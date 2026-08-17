#!/usr/bin/env node
/**
 * Focused E2E: register fresh agent → SDK bindMasterKey (0.4.1 with
 * masterPublicKey proof-of-possession) → control-status confirms binding.
 * Skips endpoints known to hang on a fresh local node (task list).
 */
import crypto from 'node:crypto';

const BASE = (process.argv[2] || 'http://localhost:29891').replace(/\/$/, '');
const DELAY_MS = parseInt(process.env.VERIFY_DELAY_MS || '1500', 10);
const results = [];
let reqCount = 0;

async function req(method, path, body, headers = {}) {
  reqCount++;
  if (reqCount > 1) await new Promise(r => setTimeout(r, DELAY_MS));
  const opts = { method, headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* null */ }
  return { status: res.status, headers: res.headers, data };
}

function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
}

function solvePoW(challenge, difficulty) {
  const prefix = '0'.repeat(difficulty);
  for (let nonce = 0; nonce < 200_000_000; nonce++) {
    if (crypto.createHash('sha256').update(challenge + nonce).digest('hex').startsWith(prefix)) return nonce;
  }
  throw new Error('PoW unsolvable');
}

const { bindMasterKey, masterKeyFingerprint } = await import('../packages/agent-keys/src/bindMasterKey.js');
const { generateKeyPair } = await import('../packages/agent-keys/src/pqc.js');

const agentName = `e2e-${Date.now().toString(36)}`;
let registered = null;

// 1. Register
const ch = await req('GET', `/api/v1/bootstrap/agents/register/challenge?agent_identity=${agentName}`);
if (!ch.data?.challenge) {
  record('REG', false, `http=${ch.status} ${JSON.stringify(ch.data).slice(0, 120)}`);
} else {
  const nonce = solvePoW(ch.data.challenge, ch.data.difficulty || 4);
  const agentKeys = await generateKeyPair();
  const reg = await req('POST', '/api/v1/bootstrap/agents/register', {
    agent_identity: agentName,
    capabilities: ['verification'],
    publicKeyHex: agentKeys.publicKey.toString('hex'),
    pow_challenge: ch.data.challenge,
    pow_nonce: nonce,
    referrer: 'e2e-focused'
  });
  registered = reg.data;
  record('REG register', reg.data?.success !== false,
    `http=${reg.status} identity=${agentName} onChainId=${reg.data?.agent?.agent_id || reg.data?.onChainAgentId || 'n/a'}`);
}

// 2. Binding window ~72h — find any deadline-ish field in the response
function findDeadline(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (/deadline/i.test(k) && (typeof v === 'string' || typeof v === 'number')) return v;
  }
  for (const v of Object.values(obj)) {
    const hit = findDeadline(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}
const dl = findDeadline(registered);
if (dl) {
  const hours = (new Date(dl).getTime() - Date.now()) / 3600_000;
  record('8c binding window 72h', hours > 70 && hours <= 73.5, `~${hours.toFixed(1)}h deadline=${dl}`);
} else {
  record('8c binding window 72h', false, `no deadline field; keys=${Object.keys(registered || {}).join(',')}`);
}

// 3. SDK bindMasterKey E2E
if (registered?.success !== false && registered) {
  try {
    const master = await generateKeyPair();
    const masterPublicKeyHex = master.publicKey.toString('hex');
    const agentId = registered.agent?.agent_id || registered.onChainAgentId || registered.agent?.identity || agentName;
    const out = await bindMasterKey({ baseUrl: BASE, agentId, masterPrivateKey: master.privateKey, masterPublicKeyHex });
    record('1a SDK bindMasterKey', out.success === true,
      `agent=${agentId} applied=${out.applied} block=${out.blockHeight} msg=${(out.message || '').slice(0, 40)}`);

    const cs = await req('GET', `/api/v1/agents/${encodeURIComponent(agentId)}/control-status`);
    const fp = masterKeyFingerprint(masterPublicKeyHex);
    const bound = cs.status === 200
      && cs.data?.custody === 'co-managed'
      && (cs.data?.masterKeyFingerprint === fp || ('' + (cs.data?.masterKeyFingerprint || '')).slice(0, 16) === fp.slice(0, 16));
    record('1b control-status binding', bound,
      `http=${cs.status} custody=${cs.data?.custody} fpMatch=${cs.data?.masterKeyFingerprint === fp} applied=${out.applied}`);
  } catch (e) {
    record('1a SDK bindMasterKey', false, `${e.message} code=${e.errorCode} resp=${JSON.stringify(e.response).slice(0, 160)}`);
    record('1b control-status binding', false, 'skipped (bind failed)');
  }
} else {
  record('1a SDK bindMasterKey', false, 'skipped (registration failed)');
  record('1b control-status binding', false, 'skipped');
}

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} PASS =====`);
process.exit(pass === results.length ? 0 : 1);
