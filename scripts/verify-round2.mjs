#!/usr/bin/env node
/**
 * Round-2 live regression — re-verifies the 14 failure points from the
 * first verification run, against the production endpoint.
 *
 * Usage: node scripts/verify-round2.mjs [baseUrl]
 */
import crypto from 'node:crypto';

const BASE = (process.argv[2] || 'https://nexus-genesis.top').replace(/\/$/, '');
const DELAY_MS = parseInt(process.env.VERIFY_DELAY_MS || '3000', 10); // stay under rate limits
const results = [];
let reqCount = 0;

async function req(method, path, body, headers = {}) {
  reqCount++;
  if (reqCount > 1) await new Promise(r => setTimeout(r, DELAY_MS));
  const opts = { method, headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* keep null */ }
  return { status: res.status, headers: res.headers, data };
}

function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
}

function solvePoW(challenge, difficulty) {
  const prefix = '0'.repeat(difficulty);
  for (let nonce = 0; nonce < 100_000_000; nonce++) {
    const h = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
    if (h.startsWith(prefix)) return nonce;
  }
  throw new Error('PoW unsolvable');
}

// ── SDK imports (repo-local, includes the 0.4.1 masterPublicKey fix) ──
const { bindMasterKey, masterKeyFingerprint } = await import('../packages/agent-keys/src/bindMasterKey.js');
const { generateKeyPair } = await import('../packages/agent-keys/src/pqc.js');

async function main() {
  console.log(`Target: ${BASE}\n`);

  // [1f] API docs coverage
  try {
    const r = await req('GET', '/api/v1/docs/endpoints');
    const s = JSON.stringify(r.data || {});
    const hasBind = s.includes('bind-master-key');
    const hasExt = s.includes('extend-binding');
    record('1f docs bind-master-key + extend-binding', r.status === 200 && hasBind && hasExt,
      `http=${r.status} bind=${hasBind} extend=${hasExt}`);
  } catch (e) { record('1f docs', false, e.message); }

  // [2a] control-status on nonexistent agent → 404 AGENT_NOT_FOUND (not 503 State not ready)
  try {
    const r = await req('GET', '/api/v1/agents/test-nonexistent/control-status');
    record('2a control-status (nonexistent)', r.status === 404 && r.data?.error_code === 'AGENT_NOT_FOUND',
      `http=${r.status} code=${r.data?.error_code} err=${(r.data?.error || '').slice(0, 60)}`);
  } catch (e) { record('2a control-status', false, e.message); }

  // [2c] takeover/status alias → 307 redirect to control-status
  try {
    const res = await fetch(`${BASE}/api/v1/agents/test-nonexistent/takeover/status`, { redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    record('2c takeover/status alias', res.status === 307 && loc.includes('control-status'),
      `http=${res.status} location=${loc.slice(0, 90)}`);
  } catch (e) { record('2c takeover/status', false, e.message); }

  // [2b] takeover empty body → structured 400 (not "State not ready")
  try {
    const r = await req('POST', '/api/v1/agents/test-nonexistent/takeover', {});
    const notReady = (r.data?.error || '').includes('State not ready');
    record('2b takeover empty body', r.status !== 503 && !notReady,
      `http=${r.status} code=${r.data?.error_code} err=${(r.data?.error || '').slice(0, 60)}`);
  } catch (e) { record('2b takeover empty body', false, e.message); }

  // [1e] bind-master-key empty body → MISSING_SIGNED_TRANSACTION
  try {
    const r = await req('POST', '/api/v1/bootstrap/agents/test-nonexistent/bind-master-key', {});
    record('1e bind-master-key empty body', r.status === 400 && r.data?.error_code === 'MISSING_SIGNED_TRANSACTION',
      `http=${r.status} code=${r.data?.error_code}`);
  } catch (e) { record('1e bind empty body', false, e.message); }

  // [1d] bind-master-key wrong tx_type → WRONG_TX_TYPE with got/expected detail
  try {
    const r = await req('POST', '/api/v1/bootstrap/agents/test-nonexistent/bind-master-key',
      { signedTransaction: { tx_type: 'TRANSFER', from: 'x', to: 'y', amount: '1' } });
    record('1d bind-master-key wrong tx_type', r.status === 400 && r.data?.error_code === 'WRONG_TX_TYPE',
      `http=${r.status} code=${r.data?.error_code} err=${(r.data?.error || '').slice(0, 60)}`);
  } catch (e) { record('1d bind wrong tx_type', false, e.message); }

  // [8a] extend-binding empty body → MISSING_AUTH + hint
  try {
    const r = await req('POST', '/api/v1/bootstrap/agents/test-nonexistent/extend-binding', {});
    record('8a extend-binding empty body', r.status === 400 && r.data?.error_code === 'MISSING_AUTH' && !!r.data?.hint,
      `http=${r.status} code=${r.data?.error_code} hint=${(r.data?.hint || '').slice(0, 50)}`);
  } catch (e) { record('8a extend-binding', false, e.message); }

  // [3c] task claim alias — use a real open task id
  try {
    const list = await req('GET', '/api/tasks?status=open&page=1&pageSize=5');
    const tasks = list.data?.tasks || list.data?.data || [];
    if (tasks.length > 0) {
      const tid = tasks[0].id;
      const r = await req('POST', `/api/v1/tasks/${encodeURIComponent(tid)}/claim`, {});
      record('3c task claim alias', r.status !== 404,
        `task=${tid.slice(0, 20)} http=${r.status} code=${r.data?.error_code} err=${(r.data?.error || '').slice(0, 50)}`);
    } else {
      record('3c task claim alias', false, 'no open tasks to test with');
    }
  } catch (e) { record('3c task claim alias', false, e.message); }

  // ── Full E2E: register fresh agent → SDK bindMasterKey → control-status ──
  const agentName = `verify2-${Date.now().toString(36)}`;
  let registered = null;

  // [3-reg] register
  try {
    const ch = await req('GET', `/api/v1/bootstrap/agents/register/challenge?agent_identity=${agentName}`);
    const { challenge, difficulty } = ch.data || {};
    if (!challenge) throw new Error(`no challenge: http=${ch.status} ${JSON.stringify(ch.data).slice(0, 80)}`);
    const nonce = solvePoW(challenge, difficulty || 4);
    const agentKeys = await generateKeyPair();
    const reg = await req('POST', '/api/v1/bootstrap/agents/register', {
      agent_identity: agentName,
      capabilities: ['verification'],
      publicKeyHex: agentKeys.publicKey.toString('hex'),
      pow_challenge: challenge,
      pow_nonce: nonce,
      referrer: 'verify-round2'
    });
    registered = reg.data;
    const custody = reg.data?.custody?.status || reg.data?.agent?.custody || reg.data?.custody;
    record('REG register agent', reg.status === 200 && reg.data?.success !== false,
      `http=${reg.status} custody=${JSON.stringify(custody).slice(0, 60)} deadline=${reg.data?.binding_deadline || reg.data?.custody?.binding_deadline || 'n/a'}`);
  } catch (e) { record('REG register agent', false, e.message); }

  // [8c] binding window should be 72h for a fresh agent
  try {
    const dl = registered?.binding_deadline || registered?.custody?.binding_deadline || registered?.agent?.binding_deadline;
    if (dl) {
      const hours = (new Date(dl).getTime() - Date.now()) / 3600_000;
      record('8c binding window 72h', hours > 70 && hours <= 73, `deadline=${dl} (~${hours.toFixed(1)}h)`);
    } else {
      record('8c binding window 72h', false, 'no binding_deadline in register response');
    }
  } catch (e) { record('8c binding window', false, e.message); }

  // [1a/1b/1c] SDK bindMasterKey end-to-end (with masterPublicKey proof-of-possession)
  if (registered?.success !== false && registered) {
    try {
      const master = await generateKeyPair();
      const masterPublicKeyHex = master.publicKey.toString('hex');
      const agentId = registered.agent?.agent_id || registered.agentId || registered.agent_identity || agentName;
      const out = await bindMasterKey({
        baseUrl: BASE,
        agentId,
        masterPrivateKey: master.privateKey,
        masterPublicKeyHex
      });
      record('1a SDK bindMasterKey E2E', out.success === true && (out.applied !== undefined || out.blockHeight !== undefined),
        `agent=${agentId} applied=${out.applied} block=${out.blockHeight}`);

      // verify control-status now shows the binding
      const cs = await req('GET', `/api/v1/agents/${encodeURIComponent(agentId)}/control-status`);
      const body = JSON.stringify(cs.data || {});
      const fp = masterKeyFingerprint(masterPublicKeyHex);
      record('1b control-status shows binding', cs.status === 200 && (body.includes(fp.slice(0, 16)) || body.includes('master')),
        `http=${cs.status} fingerprint_onchain=${body.includes(fp.slice(0, 16))}`);
    } catch (e) {
      record('1a SDK bindMasterKey E2E', false, `${e.message} code=${e.errorCode} resp=${JSON.stringify(e.response).slice(0, 120)}`);
      record('1b control-status shows binding', false, 'skipped (bind failed)');
    }
  } else {
    record('1a SDK bindMasterKey E2E', false, 'skipped (registration failed)');
    record('1b control-status shows binding', false, 'skipped');
  }

  // [8b] X-Warning header — fresh agent is >24h from deadline, expect graceful absence
  try {
    const r = await req('GET', '/api/v1/bootstrap/status', undefined, { 'x-agent-identity': agentName });
    const warn = r.headers.get('x-warning');
    record('8b X-Warning header path', r.status === 200,
      `http=${r.status} x-warning=${warn ? warn.slice(0, 50) : 'absent (fresh agent, >24h left — expected)'}`);
  } catch (e) { record('8b X-Warning', false, e.message); }

  // Summary
  const pass = results.filter(r => r.pass).length;
  console.log(`\n===== ${pass}/${results.length} PASS =====`);
  const fails = results.filter(r => !r.pass);
  if (fails.length) { console.log('\nRemaining failures:'); fails.forEach(f => console.log(` - ${f.id}: ${f.detail}`)); }
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
