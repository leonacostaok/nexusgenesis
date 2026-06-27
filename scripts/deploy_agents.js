#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { PQCWallet } from '../src/wallet/pqcWallet.js';

// 部署参数
const AGENT_COUNT = 20; // 部署20个Agent节点
const INITIAL_BALANCE = 10000n; // 每个Agent的初始余额

/**
 * 部署多个Agent节点
 */
async function deployAgents() {
  console.log('========================================');
  console.log('Deploying NexusGenesis Agent Nodes');
  console.log('========================================');
  console.log(`Target: ${AGENT_COUNT} agents`);
  console.log(`Initial balance: ${INITIAL_BALANCE} NGEN`);
  console.log('========================================');

  try {
    // 创建agent配置目录
    const agentDir = path.join('data', 'agents');
    await fs.mkdir(agentDir, { recursive: true });

    // 部署Agent节点
    const agents = [];
    for (let i = 1; i <= AGENT_COUNT; i++) {
      console.log(`\nDeploying Agent ${i}/${AGENT_COUNT}...`);
      
      // 生成PQC钱包
      const wallet = await PQCWallet.generate(INITIAL_BALANCE);
      
      // 生成Agent配置
      const agentConfig = {
        agentId: `agent-${i}`,
        address: wallet.address,
        publicKey: wallet.publicKey.toString('hex'),
        balance: wallet.balance.toString(),
        capabilities: [
          'governance',
          'validation',
          'monitoring'
        ],
        metadata: {
          deploymentDate: new Date().toISOString(),
          version: '1.0.0',
          type: 'automated'
        }
      };

      // 保存Agent配置
      const configPath = path.join(agentDir, `agent-${i}.json`);
      await fs.writeFile(configPath, JSON.stringify(agentConfig, null, 2));

      agents.push(agentConfig);
      console.log(`  Agent ${i} deployed: ${wallet.address}`);
    }

    // 保存所有Agent的汇总信息
    const summaryPath = path.join(agentDir, 'agents_summary.json');
    const summary = {
      totalAgents: AGENT_COUNT,
      deploymentDate: new Date().toISOString(),
      agents: agents
    };
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    console.log('\n========================================');
    console.log('Agent deployment completed!');
    console.log(`Total agents deployed: ${AGENT_COUNT}`);
    console.log(`Agent configurations saved to: ${agentDir}`);
    console.log('========================================');

  } catch (error) {
    console.error('Error deploying agents:', error.message);
  }
}

// 运行部署
deployAgents();
