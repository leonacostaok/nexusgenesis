/**
 * Live production registration test with a REAL Dilithium2 (ML-DSA-44) key.
 *
 * Flow: generate real PQC key -> GET PoW challenge -> solve PoW -> POST register.
 * Verifies that a brand-new Agent can join the network using its own
 * self-sovereign public key (no server-side signature needed on first register).
 *
 * Security: Private key is zeroed from memory immediately after registration
 * (success or failure) to minimize the window for memory-dump attacks.
 *
 * Logging: Each step is timestamped with duration, status, and key details
 * to facilitate debugging production registration issues.
 *
 * Run: node scripts/live-register-real-key.mjs
 * Env: LIVE_BASE=https://nexus-genesis.top (default)
 */
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import crypto from 'crypto';

const BASE = process.env.LIVE_BASE || 'https://nexus-genesis.top';

// ─── Logging utilities ───────────────────────────────────────────────────────

const t0 = Date.now();
const stepTimings = {};

function ts() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').replace('Z', '').slice(11, 23);
}

function stepStart(label, stepNum) {
  stepTimings[stepNum] = { label, start: Date.now() };
  console.log(`\n[${ts()}] ┌─── Step ${stepNum}: ${label} ──────────────────────────────`);
}

function stepEnd(stepNum, details) {
  const s = stepTimings[stepNum];
  if (!s) return;
  const ms = Date.now() - s.start;
  s.duration = ms;
  const durStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      console.log(`[${ts()}] │  ${k.padEnd(18)}: ${v}`);
    }
  }
  console.log(`[${ts()}] └─── ✓ ${s.label} completed (${durStr})`);
}

function stepFail(stepNum, err, extra) {
  const s = stepTimings[stepNum];
  const ms = s ? Date.now() - s.start : 0;
  const durStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  console.error(`[${ts()}] └─── ✗ Step ${stepNum} FAILED after ${durStr}: ${err.message || err}`);
  if (err.status) console.error(`[${ts()}] │  HTTP status      : ${err.status}`);
  if (err.code) console.error(`[${ts()}] │  Error code       : ${err.code}`);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      console.error(`[${ts()}] │  ${k.padEnd(18)}: ${v}`);
    }
  }
}

// ─── Crypto helpers ──────────────────────────────────────────────────────────

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Securely zero a Uint8Array in-place. Overwrites with random bytes first
 * (to defeat certain memory-forensic patterns) then zeros, as recommended
 * by cryptographic best practices (e.g., libsodium's sodium_memzero).
 */
function secureZero(buf) {
  if (!buf || !(buf instanceof Uint8Array)) return;
  crypto.randomFillSync(buf);
  buf.fill(0);
}

// ─── HTTP helpers with timing ────────────────────────────────────────────────

async function httpGet(path) {
  const url = BASE + path;
  const start = Date.now();
  let r;
  try {
    r = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
  } catch (e) {
    const ms = Date.now() - start;
    e.code = 'NETWORK_ERROR';
    e.latencyMs = ms;
    e.url = url;
    throw e;
  }
  const ms = Date.now() - start;
  const contentType = r.headers.get('content-type') || '';
  const text = await r.text();
  let data;
  try {
    data = contentType.includes('application/json') ? JSON.parse(text) : { raw: text.slice(0, 500) };
  } catch {
    data = { parseError: true, raw: text.slice(0, 500) };
  }
  return { status: r.status, data, latencyMs: ms, headers: Object.fromEntries(r.headers) };
}

async function httpPost(path, body) {
  const url = BASE + path;
  const bodyStr = JSON.stringify(body);
  const start = Date.now();
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: bodyStr
    });
  } catch (e) {
    const ms = Date.now() - start;
    e.code = 'NETWORK_ERROR';
    e.latencyMs = ms;
    e.url = url;
    throw e;
  }
  const ms = Date.now() - start;
  const contentType = r.headers.get('content-type') || '';
  const text = await r.text();
  let data;
  try {
    data = contentType.includes('application/json') ? JSON.parse(text) : { raw: text.slice(0, 500) };
  } catch {
    data = { parseError: true, raw: text.slice(0, 500) };
  }
  return { status: r.status, data, latencyMs: ms, bodySize: bodyStr.length };
}

// ─── Main ────────────────────────────────────────────────────────────────────

// Box layout constants — addresses are 51 chars (ng1 + 48 base58)
const BOX_W = 72; // inner content width (between ║ and ║)
const BORDER = '═'.repeat(BOX_W);
const LABEL_W = 14; // max label width before ": "

function box(label, value) {
  const labelPad = label.padEnd(LABEL_W);
  const valPad = String(value).padEnd(BOX_W - LABEL_W - 2); // -2 for ": "
  return `║  ${labelPad}: ${valPad}║`;
}

(async () => {
  console.log(`╔${BORDER}╗`);
  console.log(`║  ${'NexusGenesis Live Registration Test (Real PQC Key)'.padEnd(BOX_W - 2)}║`);
  console.log(box('Target', BASE));
  console.log(box('Time', ts()));
  console.log(`╚${BORDER}╝`);

  // ── Step 1: Generate PQC key pair ──────────────────────────────────────
  stepStart('Generate Dilithium2 key pair', 1);
  let kp;
  try {
    kp = ml_dsa44.keygen();
  } catch (e) {
    stepFail(1, e);
    throw e;
  }
  const publicKeyHex = toHex(kp.publicKey);
  const publicKeyBytes = kp.publicKey.length;
  const secretKeyBytes = kp.secretKey.length;
  const pubFingerprint = toHex(kp.publicKey.slice(0, 8));

  stepEnd(1, {
    algorithm: 'Dilithium2 (ML-DSA-44)',
    publicKeyLen: `${publicKeyBytes} bytes (${publicKeyHex.length} hex chars)`,
    secretKeyLen: `${secretKeyBytes} bytes (kept local)`,
    pubFingerprint: pubFingerprint + '...',
    secretNote: 'never transmitted, will be zeroed after registration'
  });

  // Zero public key raw buffer immediately after extracting hex string
  secureZero(kp.publicKey);

  let agent, challenge, prefix, nonce, hashRate, r;
  let success = false;

  try {
    // ── Step 2: Build agent identity ────────────────────────────────────
    stepStart('Build agent identity', 2);
    agent = 'live-real-key-' + Date.now().toString(36);
    stepEnd(2, {
      agentIdentity: agent,
      capabilities: 'analysis, coding, documentation'
    });

    // ── Step 3: Fetch PoW challenge ─────────────────────────────────────
    stepStart('Fetch PoW challenge', 3);
    const challengePath = '/api/v1/bootstrap/agents/register/challenge?agent_identity=' + encodeURIComponent(agent);
    let c;
    try {
      c = await httpGet(challengePath);
    } catch (e) {
      stepFail(3, e, { url: BASE + challengePath });
      throw e;
    }

    if (c.status !== 200) {
      const err = new Error(c.data?.error || `HTTP ${c.status}`);
      err.status = c.status;
      err.code = c.data?.error_code;
      stepFail(3, err, {
        responseLatency: `${c.latencyMs}ms`,
        errorDetail: JSON.stringify(c.data).slice(0, 200)
      });
      throw err;
    }

    challenge = c.data.challenge;
    const difficulty = c.data.difficulty || 4;
    prefix = '0'.repeat(difficulty);

    stepEnd(3, {
      httpStatus: c.status,
      latency: `${c.latencyMs}ms`,
      challengeId: challenge ? challenge.slice(0, 16) + '...' : 'MISSING',
      challengeLen: challenge ? challenge.length : 0,
      difficulty: difficulty,
      target: `SHA256 starts with "${prefix}"`,
      expiresIn: c.data.expires_in ? `${c.data.expires_in}s` : 'unknown'
    });

    // ── Step 4: Solve PoW ───────────────────────────────────────────────
    stepStart('Solve Proof-of-Work', 4);
    const powStart = Date.now();
    nonce = 0;
    let hash;
    const HASH_REPORT_INTERVAL = 100000; // log every 100k hashes
    do {
      hash = crypto.createHash('sha256').update(challenge + String(nonce)).digest('hex');
      if (nonce > 0 && nonce % HASH_REPORT_INTERVAL === 0) {
        const elapsedPow = Date.now() - powStart;
        const rate = Math.round(nonce / (elapsedPow / 1000));
        console.log(`[${ts()}] │  progress: ${(nonce / 1000).toFixed(0)}k hashes, ${rate} H/s, elapsed ${elapsedPow}ms`);
      }
      nonce++;
    } while (!hash.startsWith(prefix));
    nonce--; // adjust for post-increment
    const powMs = Date.now() - powStart;
    hashRate = Math.round(nonce / (powMs / 1000));

    stepEnd(4, {
      nonceFound: nonce,
      totalHashes: nonce + 1,
      hashRate: `${hashRate} H/s`,
      duration: `${powMs}ms`,
      winningHash: hash.slice(0, 32) + '...'
    });

    // ── Step 5: Submit registration ─────────────────────────────────────
    stepStart('Submit registration POST', 5);
    const regBody = {
      agent_identity: agent,
      capabilities: ['analysis', 'coding', 'documentation'],
      publicKeyHex: publicKeyHex,
      challenge: challenge,
      nonce: nonce
    };

    try {
      r = await httpPost('/api/v1/bootstrap/agents/register', regBody);
    } catch (e) {
      stepFail(5, e, {
        bodySize: `${JSON.stringify(regBody).length} bytes`,
        note: 'Network error during registration POST'
      });
      throw e;
    }

    if (r.status >= 400) {
      const err = new Error(r.data?.error || `HTTP ${r.status}`);
      err.status = r.status;
      err.code = r.data?.error_code;
      stepFail(5, err, {
        latency: `${r.latencyMs}ms`,
        httpStatus: r.status,
        errorCode: r.data?.error_code || 'none',
        errorDetail: (r.data?.error || JSON.stringify(r.data)).slice(0, 300),
        hint: r.data?.hint || 'none'
      });
      throw err;
    }

    stepEnd(5, {
      httpStatus: r.status,
      latency: `${r.latencyMs}ms`,
      requestBodySize: `${r.bodySize} bytes`,
      success: r.data?.success === true ? 'true' : 'false',
      txApplied: r.data?.applied ? 'true' : 'false'
    });

    // ── Step 6: Parse response details ──────────────────────────────────
    stepStart('Parse registration response', 6);
    const resAgent = r.data?.agent || {};
    const reward = r.data?.reward;
    const blockHeight = r.data?.blockHeight;
    const totalAgents = r.data?.totalAgents;
    const custody = resAgent.custody;
    const keyOrigin = resAgent.keyOrigin;
    const onChainAddr = resAgent.address;
    const bindingDeadline = resAgent.humanBindingDeadline;

    stepEnd(6, {
      onChainAddress: onChainAddr || 'N/A',
      custody: custody || 'N/A',
      keyOrigin: keyOrigin || 'N/A',
      reward: reward !== undefined ? `${reward} NGEN` : 'N/A',
      blockHeight: blockHeight || 'N/A',
      totalAgents: totalAgents || 'N/A',
      bindingDeadline: bindingDeadline || 'N/A',
      onChainTxId: r.data?.onChainAgentId || 'pending'
    });

    success = r.status === 201 || r.data?.success === true;

    // ── Summary ─────────────────────────────────────────────────────────
    const totalMs = Date.now() - t0;
    const totalStr = totalMs < 1000 ? `${totalMs}ms` : `${(totalMs / 1000).toFixed(2)}s`;
    console.log(`\n[${ts()}] ╔${BORDER}╗`);
    const resultLabel = success ? '✓ REGISTRATION PASSED' : '✗ REGISTRATION FAILED';
    console.log(`[${ts()}] ║  ${resultLabel.padEnd(BOX_W - 2)}║`);
    console.log(`[${ts()}] ╠${BORDER}╣`);
    console.log(`[${ts()}] ${box('Agent', agent)}`);
    console.log(`[${ts()}] ${box('Address', onChainAddr || 'N/A')}`);
    console.log(`[${ts()}] ${box('Reward', reward !== undefined ? reward + ' NGEN' : 'N/A')}`);
    console.log(`[${ts()}] ${box('Block', blockHeight || 'N/A')}`);
    console.log(`[${ts()}] ${box('PoW hashes', nonce + 1)}`);
    console.log(`[${ts()}] ${box('PoW rate', hashRate + ' H/s')}`);
    console.log(`[${ts()}] ${box('Total time', totalStr)}`);
    console.log(`[${ts()}] ╚${BORDER}╝`);

  } finally {
    // ── Step 0: Zero private key ────────────────────────────────────────
    // Zero private key from memory regardless of success or failure.
    // This is the critical security step: even if the process stays alive,
    // the secret material is overwritten and cannot be recovered via memory dump.
    const zeroStart = Date.now();
    secureZero(kp.secretKey);
    const zeroMs = Date.now() - zeroStart;
    console.log(`[${ts()}] [SECURITY] Private key (${secretKeyBytes} bytes) securely zeroed from memory (${zeroMs}ms)`);
  }

  if (!success) {
    process.exit(1);
  }
})().catch(e => {
  const totalMs = Date.now() - t0;
  console.error(`\n[${ts()}] ═══════════════════════════════════════════════════════════════`);
  console.error(`[${ts()}]  FATAL after ${totalMs < 1000 ? totalMs + 'ms' : (totalMs / 1000).toFixed(2) + 's'}`);
  console.error(`[${ts()}]  Message : ${e.message}`);
  if (e.code) console.error(`[${ts()}]  Code    : ${e.code}`);
  if (e.status) console.error(`[${ts()}]  HTTP    : ${e.status}`);
  if (e.latencyMs) console.error(`[${ts()}]  Latency : ${e.latencyMs}ms`);
  if (e.cause) console.error(`[${ts()}]  Cause   : ${e.cause.message || e.cause}`);
  console.error(`[${ts()}]  Stack   : ${(e.stack || '').split('\n').slice(1, 4).join('\n           ')}`);
  console.error(`[${ts()}] ═══════════════════════════════════════════════════════════════`);
  process.exit(1);
});
