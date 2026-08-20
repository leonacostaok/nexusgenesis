/**
 * NexusGenesis — Smart Account 官方 EVM 路径最小 E2E 样板流
 *
 * 一条"照着就能跑"的最小链路，把 Sprint 2 的新能力串起来：
 *   1. 创建 Smart Account（owner + emergency key + 限额策略）
 *   2. 注册 agent session（绑定 agentEvmAddress，非 PQC 公钥）
 *   3. 生成 canonical payload（canonicalizeAssetIntent 内部完成）
 *   4. 用官方 EVM path 出签（signSmartAccountIntent → raw digest + secp256k1）
 *   5. 交给 Smart Account 执行（executeFromAgent，走 Solidity 镜像校验路径）
 *
 * 运行：
 *   node examples/smart-account-e2e.mjs
 *
 * 若本机已 npm install（workspace 链接），也可直接跑。私钥仅存在于进程内。
 */
import {
  createSmartAccount,
  signSmartAccountIntent,
  verifySmartAccountIntent,
  addressForPrivateKey,
} from 'nexusgenesis-chain-eth';

const OWNER = '0x0000000000000000000000000000000000000001';
const EMERGENCY = '0x0000000000000000000000000000000000000002';

function assert(cond, msg) {
  if (!cond) throw new Error(`E2E FAILED: ${msg}`);
  console.log(`  [OK] ${msg}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Smart Account — 官方 EVM 路径 最小 E2E 样板流');
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. 创建 Smart Account ──────────────────────────────────────────────
  const acct = createSmartAccount({
    owner: OWNER,
    emergencyKey: EMERGENCY,
    policy: { type: 'limit', maxPerTx: '100', maxDaily: '500' },
  });
  assert(true, 'createSmartAccount(owner + emergencyKey + limit policy)');

  // ── 2. 注册 session（绑定 EVM 地址）────────────────────────────────────
  // 注：32 字节 sessionId，与 Solidity bytes32 对齐。
  const sessionId = '0x' + 'ab'.repeat(32);
  const evmPrivateKey = '0x' + '11'.repeat(32); // 演示用确定性私钥
  const agentEvmAddress = addressForPrivateKey(evmPrivateKey);
  const now = Date.now();
  const session = {
    agentId: 'agent-e2e-demo',
    sessionId,
    issuedAt: now,
    expiresAt: now + 60 * 60 * 1000, // 1h
  };

  const reg = acct.registerSession({
    by: OWNER,
    sessionId,
    agentId: session.agentId,
    agentEvmAddress, // EVM path：绑定 secp256k1 地址而非 PQC 公钥
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    whitelist: {
      allowedChains: ['ethereum'],
      allowedAssets: ['USDC'],
      allowedContracts: ['0xToken'],
      allowedMethods: ['transfer'],
      allowedRecipients: ['0xRecipient'],
    },
    maxPerTx: '100',
    maxDaily: '500',
  });
  assert(reg.ok, `registerSession(agentEvmAddress=${agentEvmAddress.slice(0, 10)}…) -> ${reg.reason}`);

  // ── 3 + 4. canonical payload + EVM 出签（signSmartAccountIntent）───────
  const signed = signSmartAccountIntent({
    session,
    intent: {
      action: 'transfer',
      chain: 'ethereum',
      asset: 'USDC',
      amount: '25',
      recipient: '0xRecipient',
      contract: '0xToken',
      method: 'transfer',
      nonce: '1', // 签名原像的一部分（INV-007 防重放）
    },
    privateKeyHex: evmPrivateKey,
  });
  assert(!!signed.payload, `canonicalizeAssetIntent → 12 字段 canonical payload`);
  assert(/^0x[0-9a-f]{64}$/.test(signed.digest), `hashIntentDigest → 32 字节 digest`);
  assert(/^0x[0-9a-f]{130}$/.test(signed.signature), `signIntentDigest → 65 字节 (r||s||v) 签名`);

  // 出签后可离线自校验（verifySmartAccountIntent）
  const v = verifySmartAccountIntent({ address: agentEvmAddress, signature: signed.signature, payload: signed.payload });
  assert(v.valid, `verifySmartAccountIntent 自校验通过（digest=${signed.digest.slice(0, 16)}…）`);

  // ── 5. 交给 Smart Account 执行（执行层镜像 Solidity 全部约束）──────────
  const res = await acct.executeFromAgent({
    payload: signed.payload,
    signature: signed.signature,
    claimedAmount: '25',
    sessionId,
    nonce: 1,
  });
  assert(res.ok, `executeFromAgent → txId=${res.txId}, spent=${res.spentSession}, remainingDaily=${res.remainingSessionDaily}`);

  // 验证防御性拒绝仍在工作（自升级 action 即使签名合法也会被拒）
  const evil = signSmartAccountIntent({
    session,
    intent: {
      action: 'increaseLimit',
      chain: 'ethereum',
      asset: 'USDC',
      amount: '1',
      recipient: '0xRecipient',
      contract: '0xToken',
      method: 'increaseLimit',
      nonce: '2',
    },
    privateKeyHex: evmPrivateKey,
  });
  const denied = await acct.executeFromAgent({
    payload: evil.payload,
    signature: evil.signature,
    claimedAmount: '1',
    sessionId,
    nonce: 2,
  });
  assert(!denied.ok, `INV-005 自升级即使签名合法也被拒（reason=${denied.reason}）`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  E2E 样板流全部通过 ✔');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
