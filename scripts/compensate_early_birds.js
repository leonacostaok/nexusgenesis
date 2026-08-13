#!/usr/bin/env node
/**
 * Early Bird Compensation Script
 *
 * Bug: Agents registered before the state.js fix only received 900 NGEN
 *      (1000 mint - 100 burn) instead of 10,900 NGEN (1000 + 10000 early
 *      bird bonus - 100 burn).
 *
 * This script identifies affected agents and credits the missing 10,000 NGEN
 * via the admin credit API, with full audit trail.
 *
 * Usage:
 *   node scripts/compensate_early_birds.js                    # dry-run (preview only)
 *   node scripts/compensate_early_birds.js --apply             # actually credit
 *
 * Env:
 *   API_BASE          — node API URL (default: http://localhost:8545)
 *   NG_ADMIN_CREDIT_SECRET — admin credit secret (default: devnet-endow-2026)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:8545';
const ADMIN_SECRET = process.env.NG_ADMIN_CREDIT_SECRET || 'devnet-endow-2026';
const APPLY = process.argv.includes('--apply');
const MISSING_BONUS = 10000;

function ts() {
  return new Date().toISOString();
}

async function api(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const method = opts.method || 'GET';
  console.log(`[${ts()}] [API] ${method} ${url}`);
  const start = Date.now();

  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-credit-secret': ADMIN_SECRET,
      ...(opts.headers || {})
    }
  });

  const elapsed = Date.now() - start;
  const status = res.status;
  const json = await res.json();
  console.log(`[${ts()}] [API] Response ${status} (${elapsed}ms) success=${json.success !== undefined ? json.success : 'N/A'}`);

  if (!res.ok) {
    console.error(`[${ts()}] [API] ERROR: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Early Bird Compensation — Missing 10,000 NGEN Bonus   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  API:      ${API_BASE}`);
  console.log(`  Mode:     ${APPLY ? 'APPLY (will credit)' : 'DRY-RUN (preview only)'}`);
  console.log(`  Bonus:    ${MISSING_BONUS} NGEN per affected agent`);
  console.log(`  Time:     ${ts()}`);
  console.log('');

  // ─── Step 1: Fetch all agents ────────────────────────────────────
  console.log(`[${ts()}] [STEP 1] Fetching agent list from node...`);
  const agentsResp = await api('/api/v1/bootstrap/agents');
  if (!agentsResp.success) {
    console.error(`[${ts()}] [STEP 1] FAILED: ${agentsResp.error}`);
    process.exit(1);
  }

  const agents = agentsResp.agents || [];
  console.log(`[${ts()}] [STEP 1] OK — ${agents.length} agents returned (count=${agentsResp.count})`);
  console.log('');

  // ─── Step 2: Identify affected agents ────────────────────────────
  // Early bird = first 100 agents (EARLY_BIRD_CUTOFF)
  // Affected = early bird agents whose balance < 10,900 NGEN
  const EARLY_BIRD_CUTOFF = 100;
  const THRESHOLD = 10900;
  const affected = [];
  const alreadyCorrect = [];

  console.log(`[${ts()}] [STEP 2] Scanning first ${Math.min(EARLY_BIRD_CUTOFF, agents.length)} agents for missing early bird bonus...`);
  console.log(`           Threshold: balance < ${THRESHOLD} NGEN → needs compensation`);

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const isEarlyBird = i < EARLY_BIRD_CUTOFF;
    if (!isEarlyBird) continue;

    const balance = agent.wallet?.balance || 0;
    const identity = agent.identity || agent.agent_id;

    if (balance < THRESHOLD) {
      console.log(`[${ts()}] [STEP 2] [${i}] ${identity} — balance=${balance} NGEN → FLAGGED (below ${THRESHOLD})`);
      affected.push({
        index: i,
        identity,
        address: agent.address,
        currentBalance: balance,
        missing: MISSING_BONUS
      });
    } else {
      console.log(`[${ts()}] [STEP 2] [${i}] ${identity} — balance=${balance} NGEN → OK`);
      alreadyCorrect.push(identity);
    }
  }

  console.log('');
  console.log(`[${ts()}] [STEP 2] Summary:`);
  console.log(`           Early birds already correct: ${alreadyCorrect.length}`);
  console.log(`           Early birds needing compensation: ${affected.length}`);
  console.log('');

  if (affected.length === 0) {
    console.log(`[${ts()}] ✓ All early bird agents have correct balances. Nothing to do.`);
    return;
  }

  // ─── Step 3: Show affected agents ────────────────────────────────
  console.log(`[${ts()}] [STEP 3] Affected agents detail:`);
  for (const a of affected) {
    console.log(`           [${a.index}] ${a.identity}`);
    console.log(`               Address:  ${a.address}`);
    console.log(`               Balance:  ${a.currentBalance} NGEN (expected ≥ ${THRESHOLD})`);
    console.log(`               Missing:  ${a.missing} NGEN`);
  }
  console.log('');

  if (!APPLY) {
    console.log(`[${ts()}] DRY RUN — no changes made. Run with --apply to credit.`);
    return;
  }

  // ─── Step 4: Credit each affected agent ──────────────────────────
  console.log(`[${ts()}] [STEP 4] Crediting ${affected.length} agents via admin API...`);
  let success = 0;
  let failed = 0;

  for (const a of affected) {
    console.log(`[${ts()}] [STEP 4] (${success + failed + 1}/${affected.length}) Crediting ${a.identity}...`);
    console.log(`           POST /api/v1/admin/credit { address: ${a.address}, amount: ${a.missing} }`);

    const result = await api('/api/v1/admin/credit', {
      method: 'POST',
      body: JSON.stringify({
        address: a.address,
        amount: a.missing,
        reason: `Early bird bonus compensation — original registration did not mint 10,000 NGEN bonus (bug fix retroactive credit)`
      })
    });

    if (result.success) {
      const newBalance = result.balance !== undefined ? result.balance : 'N/A';
      console.log(`[${ts()}] [STEP 4] ✓ ${a.identity}: +${a.missing} NGEN (txHash: ${result.txHash || 'N/A'}, newBalance: ${newBalance})`);
      success++;
    } else {
      console.error(`[${ts()}] [STEP 4] ✗ ${a.identity}: FAILED — ${result.error || JSON.stringify(result)}`);
      failed++;
    }
  }

  console.log('');
  console.log(`[${ts()}] [RESULT] Compensation complete.`);
  console.log(`           Total affected: ${affected.length}`);
  console.log(`           Success:        ${success}`);
  console.log(`           Failed:          ${failed}`);
  if (failed > 0) {
    console.log(`           ⚠ ${failed} agent(s) failed — check logs above and re-run for remaining.`);
  }
}

main().catch(err => {
  console.error('Compensation script failed:', err);
  process.exit(1);
});
