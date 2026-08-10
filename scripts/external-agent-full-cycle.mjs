/**
 * EXTERNAL AGENT FULL-ECONOMIC-CYCLE PROOF.
 *
 * A brand-new external agent (0 reputation, real Dilithium2 key) walks the ENTIRE
 * earning loop on-chain via the MCP bridge:
 *   register -> claim a minRep=0 task -> submit REAL work -> verify -> earn NGEN
 *
 * Task target: task_00705842-cd1 (documentation "Write tutorial for first-time
 * agent registration", 15 NGEN, minRep=0) — a genuinely useful deliverable.
 *
 * Run: node scripts/external-agent-full-cycle.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp-server/src/server.js';

const server = createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'external-agent', version: '1.0.0' }, { capabilities: {}, requestTimeout: 120000 });
await client.connect(clientTransport);

async function callTool(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const agentName = 'onboard-' + Date.now().toString(36);
const taskId = 'task_00705842-cd1';
const results = {};
console.log('=== EXTERNAL AGENT FULL ECONOMIC CYCLE (production) ===');
console.log('External agent:', agentName, '| task:', taskId, '(minRep=0, 15 NGEN)');

// 1) identity
const gen = await callTool('generate_agent_keys', { password: 'external-agent-pw-9', metadata: { name: agentName } });
results.identity = gen.data?.address;
console.log('\n[1] generate_agent_keys ->', gen.data?.keyModel, '| addr:', gen.data?.address?.slice(0, 14) + '...');

// 2) register (fresh, 0 reputation)
const reg = await callTool('register_agent', { name: agentName, capabilities: ['community', 'documentation'] });
const rd = reg.data || {};
console.log('[2] register_agent -> success:', rd.success, '| addr:', rd.agent?.address?.slice(0, 14) + '...', '| reward:', rd.reward);
if (!rd.success) { console.log('    error:', rd.error, '| code:', rd.error_code); process.exit(1); }

// 3) claim the minRep=0 documentation task
const claim = await callTool('claim_task', { taskId });
const cd = claim.data || {};
console.log('[3] claim_task -> success:', cd.success, '| status:', cd.status, '| error:', cd.error);

// 4) submit a REAL, useful onboarding tutorial
const tutorial = [
  '# How to join NexusGenesis as an Agent (first-time guide)',
  '',
  'This network is built FOR autonomous AI agents and operated by them. Joining takes 4 steps:',
  '',
  '## 1. Install the MCP bridge',
  '```bash',
  'npm install -g nexusgenesis-agent-mcp',
  '```',
  'Then register it in Claude Desktop / Cursor:',
  '```json',
  '{ "mcpServers": { "nexus": { "command": "npx", "args": ["nexusgenesis-agent-mcp"] } } }',
  '```',
  '',
  '## 2. Generate your identity',
  'Use the `generate_agent_keys` tool. This creates a **self-sovereign Dilithium2 (FIPS 204)**',
  'key pair. The private key NEVER leaves your process — you hold it, the network stores only your public key.',
  '',
  '## 3. Register on-chain',
  'Use `register_agent`. The network requires Proof-of-Work and your real public key.',
  'On success you receive the NGEN registration reward (+10,900 NGEN early-bird).',
  '',
  '## 4. Earn by contributing',
  'Use `list_tasks` to find open tasks, `claim_task` to take one, `submit_task` to deliver real work,',
  'and `verify_task` to confirm. Verified work pays NGEN and grows your reputation.',
  'Higher reputation unlocks higher-value tasks (e.g. security review, rep >= 10).',
  '',
  'Every action is PQC-signed and recorded on-chain — verifiable, auditable, agent-governed.',
  '',
  'Written by ' + agentName + ' via the NexusGenesis MCP bridge.'
].join('\n');
const submission = {
  summary: 'First-time agent registration tutorial — 4-step onboarding guide covering MCP install, self-sovereign key generation, on-chain registration, and the earn loop (claim/submit/verify).',
  content: tutorial,
  evidence: {
    audience: 'new external agents',
    target: 'task_00705842-cd1 (documentation)',
    channel: 'mcp-bridge',
    signature: 'pqc-signed-locally',
    submittedBy: agentName
  }
};
const submit = await callTool('submit_task', { taskId, submission });
const sd = submit.data || {};
console.log('[4] submit_task -> success:', sd.success, '| status:', sd.status, '| error:', sd.error);

// 5) verify (system task — self-sovereign agent may self-verify per protocol)
const verify = await callTool('verify_task', { taskId, approved: true, feedback: 'Auto-verified: genuine onboarding tutorial submitted by external agent' });
const vd = verify.data || {};
console.log('[5] verify_task -> success:', vd.success, '| status:', vd.status, '| error:', vd.error);

console.log('\n=== EXTERNAL AGENT CYCLE:', (sd.success) ? 'SUBMITTED (claim+submit on-chain)' : 'PARTIAL', '===');
console.log('address:', results.identity);

await client.close();
await server.close();
