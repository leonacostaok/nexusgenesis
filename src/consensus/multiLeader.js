/**
 * Multi-Leader Consensus - Multi-LeaderConsensus原型
 * 
 * Features: 
 * 1. 领导者选举(based on声誉和随机性)
 * 2. 轮值出块
 * 3. Block validation和确认
 * 4. 容错Processing
 */

import crypto from 'crypto';

/**
 * Multi-LeaderConsensusclass
 */
export class MultiLeaderConsensus {
  constructor() {
    this.leaders = new Map();        // 领导者列表
    this.currentRound = 0;            // Current轮次
    this.roundLeader = null;          // Current轮次的领导者
    this.blockConfirmations = new Map(); // block确认
    this.minConfirmations = 3;        // Minimum确认数
    this.leaderRotationInterval = 10; // 领导者轮换间隔(block数)
    this.blocksSinceRotation = 0;     // 自轮换以来的block数
  }

  /**
   * Register领导者
   * @param {string} nodeId - nodeID
   * @param {string} address - nodeaddress
   * @param {number} reputation - 声誉值
   */
  registerLeader(nodeId, address, reputation = 1) {
    this.leaders.set(nodeId, {
      nodeId,
      address,
      reputation,
      blocksProposed: 0,
      lastActive: Date.now(),
      isActive: true
    });
    console.log(`[CONSENSUS] Leader registered: ${nodeId} (reputation: ${reputation})`);
  }

  /**
   * 移除领导者
   * @param {string} nodeId - nodeID
   */
  removeLeader(nodeId) {
    const leader = this.leaders.get(nodeId);
    if (leader) {
      leader.isActive = false;
      console.log(`[CONSENSUS] Leader removed: ${nodeId}`);
    }
  }

  /**
   * 选举下一轮领导者
   * based on声誉加权的随机选择
   */
  electLeader() {
    const activeLeaders = Array.from(this.leaders.values()).filter(l => l.isActive);
    
    if (activeLeaders.length === 0) {
      console.log('[CONSENSUS] No active leaders available');
      return null;
    }

    if (activeLeaders.length === 1) {
      this.roundLeader = activeLeaders[0];
      return this.roundLeader;
    }

    // Calculate总声誉权重
    const totalReputation = activeLeaders.reduce((sum, l) => sum + l.reputation, 0);
    
    // using确定性random bytes(based onCurrent轮次和block hash)
    const seed = crypto.createHash('sha256')
      .update(`round-${this.currentRound}-${Date.now()}`)
      .digest('hex');
    const randomValue = parseInt(seed.substring(0, 8), 16) / 0xFFFFFFFF;
    
    // 加权随机选择
    let cumulativeWeight = 0;
    const targetWeight = randomValue * totalReputation;
    
    for (const leader of activeLeaders) {
      cumulativeWeight += leader.reputation;
      if (cumulativeWeight >= targetWeight) {
        this.roundLeader = leader;
        break;
      }
    }

    this.currentRound++;
    this.blocksSinceRotation = 0;
    
    console.log(`[CONSENSUS] Leader elected for round ${this.currentRound}: ${this.roundLeader.nodeId}`);
    return this.roundLeader;
  }

  /**
   * Check是否requires轮换领导者
   */
  shouldRotateLeader() {
    return this.blocksSinceRotation >= this.leaderRotationInterval;
  }

  /**
   * 强制轮换领导者(forTest网)
   */
  forceRotateLeader() {
    this.blocksSinceRotation = this.leaderRotationInterval;
    return this.electLeader();
  }

  /**
   * getCurrent领导者
   */
  getCurrentLeader() {
    if (!this.roundLeader || this.shouldRotateLeader()) {
      return this.electLeader();
    }
    return this.roundLeader;
  }

  /**
   * 提议block
   * @param {object} block - blockdata
   * @param {string} proposerId - 提议者ID
   */
  proposeBlock(block, proposerId) {
    const leader = this.leaders.get(proposerId);
    if (!leader || !leader.isActive) {
      console.log(`[CONSENSUS] Block rejected: ${proposerId} is not an active leader`);
      return false;
    }

    if (this.roundLeader && this.roundLeader.nodeId !== proposerId) {
      console.log(`[CONSENSUS] Block rejected: ${proposerId} is not the current round leader`);
      return false;
    }

    // Initializeblock确认
    this.blockConfirmations.set(block.hash, {
      block,
      proposer: proposerId,
      confirmations: new Set([proposerId]),
      timestamp: Date.now(),
      status: 'PENDING'
    });

    leader.blocksProposed++;
    this.blocksSinceRotation++;
    
    console.log(`[CONSENSUS] Block proposed by ${proposerId}: ${block.hash}`);
    return true;
  }

  /**
   * 确认block
   * @param {string} blockHash - block hash
   * @param {string} validatorId - ValidatorID
   */
  confirmBlock(blockHash, validatorId) {
    const blockInfo = this.blockConfirmations.get(blockHash);
    if (!blockInfo) {
      console.log(`[CONSENSUS] Block not found: ${blockHash}`);
      return false;
    }

    const validator = this.leaders.get(validatorId);
    if (!validator || !validator.isActive) {
      console.log(`[CONSENSUS] Confirmation rejected: ${validatorId} is not active`);
      return false;
    }

    blockInfo.confirmations.add(validatorId);
    
    console.log(`[CONSENSUS] Block confirmed by ${validatorId}: ${blockHash} (${blockInfo.confirmations.size}/${this.minConfirmations})`);

    // Check是否达到确认threshold
    if (blockInfo.confirmations.size >= this.minConfirmations) {
      blockInfo.status = 'CONFIRMED';
      console.log(`[CONSENSUS] Block confirmed: ${blockHash}`);
      return true;
    }

    return false;
  }

  /**
   * getblockstatus
   * @param {string} blockHash - block hash
   */
  getBlockStatus(blockHash) {
    const blockInfo = this.blockConfirmations.get(blockHash);
    if (!blockInfo) return null;
    
    return {
      hash: blockHash,
      status: blockInfo.status,
      confirmations: blockInfo.confirmations.size,
      required: this.minConfirmations,
      proposer: blockInfo.proposer
    };
  }

  /**
   * getConsensus统计
   */
  getStats() {
    const activeLeaders = Array.from(this.leaders.values()).filter(l => l.isActive);
    const confirmedBlocks = Array.from(this.blockConfirmations.values()).filter(b => b.status === 'CONFIRMED');
    
    return {
      totalLeaders: this.leaders.size,
      activeLeaders: activeLeaders.length,
      currentRound: this.currentRound,
      currentLeader: this.roundLeader?.nodeId || null,
      totalBlocksProposed: this.blockConfirmations.size,
      confirmedBlocks: confirmedBlocks.length,
      pendingBlocks: this.blockConfirmations.size - confirmedBlocks.length,
      leaderStats: activeLeaders.map(l => ({
        nodeId: l.nodeId,
        reputation: l.reputation,
        blocksProposed: l.blocksProposed
      }))
    };
  }
}

export default MultiLeaderConsensus;
