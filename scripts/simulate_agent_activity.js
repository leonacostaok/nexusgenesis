#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import { PQCWallet, Transaction } from '../src/wallet/pqcWallet.js';

// 交易注入接口
const TX_INJECTION_URL = 'http://localhost:19890/tx';

/**
 * 发送交易到节点
 * @param {object} transaction - 交易对象
 * @returns {Promise<object>} - 响应结果
 */
async function sendTransaction(transaction) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(transaction);
    const options = {
      hostname: '127.0.0.1',
      port: 19890,
      path: '/tx',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          resolve({ success: false, reason: 'Invalid response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, reason: error.message });
    });

    req.write(data);
    req.end();
  });
}

// 模拟配置
const SIMULATION_DURATION = 3600000; // 1小时
const AGENT_COUNT = 20;
const PROPOSAL_INTERVAL = 300000; // 每5分钟提交一个提案
const VOTE_INTERVAL = 60000; // 每分钟投票一次

/**
 * 模拟Agent活动
 */
async function simulateAgentActivity() {
  console.log('========================================');
  console.log('NexusGenesis Agent Activity Simulation');
  console.log('========================================');
  console.log(`Duration: ${SIMULATION_DURATION / 1000 / 60} minutes`);
  console.log(`Agents: ${AGENT_COUNT}`);
  console.log(`Proposal interval: ${PROPOSAL_INTERVAL / 1000 / 60} minutes`);
  console.log(`Vote interval: ${VOTE_INTERVAL / 1000} seconds`);
  console.log('========================================');

  try {
    // 加载Agent配置
    const agentDir = path.join('data', 'agents');
    const agentFiles = await fs.readdir(agentDir);
    const agentConfigs = agentFiles.filter(file => file.startsWith('agent-') && file.endsWith('.json'));

    console.log(`Found ${agentConfigs.length} agent configurations`);

    // 加载Agent钱包
    const agents = [];
    for (const file of agentConfigs) {
      const configPath = path.join(agentDir, file);
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // 加载钱包
      const wallet = await PQCWallet.load(config.address);
      if (wallet) {
        agents.push({
          ...config,
          wallet
        });
        console.log(`Loaded agent: ${config.address}`);
      }
    }

    console.log(`Loaded ${agents.length} agent wallets`);

    // 启动提案提交
    startProposalSubmission(agents);

    // 启动投票
    startVoting(agents);

    // 启动Agent注册
    startAgentRegistration(agents);

    // 运行指定时间
    setTimeout(() => {
      console.log('========================================');
      console.log('Agent activity simulation completed');
      console.log('========================================');
      process.exit(0);
    }, SIMULATION_DURATION);

  } catch (error) {
    console.error('Error starting agent simulation:', error.message);
  }
}

/**
 * 启动Agent注册
 */
async function startAgentRegistration(agents) {
  console.log('Starting agent registration...');

  for (const agent of agents) {
    try {
      // 创建Agent注册交易
      const tx = new Transaction(
        agent.address, // 发送到自己
        agent.address, // 发送到自己
        '0', // 金额为0
        '1', // 手续费
        'AGENT_REGISTER'
      );
      tx.id = tx.computeId();
      await tx.sign(agent.wallet);
      
      // 构建完整的交易对象
      const txData = tx.toObject();
      txData.tx_type = 'AGENT_REGISTER';
      txData.payload = {
        agent_identity: agent.agentId,
        capabilities: agent.capabilities,
        metadata: agent.metadata
      };

      // 保存交易到文件
      const txPath = path.join('data', 'transactions', `${tx.id}.json`);
      await fs.mkdir(path.dirname(txPath), { recursive: true });
      await fs.writeFile(txPath, JSON.stringify(txData, null, 2));

      // 发送交易到节点
      try {
        console.log(`Sending registration transaction for agent ${agent.agentId}...`);
        console.log(`Transaction data: ${JSON.stringify(txData, null, 2)}`);
        const result = await sendTransaction(txData);
        if (result.success) {
          console.log(`Agent registered: ${agent.agentId} (${agent.address}) - Transaction accepted`);
        } else {
          console.log(`Agent registration failed: ${agent.agentId} - ${result.reason}`);
        }
      } catch (error) {
        console.error(`Error sending registration transaction for agent ${agent.agentId}:`, error);
      }

      // 等待一段时间再注册下一个Agent
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error registering agent ${agent.agentId}:`, error.message);
    }
  }
}

/**
 * 启动提案提交
 */
async function startProposalSubmission(agents) {
  console.log('Starting proposal submission...');

  let proposalCount = 1;
  setInterval(async () => {
    if (agents.length === 0) return;

    // 随机选择一个Agent提交提案
    const randomAgent = agents[Math.floor(Math.random() * agents.length)];

    try {
      // 创建Governance proposal交易
      const proposalId = `prop-${Date.now()}-${proposalCount++}`;
      const tx = new Transaction(
        randomAgent.address, // 发送到自己
        randomAgent.address, // 发送到自己
        '0', // 金额为0
        '1', // 手续费
        'GOVERNANCE_PROPOSAL'
      );
      tx.id = tx.computeId();
      await tx.sign(randomAgent.wallet);
      
      // 构建完整的交易对象
      const txData = tx.toObject();
      txData.tx_type = 'GOVERNANCE_PROPOSAL';
      txData.payload = {
        proposal_id: proposalId,
        purpose: `Test proposal ${proposalCount}`,
        amount: '1000',
        beneficiary: randomAgent.address,
        justification: 'Testing governance functionality',
        expected_benefit: 'Improved system performance',
        duration: '30 days',
        risk_assessment: 'Low',
        category: 'INFRA'
      };

      // 保存交易到文件
      const txPath = path.join('data', 'transactions', `${tx.id}.json`);
      await fs.mkdir(path.dirname(txPath), { recursive: true });
      await fs.writeFile(txPath, JSON.stringify(txData, null, 2));

      // 发送交易到节点
      const result = await sendTransaction(txData);
      if (result.success) {
        console.log(`Proposal submitted: ${proposalId} by ${randomAgent.agentId} - Transaction accepted`);
      } else {
        console.log(`Proposal submission failed: ${proposalId} - ${result.reason}`);
      }
    } catch (error) {
      console.error(`Error submitting proposal:`, error.message);
    }
  }, PROPOSAL_INTERVAL);
}

/**
 * 启动投票
 */
async function startVoting(agents) {
  console.log('Starting voting...');

  setInterval(async () => {
    if (agents.length === 0) return;

    // 读取当前的治理状态
    const statePath = path.join('data', 'state', 'blockchainState.json');
    let state = null;
    try {
      const stateData = await fs.readFile(statePath, 'utf8');
      state = JSON.parse(stateData);
    } catch (error) {
      console.error('Error reading state:', error.message);
      return;
    }

    // 检查是否有活跃的提案
    if (!state.governanceState || !state.governanceState.activeProposals || state.governanceState.activeProposals.length === 0) {
      return;
    }

    // 随机选择一个活跃提案
    const activeProposals = state.governanceState.activeProposals;
    const randomProposal = activeProposals[Math.floor(Math.random() * activeProposals.length)];

    // 随机选择一个Agent投票
    const randomAgent = agents[Math.floor(Math.random() * agents.length)];

    try {
      // 随机选择投票选项
      const voteOptions = ['YES', 'NO', 'ABSTAIN'];
      const randomVote = voteOptions[Math.floor(Math.random() * voteOptions.length)];

      // 创建投票交易
      const tx = new Transaction(
        randomAgent.address, // 发送到自己
        randomAgent.address, // 发送到自己
        '0', // 金额为0
        '1', // 手续费
        'GOVERNANCE_VOTE'
      );
      tx.id = tx.computeId();
      await tx.sign(randomAgent.wallet);
      
      // 构建完整的交易对象
      const txData = tx.toObject();
      txData.tx_type = 'GOVERNANCE_VOTE';
      txData.payload = {
        proposal_id: randomProposal,
        voter_id: randomAgent.agentId,
        vote_option: randomVote,
        timestamp: Date.now()
      };

      // 保存交易到文件
      const txPath = path.join('data', 'transactions', `${tx.id}.json`);
      await fs.mkdir(path.dirname(txPath), { recursive: true });
      await fs.writeFile(txPath, JSON.stringify(txData, null, 2));

      // 发送交易到节点
      const result = await sendTransaction(txData);
      if (result.success) {
        console.log(`Vote cast: ${randomVote} on ${randomProposal} by ${randomAgent.agentId} - Transaction accepted`);
      } else {
        console.log(`Vote casting failed: ${randomVote} on ${randomProposal} - ${result.reason}`);
      }
    } catch (error) {
      console.error(`Error casting vote:`, error.message);
    }
  }, VOTE_INTERVAL);
}

// 运行模拟
simulateAgentActivity();
