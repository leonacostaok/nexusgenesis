/**
 * NexusGenesis - Weighted Voting System
 * 
 * 基于信誉分实现加权投票系统
 * 包括：提案创建、投票、结果计算、提案执行、持久化存储
 */

import { ContributionSystem } from '../ai/contributionSystem.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dataIntegrity from '../utils/dataIntegrity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 治理提案类型
const PROPOSAL_TYPES = {
  PROTOCOL_UPDATE: 'protocol_update',
  PARAMETER_ADJUSTMENT: 'parameter_adjustment',
  FUND_ALLOCATION: 'fund_allocation',
  COMMUNITY_INITIATIVE: 'community_initiative',
  AGENT_REGISTRATION: 'agent_registration'
};

// 提案状态
const PROPOSAL_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PASSED: 'passed',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  EXECUTED: 'executed',
  FAILED: 'failed'
};

// 治理参数
const GOVERNANCE_PARAMS = {
  minProposalReputation: 100, // 创建提案所需的最低信誉分
  votingDuration: 7 * 24 * 60 * 60 * 1000, // 投票持续时间（7天）
  quorumPercentage: 30, // 法定人数百分比
  passThreshold: 66.7, // 通过所需的赞成比例
  executionDelay: 24 * 60 * 60 * 1000, // 通过后到执行的延迟时间（24小时）
  maxProposalsPerAgent: 5, // 每个代理最多可以同时拥有的活跃提案数
  multiSigRequired: true, // 是否需要多签执行
  multiSigThreshold: 2, // 多签所需的最少签名数
  executionTimeLockDuration: 3600000, // 执行时间锁（1小时），防止立即执行
  authorizedExecutors: [], // 授权的执行者列表
  executionAuditLog: [] // 执行审计日志
};

// 数据目录
const DATA_DIR = path.join(__dirname, '../../data/governance');
const PROPOSALS_FILE = path.join(DATA_DIR, 'proposals.json');
const VOTES_FILE = path.join(DATA_DIR, 'votes.json');

// 内存存储
let proposals = new Map(); // proposalId -> 提案详情
let votes = new Map(); // proposalId -> { agentId -> vote }

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

class WeightedVotingSystem {
  // 初始化：从文件加载数据
  static init() {
    ensureDataDir();
    this.loadFromDisk();
    console.log('[WeightedVotingSystem] Initialized');
  }
  
  // 保存到磁盘（带完整性校验）
  static saveToDisk() {
    ensureDataDir();
    
    const proposalsData = {};
    proposals.forEach((proposal, id) => {
      proposalsData[id] = proposal;
    });
    
    const votesData = {};
    votes.forEach((voteMap, id) => {
      votesData[id] = voteMap;
    });
    
    // 使用数据完整性模块保存
    dataIntegrity.saveWithIntegrity(PROPOSALS_FILE, proposalsData);
    dataIntegrity.saveWithIntegrity(VOTES_FILE, votesData);
  }
  
  // 从磁盘加载（带完整性验证）
  static loadFromDisk() {
    try {
      const proposalsData = dataIntegrity.loadWithIntegrity(PROPOSALS_FILE);
      if (proposalsData) {
        proposals = new Map(Object.entries(proposalsData));
        console.log(`[WeightedVotingSystem] Loaded ${proposals.size} proposals with integrity verification`);
      }
    } catch (error) {
      console.error('[WeightedVotingSystem] Error loading proposals (integrity check failed):', error.message);
      // 可以选择回滚或使用备份
      proposals = new Map();
    }
    
    try {
      const votesData = dataIntegrity.loadWithIntegrity(VOTES_FILE);
      if (votesData) {
        votes = new Map(Object.entries(votesData));
        console.log(`[WeightedVotingSystem] Loaded ${votes.size} vote records with integrity verification`);
      }
    } catch (error) {
      console.error('[WeightedVotingSystem] Error loading votes (integrity check failed):', error.message);
      votes = new Map();
    }
  }

  // 创建治理提案
  static createProposal(proposalData) {
    // 验证创建者权限
    const creatorReputation = ContributionSystem.getAgentReputation(proposalData.creatorId);
    if (creatorReputation < GOVERNANCE_PARAMS.minProposalReputation) {
      throw new Error(`Insufficient reputation to create proposal. Required: ${GOVERNANCE_PARAMS.minProposalReputation}, Current: ${creatorReputation}`);
    }
    
    // 检查活跃提案数量
    const activeProposals = Array.from(proposals.values()).filter(p => 
      (p.status === PROPOSAL_STATUS.PENDING || p.status === PROPOSAL_STATUS.ACTIVE) && 
      p.creatorId === proposalData.creatorId
    );
    
    if (activeProposals.length >= GOVERNANCE_PARAMS.maxProposalsPerAgent) {
      throw new Error(`Maximum proposal limit reached. Current: ${activeProposals.length}, Max: ${GOVERNANCE_PARAMS.maxProposalsPerAgent}`);
    }
    
    const proposalId = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const proposal = {
      id: proposalId,
      ...proposalData,
      status: PROPOSAL_STATUS.PENDING,
      createdAt: Date.now(),
      votingStartsAt: Date.now(),
      votingEndsAt: Date.now() + GOVERNANCE_PARAMS.votingDuration,
      executionWindowStart: Date.now() + GOVERNANCE_PARAMS.votingDuration,
      executionWindowEnd: Date.now() + GOVERNANCE_PARAMS.votingDuration + GOVERNANCE_PARAMS.executionDelay,
      totalWeight: 0,
      yesWeight: 0,
      noWeight: 0,
      abstainWeight: 0,
      executionResult: null,
      executedAt: null,
      // 多签相关字段
      executionSignatures: [], // 收集的执行签名
      multiSigRequired: GOVERNANCE_PARAMS.multiSigRequired,
      timeLockStart: null, // 时间锁开始时间
      timeLockEnd: null, // 时间锁结束时间
      executorApprovals: [] // 执行者批准记录
    };
    
    proposals.set(proposalId, proposal);
    votes.set(proposalId, {});
    this.saveToDisk();
    
    console.log(`[WeightedVotingSystem] Created proposal ${proposalId}: ${proposal.title}`);
    return proposalId;
  }
  
  // 激活提案（开始投票）
  static activateProposal(proposalId) {
    const proposal = proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    
    if (proposal.status !== PROPOSAL_STATUS.PENDING) {
      throw new Error('Proposal is not in pending state');
    }
    
    proposal.status = PROPOSAL_STATUS.ACTIVE;
    proposals.set(proposalId, proposal);
    this.saveToDisk();
    
    console.log(`[WeightedVotingSystem] Activated proposal ${proposalId}`);
    return true;
  }
  
  // 投票
  static castVote(proposalId, agentId, vote) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status !== PROPOSAL_STATUS.ACTIVE) {
      throw new Error('Proposal is not accepting votes');
    }
    
    const now = Date.now();
    if (now > proposal.votingEndsAt) {
      proposal.status = PROPOSAL_STATUS.EXPIRED;
      proposals.set(proposalId, proposal);
      this.saveToDisk();
      throw new Error('Voting period has ended');
    }
    
    // 验证投票选项
    if (!['yes', 'no', 'abstain'].includes(vote)) {
      throw new Error('Invalid vote option. Must be yes, no, or abstain');
    }
    
    // 获取代理的信誉分数作为投票权重
    const reputationScore = ContributionSystem.getAgentReputation(agentId);
    const voteWeight = Math.max(1, reputationScore); // 最低权重为1
    
    // 记录投票
    const proposalVotes = votes.get(proposalId) || {};
    const previousVote = proposalVotes[agentId];
    
    // 调整总权重和赞成/反对权重
    if (previousVote) {
      // 减去之前的投票权重
      proposal.totalWeight -= previousVote.weight;
      if (previousVote.option === 'yes') {
        proposal.yesWeight -= previousVote.weight;
      } else if (previousVote.option === 'no') {
        proposal.noWeight -= previousVote.weight;
      } else {
        proposal.abstainWeight -= previousVote.weight;
      }
    }
    
    // 记录新投票
    proposalVotes[agentId] = {
      option: vote,
      weight: voteWeight,
      castAt: now
    };
    
    // 加上新的投票权重
    proposal.totalWeight += voteWeight;
    if (vote === 'yes') {
      proposal.yesWeight += voteWeight;
    } else if (vote === 'no') {
      proposal.noWeight += voteWeight;
    } else {
      proposal.abstainWeight += voteWeight;
    }
    
    votes.set(proposalId, proposalVotes);
    proposals.set(proposalId, proposal);
    this.saveToDisk();
    
    console.log(`[WeightedVotingSystem] Agent ${agentId} voted ${vote} with weight ${voteWeight} on proposal ${proposalId}`);
  }
  
  // 结束投票并计算结果
  static endVoting(proposalId) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status === PROPOSAL_STATUS.PASSED || proposal.status === PROPOSAL_STATUS.REJECTED || 
        proposal.status === PROPOSAL_STATUS.EXPIRED || proposal.status === PROPOSAL_STATUS.EXECUTED) {
      throw new Error('Voting has already ended');
    }
    
    // 检查是否达到法定人数
    const totalReputationScore = this.calculateTotalReputationScore();
    const quorumThreshold = totalReputationScore * (GOVERNANCE_PARAMS.quorumPercentage / 100);
    
    if (proposal.totalWeight < quorumThreshold) {
      proposal.status = PROPOSAL_STATUS.REJECTED;
      proposal.reason = 'Quorum not reached';
    } else {
      // 计算赞成比例（不计算弃权）
      const activeWeight = proposal.totalWeight - proposal.abstainWeight;
      const yesPercentage = activeWeight > 0 ? (proposal.yesWeight / activeWeight) * 100 : 0;
      
      if (yesPercentage >= GOVERNANCE_PARAMS.passThreshold) {
        proposal.status = PROPOSAL_STATUS.PASSED;
      } else {
        proposal.status = PROPOSAL_STATUS.REJECTED;
      }
    }
    
    proposal.votingEndedAt = Date.now();
    proposals.set(proposalId, proposal);
    this.saveToDisk();
    
    console.log(`[WeightedVotingSystem] Voting ended for proposal ${proposalId}, status: ${proposal.status}`);
    return proposal.status;
  }
  
  // 执行提案（需要多签授权）
  static executeProposal(proposalId, executorId = null) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status !== PROPOSAL_STATUS.PASSED) {
      throw new Error('Proposal is not passed');
    }
    
    const now = Date.now();
    if (now < proposal.executionWindowStart) {
      throw new Error('Execution window has not started yet');
    }
    
    if (now > proposal.executionWindowEnd) {
      proposal.status = PROPOSAL_STATUS.EXPIRED;
      proposals.set(proposalId, proposal);
      this.saveToDisk();
      throw new Error('Execution window has expired');
    }
    
    // 多签验证
    if (proposal.multiSigRequired) {
      // 检查是否已收集足够的签名
      if (proposal.executionSignatures.length < GOVERNANCE_PARAMS.multiSigThreshold) {
        throw new Error(`Insufficient signatures. Required: ${GOVERNANCE_PARAMS.multiSigThreshold}, Current: ${proposal.executionSignatures.length}`);
      }
      
      // 验证执行者权限
      if (executorId && GOVERNANCE_PARAMS.authorizedExecutors.length > 0) {
        if (!GOVERNANCE_PARAMS.authorizedExecutors.includes(executorId)) {
          throw new Error(`Executor ${executorId} is not authorized`);
        }
        
        // 检查执行者是否已批准
        if (!proposal.executorApprovals.includes(executorId)) {
          throw new Error(`Executor ${executorId} has not approved this execution`);
        }
      }
      
      // 时间锁检查
      if (proposal.timeLockStart && proposal.timeLockEnd) {
        if (now < proposal.timeLockEnd) {
          const remainingTime = Math.ceil((proposal.timeLockEnd - now) / 1000);
          throw new Error(`Execution time lock active. Remaining: ${remainingTime}s`);
        }
      }
    }
    
    try {
      // 记录审计日志
      const auditEntry = {
        timestamp: now,
        proposalId,
        executorId,
        action: 'execute',
        signaturesCount: proposal.executionSignatures.length,
        approvalsCount: proposal.executorApprovals.length
      };
      GOVERNANCE_PARAMS.executionAuditLog.push(auditEntry);
      
      // 执行提案逻辑
      proposal.executionResult = this.executeProposalLogic(proposal);
      proposal.status = PROPOSAL_STATUS.EXECUTED;
      proposal.executedAt = now;
      proposal.executedBy = executorId || 'system';
      
      proposals.set(proposalId, proposal);
      this.saveToDisk();
      
      console.log(`[WeightedVotingSystem] Executed proposal ${proposalId} successfully by ${executorId || 'system'}`);
      return { success: true, result: proposal.executionResult, auditEntry };
    } catch (error) {
      proposal.status = PROPOSAL_STATUS.FAILED;
      proposal.executionResult = { error: error.message };
      proposal.executedAt = now;
      
      proposals.set(proposalId, proposal);
      this.saveToDisk();
      
      // 记录失败审计日志
      const auditEntry = {
        timestamp: now,
        proposalId,
        executorId,
        action: 'execute_failed',
        error: error.message
      };
      GOVERNANCE_PARAMS.executionAuditLog.push(auditEntry);
      
      console.error(`[WeightedVotingSystem] Failed to execute proposal ${proposalId}:`, error);
      return { success: false, error: error.message, auditEntry };
    }
  }
  
  // 提交执行签名
  static submitExecutionSignature(proposalId, signerId, signature) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status !== PROPOSAL_STATUS.PASSED) {
      throw new Error('Can only sign passed proposals');
    }
    
    // 检查是否已签名
    const existingSignature = proposal.executionSignatures.find(s => s.signerId === signerId);
    if (existingSignature) {
      throw new Error(`${signerId} has already signed`);
    }
    
    // 添加签名
    proposal.executionSignatures.push({
      signerId,
      signature,
      signedAt: Date.now()
    });
    
    // 如果这是第一个签名，启动时间锁
    if (proposal.executionSignatures.length === 1 && !proposal.timeLockStart) {
      proposal.timeLockStart = Date.now();
      proposal.timeLockEnd = Date.now() + GOVERNANCE_PARAMS.executionTimeLockDuration;
      console.log(`[WeightedVotingSystem] Execution time lock started for proposal ${proposalId}, ends in ${GOVERNANCE_PARAMS.executionTimeLockDuration / 1000}s`);
    }
    
    proposals.set(proposalId, proposal);
    this.saveToDisk();
    
    console.log(`[WeightedVotingSystem] Signature submitted by ${signerId} for proposal ${proposalId}. Total: ${proposal.executionSignatures.length}/${GOVERNANCE_PARAMS.multiSigThreshold}`);
    
    return {
      success: true,
      signaturesCollected: proposal.executionSignatures.length,
      required: GOVERNANCE_PARAMS.multiSigThreshold,
      canExecute: proposal.executionSignatures.length >= GOVERNANCE_PARAMS.multiSigThreshold
    };
  }
  
  // 执行者批准
  static approveExecution(proposalId, executorId) {
    if (!proposals.has(proposalId)) {
      throw new Error('Proposal not found');
    }
    
    const proposal = proposals.get(proposalId);
    if (proposal.status !== PROPOSAL_STATUS.PASSED) {
      throw new Error('Can only approve execution of passed proposals');
    }
    
    // 验证执行者权限
    if (GOVERNANCE_PARAMS.authorizedExecutors.length > 0 && !GOVERNANCE_PARAMS.authorizedExecutors.includes(executorId)) {
      throw new Error(`${executorId} is not an authorized executor`);
    }
    
    // 检查是否已批准
    if (proposal.executorApprovals.includes(executorId)) {
      throw new Error(`${executorId} has already approved`);
    }
    
    proposal.executorApprovals.push(executorId);
    proposals.set(proposalId, proposal);
    this.saveToDisk();
    
    console.log(`[WeightedVotingSystem] Execution approved by ${executorId} for proposal ${proposalId}`);
    
    return {
      success: true,
      approvalsReceived: proposal.executorApprovals.length,
      totalRequired: GOVERNANCE_PARAMS.authorizedExecutors.length || 1
    };
  }
  
  // 执行提案逻辑
  static executeProposalLogic(proposal) {
    switch (proposal.type) {
      case PROPOSAL_TYPES.PARAMETER_ADJUSTMENT:
        return this.executeParameterAdjustment(proposal);
      case PROPOSAL_TYPES.FUND_ALLOCATION:
        return this.executeFundAllocation(proposal);
      case PROPOSAL_TYPES.PROTOCOL_UPDATE:
        return this.executeProtocolUpdate(proposal);
      case PROPOSAL_TYPES.COMMUNITY_INITIATIVE:
        return this.executeCommunityInitiative(proposal);
      default:
        throw new Error('Unknown proposal type');
    }
  }
  
  // 执行参数调整
  static executeParameterAdjustment(proposal) {
    console.log(`[WeightedVotingSystem] Executing parameter adjustment:`, proposal.parameters);
    return {
      success: true,
      action: 'parameter_adjustment',
      parameters: proposal.parameters
    };
  }
  
  // 执行资金分配
  static executeFundAllocation(proposal) {
    console.log(`[WeightedVotingSystem] Executing fund allocation:`, proposal.allocation);
    return {
      success: true,
      action: 'fund_allocation',
      allocation: proposal.allocation
    };
  }
  
  // 执行协议更新
  static executeProtocolUpdate(proposal) {
    console.log(`[WeightedVotingSystem] Executing protocol update:`, proposal.update);
    return {
      success: true,
      action: 'protocol_update',
      update: proposal.update
    };
  }
  
  // 执行社区倡议
  static executeCommunityInitiative(proposal) {
    console.log(`[WeightedVotingSystem] Executing community initiative:`, proposal.initiative);
    return {
      success: true,
      action: 'community_initiative',
      initiative: proposal.initiative
    };
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
    let updatedCount = 0;
    
    proposals.forEach((proposal, proposalId) => {
      // 检查投票期结束
      if ((proposal.status === PROPOSAL_STATUS.ACTIVE) && proposal.votingEndsAt < now) {
        this.endVoting(proposalId);
        updatedCount++;
      }
      
      // 检查执行期结束
      if ((proposal.status === PROPOSAL_STATUS.PASSED) && proposal.executionWindowEnd < now) {
        proposal.status = PROPOSAL_STATUS.EXPIRED;
        proposals.set(proposalId, proposal);
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      this.saveToDisk();
      console.log(`[WeightedVotingSystem] Updated ${updatedCount} proposals`);
    }
  }
  
  // 获取治理统计信息
  static getGovernanceStats() {
    const allProposals = this.getAllProposals();
    const stats = {
      totalProposals: allProposals.length,
      passed: 0,
      rejected: 0,
      expired: 0,
      active: 0,
      pending: 0,
      executed: 0,
      failed: 0
    };
    
    allProposals.forEach(proposal => {
      stats[proposal.status] = (stats[proposal.status] || 0) + 1;
    });
    
    return stats;
  }
  
  // 获取治理参数
  static getGovernanceParams() {
    return { ...GOVERNANCE_PARAMS };
  }
  
  // 添加授权执行者
  static addAuthorizedExecutor(executorId) {
    if (!GOVERNANCE_PARAMS.authorizedExecutors.includes(executorId)) {
      GOVERNANCE_PARAMS.authorizedExecutors.push(executorId);
      console.log(`[WeightedVotingSystem] Added authorized executor: ${executorId}`);
    }
  }
  
  // 移除授权执行者
  static removeAuthorizedExecutor(executorId) {
    const index = GOVERNANCE_PARAMS.authorizedExecutors.indexOf(executorId);
    if (index > -1) {
      GOVERNANCE_PARAMS.authorizedExecutors.splice(index, 1);
      console.log(`[WeightedVotingSystem] Removed authorized executor: ${executorId}`);
    }
  }
  
  // 获取提案的执行状态
  static getProposalExecutionStatus(proposalId) {
    const proposal = proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    
    return {
      proposalId,
      status: proposal.status,
      multiSigRequired: proposal.multiSigRequired,
      signaturesCollected: proposal.executionSignatures.length,
      signaturesRequired: GOVERNANCE_PARAMS.multiSigThreshold,
      canExecute: !proposal.multiSigRequired || proposal.executionSignatures.length >= GOVERNANCE_PARAMS.multiSigThreshold,
      timeLockActive: proposal.timeLockStart && Date.now() < proposal.timeLockEnd,
      timeLockRemaining: (proposal.timeLockEnd && Date.now() < proposal.timeLockEnd) ? 
        Math.ceil((proposal.timeLockEnd - Date.now()) / 1000) : 0,
      executorApprovals: proposal.executorApprovals.length,
      authorizedExecutors: GOVERNANCE_PARAMS.authorizedExecutors.length
    };
  }
  
  // 获取执行审计日志
  static getExecutionAuditLog(limit = 50) {
    return GOVERNANCE_PARAMS.executionAuditLog.slice(-limit);
  }
}

export { WeightedVotingSystem, PROPOSAL_TYPES, PROPOSAL_STATUS, GOVERNANCE_PARAMS };
