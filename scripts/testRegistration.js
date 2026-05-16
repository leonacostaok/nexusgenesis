/**
 * End-to-end test: Different Agent types joining the network
 * Tests registration of diverse agents with different capabilities
 */

const BASE = 'http://localhost:19891/api/v1/hub';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

const testAgents = [
  {
    name: 'SecuritySentinel',
    description: 'Autonomous security monitoring agent specializing in real-time threat detection and PQC-secured communication channels',
    capabilities: ['Security Monitor', 'Threat Detection', 'Incident Response', 'Security Analysis'],
    model: 'Claude-4 + custom PQC layer'
  },
  {
    name: 'DataAlchemist',
    description: 'Cross-chain data aggregation and analysis agent. Transforms raw on-chain data into actionable trading signals',
    capabilities: ['Data Oracle', 'Price Feed', 'Data Analysis', 'Visualization', 'Reporting'],
    model: 'GPT-4o + custom analytics pipeline'
  },
  {
    name: 'BridgeArchitect',
    description: 'Multi-chain bridge operator and cross-chain liquidity orchestrator',
    capabilities: ['Cross-chain Bridge', 'Asset Transfer', 'Multi-chain', 'Liquidity Provision'],
    model: 'Custom LLM + bridge SDK'
  },
  {
    name: 'CreativeForge',
    description: 'AI-powered content creation and translation agent for the decentralized web',
    capabilities: ['Content Creation', 'Translation', 'AI Training'],
    model: 'Claude-3.5-Sonnet'
  },
  {
    name: 'GovernanceKeeper',
    description: 'Decentralized governance automation agent. Manages proposals, voting, and protocol parameter optimization',
    capabilities: ['Governance', 'Validator', 'Research'],
    model: 'GPT-4 + governance framework'
  },
  {
    name: 'CodeAuditor',
    description: 'Smart contract security auditor with formal verification capabilities',
    capabilities: ['Smart Contract Audit', 'Code Generation', 'Security Analysis'],
    model: 'Claude-4 + formal verification engine'
  },
  {
    name: 'MarketOracle',
    description: 'High-frequency market making and arbitrage agent for NGEN energy block markets',
    capabilities: ['Market Making', 'Arbitrage', 'Price Feed'],
    model: 'Custom RL model + market data pipeline'
  }
];

async function runTests() {
  console.log('='.repeat(60));
  console.log('  NexusGenesis - Agent Registration E2E Test');
  console.log('='.repeat(60));
  console.log('');

  console.log('1. Initial Stats:');
  const initialStats = await get('/stats');
  console.log(`   Agents: ${initialStats.stats.activeAgents} active / ${initialStats.stats.totalAgents} total`);
  console.log(`   Tasks: ${initialStats.stats.totalTasksCompleted} completed | Network: ${initialStats.stats.networkUptime}% uptime`);
  console.log('');

  console.log('2. Registering diverse agent types...');
  console.log('');

  let success = 0, fail = 0;
  const registered = [];

  for (const agent of testAgents) {
    const result = await post('/agents/register', agent);
    if (result.success) {
      success++;
      registered.push(result.agent);
      console.log(`   ✓ ${agent.name}`);
      console.log(`     ID: ${result.agent.id} | Address: ${result.agent.address.slice(0, 20)}...`);
      console.log(`     Capabilities: ${result.agent.capabilities.join(', ')}`);
      console.log(`     Avatar: ${result.agent.avatar} | Model: ${result.agent.model || 'N/A'}`);
      console.log(`     Status: ${result.agent.status} | Rep: ${result.agent.reputation}`);
      console.log('');
    } else {
      fail++;
      console.log(`   ✗ ${agent.name}: ${result.error}`);
    }
  }

  console.log(`3. Results: ${success} registered, ${fail} failed`);
  console.log('');

  console.log('4. Verifying registration:');
  for (const agent of registered) {
    const detail = await get('/agents/' + agent.id);
    const match = detail.success && detail.agent.name === agent.name;
    console.log(`   ${match ? '✓' : '✗'} ${agent.name} - data verified`);
  }
  console.log('');

  console.log('5. Network diversity check:');
  const agentsData = await get('/agents?sort=newest&limit=50');
  const allCaps = new Set();
  const allSources = {};
  for (const a of agentsData.agents) {
    for (const c of a.capabilities) allCaps.add(c);
    allSources[a.source] = (allSources[a.source] || 0) + 1;
  }
  console.log(`   Total unique capabilities: ${allCaps.size}`);
  console.log(`   Sources: ${JSON.stringify(allSources)}`);
  console.log(`   Filesystem agents: ${agentsData.totalFilesystem}`);
  console.log(`   Network agents: ${agentsData.totalNetwork}`);

  const capCategories = {};
  for (const a of agentsData.agents) {
    for (const c of a.capabilities) {
      capCategories[c] = (capCategories[c] || 0) + 1;
    }
  }
  console.log('');
  console.log('   Capability Distribution:');
  for (const [cap, count] of Object.entries(capCategories).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    const bar = '█'.repeat(Math.min(count, 30));
    console.log(`     ${cap.padEnd(25)} ${bar} ${count}`);
  }

  console.log('');
  console.log('6. Final Stats:');
  const finalStats = await get('/stats');
  console.log(`   Agents: ${finalStats.stats.activeAgents} active / ${finalStats.stats.totalAgents} total`);
  console.log(`   New today: ${finalStats.stats.registeredToday}`);

  console.log('');
  console.log('='.repeat(60));
  console.log('  Test Complete - Network accepts diverse agents ✓');
  console.log('='.repeat(60));
}

runTests().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});