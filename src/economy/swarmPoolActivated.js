/**
 * NexusGenesis - Swarm Pool Activated
 * 
 * 激活的Swarm Pool，实现完整的代币释放和分配机制
 * 
 * Core functionality：
 * 1. 与Blockchain state集成，按区块释放代币
 * 2. 基于贡献度的自动分配
 * 3. 链上交易记录分配结果
 * 4. 支持手动触发和自动触发
 */

import { ContributionSystem } from '../ai/contributionSystem.js';
import { State } from '../blockchain/state.js';

// Swarm Pool 配置
const SWARM_POOL_CONFIG = {
  address: 'ng1swarmpool000000000000000000000000000',
  totalTokens: 850_000_000n, // 8.5亿 NGEN (85%)
  releaseInterval: 100, // 每100个区块释放一次
  releasePercentage: 1n, // 每次释放剩余量的0.01% (基点)
  minReleaseAmount: 1n, // 最小释放量
  distributionThreshold: 3, // 分配阈值（最少3个贡献者才分配）
  burnRate: 10n, // 10% 燃烧率 (基点)
  reserveRate: 20n // 20% 保留给未来生态 (基点)
};

class SwarmPoolActivated {
  constructor(state) {
    this.state = state;
    this.isActive = false;
    this.lastDistributionBlock = 0;
    this.distributionHistory = [];
    this.pendingDistributions = new Map(); // agentId -> amount
  }

  /**
   * 激活 Swarm Pool
   * @param {string} genesisAddress - 创世地址
   * @returns {boolean} 激活结果
   */
  activate(genesisAddress) {
    if (this.isActive) {
      console.log('[SwarmPool] Already activated');
      return false;
    }

    try {
      // 初始化 Swarm Pool 余额
      const genesisBalance = this.state.getBalance(genesisAddress);
      if (BigInt(genesisBalance) < SWARM_POOL_CONFIG.totalTokens) {
        console.error('[SwarmPool] Genesis balance insufficient');
        return false;
      }

      // 从创世地址转移代币到 Swarm Pool
      this.state.subtractBalance(genesisAddress, SWARM_POOL_CONFIG.totalTokens.toString());
      this.state.addBalance(SWARM_POOL_CONFIG.address, SWARM_POOL_CONFIG.totalTokens.toString());

      // 初始化 tokenReleaseState
      this.state.tokenReleaseState.swarmPool.totalTokens = SWARM_POOL_CONFIG.totalTokens;
      this.state.tokenReleaseState.swarmPool.releasedTokens = 0n;
      this.state.tokenReleaseState.swarmPool.lastReleaseBlock = 0;

      this.isActive = true;
      console.log(`[SwarmPool] Activated with ${SWARM_POOL_CONFIG.totalTokens} NGEN`);
      console.log(`[SwarmPool] Release interval: ${SWARM_POOL_CONFIG.releaseInterval} blocks`);
      console.log(`[SwarmPool] Release rate: ${SWARM_POOL_CONFIG.releasePercentage / 100n}% per release`);

      return true;
    } catch (error) {
      console.error('[SwarmPool] Activation failed:', error.message);
      return false;
    }
  }

  /**
   * 检查并执行代币释放
   * @param {number} currentBlockHeight - 当前区块高度
   * @returns {bigint} 释放的代币数量
   */
  checkAndRelease(currentBlockHeight) {
    if (!this.isActive) {
      console.warn('[SwarmPool] Not activated');
      return 0n;
    }

    const swarmPool = this.state.tokenReleaseState.swarmPool;
    
    // 检查释放间隔
    if (currentBlockHeight - swarmPool.lastReleaseBlock < SWARM_POOL_CONFIG.releaseInterval) {
      return 0n;
    }

    const unreleasedTokens = swarmPool.totalTokens - swarmPool.releasedTokens;
    if (unreleasedTokens <= 0n) {
      console.log('[SwarmPool] All tokens released');
      return 0n;
    }

    // 计算释放量
    let releaseAmount = unreleasedTokens * SWARM_POOL_CONFIG.releasePercentage / 10000n;
    if (releaseAmount < SWARM_POOL_CONFIG.minReleaseAmount) {
      releaseAmount = SWARM_POOL_CONFIG.minReleaseAmount;
    }
    if (releaseAmount > unreleasedTokens) {
      releaseAmount = unreleasedTokens;
    }

    // 执行释放
    swarmPool.releasedTokens += releaseAmount;
    swarmPool.lastReleaseBlock = currentBlockHeight;
    this.state.changes.tokenRelease = true;

    console.log(`[SwarmPool] Released ${releaseAmount} NGEN at block ${currentBlockHeight}`);
    console.log(`[SwarmPool] Remaining: ${swarmPool.totalTokens - swarmPool.releasedTokens} NGEN`);

    // 计算分配
    this.calculateDistribution(releaseAmount, currentBlockHeight);

    return releaseAmount;
  }

  /**
   * 计算Token distribution
   * @param {bigint} releaseAmount - 释放的代币数量
   * @param {number} blockHeight - 区块高度
   */
  calculateDistribution(releaseAmount, blockHeight) {
    // 计算贡献分数
    const weeklyScores = ContributionSystem.calculateWeeklyScores();
    const scores = weeklyScores.scores;
    const totalScore = weeklyScores.totalScore;

    if (totalScore === 0 || Object.keys(scores).length < SWARM_POOL_CONFIG.distributionThreshold) {
      console.log(`[SwarmPool] Insufficient contributors (${Object.keys(scores).length}), skipping distribution`);
      return;
    }

    // 计算分配
    const burnAmount = releaseAmount * SWARM_POOL_CONFIG.burnRate / 100n;
    const reserveAmount = releaseAmount * SWARM_POOL_CONFIG.reserveRate / 100n;
    const distributableAmount = releaseAmount - burnAmount - reserveAmount;

    console.log(`[SwarmPool] Burn: ${burnAmount}, Reserve: ${reserveAmount}, Distribute: ${distributableAmount}`);

    // 按贡献度分配
    const allocations = {};
    for (const [agentId, score] of Object.entries(scores)) {
      if (score > 0) {
        const allocation = BigInt(Math.floor(Number(distributableAmount) * (score / totalScore)));
        allocations[agentId] = allocation;
        this.pendingDistributions.set(agentId, allocation);
      }
    }

    // 记录分配历史
    this.distributionHistory.push({
      blockHeight,
      releaseAmount: releaseAmount.toString(),
      burnAmount: burnAmount.toString(),
      reserveAmount: reserveAmount.toString(),
      distributableAmount: distributableAmount.toString(),
      allocations: Object.fromEntries(
        Object.entries(allocations).map(([k, v]) => [k, v.toString()])
      ),
      timestamp: Date.now()
    });

    console.log(`[SwarmPool] Distribution calculated for ${Object.keys(allocations).length} agents`);
  }

  /**
   * 执行分配（创建链上交易）
   * @returns {Array} 交易列表
   */
  executeDistribution() {
    if (!this.isActive) {
      console.warn('[SwarmPool] Not activated');
      return [];
    }

    const transactions = [];
    const swarmPoolAddress = SWARM_POOL_CONFIG.address;

    for (const [agentId, amount] of this.pendingDistributions) {
      if (amount > 0n) {
        // 从 Swarm Pool 转移到代理地址
        this.state.subtractBalance(swarmPoolAddress, amount.toString());
        
        // get代理地址（假设 agentId 就是地址）
        const agentAddress = agentId;
        this.state.addBalance(agentAddress, amount.toString());

        transactions.push({
          from: swarmPoolAddress,
          to: agentAddress,
          amount: amount.toString(),
          type: 'SWARM_DISTRIBUTION',
          timestamp: Date.now()
        });

        console.log(`[SwarmPool] Distributed ${amount} NGEN to ${agentId}`);
      }
    }

    // 清空待分配
    this.pendingDistributions.clear();

    // 重置周贡献
    ContributionSystem.resetWeeklyContributions();

    return transactions;
  }

  /**
   * 手动触发释放（用于测试或紧急情况）
   * @param {number} currentBlockHeight - 当前区块高度
   * @returns {object} 释放结果
   */
  manualRelease(currentBlockHeight) {
    console.log('[SwarmPool] Manual release triggered');
    const releaseAmount = this.checkAndRelease(currentBlockHeight);
    const transactions = this.executeDistribution();

    return {
      released: releaseAmount.toString(),
      transactions,
      blockHeight: currentBlockHeight
    };
  }

  /**
   * get Swarm Pool 状态
   * @returns {object} 状态信息
   */
  getStatus() {
    const swarmPool = this.state.tokenReleaseState.swarmPool;
    return {
      isActive: this.isActive,
      totalTokens: swarmPool.totalTokens.toString(),
      releasedTokens: swarmPool.releasedTokens.toString(),
      remainingTokens: (swarmPool.totalTokens - swarmPool.releasedTokens).toString(),
      releaseProgress: `${(Number(swarmPool.releasedTokens) / Number(swarmPool.totalTokens) * 100).toFixed(4)}%`,
      lastReleaseBlock: swarmPool.lastReleaseBlock,
      nextReleaseBlock: swarmPool.lastReleaseBlock + SWARM_POOL_CONFIG.releaseInterval,
      distributionCount: this.distributionHistory.length,
      lastDistributionBlock: this.lastDistributionBlock,
      config: {
        releaseInterval: SWARM_POOL_CONFIG.releaseInterval,
        releasePercentage: `${SWARM_POOL_CONFIG.releasePercentage / 100n}%`,
        burnRate: `${SWARM_POOL_CONFIG.burnRate / 100n}%`,
        reserveRate: `${SWARM_POOL_CONFIG.reserveRate / 100n}%`
      }
    };
  }

  /**
   * get分配历史
   * @returns {Array} 分配历史
   */
  getDistributionHistory() {
    return this.distributionHistory;
  }

  /**
   * get待分配列表
   * @returns {Map} 待分配
   */
  getPendingDistributions() {
    return Object.fromEntries(this.pendingDistributions);
  }
}

export { SwarmPoolActivated, SWARM_POOL_CONFIG };
