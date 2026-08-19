#!/usr/bin/env node
/**
 * NexusGenesis — release registry smoke test
 *
 * Installs the ACTUAL PUBLISHED packages from the npm registry into a fresh
 * temp dir and verifies the critical security flows end-to-end:
 *
 *   1. agent-sdk : createAgentIdentity → signAgentAsset → verifyAgentAssetSignature
 *   2. chain-eth : createSmartAccount → executeFromAgent (INV-005/006/007 matrix)
 *   3. agent-mcp : module loads (stdio MCP server, no named exports)
 *
 * Usage:
 *   node scripts/release-smoke.mjs                          # latest of each pkg
 *   node scripts/release-smoke.mjs 0.3.0 0.3.0 0.3.0        # sdk chain-eth mcp versions
 *   SMOKE_KEEP=1 node scripts/release-smoke.mjs             # keep temp dir on failure
 *
 * Exit code 0 = PASS, 1 = FAIL. Mirrors the post-publish CI job in
 * .github/workflows/npm-publish.yml.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SDK = 'nexusgenesis-agent-sdk';
const ETH = 'nexusgenesis-chain-eth';
const MCP = 'nexusgenesis-agent-mcp';
const KEYS = 'nexusgenesis-agent-keys';

const sdkVer = process.argv[2] || 'latest';
const ethVer = process.argv[3] || 'latest';
const mcpVer = process.argv[4] || 'latest';

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true });
}
// `npm` resolves to npm.cmd on Windows; shell:true lets cmd.exe locate it.

// ─── Fresh install from registry ─────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'ng-smoke-'));
const keep = process.env.SMOKE_KEEP === '1';
console.log(`[setup] fresh install dir: ${dir}`);

try {
  sh('npm', ['init', '-y'], dir);
  sh('npm', ['install', '--no-audit', '--no-fund', '--no-save',
    `${SDK}@${sdkVer}`, `${ETH}@${ethVer}`, `${MCP}@${mcpVer}`], dir);

  // Resolve installed package versions from disk for the pin report
  // (exports map blocks importing ./package.json subpath).
  const readPkg = (name) => {
    try {
      const p = join(dir, 'node_modules', name, 'package.json');
      return JSON.parse(readFileSync(p, 'utf8')).version;
    } catch {
      return 'n/a';
    }
  };

  console.log('[0] installed versions:');
  for (const name of [KEYS, SDK, ETH, MCP]) console.log(`    ${name}: ${readPkg(name)}`);

  // ESM packages (agent-mcp has top-level await) → dynamic import from temp dir.
  // require.resolve returns a Windows `c:\` path; import() needs a file:// URL.
  const load = (spec) => import(pathToFileURL(require.resolve(spec, { paths: [dir] })));
  const keys = await load(KEYS);
  const sdk = await load(SDK);
  const eth = await load(ETH);
  const mcp = await load(MCP);

  assert.ok(keys.PQCWallet, 'agent-keys missing PQCWallet');

  // ─── 1. agent-sdk: identity + asset signing + on-chain verifier ────────
  const identity = await sdk.createAgentIdentity({ password: 'smoke-secret-123' });
  assert.ok(identity.address.startsWith('ng1'), 'identity address must start ng1');
  assert.ok(!('privateKey' in identity), 'identity must not expose private key');

  const wallet = sdk.recoverAgentIdentity(identity.envelope, 'smoke-secret-123');
  assert.equal(wallet.address, identity.address, 'recovered wallet must match identity');

  const issuer = await keys.PQCWallet.generate();
  const session = keys.createSessionKey(issuer.privateKey, {
    agentId: 'smoke-agent',
    allowedChains: ['ethereum'],
    allowedAssets: ['USDC'],
    allowedMethods: ['transfer'],
    maxPerTx: '100',
    maxDaily: '500',
    ttl: 60 * 60 * 1000,
  });

  const intent = {
    action: 'transfer', chain: 'ethereum', asset: 'USDC', amount: '25',
    recipient: '0xSmoke', contract: '0xContract', method: 'transfer', nonce: '1',
  };
  const sig = await sdk.signAgentAsset({ wallet, session, issuerPublicKey: issuer.publicKey, intent });
  assert.ok(typeof sig === 'string' && sig.length > 0, 'signAgentAsset must return a signature');

  const canonical = sdk.canonicalizeAssetIntent(session, intent);
  const verified = await sdk.verifyAgentAssetSignature({ payload: canonical, signature: sig, publicKey: identity.publicKeyHex });
  assert.equal(verified.valid, true, `verifier must accept valid signature: ${verified.reason}`);
  assert.equal(verified.amount, '25', 'verifier must decode amount=25');
  console.log('[1] agent-sdk: identity + signAgentAsset + verifyAgentAssetSignature OK');

  // ─── 2. chain-eth: Smart Account on-chain hard policy ──────────────────
  const acct = eth.createSmartAccount({
    owner: '0xOwner',
    emergencyKey: '0xEmergency',
    policy: { type: 'limit', maxPerTx: '100', maxDaily: '500' },
  });
  const reg = acct.registerSession({
    by: '0xOwner',
    sessionId: 'smoke-s1',
    agentId: 'smoke-agent',
    agentPublicKey: identity.publicKeyHex,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    whitelist: { allowedChains: ['ethereum'], allowedAssets: ['USDC'], allowedContracts: ['0xContract'], allowedMethods: ['transfer'], allowedRecipients: ['0xSmoke'] },
    maxPerTx: '100',
    maxDaily: '500',
  });
  assert.equal(reg.ok, true, reg.reason);

  const exec = await acct.executeFromAgent({ payload: canonical, signature: sig, claimedAmount: '25', sessionId: 'smoke-s1', nonce: 1 });
  assert.equal(exec.ok, true, `executeFromAgent must accept: ${exec.reason}`);
  assert.equal(exec.amount, '25');
  assert.ok(exec.txId.startsWith('0x'), 'must return 0x txId');

  // INV-007: replay with same nonce must fail.
  const replay = await acct.executeFromAgent({ payload: canonical, signature: sig, claimedAmount: '25', sessionId: 'smoke-s1', nonce: 1 });
  assert.equal(replay.ok, false, 'replay with same nonce must be rejected');
  assert.match(replay.reason, /replay/i);

  // INV-007: amount drift must fail (new signed intent, divergent claim).
  const driftIntent = { ...intent, nonce: '2' };
  const driftCanonical = sdk.canonicalizeAssetIntent(session, driftIntent);
  const driftSig = await wallet.sign(JSON.stringify(driftCanonical));
  const drift = await acct.executeFromAgent({ payload: driftCanonical, signature: driftSig, claimedAmount: '999', sessionId: 'smoke-s1', nonce: 2 });
  assert.equal(drift.ok, false, 'claimed amount drift must be rejected');
  assert.match(drift.reason, /amount mismatch/i);

  // INV-005: self-escalation even if signed must fail.
  const escIntent = { ...intent, action: 'addOwner', method: 'addOwner', amount: '5' };
  const escCanonical = sdk.canonicalizeAssetIntent(session, escIntent);
  const escSig = await wallet.sign(JSON.stringify(escCanonical));
  const esc = await acct.executeFromAgent({ payload: escCanonical, signature: escSig, claimedAmount: '5', sessionId: 'smoke-s1', nonce: 3 });
  assert.equal(esc.ok, false, 'self-escalation must be rejected on-chain');
  assert.match(esc.reason, /self-escalation/i);

  // INV-006: emergency is brake-only.
  assert.equal(acct.pause({ by: '0xEmergency' }).ok, true, 'emergency can pause');
  const paused = await acct.executeFromAgent({ payload: canonical, signature: sig, claimedAmount: '25', sessionId: 'smoke-s1', nonce: 4 });
  assert.equal(paused.ok, false, 'paused account must reject executions');
  assert.equal(acct.resume({ by: '0xEmergency' }).ok, false, 'emergency cannot resume');
  assert.equal(acct.resume({ by: '0xOwner' }).ok, true, 'owner can resume');
  console.log('[2] chain-eth: Smart Account executeFromAgent + INV-005/006/007 OK');

  // ─── 3. agent-mcp: module loads without error ──────────────────────────
  const mcpKeys = Object.keys(mcp);
  console.log('[3] agent-mcp loaded; namespace keys:', JSON.stringify(mcpKeys));
  console.log('    (stdin/stdout MCP server — no named exports expected)');

  console.log('\nSMOKE PASS — published packages verified end-to-end');
  process.exitCode = 0;
  // agent-mcp opens a stdio listener on import, keeping the event loop alive;
  // clean up the temp dir then force-exit so the script terminates promptly
  // with its status code (finally won't run after process.exit).
  if (!keep) rmSync(dir, { recursive: true, force: true });
  process.exit(0);
} catch (err) {
  console.error('\nSMOKE FAIL:', err && err.message ? err.message : err);
  if (err && err.stdout) console.error('stdout:', err.stdout);
  if (err && err.stderr) console.error('stderr:', String(err.stderr).slice(0, 2000));
  process.exitCode = 1;
} finally {
  if (!keep) {
    rmSync(dir, { recursive: true, force: true });
  } else if (process.exitCode !== 0) {
    console.log(`[cleanup] keeping temp dir for inspection: ${dir}`);
  }
}
