/**
 * NexusGenesis - Multi-Leader Consensus Testnet
 * 
 * 启动多领导者共识测试网并验证去中心化出块
 * 
 * Usage：
 * node scripts/start_consensus_testnet.js
 */

import { ConsensusTestnet } from '../testnet/consensusNode.js';
import { createAgentRegisterTransaction } from '../src/transactions/agentRegister.js';

/**
 * 启动测试网演示
 */
async function startConsensusTestnet() {
  console.log('=== NexusGenesis Multi-Leader Consensus Testnet ===\n');

  // 1. 创建测试网
  const testnet = new ConsensusTestnet();

  // 2. 创建5 nodes（不同声誉值）
  console.log('--- Creating Nodes ---');
  const nodes = [
    { id: 'genesis-node', reputation: 10 },
    { id: 'validator-alpha', reputation: 8 },
    { id: 'validator-beta', reputation: 6 },
    { id: 'validator-gamma', reputation: 5 },
    { id: 'validator-delta', reputation: 3 }
  ];

  for (const nodeConfig of nodes) {
    testnet.createNode(nodeConfig.id, nodeConfig.reputation);
  }

  // 3. 连接所有节点
  console.log('\n--- Connecting Nodes ---');
  testnet.connectAllNodes();

  // 4. 创建一些交易
  console.log('\n--- Creating Transactions ---');
  const transactions = [];
  
  for (let i = 0; i < 5; i++) {
    const address = `ng1agent${i}000000000000000000000000000000000000`;
    const tx = createAgentRegisterTransaction(address, {
      agent_identity: `consensus-agent-${i}`,
      capabilities: ['coding', 'testing'],
      metadata: `Agent ${i} for consensus test`
    });
    transactions.push(tx);
  }

  console.log(`Created ${transactions.length} AGENT_REGISTER transactions`);

  // 5. 运行共识轮次（every 轮强制轮换领导者）
  console.log('\n--- Running Consensus Rounds ---');
  const rounds = 10;
  const txsPerRound = [
    [transactions[0]],
    [transactions[1]],
    [transactions[2]],
    [],
    [transactions[3]],
    [],
    [transactions[4]],
    [],
    [],
    []
  ];

  const blocks = [];
  for (let i = 0; i < rounds; i++) {
    console.log(`\n[TESTNET] === Round ${i + 1}/${rounds} ===`);
    
    // every 轮强制轮换领导者
    testnet.sharedConsensus.forceRotateLeader();
    
    const txs = txsPerRound[i] || [];
    const block = testnet.runConsensusRound(txs);
    
    if (block) {
      blocks.push(block);
    }
  }

  // 6. 显示结果
  console.log('\n=== Results ===');
  console.log(`Total blocks produced: ${blocks.length}`);
  console.log(`Success rate: ${(blocks.length / rounds * 100).toFixed(1)}%`);

  // 7. 显示every 个区块的信息
  console.log('\n--- Block Details ---');
  for (const block of blocks) {
    console.log(`Block ${block.height}: validator=${block.validator}, txs=${block.transactions.length}`);
  }

  // 8. 网络状态
  console.log('\n--- Network Status ---');
  const status = testnet.getNetworkStatus();
  console.log(`Total nodes: ${status.totalNodes}`);
  console.log(`All nodes synced: ${status.allSynced}`);
  console.log(`Average block height: ${status.averageBlockHeight.toFixed(1)}`);

  // 9. 领导者统计
  console.log('\n--- Leader Statistics ---');
  const leaderStats = {};
  for (const block of blocks) {
    leaderStats[block.validator] = (leaderStats[block.validator] || 0) + 1;
  }

  for (const [nodeId, count] of Object.entries(leaderStats)) {
    const percentage = (count / blocks.length * 100).toFixed(1);
    console.log(`${nodeId}: ${count} blocks (${percentage}%)`);
  }

  // 10. 验证去中心化
  console.log('\n--- Decentralization Check ---');
  const uniqueLeaders = Object.keys(leaderStats).length;
  const maxBlocksByOne = Math.max(...Object.values(leaderStats));
  const decentralizationRatio = (uniqueLeaders / nodes.length * 100).toFixed(1);
  const maxShare = (maxBlocksByOne / blocks.length * 100).toFixed(1);

  console.log(`Unique leaders: ${uniqueLeaders}/${nodes.length} (${decentralizationRatio}%)`);
  console.log(`Max share by single node: ${maxShare}%`);
  
  if (uniqueLeaders >= 3 && maxShare < 50) {
    console.log('✅ Decentralization verified: Power is distributed among multiple nodes');
  } else if (uniqueLeaders >= 2) {
    console.log('⚠️ Moderate decentralization: Consider adding more validators');
  } else {
    console.log('❌ Low decentralization: Too much power concentrated');
  }

  // 11. 验证区块链一致性
  console.log('\n--- Blockchain Consistency ---');
  if (status.allSynced) {
    console.log('✅ All nodes have identical blockchain');
  } else {
    console.log('❌ Nodes are out of sync');
    for (const nodeStatus of status.nodes) {
      console.log(`  ${nodeStatus.nodeId}: height=${nodeStatus.blockHeight}`);
    }
  }

  // 12. 显示节点详情
  console.log('\n--- Node Details ---');
  for (const nodeStatus of status.nodes) {
    console.log(`${nodeStatus.nodeId}:`);
    console.log(`  Reputation: ${nodeStatus.reputation}`);
    console.log(`  Block height: ${nodeStatus.blockHeight}`);
    console.log(`  Is leader: ${nodeStatus.isLeader}`);
    console.log(`  Peers: ${nodeStatus.peers}`);
  }

  console.log('\n=== Consensus Testnet Complete ===');
}

// 运行测试网
startConsensusTestnet().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
