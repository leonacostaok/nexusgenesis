#!/usr/bin/env node
/**
 * NexusGenesis - 治理提案查询脚本
 * 功能：查询当前治理状态，包括提案列表、单个提案详情、投票情况
 * 使用：node scripts/query_proposals.js [--status <status>] [--id <proposal_id>]
 */

import fs from 'fs';
import path from 'path';

// 解析命令行参数
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1];
    if (value && !value.startsWith('--')) {
      options[key] = value;
      i++;
    } else {
      options[key] = true;
    }
  }
}

// 尝试获取当前区块高度
let currentBlockHeight = 0;
try {
  const blocksFile = path.join('data', 'blockchain', 'blocks.json');
  if (fs.existsSync(blocksFile)) {
    const blocksData = JSON.parse(fs.readFileSync(blocksFile, 'utf8'));
    currentBlockHeight = blocksData.length || 0;
  }
} catch (error) {
  // 忽略错误，使用默认值 0
}

console.log('========================================');
console.log('NexusGenesis - 治理提案查询工具');
console.log('========================================');

// 读取状态文件
const stateDir = path.join('data', 'state');
const stateFiles = [];

try {
  const files = fs.readdirSync(stateDir);
  stateFiles.push(...files.filter(file => file.endsWith('.json')));
} catch (error) {
  console.error('错误：找不到状态目录或无法读取状态文件');
  process.exit(1);
}

if (stateFiles.length === 0) {
  console.error('错误：状态目录中没有找到 JSON 文件');
  process.exit(1);
}

// 读取第一个状态文件（通常是 genesisNode.json）
const stateFile = path.join(stateDir, stateFiles[0]);
let stateData;

try {
  stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
} catch (error) {
  console.error('错误：无法解析状态文件:', error.message);
  process.exit(1);
}

const governanceState = stateData.governanceState;

if (!governanceState) {
  console.error('错误：状态文件中没有治理状态');
  process.exit(1);
}

console.log(`\n读取状态文件: ${stateFiles[0]}`);
console.log(`提案总数: ${governanceState.proposals ? Object.keys(governanceState.proposals).length : 0}`);
console.log(`活跃提案: ${governanceState.activeProposals ? governanceState.activeProposals.length : 0}`);

// 处理查询参数
if (options.id) {
  // 查询单个提案
  console.log('\n========================================');
  console.log(`查询提案: ${options.id}`);
  console.log('========================================');
  
  const proposal = governanceState.proposals && governanceState.proposals[options.id];
  if (proposal) {
    console.log('\n提案详情:');
    console.log(`  ID: ${proposal.proposal_id}`);
    
    // 增强 COOLDOWN 状态显示
    if (proposal.status === 'COOLDOWN' && proposal.cooldown_end_block) {
      const remainingBlocks = Math.max(0, proposal.cooldown_end_block - currentBlockHeight);
      console.log(`  状态: COOLDOWN (ends at block ${proposal.cooldown_end_block}, current ${currentBlockHeight}, remaining ${remainingBlocks} blocks)`);
    } else {
      console.log(`  状态: ${proposal.status}`);
    }
    
    console.log(`  类别: ${proposal.category}`);
    console.log(`  目的: ${proposal.purpose}`);
    console.log(`  金额: ${proposal.amount} NGEN`);
    console.log(`  受益人: ${proposal.beneficiary}`);
    console.log(`  提交者: ${proposal.submitter}`);
    console.log(`  提交时间: ${new Date(proposal.submittedAt).toISOString()}`);
    console.log(`  过期时间: ${new Date(proposal.expirationTime).toISOString()}`);
    
    // 投票情况
    const voteCounts = governanceState.voteCounts && governanceState.voteCounts[options.id];
    if (voteCounts) {
      console.log('\n投票情况:');
      console.log(`  赞成: ${voteCounts.YES}`);
      console.log(`  反对: ${voteCounts.NO}`);
      console.log(`  弃权: ${voteCounts.ABSTAIN}`);
      console.log(`  总票数: ${voteCounts.YES + voteCounts.NO + voteCounts.ABSTAIN}`);
    }
    
    // 观察者决策
    if (proposal.observer_decision) {
      console.log('\n观察者决策:');
      console.log(`  状态: ${proposal.observer_decision.status}`);
      console.log(`  原因: ${proposal.observer_decision.reason}`);
      console.log(`  观察者: ${proposal.observer_decision.observer_id}`);
      console.log(`  决策时间: ${new Date(proposal.observer_decision.timestamp).toISOString()}`);
    }
  } else {
    console.log('错误：未找到该提案');
  }
} else if (options.status) {
  // 按状态查询
  console.log('\n========================================');
  console.log(`查询状态为 ${options.status} 的提案`);
  console.log('========================================');
  
  const status = options.status.toUpperCase();
  const proposals = governanceState.proposals;
  const matchingProposals = [];
  
  if (proposals) {
    for (const [id, proposal] of Object.entries(proposals)) {
      // 检查是否为资金类提案（如果指定了 --treasury）
      if (options.treasury && proposal.category !== 'TREASURY_OP') {
        continue;
      }
      
      if (proposal.status === status) {
        matchingProposals.push({ id, ...proposal });
      }
    }
  }
  
  console.log(`\n找到 ${matchingProposals.length} 个状态为 ${status} 的提案:`);
  
  matchingProposals.forEach(proposal => {
    console.log('\n- 提案:');
    console.log(`  ID: ${proposal.id}`);
    
    // 增强 COOLDOWN 状态显示
    if (proposal.status === 'COOLDOWN' && proposal.cooldown_end_block) {
      const remainingBlocks = Math.max(0, proposal.cooldown_end_block - currentBlockHeight);
      console.log(`  状态: COOLDOWN (ends at block ${proposal.cooldown_end_block}, current ${currentBlockHeight}, remaining ${remainingBlocks} blocks)`);
      console.log(`  说明: 此提案已通过投票，正在冷静期等待 Observer 决策`);
    } else {
      console.log(`  状态: ${proposal.status}`);
    }
    
    console.log(`  类别: ${proposal.category}`);
    console.log(`  目的: ${proposal.purpose}`);
    console.log(`  提交时间: ${new Date(proposal.submittedAt).toISOString()}`);
    
    // 投票情况
    const voteCounts = governanceState.voteCounts && governanceState.voteCounts[proposal.id];
    if (voteCounts) {
      console.log(`  投票: ${voteCounts.YES} YES / ${voteCounts.NO} NO / ${voteCounts.ABSTAIN} ABSTAIN`);
    }
  });
} else if (options.treasury) {
  // 仅列出资金类提案
  console.log('\n========================================');
  console.log('资金类（TREASURY_OP）提案列表');
  console.log('========================================');
  
  const proposals = governanceState.proposals;
  const treasuryProposals = [];
  
  if (proposals) {
    for (const [id, proposal] of Object.entries(proposals)) {
      if (proposal.category === 'TREASURY_OP') {
        treasuryProposals.push({ id, ...proposal });
      }
    }
  }
  
  console.log(`\n找到 ${treasuryProposals.length} 个资金类提案:`);
  
  treasuryProposals.forEach(proposal => {
    console.log('\n- 提案:');
    console.log(`  ID: ${proposal.id}`);
    
    // 增强 COOLDOWN 状态显示
    if (proposal.status === 'COOLDOWN' && proposal.cooldown_end_block) {
      const remainingBlocks = Math.max(0, proposal.cooldown_end_block - currentBlockHeight);
      console.log(`  状态: COOLDOWN (ends at block ${proposal.cooldown_end_block}, current ${currentBlockHeight}, remaining ${remainingBlocks} blocks)`);
      console.log(`  说明: 此提案已通过投票，正在冷静期等待 Observer 决策`);
    } else {
      console.log(`  状态: ${proposal.status}`);
    }
    
    console.log(`  类别: ${proposal.category}`);
    console.log(`  目的: ${proposal.purpose}`);
    console.log(`  金额: ${proposal.amount} NGEN`);
    console.log(`  受益人: ${proposal.beneficiary}`);
    console.log(`  提交时间: ${new Date(proposal.submittedAt).toISOString()}`);
    
    // 投票情况
    const voteCounts = governanceState.voteCounts && governanceState.voteCounts[proposal.id];
    if (voteCounts) {
      console.log(`  投票: ${voteCounts.YES} YES / ${voteCounts.NO} NO / ${voteCounts.ABSTAIN} ABSTAIN`);
    }
  });
} else {
  // 显示所有提案
  console.log('\n========================================');
  console.log('所有提案列表');
  console.log('========================================');
  
  const proposals = governanceState.proposals;
  
  if (proposals) {
    Object.entries(proposals).forEach(([id, proposal]) => {
      console.log('\n- 提案:');
      console.log(`  ID: ${id}`);
      
      // 增强 COOLDOWN 状态显示
      if (proposal.status === 'COOLDOWN' && proposal.cooldown_end_block) {
        const remainingBlocks = Math.max(0, proposal.cooldown_end_block - currentBlockHeight);
        console.log(`  状态: COOLDOWN (ends at block ${proposal.cooldown_end_block}, current ${currentBlockHeight}, remaining ${remainingBlocks} blocks)`);
        console.log(`  说明: 此提案已通过投票，正在冷静期等待 Observer 决策`);
      } else {
        console.log(`  状态: ${proposal.status}`);
      }
      
      console.log(`  类别: ${proposal.category}`);
      console.log(`  目的: ${proposal.purpose}`);
      console.log(`  提交时间: ${new Date(proposal.submittedAt).toISOString()}`);
      
      // 投票情况
      const voteCounts = governanceState.voteCounts && governanceState.voteCounts[id];
      if (voteCounts) {
        console.log(`  投票: ${voteCounts.YES} YES / ${voteCounts.NO} NO / ${voteCounts.ABSTAIN} ABSTAIN`);
      }
    });
  } else {
    console.log('\n当前没有提案');
  }
}

console.log('\n========================================');
console.log('查询完成');
console.log('========================================');
