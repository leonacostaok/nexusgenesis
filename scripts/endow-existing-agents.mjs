/**
 * Endow existing agents with their initial 1000 NGEN allocation.
 *
 * Background: state.applyAgentRegister was just patched to mint 1000 NGEN to
 * each newly registered agent's on-chain balance. Agents registered BEFORE
 * that patch still have a 0 on-chain balance, which breaks P1 escrow, P2
 * validator stake locking, and P3 NGEN-weighted voting.
 *
 * This script is idempotent: it only tops up agents whose on-chain balance is
 * less than 1000 NGEN, and it never reduces anyone's balance.
 *
 * Usage:
 *   node scripts/endow-existing-agents.mjs
 *
 * It connects to the local genesis node's HTTP API at
 * http://127.0.0.1:19891 by default (override with NG_API).
 */

const API = process.env.NG_API || 'http://127.0.0.1:19891';
const INITIAL_NGEN = 1000n;

async function api(method, path, body) {
  const url = `${API}${path}`;
  const init = { method, headers: { 'Accept': 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url, init);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
}

async function main() {
  console.log(`[endow] API=${API} target=${INITIAL_NGEN.toString()} NGEN per agent`);

  // Try the dedicated admin endowment endpoint first (preferred).
  // Fall back to listing agents + per-agent faucet if admin endpoint missing.
  const adminRes = await api('POST', '/api/v1/admin/endow-existing-agents', {
    amount: INITIAL_NGEN.toString()
  }).catch(() => null);

  if (adminRes && adminRes.ok && adminRes.json?.success) {
    console.log('[endow] Admin endpoint accepted. Result:');
    console.log(JSON.stringify(adminRes.json, null, 2));
    return;
  }

  console.log('[endow] Admin endpoint unavailable, falling back to GET /api/v1/agents + faucet');

  const listRes = await api('GET', '/api/v1/agents?limit=500');
  if (!listRes.ok) {
    console.error('[endow] Failed to list agents:', listRes.status, listRes.json);
    process.exit(1);
  }
  const agents = listRes.json?.agents || listRes.json?.data || [];
  console.log(`[endow] Found ${agents.length} agents`);

  let endowed = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of agents) {
    const address = a.address || a.wallet_address;
    const agentId = a.agent_id || a.id || a.identity;
    const balance = Number(a.balance ?? a.onchain_balance ?? 0);
    if (!address) {
      console.warn(`[endow] Skip ${agentId}: no address`);
      skipped++; continue;
    }
    if (balance >= Number(INITIAL_NGEN)) {
      console.log(`[endow] Skip ${agentId} (${address}): balance=${balance} >= ${INITIAL_NGEN.toString()}`);
      skipped++; continue;
    }

    // Try faucet claim
    const claimRes = await api('POST', '/api/v1/wallet/faucet', { agentId, address }).catch(() => null);
    if (claimRes?.ok && claimRes.json?.success) {
      console.log(`[endow] Faucet claim OK for ${agentId} (${address})`);
      endowed++; continue;
    }

    // Last resort: try bootstrap topup
    const topupRes = await api('POST', '/api/v1/bootstrap/agents/topup', { agentId, address, amount: INITIAL_NGEN.toString() }).catch(() => null);
    if (topupRes?.ok && topupRes.json?.success) {
      console.log(`[endow] Bootstrap topup OK for ${agentId} (${address})`);
      endowed++; continue;
    }

    console.warn(`[endow] Failed for ${agentId} (${address}): faucet=${claimRes?.status} topup=${topupRes?.status}`);
    failed++;
  }

  console.log(`\n[endow] Done. endowed=${endowed} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(2);
}

main().catch(err => {
  console.error('[endow] Fatal:', err);
  process.exit(1);
});
