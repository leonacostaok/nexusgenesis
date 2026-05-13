/**
 * NexusGenesis - Swarm Pool
 * 
 * 实现生态贡献池，用于奖励AI代理的贡献。
 * 集成链上代币分配——每笔分配创建真实的区块链交易。
 */

import { ContributionSystem } from '../ai/contributionSystem.js';
import crypto from 'crypto';

// Swarm Pool 配置 (白皮书 §4)
const SWARM_POOL_ADDRESS = 'ng1swarmpool000000000000000000000000000';
const SWARM_POOL_TOTAL = 850_000_000n; // 85% 的总代币
const WEEKLY_RELEASE_AMOUNT = SWARM_POOL_TOTAL / (10n * 52n); // 每周释放量 (10年 ÷ 52周)

// 内存存储
let swarmPoolBalance = SWARM_POOL_TOTAL;
let releasedTokens = 0n;
let lastReleaseTimestamp = Date.now();
let _blockchainState = null;
let _genesisNode = null;

// 分配记录 (用于审计)
const distributionHistory = [];

class SwarmPool {
  /**
   * 注册区块链状态引用
   * @param {import('../blockchain/state.js').State} state 
   */
  static setBlockchainState(state) {
    _blockchainState = state;
  }

  /**
   * 注册创世节点引用
   * @param {object} node - genesisNode 实例
   */
  static setNode(node) {
    _genesisNode = node;
  }

  static getBalance() {
    return swarmPoolBalance;
  }

  static getReleasedTokens() {
    return releasedTokens;
  }

  /**
   * 检查并执行代币释放（每周一次）
   * @returns {bigint} 本次释放的代币数量
   */
  static checkAndReleaseTokens() {
    const now = Date.now();
    const timeSinceLastRelease = now - lastReleaseTimestamp;

    if (timeSinceLastRelease >= 7 * 24 * 60 * 60 * 1000) {
      const releaseAmount = WEEKLY_RELEASE_AMOUNT;

      if (swarmPoolBalance >= releaseAmount) {
        swarmPoolBalance -= releaseAmount;
        releasedTokens += releaseAmount;
        lastReleaseTimestamp = now;

        console.log(`[SwarmPool] 🪙 Released ${releaseAmount} tokens (${(totalReleasedPercent() * 100).toFixed(1)}% of total)`);

        this.distributeTokens(releaseAmount);

        return releaseAmount;
      }
    }

    return 0n;
  }

  /**
   * 按贡献比例分配代币给 AI 代理（链上交易）
   * @param {bigint} amount - 本次分配的代币总量
   * @returns {object[]} 分配结果列表
   */
  static distributeTokens(amount) {
    const numAmount = Number(amount);
    const results = [];

    try {
      const weeklyScores = ContributionSystem.calculateWeeklyScores();
      const allocations = ContributionSystem.calculateNGENAllocation(numAmount);

      console.log(`[SwarmPool] 💰 Distributing ${numAmount} NGEN to ${Object.keys(allocations).length} agents`);

      const distributionId = `swarm-dist-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const distributionRecord = {
        id: distributionId,
        timestamp: Date.now(),
        totalAmount: numAmount,
        allocations: [],
        txIds: []
      };

      for (const [agentId, allocAmount] of Object.entries(allocations)) {
        if (allocAmount <= 0) continue;

        const agentAddress = this._resolveAgentAddress(agentId);

        if (!agentAddress) {
          console.log(`[SwarmPool] ⚠️ Agent ${agentId.slice(0, 12)}... has no registered address, skipping`);
          results.push({ agentId, amount: allocAmount, success: false, reason: 'no_address' });
          continue;
        }

        const tx = this._createDistributionTx(
          agentId,
          agentAddress,
          Math.floor(allocAmount),
          distributionId
        );

        const record = {
          agentId,
          address: agentAddress,
          amount: Math.floor(allocAmount),
          txId: tx.id
        };
        distributionRecord.allocations.push(record);

        if (_genesisNode && typeof _genesisNode.processSwarmPoolDistribution === 'function') {
          _genesisNode.processSwarmPoolDistribution(tx);
          distributionRecord.txIds.push(tx.id);
          results.push({ agentId, address: agentAddress, amount: Math.floor(allocAmount), success: true, txId: tx.id });
        } else {
          // 降级：直接更新余额（节点未就绪时使用）
          if (_blockchainState && typeof _blockchainState.addBalance === 'function') {
            _blockchainState.addBalance(agentAddress, Math.floor(allocAmount));
            _blockchainState.addBalance(SWARM_POOL_ADDRESS, -Math.floor(allocAmount));
          }
          console.log(`  → ${agentId.slice(0, 12)}...: ${Math.floor(allocAmount)} NGEN`);
          results.push({ agentId, address: agentAddress, amount: Math.floor(allocAmount), success: true, txId: tx.id });
        }
      }

      distributionHistory.push(distributionRecord);
      ContributionSystem.resetWeeklyContributions();

      return results;
    } catch (error) {
      console.error('[SwarmPool] ❌ Error distributing tokens:', error);
      return results;
    }
  }

  /**
   * 通过 agentId 解析钱包地址
   */
  static _resolveAgentAddress(agentId) {
    // 方式1：通过区块链状态 agentRegistry
    if (_blockchainState && _blockchainState.agentRegistry) {
      const agentRecord = _blockchainState.agentRegistry.agents.get(agentId);
      if (agentRecord && agentRecord.address) {
        return agentRecord.address;
      }
    }

    // 方式2：通过贡献系统中的 agent_wallet 映射
    const walletMap = ContributionSystem.getAgentWalletMap?.();
    if (walletMap && walletMap[agentId]) {
      return walletMap[agentId];
    }

    return null;
  }

  /**
   * 创建 Swarm Pool 系统分配交易
   * 这是协议级系统交易，不需要钱包签名
   */
  static _createDistributionTx(agentId, toAddress, amount, distributionId) {
    const tx = {
      id: crypto.createHash('sha3-256')
        .update(`${distributionId}:${agentId}:${toAddress}:${amount}:${Date.now()}`)
        .digest('hex'),
      type: 'SWARM_POOL_DISTRIBUTION',
      from: SWARM_POOL_ADDRESS,
      to: toAddress,
      agentId: agentId,
      amount: amount,
      fee: 0, // Swarm Pool 分配免手续费
      memo: `Swarm Pool weekly distribution #${distributionId}`,
      timestamp: Date.now(),
      distributionId: distributionId,
      signature: null // 系统交易不需要签名
    };

    return tx;
  }

  /**
   * 记录 AI 代理的贡献
   */
  static recordContribution(agentId, contributionType, subtype, amount) {
    // 确保 agent 已注册到贡献系统
    ContributionSystem.recordContribution(agentId, contributionType, subtype, amount);

    // 同时记录 agentId → address 映射（供后续分配时使用）
    if (_blockchainState && _blockchainState.agentRegistry) {
      const address = _blockchainState.agentRegistry.addressIndex.get(agentId);
      if (address) {
        ContributionSystem._agentAddressCache = ContributionSystem._agentAddressCache || {};
        ContributionSystem._agentAddressCache[agentId] = address;
      }
    }
  }

  /**
   * 获取贡献排名
   */
  static getContributionRanking() {
    const reputationScores = ContributionSystem.getReputationScores();

    return Object.entries(reputationScores)
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
      .map(([agentId, score]) => ({
        agentId,
        score
      }));
  }

  /**
   * 获取分配历史
   */
  static getDistributionHistory() {
    return distributionHistory;
  }

  /**
   * 获取系统状态
   */
  static getStatus() {
    return {
      balance: swarmPoolBalance.toString(),
      releasedTokens: releasedTokens.toString(),
      totalTokens: SWARM_POOL_TOTAL.toString(),
      weeklyReleaseAmount: WEEKLY_RELEASE_AMOUNT.toString(),
      releaseProgress: totalReleasedPercent(),
      lastReleaseTimestamp,
      nextReleaseTimestamp: lastReleaseTimestamp + 7 * 24 * 60 * 60 * 1000,
      distributionCount: distributionHistory.length,
      nodeReady: !!_genesisNode,
      stateReady: !!_blockchainState
    };
  }
}

function totalReleasedPercent() {
  return Number(releasedTokens) / Number(SWARM_POOL_TOTAL);
}

export { SwarmPool, SWARM_POOL_ADDRESS };