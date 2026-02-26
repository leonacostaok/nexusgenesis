#!/usr/bin/env node
/**
 * 测试TRANSFER状态机修复
 * 直接应用交易到状态以验证修复效果
 */

import { State, createInitialState } from './src/blockchain/state.js';
import fs from 'fs/promises';
import path from 'path';

// 主函数
async function main() {
  console.log('========================================');
  console.log('NexusGenesis - TRANSFER状态机修复测试');
  console.log('========================================');
  
  // 读取当前状态
  const statePath = path.join('data', 'state', 'blockchainState.json');
  const stateData = JSON.parse(await fs.readFile(statePath, 'utf8'));
  
  // 创建状态实例
  const genesisAddress = 'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ';
  const state = new State(genesisAddress);
  state.loadFromJSON(stateData);
  
  // 显示初始余额
  console.log('\n[1/4] 初始余额:');
  console.log(`  创世地址: ${state.getBalance(genesisAddress)} NGEN`);
  console.log(`  发送方 (普通地址A): ${state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')} NGEN`);
  console.log(`  接收方 (普通地址B): ${state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA')} NGEN`);
  
  // 计算初始总供应
  const initialSupply = BigInt(state.getBalance(genesisAddress)) + 
                       BigInt(state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')) + 
                       BigInt(state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'));
  console.log(`  初始总供应: ${initialSupply} NGEN`);
  
  // 创建测试交易
  const transaction = {
    id: 'test-tx-1',
    tx_type: 'TRANSFER',
    from: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',  // 普通地址A
    to: 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA',    // 普通地址B
    amount: '10000',
    fee: '10'
  };
  
  // 显示交易详情
  console.log('\n[2/4] 交易详情:');
  console.log(`  发送方: ${transaction.from}`);
  console.log(`  接收方: ${transaction.to}`);
  console.log(`  金额: ${transaction.amount} NGEN`);
  console.log(`  手续费: ${transaction.fee} NGEN`);
  
  // 计算预期税费
  const tax = Math.floor(Number(transaction.amount) * 0.001);
  console.log(`  预期税费: ${tax} NGEN`);
  console.log(`  预期烧掉的手续费: ${Number(transaction.fee) - tax} NGEN`);
  
  // 应用交易
  console.log('\n[3/4] 应用交易...');
  const result = state.applyTransfer(transaction);
  
  if (result) {
    console.log('  ✓ 交易应用成功');
  } else {
    console.log('  ✗ 交易应用失败');
    process.exit(1);
  }
  
  // 显示最终余额
  console.log('\n[4/4] 最终余额:');
  console.log(`  创世地址: ${state.getBalance(genesisAddress)} NGEN`);
  console.log(`  发送方 (普通地址A): ${state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')} NGEN`);
  console.log(`  接收方 (普通地址B): ${state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA')} NGEN`);
  
  // 计算最终总供应
  const finalSupply = BigInt(state.getBalance(genesisAddress)) + 
                     BigInt(state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')) + 
                     BigInt(state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'));
  console.log(`  最终总供应: ${finalSupply} NGEN`);
  
  // 验证余额变化
  console.log('\n[5/4] 验证结果:');
  
  // 验证发送方余额减少
  const expectedSenderBalance = 20000 - 10000 - 10;
  const actualSenderBalance = Number(state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB'));
  console.log(`  发送方余额变化: ${actualSenderBalance === expectedSenderBalance ? '✓' : '✗'}`);
  console.log(`    预期: ${expectedSenderBalance} NGEN`);
  console.log(`    实际: ${actualSenderBalance} NGEN`);
  
  // 验证接收方余额增加
  const expectedReceiverBalance = 9990000 + 10000;
  const actualReceiverBalance = Number(state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'));
  console.log(`  接收方余额变化: ${actualReceiverBalance === expectedReceiverBalance ? '✓' : '✗'}`);
  console.log(`    预期: ${expectedReceiverBalance} NGEN`);
  console.log(`    实际: ${actualReceiverBalance} NGEN`);
  
  // 验证创世地址余额增加
  const expectedGenesisBalance = 50000000 + tax;
  const actualGenesisBalance = Number(state.getBalance(genesisAddress));
  console.log(`  创世地址余额变化: ${actualGenesisBalance === expectedGenesisBalance ? '✓' : '✗'}`);
  console.log(`    预期: ${expectedGenesisBalance} NGEN`);
  console.log(`    实际: ${actualGenesisBalance} NGEN`);
  
  // 验证总供应不变
  console.log(`  总供应不变: ${initialSupply === finalSupply ? '✓' : '✗'}`);
  console.log(`    初始: ${initialSupply} NGEN`);
  console.log(`    最终: ${finalSupply} NGEN`);
  
  // 保存状态
  console.log('\n[6/4] 保存状态...');
  await state.saveToFile(statePath);
  console.log('  ✓ 状态已保存');
  
  console.log('\n========================================');
  console.log('测试完成!');
  console.log('========================================');
}

// 运行主函数
main().catch(error => {
  console.error('错误:', error.message);
  process.exit(1);
});
