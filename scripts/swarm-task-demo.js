/**
 * Swarm Demo Script — Simulates multiple Agents registering, discovering,
 * claiming, executing, and submitting tasks to earn NGEN rewards.
 *
 * Usage:
 *   node scripts/swarm-task-demo.js [agentCount] [baseURL]
 *
 * Examples:
 *   node scripts/swarm-task-demo.js              # 5 agents, localhost:19891
 *   node scripts/swarm-task-demo.js 8            # 8 agents
 *   node scripts/swarm-task-demo.js 5 https://nexus-genesis.top  # production
 */

const AGENT_COUNT = parseInt(process.argv[2] || '5', 10);
const BASE_URL = process.argv[3] || 'http://localhost:19891';

const CAPABILITY_SETS = [
  ['SYSTEM_DIAGNOSTICS', 'NETWORK_GOVERNANCE'],
  ['SECURITY_AUDIT', 'CODE_ANALYSIS'],
  ['CODE_ANALYSIS'],
  ['NETWORK_GOVERNANCE', 'DATA_ANALYTICS'],
  ['SYSTEM_DIAGNOSTICS', 'P2P_COMM'],
  ['DATA_ANALYTICS', 'MARKET_ANALYSIS'],
  ['BLOCKCHAIN', 'SMART_CONTRACT_ANALYSIS'],
  ['SECURITY_AUDIT', 'DATA_ANALYTICS'],
  ['P2P_COMM', 'NETWORK_GOVERNANCE'],
  ['CODE_ANALYSIS', 'BLOCKCHAIN']
];

const AGENT_NAMES = [
  'Atlas', 'Beacon', 'Cipher', 'Drift', 'Echo',
  'Flux', 'Glyph', 'Helix', 'Ion', 'Jade'
];

// ---- Helpers ----

async function http(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  return resp.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(agentId, msg) {
  const tag = agentId.slice(0, 16).padEnd(16);
  console.log(`[${tag}] ${msg}`);
}

// ---- Simulated Task Execution ----

function simulateExecution(task) {
  const templates = {
    'Network Health Monitor': {
      type: 'health_report',
      uptime: '99.7%',
      avgLatency: '42ms',
      activePeers: Math.floor(Math.random() * 20 + 10),
      anomalies: []
    },
    'Smart Contract Security Audit': {
      type: 'audit_report',
      contractsReviewed: 3,
      findings: [
        { severity: 'low', description: 'Unused state variable in token contract' }
      ],
      overallScore: Math.floor(Math.random() * 10 + 88) / 100
    },
    'Protocol Documentation Review': {
      type: 'doc_review',
      gapsFound: 2,
      inconsistencies: 1,
      changeProposal: 'Update P2P handshake docs to reflect post-quantum key exchange'
    },
    'Governance Proposal: Block Time Adjustment': {
      type: 'governance_analysis',
      currentBlockTime: '5s',
      proposedBlockTime: '3s',
      reasoning: 'Current metrics show 70% empty blocks; reducing block time improves throughput without increasing orphan rate',
      dataPoints: { avgTxPerBlock: 2.3, emptyBlockRate: 0.7 }
    },
    'P2P Network Topology Analysis': {
      type: 'topology_report',
      nodeCount: 3,
      centralizationRisk: 'low',
      recommendation: 'Add 2 more peer connections per node for redundancy'
    },
    'Agent Capability Verification': {
      type: 'capability_report',
      agentsVerified: Math.floor(Math.random() * 3 + 1),
      avgAccuracy: Math.floor(Math.random() * 10 + 90) + '%',
      details: 'All claimed capabilities verified with 90%+ accuracy'
    },
    'Economic Model Stress Test': {
      type: 'stress_test_report',
      scenariosRun: 5,
      sustainabilityScore: Math.floor(Math.random() * 15 + 80) / 100,
      recommendation: 'Current token release schedule is sustainable under 10x load'
    },
    'Cross-Chain Bridge Feasibility Study': {
      type: 'feasibility_report',
      targetChains: ['Ethereum', 'Polygon'],
      technicalFeasibility: 'high',
      estimatedDevTime: '8-12 weeks',
      architecture: 'Lock-mint bridge with multi-sig custody'
    }
  };

  return templates[task.title] || {
    type: 'generic_report',
    summary: `Completed task: ${task.title}`,
    status: 'done'
  };
}

// ---- Agent Lifecycle ----

async function runAgent(index) {
  const name = AGENT_NAMES[index % AGENT_NAMES.length];
  const capabilities = CAPABILITY_SETS[index % CAPABILITY_SETS.length];
  const agentIdentity = `swarm-${name.toLowerCase()}-${Date.now()}-${index}`;

  log(agentIdentity, `Initializing agent "${name}" with capabilities: ${capabilities.join(', ')}`);

  // Step 1: Register
  try {
    const regResult = await http('POST', '/api/v1/bootstrap/agents/register', {
      agent_identity: agentIdentity,
      capabilities
    });

    if (!regResult.success) {
      log(agentIdentity, `Registration failed: ${regResult.error || 'unknown'}`);
      return { agent: agentIdentity, status: 'registration_failed' };
    }

    log(agentIdentity, `Registered! Reward: ${regResult.reward || 0} NGEN, Block: ${regResult.blockHeight || '?'}`);
  } catch (err) {
    log(agentIdentity, `Registration error: ${err.message}`);
    return { agent: agentIdentity, status: 'registration_error' };
  }

  await sleep(500 + Math.random() * 1000);

  // Step 2: Discover tasks
  let availableTasks;
  try {
    const taskResult = await http('GET', '/api/tasks?status=open&limit=20');
    availableTasks = (taskResult.tasks || []).filter(t => {
      const required = t.requiredCapabilities || t.required_capabilities || [];
      return required.length === 0 || capabilities.some(c => required.includes(c));
    });

    log(agentIdentity, `Found ${availableTasks.length} matching tasks out of ${(taskResult.tasks || []).length} open`);
  } catch (err) {
    log(agentIdentity, `Task discovery error: ${err.message}`);
    return { agent: agentIdentity, status: 'discovery_error' };
  }

  if (availableTasks.length === 0) {
    log(agentIdentity, 'No matching tasks available');
    return { agent: agentIdentity, status: 'no_tasks' };
  }

  // Step 3: Claim a task
  const targetTask = availableTasks[Math.floor(Math.random() * Math.min(3, availableTasks.length))];
  let claimResult;
  try {
    claimResult = await http('POST', `/api/tasks/${targetTask.id}/claim`, {
      agent_identity: agentIdentity
    });

    if (!claimResult.success) {
      log(agentIdentity, `Claim failed: ${claimResult.error || 'unknown'}`);
      return { agent: agentIdentity, status: 'claim_failed' };
    }

    log(agentIdentity, `Claimed task "${targetTask.title}" (${targetTask.reward} NGEN)`);
  } catch (err) {
    log(agentIdentity, `Claim error: ${err.message}`);
    return { agent: agentIdentity, status: 'claim_error' };
  }

  // Step 4: Execute (simulated)
  const execTime = 1000 + Math.random() * 2000;
  log(agentIdentity, `Executing task (${Math.round(execTime / 1000)}s simulated)...`);
  await sleep(execTime);

  const submission = simulateExecution(targetTask);

  // Step 5: Submit
  try {
    const submitResult = await http('POST', `/api/tasks/${targetTask.id}/submit`, {
      agent_identity: agentIdentity,
      submission
    });

    if (!submitResult.success) {
      log(agentIdentity, `Submit failed: ${submitResult.error || 'unknown'}`);
      return { agent: agentIdentity, status: 'submit_failed' };
    }

    log(agentIdentity, `Submitted! Status: ${submitResult.task?.status || 'submitted'}`);
  } catch (err) {
    log(agentIdentity, `Submit error: ${err.message}`);
    return { agent: agentIdentity, status: 'submit_error' };
  }

  return {
    agent: agentIdentity,
    name,
    status: 'task_submitted',
    taskId: targetTask.id,
    taskTitle: targetTask.title,
    reward: targetTask.reward
  };
}

// ---- Main ----

async function main() {
  console.log('='.repeat(70));
  console.log(`  NexusGenesis Swarm Task Demo`);
  console.log(`  Agents: ${AGENT_COUNT}  |  Target: ${BASE_URL}`);
  console.log('='.repeat(70));
  console.log();

  // Pre-flight check
  try {
    const health = await http('GET', '/health');
    console.log(`  Network: ${health.status || 'unknown'} | Block: ${health.blockHeight || '?'}`);
    console.log();
  } catch (err) {
    console.error(`  ERROR: Cannot reach ${BASE_URL} — ${err.message}`);
    process.exit(1);
  }

  // Launch agents concurrently with staggered start
  const agentPromises = [];
  for (let i = 0; i < AGENT_COUNT; i++) {
    agentPromises.push(
      sleep(i * 800).then(() => runAgent(i))
    );
  }

  const results = await Promise.all(agentPromises);

  // Summary
  console.log();
  console.log('='.repeat(70));
  console.log('  Results Summary');
  console.log('='.repeat(70));

  const byStatus = {};
  let totalReward = 0;

  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.reward) totalReward += parseInt(r.reward, 10);

    const status = r.status === 'task_submitted' ? 'SUBMITTED' : r.status.toUpperCase();
    const taskInfo = r.taskTitle ? ` "${r.taskTitle}" (${r.reward} NGEN)` : '';
    console.log(`  ${r.name || r.agent.slice(0, 16).padEnd(16)} ${status}${taskInfo}`);
  }

  console.log();
  console.log(`  Total agents: ${results.length}`);
  console.log(`  Tasks submitted: ${byStatus.task_submitted || 0}`);
  console.log(`  Pending rewards: ${totalReward} NGEN`);
  console.log(`  Failures: ${results.length - (byStatus.task_submitted || 0)}`);

  // Check final task stats
  try {
    const stats = await http('GET', '/api/tasks/stats');
    console.log();
    console.log(`  Network task stats: ${JSON.stringify(stats)}`);
  } catch (_) {}

  console.log();
  console.log('  Done! Agents are now earning NGEN on the network.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});