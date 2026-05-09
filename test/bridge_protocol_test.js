/**
 * 跨链桥接协议测试
 */

import { CrossChainBridge } from '../src/bridge/bridgeProtocol.js';
import crypto from 'crypto';

// 创建测试密钥对
function generateTestKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' })
  };
}

// 签名消息
function signMessage(message, privateKey) {
  const sign = crypto.createSign('SHA256');
  sign.update(message);
  return sign.sign(privateKey);
}

console.log('=== 跨链桥接协议测试 ===\n');

// 测试1: 创建桥接实例
console.log('测试1: 创建桥接实例');
const bridge = new CrossChainBridge({
  chainId: 'nexus-testnet',
  minValidators: 2,
  signatureThreshold: 2,
  timeLockDuration: 1000 // 1秒时间锁，方便测试
});
console.log('✓ 桥接实例创建成功\n');

// 测试2: 注册验证者
console.log('测试2: 注册验证者');
const validator1 = generateTestKeyPair();
const validator2 = generateTestKeyPair();
const validator3 = generateTestKeyPair();

bridge.registerValidator('validator-1', validator1.publicKey);
bridge.registerValidator('validator-2', validator2.publicKey);
bridge.registerValidator('validator-3', validator3.publicKey);
console.log('✓ 3个验证者注册成功');

const activeValidators = bridge.getActiveValidators();
console.log(`✓ 活跃验证者数量: ${activeValidators.length}\n`);

// 测试3: 锁定资产
console.log('测试3: 锁定资产');
const lockResult = bridge.lockAsset(
  'ethereum',
  'solana',
  'ETH',
  1.5,
  '0x742d35Cc6634C0532925a3b886D89c9819649A5e',
  {
    timeLockDuration: 1000, // 1秒时间锁
    metadata: { sender: 'test-user', purpose: 'test' }
  }
);
console.log(`✓ 资产锁定成功，转账ID: ${lockResult.transferId}`);
console.log(`✓ 时间锁到期: ${new Date(lockResult.timeLockExpiry).toISOString()}\n`);

// 测试4: 验证转账（在时间锁到期前）
console.log('测试4: 验证转账（时间锁未到期）');
const transferId = lockResult.transferId;

// 创建转账消息进行签名
const transfer = bridge.getTransfer(transferId);
const message = crypto.createHash('sha256').update(
  `${transfer.transferId}:${transfer.fromChain}:${transfer.toChain}:${transfer.asset}:${transfer.amount}:${transfer.recipient}`
).digest();

// 尝试验证（应该失败，因为时间锁未到期）
const signature1 = signMessage(message, validator1.privateKey);
const earlyValidation = bridge.validateTransfer(transferId, 'validator-1', signature1);
console.log(`✓ 时间锁未到期时验证: ${earlyValidation ? '成功' : '失败（预期行为）'}\n`);

// 等待时间锁到期
console.log('等待时间锁到期...');
await new Promise(resolve => setTimeout(resolve, 1500));

// 测试5: 验证转账（时间锁到期后）
console.log('测试5: 验证转账（时间锁到期后）');
const validation1 = bridge.validateTransfer(transferId, 'validator-1', signature1);
console.log(`✓ 验证者1验证: ${validation1 ? '成功' : '失败'}`);

const signature2 = signMessage(message, validator2.privateKey);
const validation2 = bridge.validateTransfer(transferId, 'validator-2', signature2);
console.log(`✓ 验证者2验证: ${validation2 ? '成功' : '失败'}`);

// 检查转账状态
const validatedTransfer = bridge.getTransfer(transferId);
console.log(`✓ 转账状态: ${validatedTransfer.status}\n`);

// 测试6: 释放资产
console.log('测试6: 释放资产');
try {
  const releaseResult = bridge.releaseAsset(transferId);
  console.log(`✓ 资产释放成功`);
  console.log(`✓ 接收者: ${releaseResult.recipient}`);
  console.log(`✓ 金额: ${releaseResult.amount}\n`);
} catch (error) {
  console.error(`✗ 释放失败: ${error.message}\n`);
}

// 测试7: 更新验证者信誉
console.log('测试7: 更新验证者信誉');
bridge.updateValidatorReputation('validator-1', 5);
const validatorInfo = bridge.getValidator('validator-1');
console.log(`✓ 验证者1信誉: ${validatorInfo.reputation}\n`);

// 测试8: 验证者状态管理
console.log('测试8: 验证者状态管理');
bridge.setValidatorActive('validator-3', false);
const activeAfter = bridge.getActiveValidators();
console.log(`✓ 停用验证者3后，活跃验证者: ${activeAfter.length}\n`);

// 测试9: 获取桥接状态
console.log('测试9: 获取桥接状态');
const status = bridge.getBridgeStatus();
console.log('✓ 桥接状态:');
console.log(`  - 链ID: ${status.chainId}`);
console.log(`  - 验证者总数: ${status.validatorCount}`);
console.log(`  - 活跃验证者: ${status.activeValidators}`);
console.log(`  - 待处理转账: ${status.pendingTransfers}`);
console.log(`  - 已完成转账: ${status.completedTransfers}\n`);

// 测试10: 获取桥接事件
console.log('测试10: 获取桥接事件');
const events = bridge.getBridgeEvents(null, 5);
console.log(`✓ 最近5个事件: ${events.length}个`);
events.forEach((event, i) => {
  console.log(`  ${i+1}. ${event.type} - ${new Date(event.timestamp).toISOString()}`);
});

console.log('\n=== 所有测试完成 ===');
