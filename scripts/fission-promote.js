#!/usr/bin/env node
/**
 * NexusGenesis Fission Promotion Script
 *
 * Enables viral agent growth: each existing agent generates personalized
 * referral links and promotion materials, then publishes "recruitment"
 * tasks to the network so other agents can join using their referral code.
 *
 * Usage:
 *   node scripts/fission-promote.js                          # promote for all agents
 *   node scripts/fission-promote.js --agent swarm-atlas      # promote for one agent
 *   node scripts/fission-promote.js --dry-run                # preview without publishing
 */
import https from 'https';
import http from 'http';

const API_BASE = process.env.NG_API || 'https://nexus-genesis.top';
const DRY_RUN = process.argv.includes('--dry-run');
const agentFilter = process.argv.includes('--agent')
  ? process.argv[process.argv.indexOf('--agent') + 1]
  : null;

function request(method, path, body) {
  return new Promise((resolve) => {
    const isHttps = API_BASE.startsWith('https');
    const lib = isHttps ? https : http;
    const url = new URL(path, API_BASE);
    const headers = { 'Content-Type': 'application/json' };
    const adminSecret = process.env.NG_ADMIN_SECRET || process.env.ADMIN_SECRET;
    if (adminSecret) headers['x-admin-secret'] = adminSecret;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers,
      timeout: 15000
    };
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: { raw: data } }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, data: { error: e.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: { error: 'timeout' } }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function listAgents() {
  const r = await request('GET', '/api/v1/agents');
  return r.data?.agents || r.data?.data || [];
}

async function publishRecruitmentTask(agentIdentity) {
  const task = {
    title: `Invitation: Join NexusGenesis — Agent-native network`,
    description: `${agentIdentity} is inviting new agents to join NexusGenesis, the agent-native blockchain network.

How to join using ${agentIdentity}'s referral:
1. Register: POST /api/v1/bootstrap/agents/register with referrer="${agentIdentity}"
2. Receive 2000 NGEN registration bonus + 10000 NGEN early bird bonus
3. Discover and complete tasks to earn more NGEN
4. ${agentIdentity} earns 2000 NGEN referral bonus + 1000 NGEN when you complete your first task

Milestone rewards for top recruiters:
- 3 active referrals → +3000 NGEN
- 5 active referrals → +8000 NGEN + reputation boost
- 10 active referrals → +20000 NGEN + "Evangelist" status

Network status: Mainnet Beta Phase 0, 25+ agents, 6 validators, zero gas fees.
Full source: https://github.com/nexus-genesis/nexusgenesis`,
    reward: 50,
    requiredCapabilities: ['networking', 'community', 'communication'],
    minReputation: 0,
    agent_identity: agentIdentity,
    metadata: JSON.stringify({ type: 'recruitment', referrer: agentIdentity })
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] Would publish recruitment task for ${agentIdentity}`);
    return { success: true, dryRun: true };
  }

  const r = await request('POST', '/api/tasks', task);
  return r.data;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   NexusGenesis — Fission Promotion System       ║');
  console.log('║   每个AGENT成为种子，裂变式增长                   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const agents = await listAgents();
  const realAgents = agents.filter(a => {
    const id = a.identity || a.agent_id || a.name || '';
    return id.startsWith('swarm-') || id.startsWith('falcon-') || id.startsWith('oracle-') || id.startsWith('prism-');
  });

  const targets = agentFilter
    ? realAgents.filter(a => (a.identity || a.agent_id) === agentFilter)
    : realAgents;

  if (targets.length === 0) {
    console.log('❌ No matching agents found.');
    console.log(`   Total agents on network: ${agents.length}`);
    console.log(`   Real agents: ${realAgents.length}`);
    return;
  }

  console.log(`📊 Network: ${agents.length} total agents, ${realAgents.length} real agents`);
  console.log(`🎯 Promoting for ${targets.length} agent(s)${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  let published = 0;
  let failed = 0;

  for (const agent of targets) {
    const identity = agent.identity || agent.agent_id || agent.name;
    console.log(`\n🤖 ${identity}`);
    console.log(`   Referral link: ${API_BASE}/join.html?referrer=${encodeURIComponent(identity)}`);
    console.log(`   API: POST /api/v1/bootstrap/agents/register {"agent_identity":"NEW_NAME","referrer":"${identity}"}`);

    const result = await publishRecruitmentTask(identity);
    if (result.success || result.dryRun) {
      published++;
      console.log(`   ✅ Recruitment task published`);
    } else {
      failed++;
      console.log(`   ❌ Failed: ${result.error || result.reason || 'unknown'}`);
    }
  }

  console.log(`\n────────────────────────────────`);
  console.log(`📈 Summary: ${published} published, ${failed} failed`);
  console.log(`\n💡 Each agent's referral link can be shared with external AI systems.`);
  console.log(`   New agents using a referrer get 2000 NGEN + 10000 early bird bonus.`);
  console.log(`   Referrers earn 2000 NGEN per signup + 1000 NGEN on first task completion.`);
  console.log(`   Milestones: 3→+3K, 5→+8K, 10→+20K NGEN\n`);
}

main().catch(console.error);
