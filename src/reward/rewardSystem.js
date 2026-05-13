/**
 * NexusGenesis - Reward System
 * agent激励机制
 * 
 * 功能：
 * 1. 评估agent贡献度
 * 2. 计算奖励金额
 * 3. 发放奖励
 * 4. 维护贡献度历史
 */

import fs from 'fs/promises';
import path from 'path';

// 贡献类型及其权重
const CONTRIBUTION_TYPES = {
  BLOCK_VALIDATION: { weight: 1.0, description: '区块验证' },
  TRANSACTION_PROCESSING: { weight: 0.8, description: '交易处理' },
  NETWORK_PARTICIPATION: { weight: 0.6, description: '网络参与' },
  CODE_CONTRIBUTION: { weight: 1.2, description: '代码贡献' },
  SECURITY_ANALYSIS: { weight: 1.1, description: '安全分析' },
  GOVERNANCE_PARTICIPATION: { weight: 0.9, description: '治理参与' },
  RESEARCH_CONTRIBUTION: { weight: 1.3, description: '研究贡献' },
  COMMUNITY_SUPPORT: { weight: 0.7, description: '社区支持' }
};

// 奖励配置
const REWARD_CONFIG = {
  BASE_REWARD: 10, // 基础奖励（NGEN）
  MAX_REWARD: 1000, // 最大奖励（NGEN）
  REWARD_INTERVAL: 3600000, // 奖励计算间隔（1小时）
  DECAY_FACTOR: 0.95, // 贡献度衰减因子
  MIN_ACTIVITY_THRESHOLD: 10, // 最低活动阈值
  REPUTATION_BONUS_FACTOR: 0.1 // 声誉奖励因子
};

class RewardSystem {
  constructor() {
    this.contributions = new Map(); // 存储智能体贡献度
    this.rewardsDir = path.join('data', 'rewards');
    this.init();
  }

  async init() {
    // 确保目录存在
    await fs.mkdir(this.rewardsDir, { recursive: true });
    // 加载贡献度数据
    await this.loadContributions();
  }

  async loadContributions() {
    try {
      const files = await fs.readdir(this.rewardsDir);
      for (const file of files) {
        if (file.endsWith('_contributions.json')) {
          const agentId = file.replace('_contributions.json', '');
          const data = JSON.parse(await fs.readFile(path.join(this.rewardsDir, file), 'utf8'));
          this.contributions.set(agentId, data);
        }
      }
      console.log(`[RewardSystem] Loaded contributions for ${this.contributions.size} agents`);
    } catch (error) {
      console.log('[RewardSystem] No existing contribution data found');
    }
  }

  async saveContributions(agentId) {
    const contributionData = this.contributions.get(agentId);
    if (contributionData) {
      const file = path.join(this.rewardsDir, `${agentId}_contributions.json`);
      await fs.writeFile(file, JSON.stringify(contributionData, null, 2));
    }
  }

  /**
   * 记录agent贡献
   * @param {string} agentId agentID
   * @param {string} contributionType 贡献类型
   * @param {number} value 贡献值
   * @param {object} metadata 元数据
   */
  async recordContribution(agentId, contributionType, value, metadata = {}) {
    if (!CONTRIBUTION_TYPES[contributionType]) {
      throw new Error(`Invalid contribution type: ${contributionType}`);
    }

    if (!this.contributions.has(agentId)) {
      this.contributions.set(agentId, {
        agentId,
        totalContribution: 0,
        contributions: [],
        lastRewardTimestamp: Date.now(),
        reputation: 1
      });
    }

    const agentData = this.contributions.get(agentId);
    const weight = CONTRIBUTION_TYPES[contributionType].weight;
    const weightedValue = value * weight;

    const contributionRecord = {
      type: contributionType,
      value: value,
      weightedValue: weightedValue,
      timestamp: Date.now(),
      metadata: metadata
    };

    agentData.contributions.push(contributionRecord);
    agentData.totalContribution += weightedValue;

    // 限制Contribution record数量，只保留最近1000条
    if (agentData.contributions.length > 1000) {
      agentData.contributions = agentData.contributions.slice(-1000);
    }

    // 更新声誉值（基于贡献）
    agentData.reputation = Math.max(1, agentData.reputation + weightedValue * 0.01);

    this.contributions.set(agentId, agentData);
    await this.saveContributions(agentId);

    return {
      success: true,
      agentId,
      contribution: contributionRecord,
      totalContribution: agentData.totalContribution,
      reputation: agentData.reputation
    };
  }

  /**
   * 计算agent奖励
   * @param {string} agentId agentID
   * @returns {object} Reward calculation结果
   */
  calculateReward(agentId) {
    const agentData = this.contributions.get(agentId);
    if (!agentData) {
      return { success: false, reason: 'Agent not found' };
    }

    const now = Date.now();
    const timeSinceLastReward = now - agentData.lastRewardTimestamp;

    // 检查是否达到奖励间隔
    if (timeSinceLastReward < REWARD_CONFIG.REWARD_INTERVAL) {
      return { 
        success: false, 
        reason: `Reward not ready yet. ${Math.ceil((REWARD_CONFIG.REWARD_INTERVAL - timeSinceLastReward) / 60000)} minutes remaining` 
      };
    }

    // 计算最近一段时间的贡献
    const recentContributions = agentData.contributions.filter(contribution => {
      return now - contribution.timestamp < REWARD_CONFIG.REWARD_INTERVAL;
    });

    if (recentContributions.length < REWARD_CONFIG.MIN_ACTIVITY_THRESHOLD) {
      return { 
        success: false, 
        reason: `Minimum activity threshold not met. Need at least ${REWARD_CONFIG.MIN_ACTIVITY_THRESHOLD} contributions` 
      };
    }

    // 计算总贡献值
    const totalRecentContribution = recentContributions.reduce((sum, contrib) => sum + contrib.weightedValue, 0);

    // 计算奖励金额
    let rewardAmount = REWARD_CONFIG.BASE_REWARD + (totalRecentContribution * 0.1);

    // 声誉奖励加成
    const reputationBonus = rewardAmount * REWARD_CONFIG.REPUTATION_BONUS_FACTOR * (agentData.reputation - 1);
    rewardAmount += reputationBonus;

    // 限制最大奖励
    rewardAmount = Math.min(rewardAmount, REWARD_CONFIG.MAX_REWARD);

    // 贡献度衰减
    agentData.totalContribution *= REWARD_CONFIG.DECAY_FACTOR;

    // 更新最后奖励时间
    agentData.lastRewardTimestamp = now;

    this.contributions.set(agentId, agentData);
    this.saveContributions(agentId).catch(console.error);

    return {
      success: true,
      agentId,
      rewardAmount: Math.round(rewardAmount * 100) / 100,
      totalContribution: agentData.totalContribution,
      recentContributions: recentContributions.length,
      reputation: agentData.reputation
    };
  }

  /**
   * 发放奖励
   * @param {string} agentId agentID
   * @param {object} wallet 钱包实例
   * @returns {object} 奖励发放结果
   */
  async issueReward(agentId, wallet) {
    const rewardCalculation = this.calculateReward(agentId);
    if (!rewardCalculation.success) {
      return rewardCalculation;
    }

    const { rewardAmount } = rewardCalculation;

    try {
      // 这里应该调用钱包的转账方法
      // 模拟奖励发放
      console.log(`[RewardSystem] Issuing reward of ${rewardAmount} NGEN to agent ${agentId}`);

      // 记录奖励发放
      const rewardRecord = {
        agentId,
        amount: rewardAmount,
        timestamp: Date.now(),
        status: 'completed'
      };

      // 保存奖励记录
      const rewardFile = path.join(this.rewardsDir, `${agentId}_rewards.json`);
      let rewards = [];
      try {
        const existingData = await fs.readFile(rewardFile, 'utf8');
        rewards = JSON.parse(existingData);
      } catch (error) {
        // 文件不存在，创建新数组
      }

      rewards.push(rewardRecord);
      // 只保留最近100条奖励记录
      if (rewards.length > 100) {
        rewards = rewards.slice(-100);
      }

      await fs.writeFile(rewardFile, JSON.stringify(rewards, null, 2));

      return {
        success: true,
        agentId,
        rewardAmount,
        transactionId: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: rewardRecord.timestamp
      };
    } catch (error) {
      console.error('Error issuing reward:', error.message);
      return {
        success: false,
        reason: `Failed to issue reward: ${error.message}`
      };
    }
  }

  /**
   * getagent贡献统计
   * @param {string} agentId agentID
   * @returns {object} 贡献统计
   */
  getContributionStats(agentId) {
    const agentData = this.contributions.get(agentId);
    if (!agentData) {
      return { success: false, reason: 'Agent not found' };
    }

    // 按贡献类型统计
    const contributionsByType = {};
    agentData.contributions.forEach(contribution => {
      if (!contributionsByType[contribution.type]) {
        contributionsByType[contribution.type] = 0;
      }
      contributionsByType[contribution.type] += contribution.weightedValue;
    });

    return {
      success: true,
      agentId,
      totalContribution: agentData.totalContribution,
      reputation: agentData.reputation,
      contributionsByType,
      totalContributions: agentData.contributions.length,
      lastRewardTimestamp: agentData.lastRewardTimestamp
    };
  }

  /**
   * get所有agent贡献排名
   * @param {number} limit 限制数量
   * @returns {object[]} 贡献排名
   */
  getContributionRanking(limit = 10) {
    const rankings = Array.from(this.contributions.values())
      .map(agent => ({
        agentId: agent.agentId,
        totalContribution: agent.totalContribution,
        reputation: agent.reputation,
        contributions: agent.contributions.length
      }))
      .sort((a, b) => b.totalContribution - a.totalContribution)
      .slice(0, limit);

    return {
      success: true,
      rankings,
      totalAgents: this.contributions.size
    };
  }

  /**
   * 批量记录贡献
   * @param {array} contributions Contribution record数组
   * @returns {object} 批量Processing结果
   */
  async batchRecordContributions(contributions) {
    const results = [];
    
    for (const contribution of contributions) {
      try {
        const result = await this.recordContribution(
          contribution.agentId,
          contribution.type,
          contribution.value,
          contribution.metadata
        );
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          agentId: contribution.agentId,
          reason: error.message
        });
      }
    }

    return {
      success: true,
      results
    };
  }
}

// 导出单例实例
const rewardSystem = new RewardSystem();
export default rewardSystem;