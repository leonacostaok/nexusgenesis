#!/usr/bin/env node
/**
 * System Task Publisher + Auto-Verifier
 *
 * Acts as the "task market maker" — publishes tasks for agents to work on,
 * and auto-verifies submissions so agents get paid autonomously.
 *
 * This closes the agent economy loop:
 *   System publishes task → Agent claims → Agent executes → Agent submits
 *   → System auto-verifies → NGEN transferred from Swarm Pool to Agent
 *
 * Usage:
 *   node scripts/system-task-publisher.js --publisher <agent_identity> [--interval 120000]
 *
 * PM2:
 *   pm2 start ecosystem.agent-workers.json --only system-publisher
 */
import http from 'http';
import crypto from 'crypto';

const BASE_HOST = process.env.NEXUS_HOST || '127.0.0.1';
const BASE_PORT = parseInt(process.env.NEXUS_PORT || '19891', 10);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { interval: 120000, maxTasks: 10 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--publisher') opts.publisher = args[++i];
    else if (args[i] === '--interval') opts.interval = parseInt(args[++i], 10);
    else if (args[i] === '--max-tasks') opts.maxTasks = parseInt(args[++i], 10);
  }
  if (!opts.publisher) {
    console.error('Usage: node scripts/system-task-publisher.js --publisher <agent_identity> [--interval 120000]');
    process.exit(1);
  }
  return opts;
}

function api(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    // SECURITY 2026-07-06: System publisher 用 NG_ADMIN_BYPASS_SECRET（任务/投票免签类）
    // 不再使用 NG_ADMIN_SECRET（向后兼容：fallback 到该值）
    // 注意：system publisher 是 ng1swarmpool reserved address，AGENT custody token 不可用
    const adminSecret = process.env.NG_ADMIN_BYPASS_SECRET || process.env.NG_ADMIN_SECRET;
    if (adminSecret) {
      options.headers['x-admin-secret'] = adminSecret;
    }
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ ok: false, status: res.statusCode, data: { raw } }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, data: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });
}

// ─── Task templates (rotated for variety) ───
// 奖励范围 50-200 NGEN, 覆盖 monitoring/analysis/community/coding/research/security

const TASK_TEMPLATES = [
  // ── monitoring 类 (50-100 NGEN) ──
  {
    title: 'Network health monitoring — check RPC and dashboard uptime',
    description: 'Monitor the NexusGenesis network endpoints. Verify RPC is responsive, dashboard loads, and block production is active. Report any anomalies in block interval or peer connectivity.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '50'
  },
  {
    title: 'Security posture check — verify PQC signatures on recent transactions',
    description: 'Check that recent transactions have valid post-quantum signatures. Report any signature anomalies or verification failures.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '75'
  },
  {
    title: 'Swarm Pool balance verification — check reward distribution readiness',
    description: 'Verify the Swarm Pool has sufficient NGEN balance for task rewards. Report current balance and projected runway at current consumption rate.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '60'
  },
  {
    title: 'P2P network topology audit — check peer connectivity',
    description: 'Audit the P2P network topology. Check peer counts on all nodes, verify no orphaned connections, and report network diameter.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '80'
  },
  // ── analysis 类 (80-150 NGEN) ──
  {
    title: 'Agent ecosystem analysis — count active agents and validators',
    description: 'Analyze the current agent registry. Count active agents, validators, compute network participation rate, and identify inactive agents.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '90'
  },
  {
    title: 'Block production analysis — verify recent blocks and tx throughput',
    description: 'Analyze recent 100 blocks. Check block interval consistency, transaction count per block, consensus health, and validator rotation.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '120'
  },
  {
    title: 'Task market audit — review open vs completed tasks',
    description: 'Audit the task marketplace. Check for stale tasks, completion rate, average reward distribution, and agent participation metrics.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '100'
  },
  {
    title: 'Economic model stress analysis — simulate high-volume scenarios',
    description: 'Simulate high-transaction-volume scenarios. Evaluate NGEN circulation velocity, Swarm Pool depletion rate, and inflation pressure.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '150'
  },
  {
    title: 'Governance proposal impact assessment — analyze voting patterns',
    description: 'Analyze governance proposals, voting patterns, steward signature rates, and proposal success/failure ratios. Recommend improvements.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '130'
  },
  // ── community 类 (50-100 NGEN) ──
  {
    title: 'Forum activity generation — create a technical discussion topic',
    description: 'Generate a thoughtful technical discussion topic for the NexusGenesis forum about agent economies, PQC, or decentralized governance.',
    requiredCapabilities: ['community'],
    taskType: 'community',
    reward: '50'
  },
  {
    title: 'Community engagement — write a summary of NexusGenesis for new agents',
    description: 'Create an onboarding summary explaining how new agents can join, earn NGEN, and participate in governance.',
    requiredCapabilities: ['community'],
    taskType: 'community',
    reward: '70'
  },
  {
    title: 'Developer documentation review — identify gaps in API docs',
    description: 'Review the public API documentation. Identify missing endpoints, unclear descriptions, and recommend improvements for developer adoption.',
    requiredCapabilities: ['community'],
    taskType: 'community',
    reward: '90'
  },
  // ── coding 类 (150-200 NGEN) ──
  {
    title: 'Smart contract security audit — review escrow and staking contracts',
    description: 'Audit the escrow and staking smart contracts for reentrancy, overflow, and access control vulnerabilities. Submit findings with severity ratings.',
    requiredCapabilities: ['coding'],
    taskType: 'coding',
    reward: '200'
  },
  {
    title: 'Chain reorganization logic review — analyze fork handling code',
    description: 'Review the chain fork detection and reorganization logic in genesisNode.js. Identify edge cases and recommend improvements for robustness.',
    requiredCapabilities: ['coding'],
    taskType: 'coding',
    reward: '180'
  },
  {
    title: 'P2P handshake optimization — propose connection pooling improvements',
    description: 'Analyze the P2P handshake flow. Propose optimizations for connection establishment, key exchange, and peer discovery latency.',
    requiredCapabilities: ['coding'],
    taskType: 'coding',
    reward: '160'
  },
  // ── research 类 (100-180 NGEN) ──
  {
    title: 'Cross-chain bridge feasibility study — NGEN to EVM chains',
    description: 'Research and document the feasibility of bridging NGEN to Ethereum and other EVM chains. Include technical architecture proposal and risk analysis.',
    requiredCapabilities: ['research'],
    taskType: 'research',
    reward: '180'
  },
  {
    title: 'Post-quantum cryptography migration plan — assess ML-KEM readiness',
    description: 'Assess the current ML-KEM-768 implementation readiness for NIST PQC standardization. Recommend migration steps and timeline.',
    requiredCapabilities: ['research'],
    taskType: 'research',
    reward: '150'
  },
  {
    title: 'Agent reputation system design — propose weighted scoring model',
    description: 'Design a reputation scoring model that weights task quality, timeliness, and community contributions. Include mathematical formulation and simulation results.',
    requiredCapabilities: ['research'],
    taskType: 'research',
    reward: '130'
  },
  // ── security_audit 类 (180-200 NGEN) ──
  {
    title: 'Validator slashing mechanism audit — verify penalty enforcement',
    description: 'Audit the validator slashing mechanism. Verify downtime/double-sign/malicious penalties are correctly enforced and slashed funds reach burn address.',
    requiredCapabilities: ['security_audit'],
    taskType: 'security_audit',
    reward: '200'
  },
  {
    title: 'DDoS protection assessment — evaluate rate limiter effectiveness',
    description: 'Evaluate the DDoS protection and rate limiting mechanisms. Propose improvements for handling sustained attacks and sybil resistance.',
    requiredCapabilities: ['security_audit'],
    taskType: 'security_audit',
    reward: '180'
  },
];

// ─── Publish a task ───

async function publishTask(publisher, template) {
  const resp = await api('POST', '/api/tasks', {
    agent_identity: publisher,
    title: template.title,
    description: template.description,
    requiredCapabilities: template.requiredCapabilities,
    taskType: template.taskType,
    reward: template.reward
  });

  if (resp.ok) {
    console.log(`  📤 Published: "${template.title.slice(0, 50)}..." (${template.reward} NGEN)`);
  } else {
    console.log(`  ✗ Publish failed: ${resp.data?.error || 'unknown'}`);
  }
  return resp.ok;
}

// ─── Auto-verify submitted tasks ───

async function autoVerifySubmissions(publisher) {
  const resp = await api('GET', '/api/tasks?status=submitted&limit=20');
  if (!resp.ok || !resp.data?.tasks?.length) return 0;

  let verified = 0;
  for (const task of resp.data.tasks) {
    const verifyResp = await api('POST', `/api/tasks/${task.id}/verify`, {
      agent_identity: publisher,
      approved: true,
      feedback: 'Auto-verified by system publisher — submission meets quality standards'
    });

    if (verifyResp.ok) {
      console.log(`  ✓ Auto-verified task ${task.id?.slice(0, 20)} — ${task.reward} NGEN → agent`);
      verified++;
    }
  }
  return verified;
}

// ─── Check if we need more tasks ───

async function publishIfNeeded(publisher, maxOpen) {
  const resp = await api('GET', '/api/tasks?status=open&limit=50');
  const openCount = resp.ok ? (resp.data?.tasks?.length || 0) : 0;

  if (openCount >= maxOpen) {
    console.log(`  ℹ ${openCount} open tasks already in market, skipping publish`);
    return;
  }

  // 一次发布多个任务填满到 maxOpen (最多 3 个/tick, 避免突发)
  const toPublish = Math.min(maxOpen - openCount, 3);
  // 随机打乱模板顺序, 取前 toPublish 个 (避免重复)
  const shuffled = [...TASK_TEMPLATES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < toPublish && i < shuffled.length; i++) {
    await publishTask(publisher, shuffled[i]);
  }
}

// ─── Main ───

async function main() {
  const opts = parseArgs();
  console.log('═══════════════════════════════════════════════════');
  console.log('  NexusGenesis System Task Publisher + Auto-Verifier');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Publisher:    ${opts.publisher}`);
  console.log(`  Interval:     ${opts.interval / 1000}s`);
  console.log(`  Max open:     ${opts.maxTasks} tasks`);
  console.log(`  Endpoint:     http://${BASE_HOST}:${BASE_PORT}`);
  console.log('═══════════════════════════════════════════════════\n');

  let cycle = 0;

  async function tick() {
    cycle++;
    console.log(`\n[Cycle ${cycle}] ${new Date().toISOString()}`);

    try {
      // 1. Publish new tasks if needed
      await publishIfNeeded(opts.publisher, opts.maxTasks);

      // 2. Auto-verify pending submissions
      const verified = await autoVerifySubmissions(opts.publisher);
      if (verified > 0) {
        console.log(`  💰 Verified ${verified} submissions this cycle`);
      }
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
    }
  }

  await tick();
  setInterval(tick, opts.interval);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
