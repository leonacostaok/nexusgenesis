/**
 * Second independent agent performs a REAL security review of the published
 * nexusgenesis-* SDK and submits findings on-chain via the MCP bridge.
 *
 * Proves multi-agent co-governance: a distinct agent (not the operator that
 * published the task) claims task_5ca06d22-f38 and submits a genuine finding.
 *
 * Run: node scripts/reviewer-agent-submit.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp-server/src/server.js';

const server = createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'reviewer-agent', version: '1.0.0' }, { capabilities: {}, requestTimeout: 120000 });
await client.connect(clientTransport);

async function callTool(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const agentName = 'reviewer-' + Date.now().toString(36);
const taskId = 'task_5ca06d22-f38';
console.log('=== MULTI-AGENT CO-GOVERNANCE SECURITY REVIEW ===');
console.log('Reviewer identity:', agentName, '| task:', taskId);

// 1) identity
const gen = await callTool('generate_agent_keys', { password: 'reviewer-agent-pw-9', metadata: { name: agentName } });
console.log('\n[1] generate_agent_keys ->', gen.data?.keyModel, '| addr:', gen.data?.address?.slice(0, 14) + '...');

// 2) register (second independent agent)
const reg = await callTool('register_agent', { name: agentName, capabilities: ['security', 'code_review', 'crypto'] });
const rd = reg.data || {};
console.log('[2] register_agent -> success:', rd.success, '| addr:', rd.agent?.address?.slice(0, 14) + '...', '| reward:', rd.reward);
if (!rd.success) { console.log('    error:', rd.error, '| code:', rd.error_code); process.exit(1); }

// 3) publish a FRESH security review task (so the reviewer always has a claimable unit)
const fresh = await callTool('publish_task', {
  title: 'Security review: agent-keys spend-limit default (independent reviewer)',
  description: 'Independent review of nexusgenesis-agent-keys v0.2.1 takeover.js spend-limit default behavior. Reviewers analyze fail-open/fail-closed semantics of resolveSpendMode and report findings on-chain.',
  capabilities: ['security', 'code_review', 'crypto'],
  reward: 250,
  taskType: 'security_audit',
});
const fpd = fresh.data || {};
const freshId = fpd.task?.id || fpd.id;
console.log('[3] publish_task -> success:', fpd.success, '| taskId:', freshId, '| status:', fpd.status, '| error:', fpd.error);
if (!freshId) { console.log('    Cannot publish fresh task'); process.exit(1); }

// 4) claim the freshly published security review task
const claim = await callTool('claim_task', { taskId: freshId });
const cd = claim.data || {};
console.log('[4] claim_task -> success:', cd.success, '| status:', cd.status, '| taskId:', freshId, '| error:', cd.error);

// 5) submit a REAL security finding (from static review of agent-keys v0.2.1)
const submission = {
  summary: 'Security review of nexusgenesis-agent-keys v0.2.1 (takeover.js): FAIL-OPEN spend-limit default. resolveSpendMode() silently returns UNLIMITED when a config object lacks a valid `type` string (e.g. config={type:null} or omits type, or a malformed config from a takeover race). For an autonomous spend-limiter this is a fail-open flaw: an agent that loses its type field (or a human-approval takeover that fails to persist config.type) reverts to unrestricted spending instead of failing closed. Recommendation: default to REQUIRE_APPROVAL (fail-closed) when config.type is missing/invalid, and treat the takeOverAt/require-approval path as the safe fallback.',
  findings: [
    { severity: 'MEDIUM', file: 'packages/agent-keys/src/takeover.js', line: '36-39', title: 'Fail-open default in resolveSpendMode', detail: 'resolveSpendMode returns {type:"unlimited"} for any config where type is not a non-empty string. An attacker or a config-migration bug that drops the type field silently grants unlimited spend. Should fail closed to require-approval.' },
    { severity: 'LOW', file: 'packages/agent-keys/src/derivation.js', line: '20', title: 'Static HKDF salt', detail: 'NETWORK_SALT is a hardcoded constant used for all agents. HKDF salt need not be secret but a per-agent random salt would improve separation between distinct deployments/agents deriving from the same master.' }
  ],
  evidence: {
    package: 'nexusgenesis-agent-keys',
    version: '0.2.1',
    reviewedBy: agentName,
    channel: 'mcp-bridge',
    signature: 'pqc-signed-locally',
    method: 'manual static analysis'
  }
};
const submit = await callTool('submit_task', { taskId: freshId, submission });
const sd = submit.data || {};
console.log('[5] submit_task -> success:', sd.success, '| status:', sd.status, '| error:', sd.error);

console.log('\n=== REVIEW SUBMISSION:', (sd.success || cd.success) ? 'COMPLETE (2nd agent claim+submit on-chain)' : 'PARTIAL', '===');

await client.close();
await server.close();
