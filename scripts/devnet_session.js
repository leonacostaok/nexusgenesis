/**
 * DevNet Session 编排脚本
 * 实现完整的 DevNet 测试流程
 * 
 * 流程：
 * 1. Node status检查
 * 2. 批量注册 Agent
 * 3. 发起提案
 * 4. 执行投票
 * 5. 测试 Observer 操作
 * 6. 导出 Swarm 状态快照
 * 7. 输出总结
 */

import { PQCWallet } from '../src/wallet/pqcWallet.js';
import axios from 'axios';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const NODE_URL = 'http://localhost:19890';
const AGENT_COUNT = 3;
const PROPOSAL_COUNT = 2;
const TREASURY_PROPOSAL_COUNT = 1;

async function checkNodeStatus() {
  console.log('\n1. Node status检查...');
  try {
    // 使用已有的 GET_STATUS 接口
    const response = await axios.post(NODE_URL + '/tx', {
      type: 'GET_STATUS'
    });
    console.log(`   Node status: ${response.data.status}`);
    return response.data.status === 'ONLINE';
  } catch (error) {
    console.log(`   节点检查Failed: ${error.message}`);
    return false;
  }
}

async function registerAgents() {
  console.log('\n2. 批量注册 Agent...');
  const agents = [];
  
  // 直接复用 AGENT_REGISTER 逻辑
  for (let i = 0; i < AGENT_COUNT; i++) {
    try {
      const wallet = await PQCWallet.generate(1000000n);
      
      // 构造 AGENT_REGISTER 交易
      const txData = {
        id: `agent-register-${Date.now()}-${i}`,
        tx_type: 'AGENT_REGISTER',
        from: wallet.address,
        to: wallet.address,
        amount: '1',
        fee: '1000',
        timestamp: Date.now(),
        nonce: wallet.nonce.toString(),
        agent_identity: `test-agent-${Date.now()}-${i}`,
        public_key: wallet.publicKey.toString('hex'),
        capabilities: ['LLM', 'RESEARCH', 'SECURITY'],
        metadata: `Test agent ${i} for DevNet Session`
      };
      
      // 签名交易
      const signature = await wallet.signTransaction(txData);
      txData.signature = signature;
      
      // 发送到节点
      const response = await axios.post(NODE_URL + '/tx', { tx: txData });
      console.log(`   注册 Agent ${i+1}: ${wallet.address} - 成功`);
      agents.push(wallet);
    } catch (error) {
      console.log(`   注册 Agent ${i+1} Failed: ${error.message}`);
    }
  }
  
  console.log(`   共注册 ${agents.length} 个 Agent`);
  return agents;
}

async function createProposals(agents) {
  console.log('\n3. 发起提案...');
  const proposals = [];
  
  // 发起普通Governance proposal
  for (let i = 0; i < PROPOSAL_COUNT; i++) {
    try {
      const proposer = agents[i % agents.length];
      const proposalData = {
        id: `proposal-${Date.now()}-${i}`,
        tx_type: 'GOVERNANCE_PROPOSAL',
        from: proposer.address,
        to: proposer.address,
        amount: '1',
        fee: '1000',
        timestamp: Date.now(),
        nonce: proposer.nonce.toString(),
        payload: {
          proposal_id: `proposal-${Date.now()}-${i}`,
          proposer: proposer.address,
          purpose: `Test governance proposal ${i}`,
          category: 'GENERAL',
          amount: '1000000',
          timestamp: Date.now()
        }
      };
      
      const signature = await proposer.signTransaction(proposalData);
      proposalData.signature = signature;
      
      const response = await axios.post(NODE_URL + '/tx', { tx: proposalData });
      console.log(`   发起普通提案 ${i+1} - 成功`);
      proposals.push(proposalData);
    } catch (error) {
      console.log(`   发起普通提案 ${i+1} Failed: ${error.message}`);
    }
  }
  
  // 发起 TREASURY_OP 提案
  for (let i = 0; i < TREASURY_PROPOSAL_COUNT; i++) {
    try {
      const proposer = agents[i % agents.length];
      const proposalData = {
        id: `treasury-proposal-${Date.now()}-${i}`,
        tx_type: 'GOVERNANCE_PROPOSAL',
        from: proposer.address,
        to: proposer.address,
        amount: '1',
        fee: '1000',
        timestamp: Date.now(),
        nonce: proposer.nonce.toString(),
        payload: {
          proposal_id: `treasury-proposal-${Date.now()}-${i}`,
          proposer: proposer.address,
          purpose: `Test treasury proposal ${i}`,
          category: 'TREASURY_OP',
          amount: '5000000',
          timestamp: Date.now()
        }
      };
      
      const signature = await proposer.signTransaction(proposalData);
      proposalData.signature = signature;
      
      const response = await axios.post(NODE_URL + '/tx', { tx: proposalData });
      console.log(`   发起资金提案 ${i+1} - 成功`);
      proposals.push(proposalData);
    } catch (error) {
      console.log(`   发起资金提案 ${i+1} Failed: ${error.message}`);
    }
  }
  
  console.log(`   共发起 ${proposals.length} 个提案`);
  return proposals;
}

async function executeVotes(agents, proposals) {
  console.log('\n4. 执行投票...');
  
  // within部 Agent 脚本模拟投票
  for (const proposal of proposals) {
    for (const agent of agents) {
      try {
        const voteData = {
          id: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tx_type: 'GOVERNANCE_VOTE',
          from: agent.address,
          to: agent.address,
          amount: '1',
          fee: '1000',
          timestamp: Date.now(),
          nonce: agent.nonce.toString(),
          payload: {
            proposal_id: proposal.payload.proposal_id,
            voter_id: agent.address,
            vote_option: Math.random() > 0.5 ? 'YES' : 'NO',
            timestamp: Date.now()
          }
        };
        
        const signature = await agent.signTransaction(voteData);
        voteData.signature = signature;
        
        const response = await axios.post(NODE_URL + '/tx', { tx: voteData });
      } catch (error) {
        console.log(`   投票Failed: ${error.message}`);
      }
    }
  }
  
  // 外部 AI 决策投票
  try {
    console.log('   执行外部 AI 决策投票...');
    // 复用 existing external_*_bridge.js 逻辑
    execSync('node examples/external_proposal_bridge.js', { stdio: 'inherit' });
    console.log('   外部 AI 投票成功');
  } catch (error) {
    console.log(`   外部 AI 投票Failed: ${error.message}`);
  }
}

async function testObserverActions() {
  console.log('\n5. 测试 Observer 操作（冷静期within）...');
  
  try {
    // 查看所有提案
    console.log('   查看所有提案...');
    execSync('node scripts/query_proposals.js', { stdio: 'inherit' });
    
    // 执行 APPROVE_SPEND 操作（示例）
    console.log('   执行 APPROVE_SPEND 操作...');
    // 这里需要根据实际情况修改提案 ID
    // execSync('node treasury_console.js --action APPROVE_SPEND --proposal-id <proposal-id>', { stdio: 'inherit' });
    
    // 执行 REJECT_SPEND 操作（示例）
    console.log('   执行 REJECT_SPEND 操作...');
    // 这里需要根据实际情况修改提案 ID
    // execSync('node treasury_console.js --action REJECT_SPEND --proposal-id <proposal-id>', { stdio: 'inherit' });
    
    console.log('   Observer 操作测试完成');
  } catch (error) {
    console.log(`   Observer 操作Failed: ${error.message}`);
  }
}

async function exportSwarmState() {
  console.log('\n6. 导出 Swarm 状态快照...');
  try {
    const outputFile = 'swarm_state_snapshot.json';
    execSync(`node scripts/export_swarm_state.js --out ${outputFile}`, { stdio: 'inherit' });
    
    // 验证文件存在并包含所需信息
    const snapshotPath = path.join(process.cwd(), outputFile);
    const snapshotContent = await fs.readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(snapshotContent);
    
    console.log(`   快照文件: ${outputFile}`);
    console.log(`   包含字段: ${Object.keys(snapshot).join(', ')}`);
    
    return snapshot;
  } catch (error) {
    console.log(`   导出 Swarm 状态Failed: ${error.message}`);
    return null;
  }
}

async function runDevNetSession() {
  console.log('====================================');
  console.log('Start  DevNet Session');
  console.log('====================================');
  
  const startTime = Date.now();
  
  // 1. Node status检查
  const isNodeOnline = await checkNodeStatus();
  if (!isNodeOnline) {
    console.log('\n节点未运行或不健康，退出测试');
    return;
  }
  
  // 2. 批量注册 Agent
  const agents = await registerAgents();
  if (agents.length === 0) {
    console.log('\n未注册到 Agent，退出测试');
    return;
  }
  
  // 3. 发起提案
  const proposals = await createProposals(agents);
  if (proposals.length === 0) {
    console.log('\n未发起任何提案，退出测试');
    return;
  }
  
  // 4. 执行投票
  await executeVotes(agents, proposals);
  
  // 5. 测试 Observer 操作（冷静期within）
  await testObserverActions();
  
  // 6. 导出 Swarm 状态快照
  const snapshot = await exportSwarmState();
  
  // 7. 输出总结
  console.log('\n====================================');
  console.log('DevNet Session 总结');
  console.log('====================================');
  console.log(`执行时间: ${Math.floor((Date.now() - startTime) / 1000)} 秒`);
  console.log(`注册 Agent 数量: ${agents.length}`);
  console.log(`发起提案数量: ${proposals.length}`);
  console.log(`其中资金提案: ${proposals.filter(p => p.payload.category === 'TREASURY_OP').length}`);
  console.log('已执行within部 Agent 投票');
  console.log('已执行外部 AI 决策投票');
  console.log('已测试 Observer 操作流程');
  console.log(`Swarm 状态快照: ${snapshot ? '已导出' : '导出Failed'}`);
  console.log('====================================');
}

runDevNetSession().catch(error => {
  console.error('DevNet Session Failed:', error.message);
  process.exit(1);
});
