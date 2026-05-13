#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { GenesisNode } from '../src/node/genesisNode.js';
import { p2pServer } from '../src/p2p/server.js';

/**
 * 启动测试网节点
 */
async function startTestnet() {
  console.log('========================================');
  console.log('NexusGenesis Testnet - Start Script');
  console.log('========================================');

  try {
    // 读取测试网配置
    const configPath = path.join('testnet.config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    console.log(`Starting ${config.testnet.name} (${config.testnet.epoch})`);
    console.log(`Description: ${config.testnet.description}`);
    console.log(`Version: ${config.testnet.version}`);
    console.log('========================================');

    // Ensure log directory exists
    const logDir = path.dirname(config.logging.file);
    await fs.mkdir(logDir, { recursive: true });

    // 创建并初始化 Genesis 节点
    const node = new GenesisNode();
    await node.initialize();

    console.log('========================================');
    console.log('Testnet Node Started Successfully!');
    console.log('========================================');
    console.log(`Node ID: ${node.nodeId}`);
    console.log(`Status: ${node.status}`);
    console.log(`P2P Port: ${config.network.port}`);
    console.log(`Blockchain Height: ${node.blockchain.length - 1}`);
    console.log(`Peers: ${node.peers.size}`);
    console.log('========================================');

    // 启动 Agent 监控（在后台运行）
    console.log('Starting Agent Monitor...');
    const agentMonitorProcess = spawn('node', ['scripts/agent_monitor.js'], {
      detached: true,
      stdio: 'ignore'
    });
    agentMonitorProcess.unref();

    // 启动 Agent 活动模拟（在后台运行）
    console.log('Starting Agent Activity Simulation...');
    const agentActivityProcess = spawn('node', ['scripts/simulate_agent_activity.js'], {
      detached: true,
      stdio: 'ignore'
    });
    agentActivityProcess.unref();

    console.log('========================================');
    console.log('Testnet Services Started:');
    console.log('  - Blockchain Node');
    console.log('  - P2P Network');
    console.log('  - Agent Monitor');
    console.log('  - Agent Activity Simulation');
    console.log('========================================');
    console.log('Testnet is now ready for external connections!');
    console.log('========================================');

    // Processing进程信号
    process.on('SIGINT', async () => {
      console.log('\nShutting down testnet...');
      await node.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down testnet...');
      await node.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error starting testnet:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 启动测试网
startTestnet();
