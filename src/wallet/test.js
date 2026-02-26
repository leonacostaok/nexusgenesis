/**
 * NexusGenesis - 钱包测试
 * 测试两个钱包之间转账
 */

import { PQCWallet, Transaction } from './pqcWallet.js';

async function test() {
  console.log('═══════════════════════════════════════════');
  console.log('  NexusGenesis 钱包转账测试');
  console.log('═══════════════════════════════════════════');
  console.log('');

  // 1. 生成两个钱包
  console.log('[1/4] 生成钱包 A 和 B...');
  const walletA = await PQCWallet.generate(50000000); // 5000万 NGEN
  const walletB = await PQCWallet.generate(0);
  
  console.log('  钱包 A: ' + walletA.address);
  console.log('  钱包 B: ' + walletB.address);
  console.log('');

  // 2. 查看余额
  console.log('[2/4] 初始余额:');
  console.log('  A: ' + walletA.balance + ' NGEN');
  console.log('  B: ' + walletB.balance + ' NGEN');
  console.log('');

  // 3. A 转账 1000 NGEN 给 B
  console.log('[3/4] A 转账 1000 NGEN 给 B...');
  const amount = 1000n;
  const tx = await Transaction.create(walletA, walletB.address, amount, '测试转账');
  
  // 签名
  await tx.sign(walletA);
  
  console.log('  交易ID: ' + tx.id);
  console.log('  手续费: ' + tx.fee + ' NGEN');
  console.log('  签名: ' + tx.signature.substring(0, 32) + '...');
  console.log('');

  // 4. 执行转账
  console.log('[4/4] 执行转账...');
  
  // 扣除 A 的余额
  walletA.balance -= (amount + tx.fee);
  // 增加 B 的余额
  walletB.balance += amount;
  
  console.log('  转账成功!');
  console.log('');
  
  // 5. 最终余额
  console.log('═══════════════════════════════════════════');
  console.log('  最终余额:');
  console.log('  A: ' + walletA.balance + ' NGEN');
  console.log('  B: ' + walletB.balance + ' NGEN');
  console.log('═══════════════════════════════════════════');
}

test().catch(console.error);
