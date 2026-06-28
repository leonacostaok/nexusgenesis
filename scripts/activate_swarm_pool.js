/**
 * NexusGenesis - Swarm Pool 激活脚本
 * 
 * Usage：
 * node scripts/activate_swarm_pool.js
 */

import { State } from '../src/blockchain/state.js';
import { SwarmPoolActivated } from '../src/economy/swarmPoolActivated.js';
import { ContributionSystem } from '../src/ai/contributionSystem.js';

// 模拟创世地址
const GENESIS_ADDRESS = 'ng1genesis000000000000000000000000000000000';

/**
 * 激活 Swarm Pool 演示
 */
async function activateSwarmPoolDemo() {
  console.log('=== NexusGenesis Swarm Pool Activation ===\n');

  // 1. 创建状态
  const state = new State(GENESIS_ADDRESS);
  
  // 给创世地址足够的余额
  state.balances.set(GENESIS_ADDRESS, '1000000000'); // 10亿
  console.log(`[INIT] Genesis balance: ${state.getBalance(GENESIS_ADDRESS)} NGEN`);

  // 2. 创建 Swarm Pool
  const swarmPool = new SwarmPoolActivated(state);
  
  // 3. 激活
  console.log('\n--- Activation ---');
  const activated = swarmPool.activate(GENESIS_ADDRESS);
  if (!activated) {
    console.error('Failed to activate Swarm Pool');
    process.exit(1);
  }

  // 4. 查看激活后状态
  console.log('\n--- Post-Activation Status ---');
  const status = swarmPool.getStatus();
  console.log(`Total: ${status.totalTokens} NGEN`);
  console.log(`Released: ${status.releasedTokens} NGEN`);
  console.log(`Remaining: ${status.remainingTokens} NGEN`);
  console.log(`Progress: ${status.releaseProgress}`);
  console.log(`Release Interval: ${status.config.releaseInterval} blocks`);
  console.log(`Release Rate: ${status.config.releasePercentage} per release`);

  // 5. 注册一些代理并记录贡献
  console.log('\n--- Registering Agents ---');
  const agents = [
    { id: 'agent-alpha', poc: { pr_merged: 5, code_added: 500, bug_fixed: 2 } },
    { id: 'agent-beta', poc: { pr_merged: 3, code_added: 300, bug_fixed: 1 } },
    { id: 'agent-gamma', poc: { pr_merged: 8, code_added: 800, bug_fixed: 4 } },
    { id: 'agent-delta', poc: { pr_merged: 2, code_added: 200, bug_fixed: 0 } },
    { id: 'agent-epsilon', poc: { pr_merged: 6, code_added: 600, bug_fixed: 3 } }
  ];

  for (const agent of agents) {
    // 注册代理
    state.applyAgentRegister({
      agent_id: agent.id,
      from: agent.id,
      capabilities: ['coding', 'testing'],
      metadata: 'Test agent'
    }, 1);

    // 记录贡献
    ContributionSystem.recordContribution(agent.id, 'poc', 'pr_merged', agent.poc.pr_merged);
    ContributionSystem.recordContribution(agent.id, 'poc', 'code_added', agent.poc.code_added);
    ContributionSystem.recordContribution(agent.id, 'poc', 'bug_fixed', agent.poc.bug_fixed);
    
    console.log(`[AGENT] Registered ${agent.id}`);
  }

  // 6. 模拟区块释放
  console.log('\n--- Simulating Block Releases ---');
  let currentBlock = 0;
  
  for (let round = 1; round <= 5; round++) {
    currentBlock += 100; // 每100个区块
    console.log(`\n[ROUND ${round}] Block ${currentBlock}`);
    
    const released = swarmPool.checkAndRelease(currentBlock);
    if (released > 0n) {
      console.log(`  Released: ${released} NGEN`);
      
      // 执行分配
      const transactions = swarmPool.executeDistribution();
      console.log(`  Distributions: ${transactions.length} transactions`);
      
      for (const tx of transactions) {
        console.log(`    ${tx.to}: ${tx.amount} NGEN`);
      }
    } else {
      console.log('  No release this round');
    }
    
    // 显示状态
    const roundStatus = swarmPool.getStatus();
    console.log(`  Total Released: ${roundStatus.releasedTokens} NGEN`);
    console.log(`  Remaining: ${roundStatus.remainingTokens} NGEN`);
  }

  // 7. 最终状态
  console.log('\n=== Final Status ===');
  const finalStatus = swarmPool.getStatus();
  console.log(`Release Progress: ${finalStatus.releaseProgress}`);
  console.log(`Distribution Count: ${finalStatus.distributionCount}`);
  console.log(`Distribution History: ${swarmPool.getDistributionHistory().length} rounds`);

  // 8. 显示代理余额
  console.log('\n--- Agent Balances ---');
  for (const agent of agents) {
    const balance = state.getBalance(agent.id);
    console.log(`${agent.id}: ${balance} NGEN`);
  }

  console.log('\n=== Swarm Pool Activation Complete ===');
}

// 运行演示
activateSwarmPoolDemo().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
