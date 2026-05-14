#!/usr/bin/env node
/**
 * TestTRANSFERstatus机修复
 * 直接应用transaction到status以Verify修复效果
 */

import { State, createInitialState } from './src/blockchain/state.js';
import fs from 'fs/promises';
import path from 'path';

// 主function
async function main() {
  console.log('========================================');
  console.log('NexusGenesis - TRANSFERstatus机修复Test');
  console.log('========================================');
  
  // 读取Currentstatus
  const statePath = path.join('data', 'state', 'blockchainState.json');
  const stateData = JSON.parse(await fs.readFile(statePath, 'utf8'));
  
  // Createstatusinstance
  const genesisAddress = 'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ';
  const state = new State(genesisAddress);
  state.loadFromJSON(stateData);
  
  // 显示初始balance
  console.log('\n[1/4] 初始balance:');
  console.log(`  Genesisaddress: ${state.getBalance(genesisAddress)} NGEN`);
  console.log(`  Send方 (普通addressA): ${state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')} NGEN`);
  console.log(`  Receive方 (普通addressB): ${state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA')} NGEN`);
  
  // Calculate初始总供应
  const initialSupply = BigInt(state.getBalance(genesisAddress)) + 
                       BigInt(state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')) + 
                       BigInt(state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'));
  console.log(`  初始总供应: ${initialSupply} NGEN`);
  
  // CreateTesttransaction
  const transaction = {
    id: 'test-tx-1',
    tx_type: 'TRANSFER',
    from: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',  // 普通addressA
    to: 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA',    // 普通addressB
    amount: '10000',
    fee: '10'
  };
  
  // 显示transaction详情
  console.log('\n[2/4] transaction详情:');
  console.log(`  Send方: ${transaction.from}`);
  console.log(`  Receive方: ${transaction.to}`);
  console.log(`  amount: ${transaction.amount} NGEN`);
  console.log(`  fee: ${transaction.fee} NGEN`);
  
  // Calculate预期税费
  const tax = Math.floor(Number(transaction.amount) * 0.001);
  console.log(`  预期税费: ${tax} NGEN`);
  console.log(`  预期烧掉的fee: ${Number(transaction.fee) - tax} NGEN`);
  
  // 应用transaction
  console.log('\n[3/4] 应用transaction...');
  const result = state.applyTransfer(transaction);
  
  if (result) {
    console.log('  ✓ transaction应用success');
  } else {
    console.log('  ✗ transaction应用failed');
    process.exit(1);
  }
  
  // 显示最终balance
  console.log('\n[4/4] 最终balance:');
  console.log(`  Genesisaddress: ${state.getBalance(genesisAddress)} NGEN`);
  console.log(`  Send方 (普通addressA): ${state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')} NGEN`);
  console.log(`  Receive方 (普通addressB): ${state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA')} NGEN`);
  
  // Calculate最终总供应
  const finalSupply = BigInt(state.getBalance(genesisAddress)) + 
                     BigInt(state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB')) + 
                     BigInt(state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'));
  console.log(`  最终总供应: ${finalSupply} NGEN`);
  
  // Verifybalance变化
  console.log('\n[5/4] verification result:');
  
  // VerifySend方balance减少
  const expectedSenderBalance = 20000 - 10000 - 10;
  const actualSenderBalance = Number(state.getBalance('ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB'));
  console.log(`  Send方balance变化: ${actualSenderBalance === expectedSenderBalance ? '✓' : '✗'}`);
  console.log(`    预期: ${expectedSenderBalance} NGEN`);
  console.log(`    实际: ${actualSenderBalance} NGEN`);
  
  // VerifyReceive方balance增加
  const expectedReceiverBalance = 9990000 + 10000;
  const actualReceiverBalance = Number(state.getBalance('ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'));
  console.log(`  Receive方balance变化: ${actualReceiverBalance === expectedReceiverBalance ? '✓' : '✗'}`);
  console.log(`    预期: ${expectedReceiverBalance} NGEN`);
  console.log(`    实际: ${actualReceiverBalance} NGEN`);
  
  // VerifyGenesisaddressbalance增加
  const expectedGenesisBalance = 50000000 + tax;
  const actualGenesisBalance = Number(state.getBalance(genesisAddress));
  console.log(`  Genesisaddressbalance变化: ${actualGenesisBalance === expectedGenesisBalance ? '✓' : '✗'}`);
  console.log(`    预期: ${expectedGenesisBalance} NGEN`);
  console.log(`    实际: ${actualGenesisBalance} NGEN`);
  
  // Verify总供应不变
  console.log(`  总供应不变: ${initialSupply === finalSupply ? '✓' : '✗'}`);
  console.log(`    初始: ${initialSupply} NGEN`);
  console.log(`    最终: ${finalSupply} NGEN`);
  
  // Savestatus
  console.log('\n[6/4] Savestatus...');
  await state.saveToFile(statePath);
  console.log('  ✓ statussaved');
  
  console.log('\n========================================');
  console.log('Test完成!');
  console.log('========================================');
}

// 运行主function
main().catch(error => {
  console.error('error:', error.message);
  process.exit(1);
});
