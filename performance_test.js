/**
 * 智能合约性能测试脚本
 * 测试AINVM智能合约的执行性能和网络响应时间
 */

import contractManager from './src/contracts/contractManager.js';
import { testCounterContract } from './src/contracts/examples/counter.js';
import { testMatrixContract } from './src/contracts/examples/matrixOperations.js';
import { testTokenContract } from './src/contracts/examples/token.js';
import { testGovernanceContract } from './src/contracts/examples/governance.js';
import { testDIDContract } from './src/contracts/examples/did.js';
import { testAIContract } from './src/contracts/examples/ai.js';
import fs from 'fs';
import path from 'path';

// 性能测试配置
const config = {
  iterations: 100, // 每个测试的迭代次数
  warmup: 10,     // 预热迭代次数
  gasLimit: 10000  // Gas限制
};

// 性能测试结果
const results = {
  counter: [],
  matrix: [],
  token: [],
  governance: [],
  did: [],
  ai: []
};

// 测试执行时间
function measureExecutionTime(fn, name) {
  const start = process.hrtime();
  const result = fn();
  const end = process.hrtime(start);
  const duration = end[0] * 1000 + end[1] / 1000000; // 转换为毫秒
  
  console.log(`${name}: ${duration.toFixed(2)}ms`);
  return duration;
}

// 测试计数器合约性能
async function testCounterPerformance() {
  console.log('\n=== Testing Counter Contract Performance ===');
  
  // 部署合约
  const contractId = await testCounterContract();
  
  // 预热
  for (let i = 0; i < config.warmup; i++) {
    contractManager.executeContract(contractId, config.gasLimit);
  }
  
  // 性能测试
  for (let i = 0; i < config.iterations; i++) {
    const duration = measureExecutionTime(() => {
      return contractManager.executeContract(contractId, config.gasLimit);
    }, `Counter execution ${i + 1}`);
    results.counter.push(duration);
  }
  
  return contractId;
}

// 测试矩阵运算合约性能
async function testMatrixPerformance() {
  console.log('\n=== Testing Matrix Operations Performance ===');
  
  // 部署合约
  const contractId = await testMatrixContract();
  
  // 预热
  for (let i = 0; i < config.warmup; i++) {
    contractManager.executeContract(contractId, config.gasLimit);
  }
  
  // 性能测试
  for (let i = 0; i < config.iterations; i++) {
    const duration = measureExecutionTime(() => {
      return contractManager.executeContract(contractId, config.gasLimit);
    }, `Matrix execution ${i + 1}`);
    results.matrix.push(duration);
  }
  
  return contractId;
}

// 测试代币合约性能
async function testTokenPerformance() {
  console.log('\n=== Testing Token Contract Performance ===');
  
  // 部署合约
  const contractId = await testTokenContract();
  
  // 预热
  for (let i = 0; i < config.warmup; i++) {
    contractManager.executeContract(contractId, config.gasLimit);
  }
  
  // 性能测试
  for (let i = 0; i < config.iterations; i++) {
    const duration = measureExecutionTime(() => {
      return contractManager.executeContract(contractId, config.gasLimit);
    }, `Token execution ${i + 1}`);
    results.token.push(duration);
  }
  
  return contractId;
}

// 测试治理合约性能
async function testGovernancePerformance() {
  console.log('\n=== Testing Governance Contract Performance ===');
  
  // 部署合约
  const contractId = await testGovernanceContract();
  
  // 预热
  for (let i = 0; i < config.warmup; i++) {
    contractManager.executeContract(contractId, config.gasLimit);
  }
  
  // 性能测试
  for (let i = 0; i < config.iterations; i++) {
    const duration = measureExecutionTime(() => {
      return contractManager.executeContract(contractId, config.gasLimit);
    }, `Governance execution ${i + 1}`);
    results.governance.push(duration);
  }
  
  return contractId;
}

// 测试DID合约性能
async function testDIDPerformance() {
  console.log('\n=== Testing DID Contract Performance ===');
  
  // 部署合约
  const contractId = await testDIDContract();
  
  // 预热
  for (let i = 0; i < config.warmup; i++) {
    contractManager.executeContract(contractId, config.gasLimit);
  }
  
  // 性能测试
  for (let i = 0; i < config.iterations; i++) {
    const duration = measureExecutionTime(() => {
      return contractManager.executeContract(contractId, config.gasLimit);
    }, `DID execution ${i + 1}`);
    results.did.push(duration);
  }
  
  return contractId;
}

// 测试AI合约性能
async function testAIPerformance() {
  console.log('\n=== Testing AI Contract Performance ===');
  
  // 部署合约
  const contractId = await testAIContract();
  
  // 预热
  for (let i = 0; i < config.warmup; i++) {
    contractManager.executeContract(contractId, config.gasLimit);
  }
  
  // 性能测试
  for (let i = 0; i < config.iterations; i++) {
    const duration = measureExecutionTime(() => {
      return contractManager.executeContract(contractId, config.gasLimit);
    }, `AI execution ${i + 1}`);
    results.ai.push(duration);
  }
  
  return contractId;
}

// 计算性能统计数据
function calculateStats(data) {
  const sorted = data.sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = data.reduce((acc, val) => acc + val, 0);
  const avg = sum / data.length;
  const median = sorted[Math.floor(data.length / 2)];
  
  return {
    min: min.toFixed(2),
    max: max.toFixed(2),
    avg: avg.toFixed(2),
    median: median.toFixed(2),
    total: sum.toFixed(2),
    count: data.length
  };
}

// 生成性能报告
function generateReport() {
  console.log('\n=== Performance Test Report ===');
  console.log('\nCounter Contract:');
  console.log(calculateStats(results.counter));
  
  console.log('\nMatrix Operations:');
  console.log(calculateStats(results.matrix));
  
  console.log('\nToken Contract:');
  console.log(calculateStats(results.token));
  
  console.log('\nGovernance Contract:');
  console.log(calculateStats(results.governance));
  
  console.log('\nDID Contract:');
  console.log(calculateStats(results.did));
  
  console.log('\nAI Contract:');
  console.log(calculateStats(results.ai));
  
  // 计算总体性能
  const allResults = [
    ...results.counter,
    ...results.matrix,
    ...results.token,
    ...results.governance,
    ...results.did,
    ...results.ai
  ];
  
  console.log('\nOverall Performance:');
  console.log(calculateStats(allResults));
  
  // 保存报告到文件
  const report = {
    timestamp: new Date().toISOString(),
    config,
    results: {
      counter: calculateStats(results.counter),
      matrix: calculateStats(results.matrix),
      token: calculateStats(results.token),
      governance: calculateStats(results.governance),
      did: calculateStats(results.did),
      ai: calculateStats(results.ai),
      overall: calculateStats(allResults)
    }
  };
  
  const reportDir = 'data/performance';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const reportPath = path.join(reportDir, `performance_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\nReport saved to: ${reportPath}`);
}

// 主测试函数
async function main() {
  console.log('=== Starting Smart Contract Performance Tests ===');
  console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
  
  try {
    // 加载现有合约状态
    await contractManager.loadState();
    console.log('Loaded existing contract state');
    
    // 运行性能测试
    await testCounterPerformance();
    await testMatrixPerformance();
    await testTokenPerformance();
    await testGovernancePerformance();
    await testDIDPerformance();
    await testAIPerformance();
    
    // 生成报告
    generateReport();
    
    // 保存合约状态
    await contractManager.saveState();
    console.log('\nContract state saved');
    
    console.log('\n=== Performance tests completed successfully! ===');
    
  } catch (error) {
    console.error('Error during performance testing:', error);
  }
}

// 运行测试
main();
