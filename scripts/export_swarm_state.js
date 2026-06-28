#!/usr/bin/env node

/**
 * Swarm 状态导出脚本
 * 
 * 功能：
 * 1. 从当前状态文件读取链状态
 * 2. 组装成符合 SWARM_STATE_SPEC.md 的 JSON 结构
 * 3. 输出到控制台或指定文件
 */

import fs from 'fs';
import path from 'path';

// 状态文件路径
const STATE_FILES = [
  path.join(process.cwd(), 'data', 'state', 'blockchainState.json'),
  path.join(process.cwd(), 'data', 'state', 'genesisNode.json')
];

/**
 * 读取状态文件
 * @returns {object} 状态对象
 */
function readStateFile() {
  for (const filePath of STATE_FILES) {
    if (fs.existsSync(filePath)) {
      console.log(`Reading state from: ${filePath}`);
      try {
        const stateData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(stateData);
      } catch (error) {
        console.error(`Error reading state file: ${error.message}`);
      }
    }
  }
  console.error('No state file found!');
  process.exit(1);
}

/**
 * 导出 Swarm 状态快照
 * @returns {object} Swarm 状态快照
 */
function exportSwarmState() {
  const state = readStateFile();
  
  // 构建网络信息
  const network = {
    height: state.blockchain?.length || 0,
    latest_block_time: new Date().toISOString()
  };
  
  // 构建提案列表
  const proposals = [];
  const governanceState = state.governanceState || state.governance_state || {};
  const proposalsMap = governanceState.proposals || {};
  
  for (const [proposalId, proposal] of Object.entries(proposalsMap)) {
    proposals.push({
      proposal_id: proposal.proposal_id || proposalId,
      status: proposal.status || 'PENDING',
      category: proposal.category || 'UNKNOWN',
      purpose: proposal.purpose || 'No purpose provided',
      amount: proposal.amount || '0',
      beneficiary: proposal.beneficiary || 'ng1...',
      created_at_block: proposal.submittedAt ? Math.floor(proposal.submittedAt / 1000) : 0,
      expires_at_block: proposal.expirationTime ? Math.floor(proposal.expirationTime / 1000) : 0,
      vote_counts: proposal.vote_counts || governanceState.voteCounts?.[proposalId] || { YES: 0, NO: 0, ABSTAIN: 0 },
      observer_decision: proposal.observer_decision || null
    });
  }
  
  // 构建 Agent 列表
  const agents = [];
  const agentRegistry = state.agentRegistry || {};
  const agentsMap = agentRegistry.agents || {};
  
  for (const [agentId, agent] of Object.entries(agentsMap)) {
    agents.push({
      agent_id: agent.agent_id || agentId,
      address: agent.address || 'ng1...',
      label: agent.metadata || agent.label || agent.address || 'Unknown Agent',
      capabilities: agent.capabilities || [],
      reputation: agent.reputation || 0,
      registered_at_block: agent.registered_at_block || 0
    });
  }
  
  // 组装最终状态快照
  return {
    network,
    proposals,
    agents
  };
}

/**
 * 主函数
 */
function main() {
  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let outputFile = null;
    
    if (args.length > 0) {
      if (args[0] === '--out' && args.length > 1) {
        outputFile = args[1];
      }
    }
    
    // 导出状态
    const swarmState = exportSwarmState();
    const jsonOutput = JSON.stringify(swarmState, null, 2);
    
    // 输出结果
    if (outputFile) {
      fs.writeFileSync(outputFile, jsonOutput);
      console.log(`Swarm state exported to: ${outputFile}`);
    } else {
      console.log(jsonOutput);
    }
  } catch (error) {
    console.error('Error exporting swarm state:', error.message);
    process.exit(1);
  }
}

// 运行脚本
main();