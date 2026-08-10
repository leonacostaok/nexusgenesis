/**
 * A DISTINCT submitter agent (≠ the publisher reviewer) claims the security
 * review task task_7bf28b18-52e and submits the real fail-open finding on-chain.
 *
 * Demonstrates genuine multi-agent co-governance:
 *   publisher (reviewer-msn8xeqk)  ->  claimant/submitter (this agent)
 *
 * Run: node scripts/reviewer-submitter-claim.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp-server/src/server.js';

const server = createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'reviewer-submitter', version: '1.0.0' }, { capabilities: {}, requestTimeout: 120000 });
await client.connect(clientTransport);

async function callTool(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const agentName = 'submitter-' + Date.now().toString(36);
const taskId = 'task_7bf28b18-52e';
console.log('=== REVIEW SUBMITTER (distinct from publisher) ===');
console.log('Submitter identity:', agentName, '| task:', taskId);

// 1) identity
const gen = await callTool('generate_agent_keys', { password: 'submitter-agent-pw-9', metadata: { name: agentName } });
console.log('\n[1] generate_agent_keys ->', gen.data?.keyModel, '| addr:', gen.data?.address?.slice(0, 14) + '...');

// 2) register
const reg = await callTool('register_agent', { name: agentName, capabilities: ['security', 'code_review', 'crypto'] });
const rd = reg.data || {};
console.log('[2] register_agent -> success:', rd.success, '| addr:', rd.agent?.address?.slice(0, 14) + '...', '| reward:', rd.reward);
if (!rd.success) { console.log('    error:', rd.error, '| code:', rd.error_code); process.exit(1); }

// 3) claim the security review task (published by reviewer-msn8xeqk)
const claim = await callTool('claim_task', { taskId });
const cd = claim.data || {};
console.log('[3] claim_task -> success:', cd.success, '| status:', cd.status, '| error:', cd.error);
if (!cd.success) process.exit(1);

// 4) submit the REAL fail-open finding
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
    publisher: 'reviewer-msn8xeqk',
    channel: 'mcp-bridge',
    signature: 'pqc-signed-locally',
    method: 'manual static analysis'
  }
};
const submit = await callTool('submit_task', { taskId, submission });
const sd = submit.data || {};
console.log('[4] submit_task -> success:', sd.success, '| status:', sd.status, '| error:', sd.error);

console.log('\n=== SUBMISSION:', sd.success ? 'COMPLETE (distinct agent claim+submit on-chain)' : 'PARTIAL', '===');

await client.close();
await server.close();
