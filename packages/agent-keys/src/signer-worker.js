#!/usr/bin/env node
/**
 * nexusgenesis-agent-keys — Signer worker entry point
 *
 * This file is the child process entry point for the Signer subprocess.
 * It is spawned by signer.js (spawnSigner) and communicates via stdin/stdout
 * using a JSON-line protocol. It is NOT meant to be imported — only executed.
 *
 * SECURITY MODEL
 * ──────────────
 * - Key material is held as ShardedSecret (XOR 2-of-2 shards, never contiguous
 *   plaintext in memory). See secure.js for the boundary statement.
 * - After init, the worker enters a strict read loop: only stdin (JSON-line).
 * - No file system access after init (the imported modules are loaded at
 *   startup before the first message is processed).
 * - No network access (the process has no listening sockets or outgoing
 *   connections; seccomp at deploy time can enforce this).
 * - Password is received once via stdin (Node.js IPC = Unix domain socket /
 *   named pipe, not the network stack). Not visible in /proc/.../environ
 *   or /proc/.../cmdline.
 * - Idle timeout (default 5 min) ensures the process does not persist
 *   indefinitely.
 * - Input cap (1 MiB per message) prevents OOM-then-swap attacks.
 *
 * KNOWN LIMITATION — amount-hash unlinkability:
 *   The worker trusts the `amount` field from the parent process. It cannot
 *   verify that the amount matches the `hash` being signed. A compromised
 *   parent can lie about the amount. See signer.js for mitigation strategy.
 */

import { ShardedSecret, disableCoreDumps } from './secure.js';
import { decryptPrivateKey, isValidEnvelope } from './encryption.js';
import { generateAddress } from './address.js';
import { signSync } from './pqc.js';
import { checkSpendAllowedTiered } from './takeover.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────
// Immediately disable core dumps in the child process.
disableCoreDumps();

// Least privilege: drop to an unprivileged account before handling any key
// material. Enabled with NGX_SIGNER_DOWNGRADE=1 when started as root
// (containers / system daemons). POSIX only — on Windows this is a no-op.
//
// Pair with the reference seccomp profile at deploy/seccomp/signer-seccomp.json
// (Docker `--security-opt seccomp=...`) to also constrain the syscall surface.
try {
  if (
    process.env.NGX_SIGNER_DOWNGRADE === '1' &&
    typeof process.getuid === 'function' &&
    process.getuid() === 0
  ) {
    process.setgid('nobody');
    process.setuid('nobody');
    console.error('[signer-worker] privileges dropped to nobody');
  }
} catch (err) {
  console.error(`[signer-worker] privilege downgrade FAILED, refusing to continue: ${err.message}`);
  process.exit(1);
}

// ─── State ───────────────────────────────────────────────────────────────
let sharded = null;     // ShardedSecret holding the private key
let publicKey = null;   // Public key (Buffer)
let address = null;     // Wallet address (string)
let policy = null;      // Spend policy (object)
let idleTimer = null;   // Idle timeout timer
let currentIdleTimeout = 5 * 60 * 1000; // Idle timeout in ms

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Write a JSON-line response to stdout. */
function respond(msg) {
  try {
    process.stdout.write(JSON.stringify(msg) + '\n');
  } catch {
    // stdout closed — exit.
    process.exit(1);
  }
}

/** Reset the idle timeout (called after each successful request). */
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (currentIdleTimeout > 0) {
    idleTimer = setTimeout(() => {
      respond({ type: 'exiting', reason: 'idle_timeout' });
      process.exit(0);
    }, currentIdleTimeout);
    idleTimer.unref();
  }
}

// ─── Message handler ─────────────────────────────────────────────────────

function handleMessage(msg) {
  try {
    switch (msg.type) {
      case 'init': {
        if (!isValidEnvelope(msg.envelope)) {
          respond({ type: 'init_fail', error: 'Invalid envelope' });
          return;
        }
        if (!msg.password || msg.password.length < 8) {
          respond({ type: 'init_fail', error: 'Invalid password' });
          return;
        }

        try {
          // Decrypt private key from envelope.
          const privateKey = decryptPrivateKey(msg.envelope, msg.password);
          // Immediately shard it; ShardedSecret constructor zeroes the caller's copy.
          sharded = new ShardedSecret(privateKey);
          publicKey = Buffer.from(msg.envelope.metadata.publicKey, 'hex');
          address = msg.envelope.metadata.address || generateAddress(publicKey);
          policy = msg.policy || {};
          currentIdleTimeout = msg.idleTimeoutMs || (5 * 60 * 1000);

          respond({ type: 'init_ok', address });
          resetIdleTimer();
        } catch (e) {
          respond({ type: 'init_fail', error: e.message });
        }
        break;
      }

      case 'sign': {
        if (!sharded) {
          respond({ type: 'sign_fail', requestId: msg.requestId, error: 'Not initialized' });
          return;
        }
        resetIdleTimer();

        const hash = msg.hash;
        if (!hash || typeof hash !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hash)) {
          respond({ type: 'sign_fail', requestId: msg.requestId, error: 'Invalid hash (must be 0x-hex)' });
          return;
        }

        // Enforce spend policy (if configured) with three-tier authorization.
        // SECURITY FIX: the check MUST use the transaction's real amount
        // (msg.amount), never a policy field. An earlier revision passed
        // `policy.maxPerTx` here, which (a) never reflected the actual
        // transaction value and (b) could push every request into the
        // medium-timelock branch. When a policy is configured but the
        // caller did not supply an amount, fail CLOSED.
        if (policy.type) {
          if (msg.amount === undefined || msg.amount === null) {
            respond({
              type: 'sign_fail',
              requestId: msg.requestId,
              error: 'Policy is configured but the sign request carries no amount (fail-closed)'
            });
            return;
          }
          const result = checkSpendAllowedTiered(policy, { amount: msg.amount });
          if (!result.allowed) {
            respond({ type: 'sign_fail', requestId: msg.requestId, error: result.reason || 'Policy denied' });
            return;
          }
          // If the result includes a timelock, communicate it back.
          if (result.tier === 'medium-timelock') {
            respond({ type: 'sign_timelock', requestId: msg.requestId, timelockMs: result.timelockMs, scheduledAt: result.scheduledAt });
            return;
          }
        }

        // Sign with transient use: plaintext key exists only inside the callback.
        try {
          const sigHex = sharded.use(pk => {
            const sig = signSync(hash, pk);
            return Buffer.from(sig).toString('hex');
          });
          respond({ type: 'signature', requestId: msg.requestId, sig: '0x' + sigHex });
        } catch (e) {
          respond({ type: 'sign_fail', requestId: msg.requestId, error: e.message });
        }
        break;
      }

      case 'ping': {
        respond({ type: 'pong', requestId: msg.requestId });
        resetIdleTimer();
        break;
      }

      case 'exit': {
        respond({ type: 'exiting', reason: 'parent_request' });
        setTimeout(() => process.exit(0), 50);
        break;
      }

      default: {
        respond({ type: 'sign_fail', requestId: msg.requestId, error: `Unknown message type: ${msg.type}` });
      }
    }
  } catch (e) {
    respond({ type: 'sign_fail', requestId: msg.requestId, error: e.message });
  }
}

// ─── Read loop: stdin → JSON-line → handleMessage ────────────────────────
// SECURITY: cap the pending input buffer. A compromised parent could
// otherwise stream unbounded bytes (never a newline) and OOM the worker,
// forcing it into swap where the sharded key could be scraped.
const MAX_LINE_BYTES = 1024 * 1024; // 1 MiB per message
let inputBuffer = '';

process.stdin.on('data', (chunk) => {
  inputBuffer += chunk.toString();
  if (Buffer.byteLength(inputBuffer, 'utf8') > MAX_LINE_BYTES) {
    respond({ type: 'sign_fail', error: `Message exceeds ${MAX_LINE_BYTES} bytes` });
    process.exit(1);
  }
  const lines = inputBuffer.split('\n');
  inputBuffer = lines.pop(); // Keep incomplete line in buffer.
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      handleMessage(JSON.parse(line));
    } catch (e) {
      respond({ type: 'sign_fail', error: `Parse error: ${e.message}` });
    }
  }
});

process.stdin.on('end', () => {
  // Parent closed stdin — clean up and exit.
  if (sharded) { sharded.destroy(); sharded = null; }
  process.exit(0);
});

// ─── Signal handling ─────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  if (sharded) { sharded.destroy(); sharded = null; }
  process.exit(0);
});
process.on('SIGINT', () => {
  if (sharded) { sharded.destroy(); sharded = null; }
  process.exit(0);
});