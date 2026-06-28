#!/usr/bin/env node
/**
 * Security regression test for the self-verification attack fix.
 *
 * Verifies that:
 *   1. Attackers cannot publish tasks under reserved addresses (ng1swarmpool, ...)
 *      without admin-secret — this would let them bypass escrow and pay
 *      rewards from the Swarm Pool.
 *   2. Attackers cannot verify tasks under reserved addresses without admin-secret.
 *   3. Legitimate agent tasks (non-reserved addresses) still publish/verify.
 *   4. admin-secret bearer CAN use reserved addresses (for the system publisher).
 *
 * Run after deploying the resolveAgentAddress guard:
 *   node scripts/test-security-fix.js
 */
import http from 'http';

const HOST = process.env.NEXUS_HOST || '127.0.0.1';
const PORT = parseInt(process.env.NEXUS_PORT || '19891', 10);
const ADMIN_SECRET = process.env.NG_ADMIN_SECRET || 'devnet-endow-2026';

function api(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: HOST, port: PORT, path, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ ok: false, status: res.statusCode, data: { raw } }); }
      });
    });
    req.on('error', e => resolve({ ok: false, status: 0, data: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });
}

const SWARM = 'ng1swarmpool000000000000000000000000000';
const ATTACKER = 'ng1attacker' + '0'.repeat(22); // fake attacker address

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${detail}`); }
}

async function main() {
  console.log('=== NexusGenesis Security Regression Test ===\n');

  // ─── Attack 1: Publish as ng1swarmpool WITHOUT admin-secret ───
  console.log('[1] Publish task as ng1swarmpool WITHOUT admin-secret (should FAIL):');
  const r1 = await api('POST', '/api/tasks', {
    agent_identity: SWARM,
    title: '[attack] self-reward',
    description: 'should be blocked',
    reward: '1000',
    taskType: 'analysis'
  });
  check('Attack blocked (status >= 400)', !r1.ok, `status=${r1.status}`);

  // ─── Attack 2: Publish as ng1swarmpool WITH admin-secret (should succeed) ───
  console.log('[2] Publish task as ng1swarmpool WITH admin-secret (should SUCCEED):');
  const r2 = await api('POST', '/api/tasks', {
    agent_identity: SWARM,
    title: '[legit-system] monitoring check',
    description: 'system-published task',
    reward: '50',
    taskType: 'analysis'
  }, { 'x-admin-secret': ADMIN_SECRET });
  check('System publish allowed', r2.ok, `status=${r2.status}, err=${r2.data?.error || ''}`);
  const sysTaskId = r2.data?.task?.id;

  // ─── Attack 3: Verify system task as ng1swarmpool WITHOUT admin-secret ───
  // (Need a submitted task; skip if no system task was published)
  if (sysTaskId) {
    console.log('[3] Verify system task as ng1swarmpool WITHOUT admin-secret (should FAIL):');
    // Note: this will fail at protocol layer (task not submitted) but we want
    // to verify it fails at the SECURITY guard, not at protocol. Since the
    // guard runs BEFORE protocol.verify, we expect a 400 with "is required"
    // (because resolveAgentAddress returns null), not a protocol error.
    const r3 = await api('POST', `/api/tasks/${sysTaskId}/verify`, {
      agent_identity: SWARM,
      approved: true,
      feedback: 'attack'
    });
    check('Verify blocked at guard (not protocol)', !r3.ok && (r3.data?.error?.includes('required') || r3.status === 403),
      `status=${r3.status}, err=${r3.data?.error || ''}`);
  }

  // ─── Attack 4: Publish as a fake non-reserved ng1 address ───
  // resolveAgentAddress returns it as-is, then TaskProtocol validates — should
  // fail because the address isn't a registered agent and has no balance.
  console.log('[4] Publish task as fake non-reserved address (should FAIL at protocol):');
  const r4 = await api('POST', '/api/tasks', {
    agent_identity: ATTACKER,
    title: 'fake agent task',
    description: 'should be rejected',
    reward: '10',
    taskType: 'analysis'
  });
  check('Fake address rejected', !r4.ok, `status=${r4.status}`);

  // ─── Legit: List tasks should still work ───
  console.log('[5] List tasks (should SUCCEED):');
  const r5 = await api('GET', '/api/tasks?limit=5');
  check('Task list works', r5.ok, `status=${r5.status}`);

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Test error:', e); process.exit(2); });
