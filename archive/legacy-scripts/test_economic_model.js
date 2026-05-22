#!/usr/bin/env node

/**
 * Economy模型Test脚本
 * Test内容：
 * 1. 10-5-85 分配规则
 * 2. Metabolic Tax Features
 * 3. Swarm Pool TokenRelease机制
 * 4. on-chain审计接口
 */

import { State, createInitialState } from './src/blockchain/state.js';

async function testEconomicModel() {
  console.log('=== Economy模型Test开始 ===\n');
  
  // Test 1: 10-5-85 分配规则
  console.log('Test 1: 10-5-85 分配规则');
  const genesisAddress = 'ng112hFcHvMoQuEZwFdggJPsYorQQEVYmc7MR4h2fyQcEhMkpfyTZH';
  const state = createInitialState(genesisAddress, '1000000000');
  
  const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
  const genesisReserveAddress = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';
  const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
  
  const observerBalance = state.getBalance(observerAddress);
  const genesisReserveBalance = state.getBalance(genesisReserveAddress);
  const swarmPoolBalance = state.getBalance(swarmPoolAddress);
  const genesisBalance = state.getBalance(genesisAddress);
  
  console.log(`Physical BridgeFundaddressbalance: ${observerBalance} NGEN`);
  console.log(`Genesisnode储备addressbalance: ${genesisReserveBalance} NGEN`);
  console.log(`生态contributionPooladdressbalance: ${swarmPoolBalance} NGEN`);
  console.log(`Genesisaddressbalance: ${genesisBalance} NGEN`);
  
  const total = BigInt(observerBalance) + BigInt(genesisReserveBalance) + BigInt(swarmPoolBalance) + BigInt(genesisBalance);
  console.log(`total supply: ${total} NGEN`);
  
  // Verify分配比例
  const expectedObserver = total * 10n / 100n;
  const expectedGenesisReserve = total * 5n / 100n;
  const expectedSwarmPool = total * 85n / 100n;
  
  console.log(`\n预期分配:`);
  console.log(`Physical BridgeFund: ${expectedObserver} NGEN (10%)`);
  console.log(`Genesisnode储备: ${expectedGenesisReserve} NGEN (5%)`);
  console.log(`生态contributionPool: ${expectedSwarmPool} NGEN (85%)`);
  
  const isObserverCorrect = BigInt(observerBalance) === expectedObserver;
  const isGenesisReserveCorrect = BigInt(genesisReserveBalance) === expectedGenesisReserve;
  const isSwarmPoolCorrect = BigInt(swarmPoolBalance) === expectedSwarmPool;
  
  console.log(`\nverification result:`);
  console.log(`Physical BridgeFund分配正确: ${isObserverCorrect}`);
  console.log(`Genesisnode储备分配正确: ${isGenesisReserveCorrect}`);
  console.log(`生态contributionPool分配正确: ${isSwarmPoolCorrect}`);
  
  // Test 2: Metabolic Tax Features
  console.log('\n\nTest 2: Metabolic Tax Features');
  
  // CreateTesttransaction
  const testTransaction = {
    from: 'ng1test00000000000000000000000000000000000',
    to: 'ng1test2000000000000000000000000000000000',
    amount: '1000000', // 1,000,000 NGEN
    fee: '1000' // 1,000 NGEN fee
  };
  
  // 先给Testaddress充值
  state.setBalance(testTransaction.from, '2000000'); // 2,000,000 NGEN
  
  console.log(`transaction前balance:`);
  console.log(`Send方: ${state.getBalance(testTransaction.from)} NGEN`);
  console.log(`Receive方: ${state.getBalance(testTransaction.to)} NGEN`);
  console.log(`Genesisaddress (Tax Receive): ${state.getBalance(genesisAddress)} NGEN`);
  
  // 应用transaction
  const success = state.applyTransfer(testTransaction);
  console.log(`\ntransactionExecute结果: ${success ? 'success' : 'failed'}`);
  
  console.log(`\ntransaction后balance:`);
  console.log(`Send方: ${state.getBalance(testTransaction.from)} NGEN`);
  console.log(`Receive方: ${state.getBalance(testTransaction.to)} NGEN`);
  console.log(`Observer address (Tax Receive): ${state.getBalance('ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r')} NGEN`);
  
  // Verify Tax Calculate
  const expectedTax = 1000000n / 1000n; // 0.1%
  const observerInitialBalance = 100000000n;
  const actualTax = BigInt(state.getBalance('ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r')) - observerInitialBalance;
  console.log(`\n预期 Tax: ${expectedTax} NGEN`);
  console.log(`实际 Tax: ${actualTax} NGEN`);
  console.log(`Tax Calculate正确: ${expectedTax === actualTax}`);
  
  // Test 3: TokenRelease机制
  console.log('\n\nTest 3: TokenRelease机制');
  
  console.log(`Release前status:`);
  console.log(`Swarm Pool balance: ${state.getBalance(swarmPoolAddress)} NGEN`);
  console.log(`Observer balance: ${state.getBalance(observerAddress)} NGEN`);
  console.log(`Genesis Reserve balance: ${state.getBalance(genesisReserveAddress)} NGEN`);
  console.log(`Swarm Pool released: ${state.tokenReleaseState.swarmPool.releasedTokens} NGEN`);
  console.log(`Observer released: ${state.tokenReleaseState.observer.releasedTokens} NGEN`);
  console.log(`Genesis Reserve released: ${state.tokenReleaseState.genesisReserve.releasedTokens} NGEN`);
  
  // Simulationblock height，触发Release
  const initialBlockHeight = 1;
  const releaseBlockHeight = initialBlockHeight + 100; // 触发第一次Release
  
  // 应用空transaction以触发ReleaseCheck
  state.applyTransactions([], releaseBlockHeight);
  
  console.log(`\nRelease后status:`);
  console.log(`Swarm Pool balance: ${state.getBalance(swarmPoolAddress)} NGEN`);
  console.log(`Observer balance: ${state.getBalance(observerAddress)} NGEN`);
  console.log(`Genesis Reserve balance: ${state.getBalance(genesisReserveAddress)} NGEN`);
  console.log(`Swarm Pool released: ${state.tokenReleaseState.swarmPool.releasedTokens} NGEN`);
  console.log(`Observer released: ${state.tokenReleaseState.observer.releasedTokens} NGEN`);
  console.log(`Genesis Reserve released: ${state.tokenReleaseState.genesisReserve.releasedTokens} NGEN`);
  
  // Test里程碑Release
  console.log('\n\nTest 3.1: 里程碑Release');
  const milestoneBlockHeight = 1000; // 第一个里程碑
  state.applyTransactions([], milestoneBlockHeight);
  
  console.log(`里程碑Release后status:`);
  console.log(`Genesis Reserve balance: ${state.getBalance(genesisReserveAddress)} NGEN`);
  console.log(`Genesis Reserve released: ${state.tokenReleaseState.genesisReserve.releasedTokens} NGEN`);
  
  // Test 4: on-chain审计接口
  console.log('\n\nTest 4: on-chain审计接口');
  
  const auditData = state.getEconomicAuditData();
  console.log('审计data:');
  console.log(JSON.stringify(auditData, null, 2));
  
  const validationResult = state.validateEconomicRules();
  console.log('\n规则verification result:');
  console.log(`是否有效: ${validationResult.isValid}`);
  console.log('详细info:');
  console.log(JSON.stringify(validationResult.details, null, 2));
  
  console.log('\n=== Economy模型Test完成 ===');
}

// 运行Test
testEconomicModel().catch(console.error);
