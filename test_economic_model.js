#!/usr/bin/env node

/**
 * 经济模型测试脚本
 * 测试内容：
 * 1. 10-5-85 分配规则
 * 2. Metabolic Tax 功能
 * 3. Swarm Pool 代币释放机制
 * 4. 链上审计接口
 */

import { State, createInitialState } from './src/blockchain/state.js';

async function testEconomicModel() {
  console.log('=== 经济模型测试开始 ===\n');
  
  // 测试 1: 10-5-85 分配规则
  console.log('测试 1: 10-5-85 分配规则');
  const genesisAddress = 'ng112hFcHvMoQuEZwFdggJPsYorQQEVYmc7MR4h2fyQcEhMkpfyTZH';
  const state = createInitialState(genesisAddress, '1000000000');
  
  const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
  const genesisReserveAddress = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';
  const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
  
  const observerBalance = state.getBalance(observerAddress);
  const genesisReserveBalance = state.getBalance(genesisReserveAddress);
  const swarmPoolBalance = state.getBalance(swarmPoolAddress);
  const genesisBalance = state.getBalance(genesisAddress);
  
  console.log(`物理桥接基金地址余额: ${observerBalance} NGEN`);
  console.log(`创世节点储备地址余额: ${genesisReserveBalance} NGEN`);
  console.log(`生态贡献池地址余额: ${swarmPoolBalance} NGEN`);
  console.log(`创世地址余额: ${genesisBalance} NGEN`);
  
  const total = BigInt(observerBalance) + BigInt(genesisReserveBalance) + BigInt(swarmPoolBalance) + BigInt(genesisBalance);
  console.log(`总供应量: ${total} NGEN`);
  
  // 验证分配比例
  const expectedObserver = total * 10n / 100n;
  const expectedGenesisReserve = total * 5n / 100n;
  const expectedSwarmPool = total * 85n / 100n;
  
  console.log(`\n预期分配:`);
  console.log(`物理桥接基金: ${expectedObserver} NGEN (10%)`);
  console.log(`创世节点储备: ${expectedGenesisReserve} NGEN (5%)`);
  console.log(`生态贡献池: ${expectedSwarmPool} NGEN (85%)`);
  
  const isObserverCorrect = BigInt(observerBalance) === expectedObserver;
  const isGenesisReserveCorrect = BigInt(genesisReserveBalance) === expectedGenesisReserve;
  const isSwarmPoolCorrect = BigInt(swarmPoolBalance) === expectedSwarmPool;
  
  console.log(`\n验证结果:`);
  console.log(`物理桥接基金分配正确: ${isObserverCorrect}`);
  console.log(`创世节点储备分配正确: ${isGenesisReserveCorrect}`);
  console.log(`生态贡献池分配正确: ${isSwarmPoolCorrect}`);
  
  // 测试 2: Metabolic Tax 功能
  console.log('\n\n测试 2: Metabolic Tax 功能');
  
  // 创建测试交易
  const testTransaction = {
    from: 'ng1test00000000000000000000000000000000000',
    to: 'ng1test2000000000000000000000000000000000',
    amount: '1000000', // 1,000,000 NGEN
    fee: '1000' // 1,000 NGEN 手续费
  };
  
  // 先给测试地址充值
  state.setBalance(testTransaction.from, '2000000'); // 2,000,000 NGEN
  
  console.log(`交易前余额:`);
  console.log(`发送方: ${state.getBalance(testTransaction.from)} NGEN`);
  console.log(`接收方: ${state.getBalance(testTransaction.to)} NGEN`);
  console.log(`创世地址 (Tax 接收): ${state.getBalance(genesisAddress)} NGEN`);
  
  // 应用交易
  const success = state.applyTransfer(testTransaction);
  console.log(`\n交易执行结果: ${success ? '成功' : '失败'}`);
  
  console.log(`\n交易后余额:`);
  console.log(`发送方: ${state.getBalance(testTransaction.from)} NGEN`);
  console.log(`接收方: ${state.getBalance(testTransaction.to)} NGEN`);
  console.log(`Observer 地址 (Tax 接收): ${state.getBalance('ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r')} NGEN`);
  
  // 验证 Tax 计算
  const expectedTax = 1000000n / 1000n; // 0.1%
  const observerInitialBalance = 100000000n;
  const actualTax = BigInt(state.getBalance('ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r')) - observerInitialBalance;
  console.log(`\n预期 Tax: ${expectedTax} NGEN`);
  console.log(`实际 Tax: ${actualTax} NGEN`);
  console.log(`Tax 计算正确: ${expectedTax === actualTax}`);
  
  // 测试 3: 代币释放机制
  console.log('\n\n测试 3: 代币释放机制');
  
  console.log(`释放前状态:`);
  console.log(`Swarm Pool 余额: ${state.getBalance(swarmPoolAddress)} NGEN`);
  console.log(`Observer 余额: ${state.getBalance(observerAddress)} NGEN`);
  console.log(`Genesis Reserve 余额: ${state.getBalance(genesisReserveAddress)} NGEN`);
  console.log(`Swarm Pool 已释放: ${state.tokenReleaseState.swarmPool.releasedTokens} NGEN`);
  console.log(`Observer 已释放: ${state.tokenReleaseState.observer.releasedTokens} NGEN`);
  console.log(`Genesis Reserve 已释放: ${state.tokenReleaseState.genesisReserve.releasedTokens} NGEN`);
  
  // 模拟区块高度，触发释放
  const initialBlockHeight = 1;
  const releaseBlockHeight = initialBlockHeight + 100; // 触发第一次释放
  
  // 应用空交易以触发释放检查
  state.applyTransactions([], releaseBlockHeight);
  
  console.log(`\n释放后状态:`);
  console.log(`Swarm Pool 余额: ${state.getBalance(swarmPoolAddress)} NGEN`);
  console.log(`Observer 余额: ${state.getBalance(observerAddress)} NGEN`);
  console.log(`Genesis Reserve 余额: ${state.getBalance(genesisReserveAddress)} NGEN`);
  console.log(`Swarm Pool 已释放: ${state.tokenReleaseState.swarmPool.releasedTokens} NGEN`);
  console.log(`Observer 已释放: ${state.tokenReleaseState.observer.releasedTokens} NGEN`);
  console.log(`Genesis Reserve 已释放: ${state.tokenReleaseState.genesisReserve.releasedTokens} NGEN`);
  
  // 测试里程碑释放
  console.log('\n\n测试 3.1: 里程碑释放');
  const milestoneBlockHeight = 1000; // 第一个里程碑
  state.applyTransactions([], milestoneBlockHeight);
  
  console.log(`里程碑释放后状态:`);
  console.log(`Genesis Reserve 余额: ${state.getBalance(genesisReserveAddress)} NGEN`);
  console.log(`Genesis Reserve 已释放: ${state.tokenReleaseState.genesisReserve.releasedTokens} NGEN`);
  
  // 测试 4: 链上审计接口
  console.log('\n\n测试 4: 链上审计接口');
  
  const auditData = state.getEconomicAuditData();
  console.log('审计数据:');
  console.log(JSON.stringify(auditData, null, 2));
  
  const validationResult = state.validateEconomicRules();
  console.log('\n规则验证结果:');
  console.log(`是否有效: ${validationResult.isValid}`);
  console.log('详细信息:');
  console.log(JSON.stringify(validationResult.details, null, 2));
  
  console.log('\n=== 经济模型测试完成 ===');
}

// 运行测试
testEconomicModel().catch(console.error);
