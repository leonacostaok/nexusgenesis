#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

// 主函数
async function main() {
  try {
    if (command === '--status') {
      await checkNodeStatus();
    } else if (command === '--metrics') {
      await collectMetrics();
    } else if (command === '--logs') {
      await analyzeLogs();
    } else if (command === '--network') {
      await checkNetworkStatus();
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

// 检查节点状态
async function checkNodeStatus() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Node Status Check');
    console.log('========================================');

    // 检查区块链状态
    const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
    let blocks = [];
    try {
      const data = await fs.readFile(blockchainPath, 'utf8');
      blocks = JSON.parse(data);
      console.log(`Blockchain: ${blocks.length} blocks`);
      if (blocks.length > 0) {
        const latestBlock = blocks[blocks.length - 1];
        console.log(`Latest Block: #${latestBlock.header.height} (${new Date(latestBlock.header.timestamp).toISOString()})`);
      }
    } catch (error) {
      console.log('Blockchain: Not initialized');
    }

    // 检查状态文件
    const statePath = path.join('data', 'state', 'blockchainState.json');
    try {
      const data = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(data);
      console.log('State: Initialized');
      console.log(`Balances: ${Object.keys(state.balances || {}).length} addresses`);
      console.log(`Agents: ${Object.keys(state.agentRegistry?.agents || {}).length} registered`);
    } catch (error) {
      console.log('State: Not initialized');
    }

    // 检查P2P连接
    const p2pPath = path.join('data', 'state', 'genesisNode.json');
    try {
      const data = await fs.readFile(p2pPath, 'utf8');
      const nodeState = JSON.parse(data);
      console.log('P2P: Initialized');
      console.log(`Node ID: ${nodeState.nodeId}`);
      console.log(`Peers: ${nodeState.connectedPeers?.length || 0} connected`);
    } catch (error) {
      console.log('P2P: Not initialized');
    }

    console.log('========================================');
  } catch (error) {
    console.error('Error checking node status:', error.message);
  }
}

// 采集性能指标
async function collectMetrics() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Performance Metrics');
    console.log('========================================');

    // 系统指标
    const systemMetrics = {
      cpu: os.cpus().length,
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024),
        free: Math.round(os.freemem() / 1024 / 1024)
      },
      uptime: Math.round(os.uptime() / 60),
      platform: os.platform(),
      arch: os.arch()
    };

    console.log('System Metrics:');
    console.log(`  CPU Cores: ${systemMetrics.cpu}`);
    console.log(`  Memory: ${systemMetrics.memory.free} MB free / ${systemMetrics.memory.total} MB total`);
    console.log(`  Uptime: ${systemMetrics.uptime} minutes`);
    console.log(`  Platform: ${systemMetrics.platform} (${systemMetrics.arch})`);

    // 区块链指标
    let blocks = [];
    const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
    try {
      const data = await fs.readFile(blockchainPath, 'utf8');
      blocks = JSON.parse(data);
      
      if (blocks.length > 0) {
        const latestBlock = blocks[blocks.length - 1];
        const blockTime = blocks.length > 1 ? 
          (latestBlock.header.timestamp - blocks[blocks.length - 2].header.timestamp) / 1000 : 0;
        
        console.log('\nBlockchain Metrics:');
        console.log(`  Block Height: ${latestBlock.header.height}`);
        console.log(`  Transaction Count: ${blocks.reduce((sum, block) => sum + block.body.transactions.length, 0)}`);
        console.log(`  Average Block Time: ${blockTime.toFixed(2)} seconds`);
      }
    } catch (error) {
      console.log('\nBlockchain Metrics: Not available');
    }

    // 存储指标
    const dataDir = path.join(process.cwd(), 'data');
    try {
      const stats = await fs.stat(dataDir);
      console.log('\nStorage Metrics:');
      console.log(`  Data Directory: ${dataDir}`);
    } catch (error) {
      console.log('\nStorage Metrics: Not available');
    }

    // 保存指标到文件
    const metricsData = {
      timestamp: new Date().toISOString(),
      system: systemMetrics,
      blockchain: {
        blockHeight: blocks.length > 0 ? blocks[blocks.length - 1].header.height : 0,
        transactionCount: blocks.reduce((sum, block) => sum + block.body.transactions.length, 0) || 0
      }
    };

    const metricsPath = path.join('data', 'metrics.json');
    await fs.writeFile(metricsPath, JSON.stringify(metricsData, null, 2));
    console.log('\nMetrics saved to data/metrics.json');

    console.log('========================================');
  } catch (error) {
    console.error('Error collecting metrics:', error.message);
  }
}

// 分析日志
async function analyzeLogs() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Log Analysis');
    console.log('========================================');

    // 检查事件日志
    const eventsDir = path.join('data', 'events');
    try {
      const eventFiles = await fs.readdir(eventsDir);
      const governanceEvents = eventFiles.filter(file => file.startsWith('GOVERNANCE_PROPOSAL'));
      const observerEvents = eventFiles.filter(file => file.startsWith('OBSERVER_EVENT'));

      console.log('Event Logs:');
      console.log(`  Total Events: ${eventFiles.length}`);
      console.log(`  Governance Proposals: ${governanceEvents.length}`);
      console.log(`  Observer Events: ${observerEvents.length}`);

      // 分析最近的治理提案
      if (governanceEvents.length > 0) {
        const latestProposalFile = governanceEvents.sort().reverse()[0];
        const proposalPath = path.join(eventsDir, latestProposalFile);
        const proposalData = await fs.readFile(proposalPath, 'utf8');
        const proposal = JSON.parse(proposalData);
        const eventData = proposal.event_data || proposal;

        console.log('\nLatest Governance Proposal:');
        console.log(`  ID: ${eventData.proposal_id || 'N/A'}`);
        console.log(`  Type: ${eventData.category || 'N/A'}`);
        console.log(`  Amount: ${eventData.amount || 'N/A'} NGEN`);
        console.log(`  Created: ${new Date(proposal.timestamp || eventData.timestamp).toISOString()}`);
        console.log(`  Purpose: ${eventData.purpose || 'N/A'}`);
      }
    } catch (error) {
      console.log('Event Logs: Not available');
    }

    console.log('========================================');
  } catch (error) {
    console.error('Error analyzing logs:', error.message);
  }
}

// 检查网络状态
async function checkNetworkStatus() {
  try {
    console.log('========================================');
    console.log('NexusGenesis - Network Status');
    console.log('========================================');

    // 检查P2P连接
    const nodeStatePath = path.join('data', 'state', 'genesisNode.json');
    try {
      const data = await fs.readFile(nodeStatePath, 'utf8');
      const nodeState = JSON.parse(data);

      console.log('Node Information:');
      console.log(`  Node ID: ${nodeState.nodeId}`);
      console.log(`  Listening Port: ${nodeState.port || 8080}`);
      console.log(`  Connected Peers: ${nodeState.connectedPeers?.length || 0}`);

      if (nodeState.connectedPeers && nodeState.connectedPeers.length > 0) {
        console.log('\nConnected Peers:');
        nodeState.connectedPeers.forEach((peer, index) => {
          console.log(`  ${index + 1}. ${peer.nodeId} (${peer.host}:${peer.port})`);
        });
      }
    } catch (error) {
      console.log('Node Information: Not available');
    }

    console.log('========================================');
  } catch (error) {
    console.error('Error checking network status:', error.message);
  }
}

// 显示帮助信息
function showHelp() {
  console.log('========================================');
  console.log('NexusGenesis - Monitoring Tool');
  console.log('========================================');
  console.log('Usage:');
  console.log('  node scripts/monitor.js --status');
  console.log('    - Check node status and blockchain health');
  console.log('');
  console.log('  node scripts/monitor.js --metrics');
  console.log('    - Collect performance metrics');
  console.log('');
  console.log('  node scripts/monitor.js --logs');
  console.log('    - Analyze event logs');
  console.log('');
  console.log('  node scripts/monitor.js --network');
  console.log('    - Check network status and peer connections');
  console.log('');
  console.log('  node scripts/monitor.js --help');
  console.log('    - Show this help message');
  console.log('========================================');
}

// 运行主函数
main();
