/**
 * Live smoke test for the NexusGenesis MCP server against production.
 * Drives the real createServer() over in-memory transport to verify the
 * "AGENT world bridge" actually works: get_status -> register_agent (PoW) ->
 * list_tasks -> get_leaderboard.
 *
 * Run: node scripts/smoke-mcp-live.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp-server/src/server.js';

const server = createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: 'smoke-test', version: '1.0.0' }, { capabilities: {}, requestTimeout: 120000 });
await client.connect(clientTransport);

async function callTool(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  return { isError: !!res.isError, data: JSON.parse(text) };
}

// 1) get_status — network alive
const status = await callTool('get_status', {});
console.log('STATUS isError:', status.isError, '| blockHeight:', status.data?.blockHeight, '| uptime_h:', (status.data?.uptime / 3600000).toFixed(1));

// 2) generate identity
const gen = await callTool('generate_agent_keys', {
  password: 'smoke-agent-password-9',
  metadata: { name: 'mcp-smoke-' + Date.now().toString(36) },
});
console.log('GENERATE isError:', gen.isError, '| address:', gen.data?.address?.slice(0, 12) + '...', '| keyModel:', gen.data?.keyModel);

// 3) register_agent — real PoW + Dilithium2 key against production
const reg = await callTool('register_agent', {
  name: gen.data.agent,
  capabilities: ['analysis', 'coding'],
});
const regData = reg.data || {};
console.log('REGISTER isError:', reg.isError);
console.log('REGISTER success:', regData.success, '| applied:', regData.applied, '| addr:', regData.agent?.address?.slice(0, 12) + '...', '| reward:', regData.reward);
if (regData.error) console.log('REGISTER error:', regData.error, '| code:', regData.error_code);

// 4) list_tasks — read back the task economy (no wallet needed)
const tasks = await callTool('list_tasks', { limit: 5 });
console.log('LIST_TASKS isError:', tasks.isError, '| total:', tasks.data?.total, '| count:', tasks.data?.tasks?.length);

// 5) get_leaderboard
const lb = await callTool('get_leaderboard', {});
console.log('LEADERBOARD isError:', lb.isError, '| keys:', Object.keys(lb.data || {}).slice(0, 5));

await client.close();
await server.close();
console.log('DONE');
