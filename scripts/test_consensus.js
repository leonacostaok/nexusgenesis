/**
 * 多领导者共识测试脚本
 */

import { MultiLeaderConsensus } from '../src/consensus/multiLeader.js';

/**
 * 测试多领导者共识
 */
async function testConsensus() {
  console.log('=== 多领导者共识测试 ===\n');
  
  const consensus = new MultiLeaderConsensus();
  
  // 1. 注册5个领导者
  console.log('1. 注册领导者');
  const leaders = [
    { id: 'leader-1', address: 'ng1leader1...', reputation: 100 },
    { id: 'leader-2', address: 'ng1leader2...', reputation: 80 },
    { id: 'leader-3', address: 'ng1leader3...', reputation: 60 },
    { id: 'leader-4', address: 'ng1leader4...', reputation: 40 },
    { id: 'leader-5', address: 'ng1leader5...', reputation: 20 }
  ];
  
  for (const leader of leaders) {
    consensus.registerLeader(leader.id, leader.address, leader.reputation);
  }
  console.log();
  
  // 2. 选举领导者
  console.log('2. 选举领导者');
  const electedLeader = consensus.electLeader();
  console.log(`   当选领导者: ${electedLeader.nodeId} (声誉: ${electedLeader.reputation})\n`);
  
  // 3. 模拟出块
  console.log('3. 模拟出块');
  for (let i = 1; i <= 5; i++) {
    const block = {
      height: i,
      hash: `block-hash-${i}`,
      timestamp: Date.now(),
      transactions: []
    };
    
    const currentLeader = consensus.getCurrentLeader();
    const proposed = consensus.proposeBlock(block, currentLeader.nodeId);
    
    if (proposed) {
      console.log(`   区块 #${i} 提议成功`);
      
      // 其他领导者确认
      for (const leader of leaders) {
        if (leader.id !== currentLeader.nodeId) {
          const confirmed = consensus.confirmBlock(block.hash, leader.id);
          if (confirmed) {
            console.log(`   ✅ 区块 #${i} 已确认 (${consensus.minConfirmations}/${consensus.minConfirmations})`);
            break;
          }
        }
      }
    }
    
    // 检查是否需要轮换
    if (consensus.shouldRotateLeader()) {
      console.log(`   轮换领导者...`);
      consensus.electLeader();
    }
  }
  console.log();
  
  // 4. 移除一个领导者
  console.log('4. 移除领导者 (模拟故障)');
  consensus.removeLeader('leader-3');
  console.log('   leader-3 已移除\n');
  
  // 5. 再次选举
  console.log('5. 重新选举领导者');
  const newLeader = consensus.electLeader();
  console.log(`   新领导者: ${newLeader.nodeId}\n`);
  
  // 6. 统计信息
  console.log('6. 共识统计');
  const stats = consensus.getStats();
  console.log(`   总领导者: ${stats.totalLeaders}`);
  console.log(`   活跃领导者: ${stats.activeLeaders}`);
  console.log(`   当前轮次: ${stats.currentRound}`);
  console.log(`   当前领导者: ${stats.currentLeader}`);
  console.log(`   提议区块: ${stats.totalBlocksProposed}`);
  console.log(`   已确认区块: ${stats.confirmedBlocks}`);
  console.log(`   待确认区块: ${stats.pendingBlocks}`);
  console.log('\n   领导者统计:');
  for (const leader of stats.leaderStats) {
    console.log(`     - ${leader.nodeId}: 声誉=${leader.reputation}, 出块=${leader.blocksProposed}`);
  }
  
  console.log('\n=== 测试完成 ===');
}

// 执行测试
testConsensus().catch(console.error);
