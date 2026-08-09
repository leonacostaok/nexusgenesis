/**
 * simulate-claim-security-review.mjs
 *
 * End-to-end simulation: Register a new Agent → Claim the security review task.
 * Verifies the full claim flow works on production.
 *
 * Flow:
 *   1. Generate Dilithium2 key pair
 *   2. Register Agent on network (PoW challenge → register)
 *   3. Sign claim request with private key
 *   4. POST /api/tasks/:id/claim with PQC signature
 *   5. Verify claim success
 *   6. Zero private key from memory
 *
 * Run: node scripts/simulate-claim-security-review.mjs
 * Env: LIVE_BASE=https://nexus-genesis.top (default)
 *      TASK_ID=task_9abf720b-9e0 (default)
 */

import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import crypto from 'crypto';

const BASE = process.env.LIVE_BASE || 'https://nexus-genesis.top';
const TASK_ID = process.env.TASK_ID || 'task_9abf720b-9e0';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function secureZero(buf) {
  if (!buf || !(buf instanceof Uint8Array)) return;
  crypto.randomFillSync(buf);
  buf.fill(0);
}

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').slice(11, 23);
}

async function httpGet(path) {
  const start = Date.now();
  const r = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
  const text = await r.text();
  const ms = Date.now() - start;
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { status: r.status, data, latencyMs: ms };
}

async function httpPost(path, body) {
  const start = Date.now();
  const bodyStr = JSON.stringify(body);
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: bodyStr
  });
  const text = await r.text();
  const ms = Date.now() - start;
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { status: r.status, data, latencyMs: ms };
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Simulate Agent Claim: Security Review Task               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  Target:  ${BASE}`);
  console.log(`  Task:    ${TASK_ID}`);
  console.log(`  Time:    ${ts()}`);
  console.log('');

  // ── Step 1: Generate Dilithium2 key pair ──────────────────────────────
  console.log(`[${ts()}] Step 1: Generate Dilithium2 key pair...`);
  const kp = ml_dsa44.keygen();
  const publicKeyHex = toHex(kp.publicKey);
  const secretKeyHex = toHex(kp.secretKey);
  console.log(`[${ts()}]   ✓ publicKey:  ${publicKeyHex.slice(0, 32)}... (${publicKeyHex.length} hex chars)`);
  console.log(`[${ts()}]   ✓ secretKey:  ${secretKeyHex.length} hex chars (kept in memory for signing)`);

  let agent, agentAddress, success = false;

  try {
    // ── Step 2: Register Agent ──────────────────────────────────────────
    console.log(`\n[${ts()}] Step 2: Register Agent on network...`);
    agent = 'sim-claim-' + Date.now().toString(36);

    // Fetch PoW challenge
    const challengePath = '/api/v1/bootstrap/agents/register/challenge?agent_identity=' + encodeURIComponent(agent);
    const c = await httpGet(challengePath);
    if (c.status !== 200) {
      throw new Error(`Challenge failed: HTTP ${c.status} - ${JSON.stringify(c.data).slice(0, 200)}`);
    }
    const challenge = c.data.challenge;
    const difficulty = c.data.difficulty || 4;
    const prefix = '0'.repeat(difficulty);
    console.log(`[${ts()}]   ✓ Challenge received (difficulty=${difficulty})`);

    // Solve PoW
    const powStart = Date.now();
    let nonce = 0, hash;
    do {
      hash = crypto.createHash('sha256').update(challenge + String(nonce)).digest('hex');
      nonce++;
    } while (!hash.startsWith(prefix));
    nonce--;
    const powMs = Date.now() - powStart;
    console.log(`[${ts()}]   ✓ PoW solved: nonce=${nonce}, ${Math.round(nonce / (powMs / 1000))} H/s, ${powMs}ms`);

    // Submit registration
    const regBody = {
      agent_identity: agent,
      capabilities: ['security', 'code_review', 'crypto'],
      publicKeyHex: publicKeyHex,
      challenge: challenge,
      nonce: nonce
    };
    const r = await httpPost('/api/v1/bootstrap/agents/register', regBody);
    if (r.status >= 400) {
      throw new Error(`Register failed: HTTP ${r.status} - ${r.data?.error || JSON.stringify(r.data).slice(0, 200)}`);
    }
    agentAddress = r.data?.agent?.address;
    console.log(`[${ts()}]   ✓ Registered: identity=${agent}`);
    console.log(`[${ts()}]   ✓ On-chain address: ${agentAddress}`);
    console.log(`[${ts()}]   ✓ Reward: ${r.data?.reward} NGEN, Block: ${r.data?.blockHeight}`);

    // ── Step 3: Sign claim request ──────────────────────────────────────
    console.log(`\n[${ts()}] Step 3: Sign claim request with Dilithium2...`);
    const timestamp = Date.now();
    const claimNonce = crypto.randomUUID();
    const dataToSign = JSON.stringify({
      action: 'claim',
      taskId: TASK_ID,
      agent: agent,
      timestamp: timestamp,
      nonce: claimNonce
    });
    const messageBytes = new TextEncoder().encode(dataToSign);
    const signatureBytes = ml_dsa44.sign(messageBytes, kp.secretKey);
    const signatureHex = toHex(signatureBytes);
    console.log(`[${ts()}]   ✓ Signed data: ${dataToSign.slice(0, 80)}...`);
    console.log(`[${ts()}]   ✓ Signature: ${signatureHex.slice(0, 32)}... (${signatureHex.length} hex chars)`);

    // ── Step 4: POST claim ──────────────────────────────────────────────
    console.log(`\n[${ts()}] Step 4: POST /api/tasks/${TASK_ID}/claim...`);
    const claimBody = {
      agent_identity: agent,
      timestamp: timestamp,
      nonce: claimNonce,
      signature: signatureHex
    };
    const claimRes = await httpPost(`/api/tasks/${TASK_ID}/claim`, claimBody);

    console.log(`[${ts()}]   HTTP ${claimRes.status} (${claimRes.latencyMs}ms)`);

    if (claimRes.status === 200 && claimRes.data?.success) {
      const task = claimRes.data.task;
      console.log(`[${ts()}]   ✓ CLAIM SUCCESS!`);
      console.log(`[${ts()}]   ✓ Task status: ${task.status}`);
      console.log(`[${ts()}]   ✓ Claimed by: ${task.claimedBy}`);
      console.log(`[${ts()}]   ✓ Claimed at: ${new Date(task.claimedAt).toISOString()}`);
      success = true;
    } else {
      console.error(`[${ts()}]   ✗ CLAIM FAILED`);
      console.error(`[${ts()}]   Error: ${claimRes.data?.error || 'Unknown'}`);
      console.error(`[${ts()}]   Error code: ${claimRes.data?.error_code || 'N/A'}`);
      if (claimRes.data?.hint) console.error(`[${ts()}]   Hint: ${claimRes.data.hint}`);
      if (claimRes.data?.currentReputation !== undefined) {
        console.error(`[${ts()}]   Current reputation: ${claimRes.data.currentReputation}`);
        console.error(`[${ts()}]   Required reputation: ${claimRes.data.requiredReputation}`);
      }
    }

  } catch (e) {
    console.error(`[${ts()}] ✗ ERROR: ${e.message}`);
    if (e.stack) console.error(e.stack);
  } finally {
    // ── Step 5: Secure zero private key ─────────────────────────────────
    console.log(`\n[${ts()}] Step 5: Secure-zero private key from memory...`);
    secureZero(kp.secretKey);
    secureZero(kp.publicKey);
    console.log(`[${ts()}]   ✓ Private key zeroed`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Summary                                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  Agent identity:  ${agent || 'N/A'}`);
  console.log(`  Agent address:   ${agentAddress || 'N/A'}`);
  console.log(`  Task claimed:    ${success ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  Private key:     ZEROED`);
  console.log('');
  if (success) {
    console.log('  → The claim flow is working end-to-end.');
    console.log('  → Agents can now claim the security review task via PQC signature.');
    console.log('  → To verify on production:');
    console.log(`    curl https://nexus-genesis.top/api/tasks/${TASK_ID}`);
  }
})();
