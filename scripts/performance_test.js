#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { performance } from 'perf_hooks';

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

// 主函数
async function main() {
  try {
    if (command === '--throughput') {
      await runThroughputTest();
    } else if (command === '--resource') {
      await runResourceMonitoring();
    } else if (command === '--stress') {
      await runStressTest();
    } else if (command === '--help' || !command) {
      showHelp();
    } else {
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// 吞吐量测试
async function runThroughputTest() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Throughput Test');
    console.log('========================================');

    // 读取区块链数据
    const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
    const data = await fs.readFile(blockchainPath, 'utf8');
    const blocks = JSON.parse(data);

    console.log(`Total blocks: ${blocks.length}`);
    console.log(`Total transactions: ${blocks.reduce((sum, block) => sum + block.body.transactions.length, 0)}`);

    // 测试区块Processing速度
    console.log('\nTesting block processing speed...');
    const startTime = performance.now();
    
    // 模拟区块Processing
    blocks.forEach((block, index) => {
      // 模拟Block validation和Processing
      const blockHash = block.hash;
      const transactions = block.body.transactions;
      // 简单的Processing逻辑
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        // 模拟交易验证
        const txHash = tx.hash || 'mock-hash';
      }
    });

    const endTime = performance.now();
    const processingTime = endTime - startTime;
    const blocksPerSecond = blocks.length / (processingTime / 1000);
    const transactionsPerSecond = blocks.reduce((sum, block) => sum + block.body.transactions.length, 0) / (processingTime / 1000);

    console.log(`Processing time: ${processingTime.toFixed(2)} ms`);
    console.log(`Blocks per second: ${blocksPerSecond.toFixed(2)}`);
    console.log(`Transactions per second: ${transactionsPerSecond.toFixed(2)}`);

    // 测试状态读取速度
    console.log('\nTesting state read speed...');
    const statePath = path.join('data', 'state', 'blockchainState.json');
    const stateData = await fs.readFile(statePath, 'utf8');
    
    const stateStartTime = performance.now();
    const state = JSON.parse(stateData);
    const stateEndTime = performance.now();
    
    const stateReadTime = stateEndTime - stateStartTime;
    console.log(`State read time: ${stateReadTime.toFixed(2)} ms`);
    console.log(`Balances count: ${Object.keys(state.balances || {}).length}`);
    console.log(`Agents count: ${Object.keys(state.agentRegistry?.agents || {}).length}`);

    console.log('========================================');
  } catch (error) {
    console.error('Error running throughput test:', error.message);
  }
}

// 资源消耗监控
async function runResourceMonitoring() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Resource Monitoring');
    console.log('========================================');

    // 初始资源状态
    const initialMemory = process.memoryUsage();
    const initialCpuUsage = process.cpuUsage();
    const initialFreeMemory = os.freemem();
    
    console.log('Initial Resource Usage:');
    console.log(`  Process Memory: ${Math.round(initialMemory.rss / 1024 / 1024)} MB RSS`);
    console.log(`  System Free Memory: ${Math.round(initialFreeMemory / 1024 / 1024)} MB`);
    console.log(`  CPU Usage: ${JSON.stringify(initialCpuUsage)}`);

    // 模拟负载
    console.log('\nRunning load simulation...');
    
    // 读取和解析区块链数据多次
    const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
    const statePath = path.join('data', 'state', 'blockchainState.json');
    
    for (let i = 0; i < 100; i++) {
      // 读取区块链
      const blockchainData = await fs.readFile(blockchainPath, 'utf8');
      const blocks = JSON.parse(blockchainData);
      
      // 读取状态
      const stateData = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(stateData);
      
      // 模拟Processing
      blocks.forEach(block => {
        const txCount = block.body.transactions.length;
      });
    }

    // 最终资源状态
    const finalMemory = process.memoryUsage();
    const finalCpuUsage = process.cpuUsage(initialCpuUsage);
    const finalFreeMemory = os.freemem();
    
    console.log('\nFinal Resource Usage:');
    console.log(`  Process Memory: ${Math.round(finalMemory.rss / 1024 / 1024)} MB RSS`);
    console.log(`  System Free Memory: ${Math.round(finalFreeMemory / 1024 / 1024)} MB`);
    console.log(`  CPU Usage: ${JSON.stringify(finalCpuUsage)}`);

    // 计算资源消耗
    const memoryIncrease = Math.round((finalMemory.rss - initialMemory.rss) / 1024 / 1024);
    const systemMemoryDecrease = Math.round((initialFreeMemory - finalFreeMemory) / 1024 / 1024);
    
    console.log('\nResource Consumption:');
    console.log(`  Process Memory Increase: ${memoryIncrease} MB`);
    console.log(`  System Memory Decrease: ${systemMemoryDecrease} MB`);
    console.log(`  CPU User Time: ${finalCpuUsage.user / 1000} ms`);
    console.log(`  CPU System Time: ${finalCpuUsage.system / 1000} ms`);

    // 检查磁盘使用情况
    const dataDir = path.join(process.cwd(), 'data');
    const dataSize = await getDirectorySize(dataDir);
    console.log(`\nData Directory Size: ${(dataSize / 1024 / 1024).toFixed(2)} MB`);

    console.log('========================================');
  } catch (error) {
    console.error('Error running resource monitoring:', error.message);
  }
}

// 压力测试
async function runStressTest() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Stress Test');
    console.log('========================================');

    // 测试参数
    const testDuration = 60000; // 60秒
    const startTime = Date.now();
    let operations = 0;

    console.log(`Running stress test for ${testDuration / 1000} seconds...`);

    // 持续执行操作直到达到测试时长
    while (Date.now() - startTime < testDuration) {
      // 读取和解析区块链数据
      const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
      const blockchainData = await fs.readFile(blockchainPath, 'utf8');
      const blocks = JSON.parse(blockchainData);
      
      // 读取和解析状态数据
      const statePath = path.join('data', 'state', 'blockchainState.json');
      const stateData = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(stateData);
      
      // 模拟复杂操作
      blocks.forEach(block => {
        const txCount = block.body.transactions.length;
        const blockHash = block.hash;
      });
      
      // 计算余额总和
      const totalBalance = Object.values(state.balances || {}).reduce((sum, balance) => sum + parseInt(balance), 0);
      
      operations++;
    }

    const endTime = Date.now();
    const actualDuration = endTime - startTime;
    const operationsPerSecond = operations / (actualDuration / 1000);

    console.log(`\nStress Test Results:`);
    console.log(`  Total Operations: ${operations}`);
    console.log(`  Test Duration: ${actualDuration.toFixed(2)} ms`);
    console.log(`  Operations per Second: ${operationsPerSecond.toFixed(2)}`);

    // Check system status
    const memory = process.memoryUsage();
    const freeMemory = os.freemem();
    
    console.log(`\nSystem State After Test:`);
    console.log(`  Process Memory: ${Math.round(memory.rss / 1024 / 1024)} MB RSS`);
    console.log(`  System Free Memory: ${Math.round(freeMemory / 1024 / 1024)} MB`);
    console.log(`  CPU Cores: ${os.cpus().length}`);
    console.log(`  Load Average: ${os.loadavg().join(', ')}`);

    console.log('========================================');
  } catch (error) {
    console.error('Error running stress test:', error.message);
  }
}

// 辅助函数：get目录大小
async function getDirectorySize(dir) {
  let totalSize = 0;
  const files = await fs.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      totalSize += await getDirectorySize(filePath);
    } else {
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

// 显示帮助信息
function showHelp() {
  console.log('========================================');
  console.log('NexusGenesis - Performance Test Tool');
  console.log('========================================');
  console.log('Usage:');
  console.log('  node scripts/performance_test.js --throughput');
  console.log('    - Run throughput test');
  console.log('');
  console.log('  node scripts/performance_test.js --resource');
  console.log('    - Run resource consumption monitoring');
  console.log('');
  console.log('  node scripts/performance_test.js --stress');
  console.log('    - Run stress test');
  console.log('');
  console.log('  node scripts/performance_test.js --help');
  console.log('    - Show this help message');
  console.log('========================================');
}

// 运行主函数
main();
