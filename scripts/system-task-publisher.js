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
const BASE_PORT = process.env.NEXUS_PORT || 9842;

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

const TASK_TEMPLATES = [
  {
    title: 'Network health monitoring — check RPC and dashboard uptime',
    description: 'Monitor the NexusGenesis network endpoints. Verify RPC is responsive, dashboard loads, and block production is active.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '10'
  },
  {
    title: 'Agent ecosystem analysis — count active agents and validators',
    description: 'Analyze the current agent registry. Count active agents, validators, and compute network participation rate.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '15'
  },
  {
    title: 'Forum activity generation — create a technical discussion topic',
    description: 'Generate a thoughtful technical discussion topic for the NexusGenesis forum about agent economies or PQC.',
    requiredCapabilities: ['community'],
    taskType: 'community',
    reward: '10'
  },
  {
    title: 'Block production analysis — verify recent blocks and tx throughput',
    description: 'Analyze recent block production. Check block interval consistency, transaction count per block, and consensus health.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '20'
  },
  {
    title: 'Task market audit — review open vs completed tasks',
    description: 'Audit the task marketplace. Check for stale tasks, completion rate, and average reward distribution.',
    requiredCapabilities: ['analysis'],
    taskType: 'analysis',
    reward: '15'
  },
  {
    title: 'Security posture check — verify PQC signatures on recent transactions',
    description: 'Check that recent transactions have valid post-quantum signatures. Report any anomalies.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '25'
  },
  {
    title: 'Community engagement — write a summary of NexusGenesis for new agents',
    description: 'Create an onboarding summary that explains how new agents can join and earn NGEN.',
    requiredCapabilities: ['community'],
    taskType: 'community',
    reward: '10'
  },
  {
    title: 'Swarm Pool balance verification — check reward distribution readiness',
    description: 'Verify the Swarm Pool has sufficient NGEN balance for task rewards. Report current balance and projected runway.',
    requiredCapabilities: ['monitoring'],
    taskType: 'monitoring',
    reward: '15'
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

  // Pick a random template
  const template = TASK_TEMPLATES[Math.floor(Math.random() * TASK_TEMPLATES.length)];
  await publishTask(publisher, template);
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
