/**
 * Sprint 3 — Simulation 正式化 + Policy Engine 外置化 测试
 *
 * 覆盖：
 *   T1 Simulation gate  fail-closed：required action 未经成功 signed preview → SimulationRequired；
 *                        经成功 preview → 放行；digest 不匹配 → 仍拒绝。
 *   T2 Policy Engine    SMART_ACCOUNT_POLICY_FILE 规则生效：超限 → PolicyRejected；
 *                        默认（无文件）→ 软策略放行，链上硬策略兜底。
 *   工具面              smart_account_simulation_policy / smart_account_policy 查询。
 *   可观测              metrics：simulation_blocked / policy_rejected；audit 带 gate 字段。
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, __resetSmartAccountForTest } from '../src/server.js';
import { classifySimulationRisk } from '../src/simulation-policy.js';
import { evaluatePolicy, policySnapshot } from '../src/policy-engine.js';

const STATE_FILE = join(tmpdir(), `sim-policy-state-${process.pid}-${Date.now()}.json`);
const POLICY_FILE = join(tmpdir(), `sim-policy-rules-${process.pid}-${Date.now()}.json`);

process.env.SMART_ACCOUNT_STATE_FILE = STATE_FILE;

// local 配置面（anvil 密钥，与既有测试一致）。
const OWNER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const EMERGENCY_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const SESSION_ID = '0x' + 'ab'.repeat(32);
const AGENT_ID = 'sim-policy-agent';
const AGENT_PK = '0x' + '11'.repeat(32);
const ISSUED_AT = Date.now() - 1000;
const EXPIRES_AT = Date.now() + 3600_000;
const SESSION_BINDING = { agentId: AGENT_ID, sessionId: SESSION_ID, issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT };

const INTENT = {
  action: 'transfer', chain: 'ethereum', asset: 'USDC', amount: '25',
  recipient: '0xRecipient', contract: '0xToken', method: 'transfer', nonce: '1',
};

const WHITELIST = {
  allowedChains: ['ethereum'],
  allowedAssets: ['USDC'],
  allowedContracts: ['0xToken'],
  allowedMethods: ['transfer'],
  allowedRecipients: ['0xRecipient'],
};

let server;
let client;
let clientTransport;
let serverTransport;

before(async () => {
  __resetSmartAccountForTest();
  server = createServer();
  [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-sim-policy', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);
});

beforeEach(() => {
  __resetSmartAccountForTest();
});

after(async () => {
  await client.close();
  await server.close();
  __resetSmartAccountForTest();
  for (const f of [STATE_FILE, POLICY_FILE]) {
    if (existsSync(f)) unlinkSync(f);
  }
});

async function callTool(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
}

async function setupAccount() {
  const { addressForPrivateKey } = await import('nexusgenesis-chain-eth');
  const out = await callTool('smart_account_setup', {
    owner: OWNER_PK,
    emergencyKey: EMERGENCY_PK,
    sessionId: SESSION_ID,
    agentId: AGENT_ID,
    agentEvmAddress: addressForPrivateKey(AGENT_PK),
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    maxPerTx: '100',
    maxDaily: '500',
    ...WHITELIST,
  });
  assert.equal(out.success, true, JSON.stringify(out));
  return out;
}

// 延迟 import 避免模块初始化顺序问题；本地封装签名。
let _signer;
async function signSmartAccountIntentLocal(intent) {
  if (!_signer) {
    const { signSmartAccountIntent } = await import('nexusgenesis-chain-eth');
    _signer = signSmartAccountIntent;
  }
  return _signer({ session: SESSION_BINDING, intent, privateKeyHex: AGENT_PK });
}

// ─── 单元：simulation-policy 分类 ────────────────────────────────────────
test('T1 classifySimulationRisk: required / skippable / unknown fail-closed', () => {
  assert.equal(classifySimulationRisk('transfer').level, 'required');
  assert.equal(classifySimulationRisk('transfer').requiresSimulation, true);
  assert.equal(classifySimulationRisk('raise-limit').requiresSimulation, true);
  assert.equal(classifySimulationRisk('balance').requiresSimulation, false);
  assert.equal(classifySimulationRisk('view').level, 'skippable');
  // 未知 action → required（fail-closed）
  assert.equal(classifySimulationRisk('totally-unknown-action').requiresSimulation, true);
  assert.equal(classifySimulationRisk('').requiresSimulation, true);
});

// ─── 单元：policy-engine ─────────────────────────────────────────────────
test('T2 evaluatePolicy: default (no file) is permissive; file rules enforce', () => {
  try {
    // 默认：无 SMART_ACCOUNT_POLICY_FILE → 软策略放行。
    delete process.env.SMART_ACCOUNT_POLICY_FILE;
    assert.deepEqual(evaluatePolicy({ action: 'transfer', amount: '999999' }), { allowed: true });

    // 有规则文件：enabled:false → 拒绝；maxPerTx 超限 → 拒绝；未命中 → 放行。
    writeFileSync(POLICY_FILE, JSON.stringify({
      rules: [
        { action: 'transfer', enabled: true, maxPerTx: '10' },
        { action: 'withdraw', enabled: false },
      ],
    }), 'utf8');
    process.env.SMART_ACCOUNT_POLICY_FILE = POLICY_FILE;

    const over = evaluatePolicy({ action: 'transfer', amount: '25' });
    assert.equal(over.allowed, false);
    assert.equal(over.code, 'PolicyRejected');

    const disabled = evaluatePolicy({ action: 'withdraw' });
    assert.equal(disabled.allowed, false);
    assert.equal(disabled.code, 'PolicyRejected');

    const ok = evaluatePolicy({ action: 'transfer', amount: '5' });
    assert.deepEqual(ok, { allowed: true });

    const unlisted = evaluatePolicy({ action: 'swap' });
    assert.deepEqual(unlisted, { allowed: true });

    const snap = policySnapshot();
    assert.equal(snap.rules.length, 2);
  } finally {
    delete process.env.SMART_ACCOUNT_POLICY_FILE;
  }
});

test('T2 evaluatePolicy: BigInt-safe ceiling + malformed amount fail-closed (review fix)', () => {
  try {
    writeFileSync(POLICY_FILE, JSON.stringify({
      rules: [{ action: 'transfer', enabled: true, maxPerTx: '9007199254740992' }], // 2^53
    }), 'utf8');
    process.env.SMART_ACCOUNT_POLICY_FILE = POLICY_FILE;

    // 2^53 + 1 > 2^53：Number() 会双双舍入为 2^53（相等→放行），BigInt 精确比较 → 拒绝。
    const precision = evaluatePolicy({ action: 'transfer', amount: '9007199254740993' });
    assert.equal(precision.allowed, false, 'wei 级金额不得因 Number 精度损失而绕过限额');
    assert.equal(precision.code, 'PolicyRejected');

    // 边界值本身（等于限额）→ 放行。
    const atLimit = evaluatePolicy({ action: 'transfer', amount: '9007199254740992' });
    assert.deepEqual(atLimit, { allowed: true });

    // malformed amount（非数字）→ fail-closed 拒绝，不得静默放行。
    const malformed = evaluatePolicy({ action: 'transfer', amount: 'not-a-number' });
    assert.equal(malformed.allowed, false);
    assert.match(malformed.reason, /not numeric/);
  } finally {
    delete process.env.SMART_ACCOUNT_POLICY_FILE;
  }
});

test('T2 loadPolicy: corrupted policy file degrades to permissive (on-chain backstop)', () => {
  try {
    writeFileSync(POLICY_FILE, '{ not valid json !!!', 'utf8');
    process.env.SMART_ACCOUNT_POLICY_FILE = POLICY_FILE;
    // 软策略回退为空表（放行）——链上硬策略兜底；行为与设计一致。
    assert.deepEqual(evaluatePolicy({ action: 'transfer', amount: '999' }), { allowed: true });
    assert.equal(policySnapshot().rules.length, 0);
  } finally {
    delete process.env.SMART_ACCOUNT_POLICY_FILE;
  }
});

// ─── 集成：工具面 ────────────────────────────────────────────────────────
test('tools smart_account_simulation_policy / smart_account_policy exist and respond', async () => {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  assert.ok(names.includes('smart_account_simulation_policy'));
  assert.ok(names.includes('smart_account_policy'));

  const sp = await callTool('smart_account_simulation_policy', { action: 'transfer' });
  assert.equal(sp.success, true);
  assert.equal(sp.risk.level, 'required');
  assert.equal(sp.policy.windowMs, 60000);

  const pol = await callTool('smart_account_policy', {});
  assert.equal(pol.success, true);
  assert.ok(Array.isArray(pol.policy.rules));
});

// ─── 集成：simulation gate fail-closed ───────────────────────────────────
test('T1 execute without a successful signed preview → SimulationRequired (fail-closed)', async () => {
  await setupAccount();
  const { payload, signature } = await signSmartAccountIntentLocal(INTENT);

  // 未经 preview 直接 execute（transfer 为 required）→ 拒绝，不走链。
  const blocked = await callTool('smart_account_execute', { payload, signature });
  assert.equal(blocked.success, false);
  assert.equal(blocked.error, 'SimulationRequired');
  assert.equal(blocked.simulation.level, 'required');

  // 指标 + 审计留痕（gate: simulation）。
  const m = (await callTool('smart_account_metrics', {})).metrics;
  assert.equal(m.smart_account_simulation_blocked, 1);
  const audit = await callTool('smart_account_audit', {});
  const gated = audit.entries.find((e) => e.gate === 'simulation');
  assert.equal(gated.errorName, 'SimulationRequired');
});

test('T1 signed preview arms the gate → execute proceeds', async () => {
  await setupAccount();
  const { payload, signature } = await signSmartAccountIntentLocal(INTENT);

  // 带签名成功 preview（wouldExecute=true，且为 required action 提供 digest 记录）。
  const prev = await callTool('smart_account_preview', { ...INTENT, nonce: 1, signature });
  assert.equal(prev.success, true, JSON.stringify(prev));
  assert.equal(prev.wouldExecute, true);
  assert.equal(prev.simulation.level, 'required');

  // 同一 digest → 门禁放行，execute 成功。
  const exec = await callTool('smart_account_execute', { payload, signature });
  assert.equal(exec.success, true, JSON.stringify(exec));
  assert.equal(exec.status, 'confirmed');

  // 非 required action（balance）即使无 preview 也不拦截。
  const balance = await callTool('smart_account_preview', {
    action: 'balance', chain: 'ethereum', asset: 'USDC', amount: '0',
    recipient: '0xRecipient', contract: '0xToken', method: 'view', nonce: '2',
  });
  assert.equal(balance.success, true);
});

test('T1 digest mismatch (different intent than previewed) → still fail-closed', async () => {
  await setupAccount();
  const { payload, signature } = await signSmartAccountIntentLocal(INTENT);

  // preview 一个 intent。
  const prev = await callTool('smart_account_preview', { ...INTENT, nonce: 1, signature });
  assert.equal(prev.wouldExecute, true);

  // 换一个 amount 的 payload（digest 不同）→ 门禁拒绝（未模拟该 digest）。
  const other = await signSmartAccountIntentLocal({ ...INTENT, amount: '50', nonce: '2' });
  const blocked = await callTool('smart_account_execute', { payload: other.payload, signature: other.signature });
  assert.equal(blocked.success, false);
  assert.equal(blocked.error, 'SimulationRequired');
});

// ─── 集成：policy engine gate ────────────────────────────────────────────
test('T2 policy maxPerTx rejection happens off-chain (never touches chain)', async () => {
  writeFileSync(POLICY_FILE, JSON.stringify({
    rules: [{ action: 'transfer', enabled: true, maxPerTx: '10' }],
  }), 'utf8');
  process.env.SMART_ACCOUNT_POLICY_FILE = POLICY_FILE;
  try {
    await setupAccount();
    const { payload, signature } = await signSmartAccountIntentLocal(INTENT);

    // 先成功 preview（通过 simulation gate）。
    const prev = await callTool('smart_account_preview', { ...INTENT, nonce: 1, signature });
    assert.equal(prev.wouldExecute, true);

    // amount 25 > policy maxPerTx 10 → PolicyRejected（链下，不广播）。
    const rejected = await callTool('smart_account_execute', { payload, signature });
    assert.equal(rejected.success, false, JSON.stringify(rejected));
    assert.equal(rejected.error, 'PolicyRejected');
    assert.match(rejected.reason, /exceeds policy maxPerTx/);

    // 指标 + 审计（gate: policy）。
    const m = (await callTool('smart_account_metrics', {})).metrics;
    assert.equal(m.smart_account_policy_rejected, 1);
    const audit = await callTool('smart_account_audit', {});
    const gated = audit.entries.find((e) => e.gate === 'policy');
    assert.equal(gated.errorName, 'PolicyRejected');

    // 链上未发生任何 execute 广播：tx 台账为空。
    const st = await callTool('smart_account_tx_status', { txHash: '0x' + 'ee'.repeat(32) });
    assert.equal(st.recorded.length, 0);
  } finally {
    delete process.env.SMART_ACCOUNT_POLICY_FILE;
  }
});
