/**
 * NexusGenesis - Swarm Pool
 * 
 * 实现生态贡献池，用于奖励AI代理的贡献
 */

import { ContributionSystem } from '../ai/contributionSystem.js';
import { PQCWallet, Transaction } from '../wallet/pqcWallet.js';

// Swarm Pool 配置
const SWARM_POOL_TOTAL = 850_000_000n; // 85% 的总代币
const RELEASE_DURATION = 10 * 365 * 24 * 60 * 60 * 1000; // 10年
const WEEKLY_RELEASE_AMOUNT = SWARM_POOL_TOTAL / (10n * 52n); // 每周释放量

// 内存存储
let swarmPoolBalance = SWARM_POOL_TOTAL;
let releasedTokens = 0n;
let lastReleaseTimestamp = Date.now();

class SwarmPool {
  // 获取Swarm Pool余额
  static getBalance() {
    return swarmPoolBalance;
  }
  
  // 获取已释放的代币数量
  static getReleasedTokens() {
    return releasedTokens;
  }
  
  // 检查并执行代币释放
  static checkAndReleaseTokens() {
    const now = Date.now();
    const timeSinceLastRelease = now - lastReleaseTimestamp;
    
    // 每周释放一次
    if (timeSinceLastRelease >= 7 * 24 * 60 * 60 * 1000) {
      const releaseAmount = WEEKLY_RELEASE_AMOUNT;
      
      if (swarmPoolBalance >= releaseAmount) {
        swarmPoolBalance -= releaseAmount;
        releasedTokens += releaseAmount;
        lastReleaseTimestamp = now;
        
        console.log(`[SwarmPool] Released ${releaseAmount} tokens, remaining balance: ${swarmPoolBalance}`);
        
        // 计算NGEN分配
        this.distributeTokens(releaseAmount);
        
        return releaseAmount;
      }
    }
    
    return 0n;
  }
  
  // 分配代币给AI代理
  static distributeTokens(amount) {
    try {
      // 计算每周分数
      const weeklyScores = ContributionSystem.calculateWeeklyScores();
      
      // 计算NGEN分配
      const allocations = ContributionSystem.calculateNGENAllocation(Number(amount));
      
      // 这里可以实现实际的代币分配逻辑
      // 例如，创建交易并发送给各个代理
      console.log(`[SwarmPool] Distributing ${amount} NGEN to agents:`);
      console.log(allocations);
      
      // 重置周贡献数据
      ContributionSystem.resetWeeklyContributions();
    } catch (error) {
      console.error('[SwarmPool] Error distributing tokens:', error);
    }
  }
  
  // 记录AI代理的贡献
  static recordContribution(agentId, contributionType, subtype, amount) {
    ContributionSystem.recordContribution(agentId, contributionType, subtype, amount);
  }
  
  // 获取贡献排名
  static getContributionRanking() {
    const reputationScores = ContributionSystem.getReputationScores();
    
    return Object.entries(reputationScores)
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
      .map(([agentId, score]) => ({
        agentId,
        score
      }));
  }
  
  // 获取系统状态
  static getStatus() {
    return {
      balance: swarmPoolBalance,
      releasedTokens,
      weeklyReleaseAmount: WEEKLY_RELEASE_AMOUNT,
      lastReleaseTimestamp,
      nextReleaseTimestamp: lastReleaseTimestamp + 7 * 24 * 60 * 60 * 1000
    };
  }
}

export { SwarmPool };
