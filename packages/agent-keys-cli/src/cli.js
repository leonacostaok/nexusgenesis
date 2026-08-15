#!/usr/bin/env node
/**
 * nexusgenesis-agent-keys-cli — Command-line interface
 *
 * Usage:
 *   nexusgenesis generate-key <password>
 *   nexusgenesis sign <hash> [--amount <amount>]
 *   nexusgenesis verify <message-hex> <signature-hex> <public-key-hex>
 *   nexusgenesis session create <agent-id> [--ttl <ms>] [--max-per-tx <n>]
 *   nexusgenesis session check <session-json> [--contract <addr>]
 *   nexusgenesis info
 *   nexusgenesis tier <amount>
 *   nexusgenesis benchmark
 *   nexusgenesis serve                             # Start signer daemon (stdio)
 *
 * Options:
 *   --envelope <file>   Key envelope file (required for sign, session, serve)
 *   --password <pass>   Password to decrypt envelope
 *   --help, -h          Show this help
 */

import {
  generateKeyPair,
  signSync,
  verify,
  getPQCInfo,
  hash,
  encryptPrivateKey,
  decryptPrivateKey,
  isValidEnvelope,
  createSessionKey,
  checkSessionAccess,
  checkSpendAllowedTiered,
  resolveTier,
  ShardedSecret,
  disableCoreDumps,
  spawnSigner,
} from 'nexusgenesis-agent-keys';
import fs from 'node:fs';
import path from 'node:path';

disableCoreDumps();

// ─── Helpers ────────────────────────────────────────────────────────────

function loadKey(envelopeFile, password) {
  if (!envelopeFile) throw new Error('--envelope is required');
  if (!password) throw new Error('--password is required');
  const raw = fs.readFileSync(envelopeFile, 'utf-8');
  const envelope = JSON.parse(raw);
  if (!isValidEnvelope(envelope)) throw new Error('Invalid envelope file');
  const privateKey = decryptPrivateKey(envelope, password);
  return new ShardedSecret(privateKey);
}

function print(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// ─── Commands ───────────────────────────────────────────────────────────

const COMMANDS = {
  async 'generate-key'([password]) {
    if (!password) throw new Error('Usage: nexusgenesis generate-key <password>');
    const { publicKey, privateKey } = await generateKeyPair();
    const envelope = encryptPrivateKey(privateKey, password, { publicKey: publicKey.toString('hex') });
    print({ publicKey: publicKey.toString('hex'), envelope });
  },

  async 'sign'([hashHex], { envelope, password, amount }) {
    const sharded = loadKey(envelope, password);
    if (amount) {
      const check = checkSpendAllowedTiered({ type: 'limit', maxPerTx: '0' }, { amount });
      if (!check.allowed) {
        console.error(`Policy denied: ${check.reason}`);
        process.exit(1);
      }
    }
    const sigHex = sharded.use(pk => signSync(hashHex, pk).toString('hex'));
    print({ signature: `0x${sigHex}` });
  },

  async 'verify'([message, signature, publicKey]) {
    if (!message || !signature || !publicKey) {
      throw new Error('Usage: nexusgenesis verify <message-hex> <signature-hex> <public-key-hex>');
    }
    const result = await verify(
      Buffer.from(message, 'hex'),
      Buffer.from(signature, 'hex'),
      Buffer.from(publicKey, 'hex')
    );
    print({ valid: result });
  },

  async 'session'([sub, ...args], opts) {
    if (!sub) throw new Error('Usage: nexusgenesis session <create|check> [...]');
    switch (sub) {
      case 'create': {
        const [agentId] = args;
        if (!agentId) throw new Error('Usage: nexusgenesis session create <agent-id>');
        const sharded = loadKey(opts.envelope, opts.password);
        const session = sharded.use(pk => createSessionKey(pk, {
          agentId,
          ttl: parseInt(opts.ttl) || (24 * 60 * 60 * 1000),
          maxPerTx: opts['max-per-tx'] || '0',
          maxDaily: opts['max-daily'] || '0',
          allowedContracts: opts['allow-contract'] ? opts['allow-contract'].split(',') : [],
          allowedMethods: opts['allow-method'] ? opts['allow-method'].split(',') : [],
          allowedChains: opts['allow-chain'] ? opts['allow-chain'].split(',') : [],
        }));
        print(session);
        break;
      }
      case 'check': {
        const [sessionJson] = args;
        if (!sessionJson) throw new Error('Usage: nexusgenesis session check <session-json>');
        const session = JSON.parse(sessionJson);
        const result = checkSessionAccess(session, {
          contract: opts.contract,
          method: opts.method,
          chain: opts.chain,
          amount: opts.amount,
        });
        print(result);
        break;
      }
      default:
        throw new Error(`Unknown subcommand: ${sub}`);
    }
  },

  async 'info'() {
    print(getPQCInfo());
  },

  async 'tier'([amount]) {
    if (!amount) throw new Error('Usage: nexusgenesis tier <amount>');
    const tier = resolveTier({ amount });
    print(tier);
  },

  async 'benchmark'() {
    console.log('Running PQC benchmark...');
    const { default: bench } = await import('../../agent-keys/bench/pqc-benchmark.js');
    // bench runs on import; no extra action needed
  },

  async 'serve'([], opts) {
    const sharded = loadKey(opts.envelope, opts.password);
    const signer = await spawnSigner({
      envelope: JSON.parse(fs.readFileSync(opts.envelope, 'utf-8')),
      password: opts.password,
      idleTimeoutMs: opts['idle-timeout'] ? parseInt(opts['idle-timeout']) : undefined,
    });
    console.error('[signer-daemon] Started on stdio, waiting for requests...');
    // Keep alive
    process.on('SIGINT', async () => {
      await signer.close();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await signer.close();
      process.exit(0);
    });
    // Expose signer handle globally for parent process
    global.__signerHandle = signer;
  },
};

// ─── Main ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const eqIdx = key.indexOf('=');
      if (eqIdx !== -1) {
        opts[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        opts[key] = args[++i];
      } else {
        opts[key] = true;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, opts };
}

async function main() {
  const { positional, opts } = parseArgs();

  if (opts.help || opts.h || positional.length === 0) {
    console.log(`
NexusGenesis agent-keys CLI

Usage:
  nexusgenesis <command> [args...] [options]

Commands:
  generate-key <password>          Generate a new Dilithium2 key pair
  sign <hash>                      Sign a hash
  verify <msg> <sig> <pubkey>     Verify a signature
  session create <agent-id>        Create a session key
  session check <json>             Check session access
  info                             Get PQC algorithm info
  tier <amount>                    Check authorization tier
  benchmark                        Run PQC benchmark
  serve                            Start signer daemon

Options:
  --envelope <file>                Key envelope file
  --password <pass>                Password to decrypt envelope
  --amount <n>                     Transaction amount (for sign/tier)
  --ttl <ms>                       Session TTL (for session create)
  --max-per-tx <n>                 Max per transaction
  --max-daily <n>                  Max daily total
  --allow-contract <list>          Comma-separated contract whitelist
  --allow-method <list>            Comma-separated method whitelist
  --allow-chain <list>             Comma-separated chain whitelist
  --contract <addr>                Contract address (for session check)
  --method <name>                  Method name (for session check)
  --chain <name>                   Chain name (for session check)
  --idle-timeout <ms>              Idle timeout for serve daemon
  --help, -h                       Show this help
`);
    return;
  }

  const cmd = positional[0];
  const handler = COMMANDS[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}. Use --help for usage.`);
    process.exit(1);
  }

  try {
    await handler(positional.slice(1), opts);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();