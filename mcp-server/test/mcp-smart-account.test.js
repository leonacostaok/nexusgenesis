import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, __resetSmartAccountForTest } from '../src/server.js';

let server;
let client;
let clientTransport;
let serverTransport;

// ─── Shared Smart Account fixtures (official EVM path) ──────────────────
const OWNER = '0x' + 'aa'.repeat(20);
const EMERGENCY = '0x' + 'bb'.repeat(20);
const SESSION_ID = '0x' + 'ab'.repeat(32);
const AGENT_ID = 'test-agent';
const EVM_KEY = '0x' + '11'.repeat(32);
const ISSUED_AT = Date.now() - 1000;
const EXPIRES_AT = Date.now() + 3600_000;

const WHITELIST = {
  allowedChains: ['ethereum'],
  allowedAssets: ['USDC'],
  allowedContracts: ['0xToken'],
  allowedMethods: ['transfer'],
  allowedRecipients: ['0xRecipient'],
};

const INTENT = {
  action: 'transfer',
  chain: 'ethereum',
  asset: 'USDC',
  amount: '25',
  recipient: '0xRecipient',
  contract: '0xToken',
  method: 'transfer',
  nonce: '1',
};

before(async () => {
  __resetSmartAccountForTest();
  server = createServer();
  [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-smart-account', version: '1.0.0' }, { capabilities: {} });
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

/** Create a local Smart Account with the shared fixtures. */
async function setupAccount() {
  const { addressForPrivateKey } = await import('nexusgenesis-chain-eth');
  const out = await callTool('smart_account_setup', {
    owner: OWNER,
    emergencyKey: EMERGENCY,
    sessionId: SESSION_ID,
    agentId: AGENT_ID,
    agentEvmAddress: addressForPrivateKey(EVM_KEY),
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    maxPerTx: '100',
    maxDaily: '500',
    ...WHITELIST,
  });
  return out;
}

test('lists Smart Account tools (official EVM path)', async () => {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  for (const expected of ['smart_account_setup', 'smart_account_preview', 'smart_account_execute', 'smart_account_estimate_loss']) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
});

test('smart_account_setup creates the account + session + exposure bound', async () => {
  const out = await setupAccount();
  assert.equal(out.success, true, JSON.stringify(out));
  assert.equal(out.sessionId, SESSION_ID);
  assert.match(out.accountId, /^0x[0-9a-f]{40}$/);
  assert.equal(out.maxLoss, '500'); // min(accountDaily, sessionDaily)
});

test('smart_account_setup rejects a malformed sessionId (fail-closed)', async () => {
  const out = await callTool('smart_account_setup', {
    owner: OWNER,
    emergencyKey: EMERGENCY,
    sessionId: 'not-32-bytes',
    agentId: AGENT_ID,
    agentEvmAddress: '0x0000000000000000000000000000000000000000',
    expiresAt: EXPIRES_AT,
  });
  assert.equal(out.success, false);
  assert.match(out.error, /32-byte hex/);
});

test('smart_account_preview admits an admissible intent and is side-effect free', async () => {
  await setupAccount();
  const out = await callTool('smart_account_preview', { ...INTENT, nonce: 1 });
  assert.equal(out.success, true, JSON.stringify(out));
  assert.equal(out.wouldExecute, true, JSON.stringify(out));
  assert.match(out.digest, /^0x[0-9a-f]{64}$/);

  // Side-effect free: exposure bound unchanged, and the SAME nonce is still
  // usable by a real execution (preview consumed nothing).
  const est = await callTool('smart_account_estimate_loss', {});
  assert.equal(est.success, true);
  assert.equal(est.sessions[0].remainingDaily, '500');

  const { signSmartAccountIntent } = await import('nexusgenesis-chain-eth');
  const signed = signSmartAccountIntent({
    session: { agentId: AGENT_ID, sessionId: SESSION_ID, issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT },
    intent: INTENT,
    privateKeyHex: EVM_KEY,
  });
  const exec = await callTool('smart_account_execute', {
    payload: signed.payload,
    signature: signed.signature,
    intent: INTENT,
    claimedAmount: '25',
    nonce: 1,
  });
  assert.equal(exec.success, true, JSON.stringify(exec));
  assert.equal(exec.remainingSessionDaily, '475');
});

test('smart_account_preview rejects an out-of-whitelist intent (fail-closed, INV-003)', async () => {
  await setupAccount();
  const out = await callTool('smart_account_preview', { ...INTENT, chain: 'solana', nonce: 1 });
  assert.equal(out.success, true);
  assert.equal(out.wouldExecute, false);
  assert.match(out.reason, /not allowed by session whitelist \(INV-003\)/);
});

test('smart_account_preview rejects a self-escalation action (INV-005)', async () => {
  await setupAccount();
  const out = await callTool('smart_account_preview', {
    ...INTENT,
    action: 'raise_limit',
    method: 'raise_limit',
    nonce: 1,
  });
  assert.equal(out.wouldExecute, false);
  assert.match(out.reason, /self-escalation/);
});

test('smart_account_execute rejects a forged signature (INV-002)', async () => {
  await setupAccount();
  const { signSmartAccountIntent } = await import('nexusgenesis-chain-eth');
  const signed = signSmartAccountIntent({
    session: { agentId: AGENT_ID, sessionId: SESSION_ID, issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT },
    intent: INTENT,
    privateKeyHex: EVM_KEY,
  });
  const out = await callTool('smart_account_execute', {
    payload: signed.payload,
    signature: '0x' + '00'.repeat(65), // garbage — not the session key
    intent: INTENT,
    claimedAmount: '25',
    nonce: 1,
  });
  assert.equal(out.success, false);
  assert.match(out.error, /INV-002/);
});

test('smart_account_execute enforces the per-tx ceiling (INV-007)', async () => {
  await setupAccount();
  const { signSmartAccountIntent } = await import('nexusgenesis-chain-eth');
  const big = { ...INTENT, amount: '250', nonce: '1' };
  const signed = signSmartAccountIntent({
    session: { agentId: AGENT_ID, sessionId: SESSION_ID, issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT },
    intent: big,
    privateKeyHex: EVM_KEY,
  });
  const out = await callTool('smart_account_execute', {
    payload: signed.payload,
    signature: signed.signature,
    intent: big,
    claimedAmount: '250',
    nonce: 1,
  });
  assert.equal(out.success, false);
  assert.match(out.error, /exceeds maxPerTx \(100\): 250 \(INV-007\)/);
});

test('smart_account_estimate_loss reports per-session + account bounds (INV-007)', async () => {
  await setupAccount();
  const out = await callTool('smart_account_estimate_loss', {});
  assert.equal(out.success, true);
  assert.equal(out.sessions.length, 1);
  assert.equal(out.sessions[0].sessionId, SESSION_ID);
  assert.equal(out.sessions[0].maxLossCeiling, '500');
  assert.match(out.maxLossStatement, /max 500/);
});
