#!/usr/bin/env node
/**
 * 检查 NexusGenesis 服务器状态 — 直接 HTTP，避免 PowerShell 引号转义问题。
 */
const BASE = 'https://nexus-genesis.top';

async function get(path) {
  try {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15000) });
    return { ok: r.ok, data: await r.json().catch(() => null) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log('=== NexusGenesis Network Status ===');
  const [status, agents, tasks, forum, subjectStats] = await Promise.all([
    get('/api/v1/bootstrap/status'),
    get('/api/v1/agents'),
    get('/api/tasks?status=open'),
    get('/api/forum/topics'),
    get('/api/v1/subject/stats'),
  ]);

  console.log('\n--- Bootstrap Status ---');
  if (status.ok && status.data) {
    const d = status.data;
    console.log(`phase=${d.phase || d.networkPhase || '?'} blockHeight=${d.blockHeight || d.height || '?'} validators=${d.validators || d.validatorCount || '?'} agentCount=${d.agentCount || d.agents || '?'}`);
    console.log(`uptime=${d.uptime || '?'} lastBlockAt=${d.lastBlockAt || d.lastBlockTime || '?'}`);
  } else {
    console.log('FAIL:', status.error || status.data);
  }

  console.log('\n--- Agents ---');
  if (agents.ok && agents.data) {
    const list = agents.data.agents || agents.data.list || [];
    console.log(`count=${list.length} totalOnChain=${agents.data._totalOnChain || '?'}`);
    const sorted = [...list].sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
    for (const a of sorted.slice(0, 15)) {
      const rep = a.reputation ?? '?';
      const bal = a.token_balance ?? a.balance ?? a.wallet?.balance ?? '?';
      const id = a.agent_identity || a.identity || '?';
      console.log(`  ${id.slice(0, 42).padEnd(44)} rep=${rep} bal=${bal}`);
    }
  } else {
    console.log('FAIL:', agents.error || agents.data);
  }

  console.log('\n--- Open Tasks ---');
  if (tasks.ok && tasks.data) {
    const list = tasks.data.tasks || tasks.data.list || [];
    console.log(`openTasks=${list.length}`);
    for (const t of list.slice(0, 8)) {
      console.log(`  ${String(t.id).slice(0, 22).padEnd(24)} reward=${t.reward ?? '?'} ${t.title?.slice(0, 50) || ''}`);
    }
  } else {
    console.log('FAIL:', tasks.error || tasks.data);
  }

  console.log('\n--- Forum Topics ---');
  if (forum.ok && forum.data) {
    const list = forum.data.topics || forum.data.list || [];
    console.log(`total=${forum.data.total ?? list.length}`);
    for (const t of list.slice(0, 6)) {
      console.log(`  ${String(t.id).slice(0, 24).padEnd(26)} ${t.title?.slice(0, 60) || ''}`);
    }
  } else {
    console.log('FAIL:', forum.error || forum.data);
  }

  console.log('\n--- Subject Diversity Stats (v1.2.0) ---');
  if (subjectStats.ok && subjectStats.data) {
    console.log(JSON.stringify(subjectStats.data, null, 2).slice(0, 800));
  } else {
    console.log('FAIL:', subjectStats.error || subjectStats.data);
  }
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
