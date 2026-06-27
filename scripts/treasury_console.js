#!/usr/bin/env node
/**
 * NexusGenesis - 资金提案控制台脚本
 * 功能：管理资金类（TREASURY_OP）提案的 DevNet 操作
 * 使用：node scripts/treasury_console.js <command> [options]
 * 命令：
 *   list       - 列出当前所有资金类提案
 *   show <id>  - 查看某个资金提案的详细状态
 *   approve <id> - 发送 Observer 批准决策
 *   reject <id>  - 发送 Observer 拒绝决策
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const proposalId = args[1];

// 读取状态文件
const stateDir = path.join('data', 'state');
let stateData;
let currentBlockHeight = 0;

try {
  const files = fs.readdirSync(stateDir);
  const stateFile = path.join(stateDir, files[0]);
  stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  
  // 尝试get当前区块高度
  const blocksFile = path.join('data', 'blockchain', 'blocks.json');
  if (fs.existsSync(blocksFile)) {
    const blocksData = JSON.parse(fs.readFileSync(blocksFile, 'utf8'));
    currentBlockHeight = blocksData.length || 0;
  }
} catch (error) {
  console.error('错误：无法读取状态文件:', error.message);
  process.exit(1);
}

const governanceState = stateData.governanceState;

if (!governanceState) {
  console.error('错误：状态文件中没有治理状态');
  process.exit(1);
}

// 主函数
async function main() {
  switch (command) {
    case 'list':
      await listTreasuryProposals();
      break;
    case 'show':
      if (!proposalId) {
        console.error('错误：请提供提案 ID');
        process.exit(1);
      }
      await showProposalDetails(proposalId);
      break;
    case 'approve':
      if (!proposalId) {
        console.error('错误：请提供提案 ID');
        process.exit(1);
      }
      await sendObserverDecision(proposalId, 'APPROVE_SPEND');
      break;
    case 'reject':
      if (!proposalId) {
        console.error('错误：请提供提案 ID');
        process.exit(1);
      }
      await sendObserverDecision(proposalId, 'REJECT_SPEND');
      break;
    default:
      console.log('用法：node scripts/treasury_console.js <command> [options]');
      console.log('命令：');
      console.log('  list       - 列出当前所有资金类提案');
      console.log('  show <id>  - 查看某个资金提案的详细状态');
      console.log('  approve <id> - 发送 Observer 批准决策');
      console.log('  reject <id>  - 发送 Observer 拒绝决策');
      process.exit(1);
  }
}

// 列出所有资金类提案
async function listTreasuryProposals() {
  console.log('========================================');
  console.log('[TREASURY] Proposals:');
  console.log('========================================');
  
  const proposals = governanceState.proposals;
  let found = false;
  
  if (proposals) {
    for (const [id, proposal] of Object.entries(proposals)) {
      if (proposal.category === 'TREASURY_OP') {
        found = true;
        console.log(`- ID: ${id}`);
        console.log(`  Status: ${proposal.status}`);
        
        if (proposal.status === 'COOLDOWN' && proposal.cooldown_end_block) {
          const remainingBlocks = Math.max(0, proposal.cooldown_end_block - currentBlockHeight);
          console.log(`  Cooldown ends at block: ${proposal.cooldown_end_block} (current: ${currentBlockHeight})`);
        }
        
        const voteCounts = governanceState.voteCounts && governanceState.voteCounts[id];
        if (voteCounts) {
          console.log(`  YES=${voteCounts.YES}, NO=${voteCounts.NO}, ABSTAIN=${voteCounts.ABSTAIN}`);
        }
        
        console.log('');
      }
    }
  }
  
  if (!found) {
    console.log('当前没有资金类提案');
  }
  
  console.log('========================================');
}

// 查看提案详细状态
async function showProposalDetails(proposalId) {
  console.log('========================================');
  console.log(`[TREASURY] Proposal Details: ${proposalId}`);
  console.log('========================================');
  
  const proposal = governanceState.proposals && governanceState.proposals[proposalId];
  
  if (proposal && proposal.category === 'TREASURY_OP') {
    console.log(`proposal_id: ${proposal.proposal_id}`);
    console.log(`status: ${proposal.status}`);
    console.log(`category: ${proposal.category}`);
    console.log(`created_at_block: ${proposal.created_at_block || 'N/A'}`);
    console.log(`expires_at_block: ${proposal.expires_at_block || 'N/A'}`);
    
    if (proposal.status === 'COOLDOWN' && proposal.cooldown_end_block) {
      const remainingBlocks = Math.max(0, proposal.cooldown_end_block - currentBlockHeight);
      console.log(`cooldown_end_block: ${proposal.cooldown_end_block}`);
      console.log(`current_height: ${currentBlockHeight}`);
      console.log(`remaining_blocks: ${remainingBlocks}`);
    }
    
    const voteCounts = governanceState.voteCounts && governanceState.voteCounts[proposalId];
    if (voteCounts) {
      console.log('vote_counts:');
      console.log(`  YES: ${voteCounts.YES}`);
      console.log(`  NO: ${voteCounts.NO}`);
      console.log(`  ABSTAIN: ${voteCounts.ABSTAIN}`);
    }
    
    if (proposal.observer_decision) {
      console.log('observer_decision:');
      console.log(`  observer_id: ${proposal.observer_decision.observer_id || 'N/A'}`);
      console.log(`  status: ${proposal.observer_decision.status}`);
      console.log(`  reason: ${proposal.observer_decision.reason || 'N/A'}`);
    }
  } else {
    console.log('错误：未找到该资金类提案');
  }
  
  console.log('========================================');
}

// 发送 Observer 决策
async function sendObserverDecision(proposalId, actionType) {
  try {
    // 构造交易
    const transaction = {
      tx_type: 'OBSERVER_EVENT',
      from: 'observer', // Observer 地址
      to: 'observer', // Observer 地址
      amount: '1', // 最小金额
      fee: '0',
      payload: {
        proposal_id: proposalId,
        action_type: actionType,
        reason: actionType === 'APPROVE_SPEND' ? 'Approved by Observer' : 'Rejected by Observer',
        observer_id: 'observer-1'
      }
    };
    
    // 发送交易到本地 HTTP 注入接口
    const response = await axios.post('http://localhost:3000/inject-transaction', transaction);
    
    if (response.status === 200) {
      console.log(`[TREASURY] Observer decision ${actionType} for proposal=${proposalId} sent.`);
    } else {
      console.error('错误：发送交易Failed:', response.data);
    }
  } catch (error) {
    console.error('错误：发送交易时出错:', error.message);
  }
}

// 执行主函数
main();
