#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// 监控配置
const MONITOR_INTERVAL = 60000; // 每分钟检查一次
const LOG_FILE = path.join('data', 'agent_monitor.log');

/**
 * 监控Agent节点
 */
async function monitorAgents() {
  console.log('========================================');
  console.log('NexusGenesis Agent Monitor');
  console.log('========================================');
  console.log(`Monitoring interval: ${MONITOR_INTERVAL / 1000} seconds`);
  console.log(`Log file: ${LOG_FILE}`);
  console.log('========================================');

  // Ensure log directory exists
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });

  // 启动监控
  setInterval(async () => {
    await checkAgentStatus();
  }, MONITOR_INTERVAL);

  // 立即执行一次检查
  await checkAgentStatus();
}

/**
 * 检查Agent状态
 */
async function checkAgentStatus() {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = [];

    // 1. 检查已部署的Agent
    const agentDir = path.join('data', 'agents');
    let agentFiles = [];
    try {
      agentFiles = await fs.readdir(agentDir);
    } catch (error) {
      logEntry.push(`${timestamp} - ERROR: Agent directory not found`);
      await writeLog(logEntry);
      return;
    }

    const agentConfigs = agentFiles.filter(file => file.startsWith('agent-') && file.endsWith('.json'));
    logEntry.push(`${timestamp} - INFO: Found ${agentConfigs.length} agent configurations`);

    // 2. 检查Blockchain state
    const statePath = path.join('data', 'state', 'blockchainState.json');
    let state = null;
    try {
      const stateData = await fs.readFile(statePath, 'utf8');
      state = JSON.parse(stateData);
      logEntry.push(`${timestamp} - INFO: Blockchain state loaded successfully`);
    } catch (error) {
      logEntry.push(`${timestamp} - WARNING: Blockchain state not found`);
    }

    // 3. 检查Agent注册情况
    if (state && state.agentRegistry) {
      const registeredAgents = Object.keys(state.agentRegistry.agents || {}).length;
      logEntry.push(`${timestamp} - INFO: Registered agents: ${registeredAgents}`);
    }

    // 4. 检查治理活动
    if (state && state.governanceState) {
      const activeProposals = state.governanceState.activeProposals?.length || 0;
      const totalProposals = Object.keys(state.governanceState.proposals || {}).length;
      logEntry.push(`${timestamp} - INFO: Active proposals: ${activeProposals}, Total proposals: ${totalProposals}`);
    }

    // 5. 检查区块高度
    const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
    try {
      const blockchainData = await fs.readFile(blockchainPath, 'utf8');
      const blocks = JSON.parse(blockchainData);
      const blockHeight = blocks.length - 1;
      logEntry.push(`${timestamp} - INFO: Block height: ${blockHeight}`);
    } catch (error) {
      logEntry.push(`${timestamp} - WARNING: Blockchain data not found`);
    }

    // 6. 检查交易池
    const genesisNodePath = path.join('data', 'state', 'genesisNode.json');
    try {
      const nodeData = await fs.readFile(genesisNodePath, 'utf8');
      const nodeState = JSON.parse(nodeData);
      const mempoolSize = nodeState.mempool?.length || 0;
      logEntry.push(`${timestamp} - INFO: Mempool size: ${mempoolSize}`);
    } catch (error) {
      logEntry.push(`${timestamp} - WARNING: Genesis node state not found`);
    }

    // 7. 检查网络连接
    try {
      const nodeData = await fs.readFile(genesisNodePath, 'utf8');
      const nodeState = JSON.parse(nodeData);
      const peerCount = nodeState.peers?.length || 0;
      logEntry.push(`${timestamp} - INFO: Connected peers: ${peerCount}`);
    } catch (error) {
      logEntry.push(`${timestamp} - WARNING: Network status not available`);
    }

    // Write log
    await writeLog(logEntry);

    // 显示当前状态
    console.log(`\n${timestamp}`);
    console.log(`Agent configurations: ${agentConfigs.length}`);
    if (state) {
      const registeredAgents = Object.keys(state.agentRegistry?.agents || {}).length;
      console.log(`Registered agents: ${registeredAgents}`);
      const activeProposals = state.governanceState?.activeProposals?.length || 0;
      console.log(`Active proposals: ${activeProposals}`);
    }

  } catch (error) {
    const timestamp = new Date().toISOString();
    await writeLog([`${timestamp} - ERROR: ${error.message}`]);
    console.error('Error monitoring agents:', error.message);
  }
}

/**
 * Write log
 */
async function writeLog(entries) {
  try {
    const logContent = entries.join('\n') + '\n';
    await fs.appendFile(LOG_FILE, logContent);
  } catch (error) {
    console.error('Error writing log:', error.message);
  }
}

// 运行监控
monitorAgents();
