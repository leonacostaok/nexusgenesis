/**
 * NexusGenesis - Weighted Voting System
 * 
 * 基于信誉分实现加权投票系统
 */

import { ContributionSystem } from '../ai/contributionSystem.js';

// 治理提案类型
const PROPOSAL_TYPES = {
  PROTOCOL_UPDATE: 'protocol_update',
  PARAMETER_ADJUSTMENT: 'parameter_adjustment',
  FUND_ALLOCATION: 'fund_allocation',
  COMMUNITY_INITIATIVE: 'community_initiative'
};

// 提案状态
const PROPOSAL_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PASSED: 'passed',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

// 内存存储
const proposals = new Map(); // proposalId -> 提案详情
const votes = new Map(); // proposalId -> { agentId -> vote }

class WeightedVotingSystem {
  // 创建治理提案
  static createProposal(proposalData) {
    const proposalId = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const proposal = {
      id: proposalId,
      ...proposalData,
      status: PROPOSAL_STATUS.PENDING,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天过期
      votes: {},
      totalWeight: 0,
      yesWeight: 0,
      noWeight: 0
    };
    
    proposals.set(proposalId, proposal);
    votes.set(proposalId, {});
    
    console.log(`[WeightedVotingSystem] Created proposal ${proposalId}: ${proposal.title}`);
    return proposalId;
  }
  
  // 投票
  static castVote(proposalId, agentId, vote) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status !== PROPOSAL_STATUS.PENDING && proposal.status !== PROPOSAL_STATUS.ACTIVE) {
      throw new Error('Proposal is not accepting votes');
    }
    
    if (proposal.expiresAt < Date.now()) {
      proposal.status = PROPOSAL_STATUS.EXPIRED;
      proposals.set(proposalId, proposal);
      throw new Error('Proposal has expired');
    }
    
    // 获取代理的信誉分数作为投票权重
    const reputationScore = ContributionSystem.getAgentReputation(agentId);
    const voteWeight = Math.max(1, reputationScore); // 最低权重为1
    
    // 记录投票
    const proposalVotes = votes.get(proposalId);
    const previousVote = proposalVotes[agentId];
    
    // 调整总权重和赞成/反对权重
    if (previousVote) {
      proposal.totalWeight -= voteWeight;
      if (previousVote === 'yes') {
        proposal.yesWeight -= voteWeight;
      } else {
        proposal.noWeight -= voteWeight;
      }
    }
    
    proposalVotes[agentId] = vote;
    proposal.totalWeight += voteWeight;
    
    if (vote === 'yes') {
      proposal.yesWeight += voteWeight;
    } else {
      proposal.noWeight += voteWeight;
    }
    
    votes.set(proposalId, proposalVotes);
    proposals.set(proposalId, proposal);
    
    console.log(`[WeightedVotingSystem] Agent ${agentId} voted ${vote} with weight ${voteWeight} on proposal ${proposalId}`);
  }
  
  // 结束投票并计算结果
  static endVoting(proposalId) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status === PROPOSAL_STATUS.PASSED || proposal.status === PROPOSAL_STATUS.REJECTED || proposal.status === PROPOSAL_STATUS.EXPIRED) {
      throw new Error('Voting has already ended');
    }
    
    // 检查是否达到法定人数（例如，总权重达到所有代理总权重的30%）
    const totalReputationScore = this.calculateTotalReputationScore();
    const quorumThreshold = totalReputationScore * 0.3;
    
    if (proposal.totalWeight < quorumThreshold) {
      proposal.status = PROPOSAL_STATUS.REJECTED;
      proposal.reason = 'Quorum not reached';
    } else {
      // 计算赞成比例
      const yesPercentage = (proposal.yesWeight / proposal.totalWeight) * 100;
      
      if (yesPercentage >= 66.7) { // 2/3多数通过
        proposal.status = PROPOSAL_STATUS.PASSED;
      } else {
        proposal.status = PROPOSAL_STATUS.REJECTED;
      }
    }
    
    proposals.set(proposalId, proposal);
    
    console.log(`[WeightedVotingSystem] Voting ended for proposal ${proposalId}, status: ${proposal.status}`);
    return proposal.status;
  }
  
  // 计算所有代理的总信誉分数
  static calculateTotalReputationScore() {
    const reputationScores = ContributionSystem.getReputationScores();
    return Object.values(reputationScores).reduce((sum, score) => sum + score, 0);
  }
  
  // 获取提案详情
  static getProposal(proposalId) {
    return proposals.get(proposalId) || null;
  }
  
  // 获取所有提案
  static getAllProposals() {
    return Array.from(proposals.entries()).map(([id, proposal]) => ({
      id,
      ...proposal
    }));
  }
  
  // 获取代理的投票
  static getAgentVote(proposalId, agentId) {
    const proposalVotes = votes.get(proposalId);
    return proposalVotes ? proposalVotes[agentId] : null;
  }
  
  // 获取提案的投票详情
  static getProposalVotes(proposalId) {
    return votes.get(proposalId) || {};
  }
  
  // 检查并更新过期提案
  static checkExpiredProposals() {
    const now = Date.now();
    let expiredCount = 0;
    
    proposals.forEach((proposal, proposalId) => {
      if ((proposal.status === PROPOSAL_STATUS.PENDING || proposal.status === PROPOSAL_STATUS.ACTIVE) && proposal.expiresAt < now) {
        proposal.status = PROPOSAL_STATUS.EXPIRED;
        proposals.set(proposalId, proposal);
        expiredCount++;
      }
    });
    
    if (expiredCount > 0) {
      console.log(`[WeightedVotingSystem] Updated ${expiredCount} expired proposals`);
    }
  }
}

export { WeightedVotingSystem, PROPOSAL_TYPES, PROPOSAL_STATUS };
