import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAgentIdentity,
  recoverAgentIdentity,
  signAsAgent,
  generateAddress,
  validateAddress,
  KEY_MODELS,
  SPEND_MODES,
  checkSpendAllowed,
  takeoverGuard,
  CoordinationClient,
  createMemoryTransport,
  runTaskLoop,
  TASK_STATUS
} from '../src/index.js';

test('createAgentIdentity returns self-sovereign identity with encrypted key', async () => {
  const identity = await createAgentIdentity({ password: 'agent-secret-123' });
  assert.ok(identity.address.startsWith('ng1'));
  assert.equal(identity.keyModel, KEY_MODELS.SELF_SOVEREIGN);
  assert.equal(validateAddress(identity.address).valid, true);
  assert.ok(identity.envelope.cipher, 'aes-256-gcm');
  // private key never exposed
  assert.ok(!('privateKey' in identity));
});

test('recoverAgentIdentity round-trips the wallet', async () => {
  const identity = await createAgentIdentity({ password: 'agent-secret-123' });
  const wallet = recoverAgentIdentity(identity.envelope, 'agent-secret-123');
  assert.equal(wallet.address, identity.address);
  const bad = recoverAgentIdentity(identity.envelope, 'wrong-password');
  assert.equal(bad, null);
});

test('signAsAgent produces verifiable signature', async () => {
  const identity = await createAgentIdentity({ password: 'agent-secret-123' });
  const wallet = recoverAgentIdentity(identity.envelope, 'agent-secret-123');
  const sig = await signAsAgent(wallet, { action: 'claim', taskId: 't-1' });
  assert.ok(typeof sig === 'string' && sig.length > 0);
  assert.equal(await wallet.verify({ action: 'claim', taskId: 't-1' }, sig), true);
});

test('CoordinationClient works over memory transport', async () => {
  const transport = createMemoryTransport();
  const client = new CoordinationClient(transport);
  const published = await client.publishTask({
    agent: 'agent-1',
    title: 'Research quantized models',
    description: 'Summarize latest',
    capabilities: ['research'],
    reward: 100,
    taskType: 'research'
  });
  assert.equal(published.ok, true);
  const tasks = await client.listTasks();
  assert.ok(Array.isArray(tasks.tasks));
});

test('runTaskLoop respects human takeover spend limits', async () => {
  const transport = createMemoryTransport();
  const identity = await createAgentIdentity({ password: 'agent-secret-123' });
  const wallet = recoverAgentIdentity(identity.envelope, 'agent-secret-123');

  // Autonomous agent: unlimited
  const autonomous = await runTaskLoop({
    agent: 'agent-1',
    wallet,
    spendConfig: { type: SPEND_MODES.UNLIMITED },
    transport,
    tasks: [{ id: 't-1', reward: 100 }]
  });
  assert.equal(autonomous.results[0].status, 'claimed');

  // Taken over: require-approval blocks spend
  const blocked = await runTaskLoop({
    agent: 'agent-1',
    wallet,
    spendConfig: { type: SPEND_MODES.REQUIRE_APPROVAL },
    transport,
    tasks: [{ id: 't-2', reward: 100 }]
  });
  assert.equal(blocked.results[0].status, 'blocked');
});

test('TASK_STATUS and takeoverGuard are exported', () => {
  assert.equal(TASK_STATUS.OPEN, 'open');
  assert.equal(takeoverGuard({ type: 'unlimited' }, { type: 'unlimited' }), true);
  assert.equal(checkSpendAllowed({ type: 'limit', maxPerTx: 10 }, { amount: 20 }).allowed, false);
});