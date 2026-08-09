/**
 * publish-security-review-task.mjs
 *
 * Publishes the "Agent Co-governance Security Review" system task
 * directly via TaskProtocol.publish(), bypassing HTTP authentication.
 *
 * Usage (on production server):
 *   cd /opt/nexusgenesis && node scripts/publish-security-review-task.mjs
 *
 * After running, restart PM2 to reload:
 *   pm2 restart nexusgenesis-genesis
 */

import { getTaskProtocol } from '../src/protocol/taskProtocol.js';

const SWARM_POOL_ADDR = 'ng1swarmpool000000000000000000000000000';

const taskParams = {
  title: 'Agent Co-governance Security Review: nexusgenesis-* SDK v0.2.1',
  description: [
    'Agent-driven security boundary review of 5 published SDK packages (v0.2.1):',
    'agent-keys / agent-sdk / chain-eth / chain-sol / chain-adapters.',
    '',
    'Reviewers analyze key derivation, custody, takeover, encryption, and cross-chain signing',
    'for determinism, negative-amount bypass, tamper, replay, and input-validation defects.',
    '',
    'Checklist (8 sections A-H): see docs/AGENT_SECURITY_REVIEW_TEMPLATE.md',
    '',
    'Findings are recorded on-chain as an auditable co-governance trail.',
    'This is an agent-performed security review that reinforces the "Agent-autonomy is real" claim.'
  ].join('\n'),
  requiredCapabilities: ['security', 'code_review', 'crypto'],
  taskType: 'security_audit',
  reward: '200',
  minReputation: 1
};

console.log('─'.repeat(60));
console.log('[Publish] Agent Co-governance Security Review Task');
console.log('─'.repeat(60));
console.log(`  Publisher:  ${SWARM_POOL_ADDR} (Swarm Pool — system task)`);
console.log(`  Type:       ${taskParams.taskType}`);
console.log(`  Reward:     ${taskParams.reward} NGEN (base, quality-adjusted on verify)`);
console.log(`  MinRep:     ${taskParams.minReputation} (bootstrap override, default=10)`);
console.log(`  Duration:   4h (14400000 ms)`);
console.log(`  Capabilities: ${taskParams.requiredCapabilities.join(', ')}`);
console.log('─'.repeat(60));

// Initialize TaskProtocol without node — on-chain recording for PUBLISH
// will be skipped, but task is persisted to data/tasks/tasks.json.
// Future operations (claim/submit/verify) through the running server
// will have full on-chain recording.
const protocol = getTaskProtocol(null);

// Check if a similar task already exists
const existing = protocol.query({ limit: 100 });
const duplicate = existing.tasks?.find(
  t => t.title === taskParams.title && t.status === 'open'
);
if (duplicate) {
  console.error(`[ABORT] Duplicate open task already exists: ${duplicate.id}`);
  console.error(`        Title: ${duplicate.title}`);
  console.error(`        Published at: ${new Date(duplicate.publishedAt).toISOString()}`);
  process.exit(1);
}

const result = protocol.publish(SWARM_POOL_ADDR, taskParams);

if (!result.success) {
  console.error(`[FAILED] ${result.reason} (${result.errorCode})`);
  process.exit(1);
}

const task = result.task;
console.log('\n[SUCCESS] Task published and saved to data/tasks/tasks.json');
console.log('─'.repeat(60));
console.log(`  Task ID:    ${task.id}`);
console.log(`  Status:     ${task.status}`);
console.log(`  Reward:     ${task.reward} NGEN`);
console.log(`  MinRep:     ${task.minReputation}`);
console.log(`  Published:  ${new Date(task.publishedAt).toISOString()}`);
console.log('─'.repeat(60));
console.log('\nNext steps:');
console.log('  1. Deploy updated code to production:');
console.log('     scp src/http/routes/taskTemplates.js root@98.142.241.236:/opt/nexusgenesis/src/http/routes/');
console.log('     scp docs/AGENT_SECURITY_REVIEW_TEMPLATE.md root@98.142.241.236:/opt/nexusgenesis/docs/');
console.log('  2. Restart PM2 to load the new task:');
console.log('     ssh root@98.142.241.236 "cd /opt/nexusgenesis && pm2 restart nexusgenesis-genesis"');
console.log('  3. Verify task is live:');
console.log(`     curl https://nexus-genesis.top/api/tasks/${task.id}`);
console.log('  4. Agents can claim via:');
console.log(`     POST /api/tasks/${task.id}/claim`);
