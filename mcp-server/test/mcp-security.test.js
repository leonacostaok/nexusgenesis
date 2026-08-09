import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { deriveChainAddresses } from 'nexusgenesis-chain-adapters';

let server;
let client;
let clientTransport;
let serverTransport;

before(async () => {
  server = createServer();
  [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);
});

after(async () => {
  await client.close();
  await server.close();
});

async function callTool(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
}

test('lists security tools', async () => {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  for (const expected of ['generate_agent_keys', 'generate_keypair', 'verify_signature', 'validate_address', 'check_spend', 'takeover_guard']) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
});

test('lists task economy + forum tools (AGENT world bridge)', async () => {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  for (const expected of [
    'register_agent', 'get_status', 'get_agents', 'get_agent', 'get_leaderboard',
    'list_tasks', 'get_task', 'claim_task', 'submit_task', 'verify_task', 'publish_task',
    'list_topics', 'create_topic', 'add_post', 'vote',
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
});

test('generate_agent_keys returns a self-sovereign identity (no private key leaked)', async () => {
  const out = await callTool('generate_agent_keys', { password: 'agent-secret-123', metadata: { name: 'alice' } });
  assert.equal(out.success, true);
  assert.equal(out.keyModel, 'self-sovereign');
  assert.match(out.address, /^ng1/);
  assert.equal(out.publicKeyHex.length, 2624); // 1312 bytes hex
  assert.ok(out.envelope && out.envelope.ciphertext, 'envelope must contain encrypted private key');
  assert.equal('privateKeyHex' in out, false, 'raw private key must never be emitted');
});

test('verify_signature validates a PQC signature', async () => {
  const { sign, verify } = await import('nexusgenesis-agent-keys');
  const { publicKey, privateKey } = await import('nexusgenesis-agent-keys').then((m) => m.generateKeyPair());
  const message = 'hello agent';
  const sig = await sign(message, privateKey);
  const ok = await callTool('verify_signature', {
    message,
    signature: sig.toString('hex'),
    publicKeyHex: publicKey.toString('hex'),
  });
  assert.equal(ok.valid, true);

  const bad = await callTool('verify_signature', {
    message: 'tampered',
    signature: sig.toString('hex'),
    publicKeyHex: publicKey.toString('hex'),
  });
  assert.equal(bad.valid, false);
});

test('validate_address accepts valid ng1 and rejects garbage', async () => {
  const { generateAddress } = await import('nexusgenesis-agent-keys');
  const keypair = await import('nexusgenesis-agent-keys').then((m) => m.generateKeyPair());
  const addr = generateAddress(keypair.publicKey);
  assert.equal((await callTool('validate_address', { address: addr })).valid, true);
  assert.equal((await callTool('validate_address', { address: 'not-an-address' })).valid, false);
});

test('check_spend enforces human-set ceilings', async () => {
  const limited = await callTool('check_spend', {
    amount: 500,
    spendConfig: { type: 'limit', maxPerTx: 100 },
  });
  assert.equal(limited.allowed, false);

  const ok = await callTool('check_spend', {
    amount: 50,
    spendConfig: { type: 'limit', maxPerTx: 100 },
  });
  assert.equal(ok.allowed, true);
});

test('takeover_guard blocks when human took control mid-operation', async () => {
  const blocked = await callTool('takeover_guard', {
    before: { type: 'unlimited' },
    after: { type: 'require-approval' },
  });
  assert.equal(blocked.safe, false);

  const safe = await callTool('takeover_guard', {
    before: { type: 'unlimited' },
    after: { type: 'unlimited' },
  });
  assert.equal(safe.safe, true);
});

test('generate_keypair digest cross-checks with chain-adapters derivation', async () => {
  const out = await callTool('generate_keypair', {});
  assert.equal(out.success, true);
  assert.equal(out.publicKeyHex.length, 2624);
  assert.ok(out.privateKeyHex);
  const addrs = deriveChainAddresses(Buffer.from(out.publicKeyHex, 'hex'), Buffer.from(out.privateKeyHex, 'hex'));
  assert.match(addrs.nexus, /^ng1/);
  assert.match(addrs.eth, /^0x[0-9a-fA-F]{40}$/);
});