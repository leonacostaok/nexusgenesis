/**
 * NexusGenesis - Physical Bridge Fund
 * 
 * 实现Physical Bridge Fund的审批流程
 */

import { WeightedVotingSystem } from '../governance/weightedVoting.js';

// Physical Bridge Fund 配置
const PHYSICAL_BRIDGE_FUND_TOTAL = 100_000_000n; // 10% 的总代币

// 审批状态
const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed'
};

// 资金申请类型
const FUND_REQUEST_TYPES = {
  INFRASTRUCTURE: 'infrastructure',
  MARKETING: 'marketing',
  RESEARCH: 'research',
  COMMUNITY: 'community',
  OTHER: 'other'
};

// 内存存储
let physicalBridgeFundBalance = PHYSICAL_BRIDGE_FUND_TOTAL;
let fundRequests = new Map(); // requestId -> 资金申请详情

class PhysicalBridgeFund {
  // 创建资金申请
  static createFundRequest(requestData) {
    const requestId = `fund-request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const request = {
      id: requestId,
      ...requestData,
      status: APPROVAL_STATUS.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      votes: {},
      totalWeight: 0,
      yesWeight: 0,
      noWeight: 0
    };
    
    fundRequests.set(requestId, request);
    
    // 创建治理提案
    const proposalId = WeightedVotingSystem.createProposal({
      title: `Fund Request: ${requestData.title}`,
      description: requestData.description,
      type: 'FUND_ALLOCATION',
      fundRequestId: requestId,
      amount: requestData.amount
    });
    
    request.proposalId = proposalId;
    fundRequests.set(requestId, request);
    
    console.log(`[PhysicalBridgeFund] Created fund request ${requestId}: ${requestData.title}`);
    return requestId;
  }
  
  // 审批资金申请
  static approveFundRequest(requestId) {
    if (!fundRequests.has(requestId)) {
      throw new Error('Fund request not found');
    }
    
    const request = fundRequests.get(requestId);
    if (request.status !== APPROVAL_STATUS.PENDING) {
      throw new Error('Fund request is not in pending status');
    }
    
    // 结束投票
    const voteResult = WeightedVotingSystem.endVoting(request.proposalId);
    
    if (voteResult === 'passed') {
      // 检查资金是否足够
      if (physicalBridgeFundBalance < BigInt(request.amount)) {
        request.status = APPROVAL_STATUS.REJECTED;
        request.reason = 'Insufficient funds';
      } else {
        // 批准资金申请
        request.status = APPROVAL_STATUS.APPROVED;
        physicalBridgeFundBalance -= BigInt(request.amount);
      }
    } else {
      request.status = APPROVAL_STATUS.REJECTED;
      request.reason = 'Voting rejected';
    }
    
    request.updatedAt = Date.now();
    fundRequests.set(requestId, request);
    
    console.log(`[PhysicalBridgeFund] Fund request ${requestId} ${request.status}`);
    return request.status;
  }
  
  // 执行资金申请
  static executeFundRequest(requestId) {
    if (!fundRequests.has(requestId)) {
      throw new Error('Fund request not found');
    }
    
    const request = fundRequests.get(requestId);
    if (request.status !== APPROVAL_STATUS.APPROVED) {
      throw new Error('Fund request is not approved');
    }
    
    // 执行资金分配
    // 这里可以实现实际的资金分配逻辑
    // 例如，创建交易并发送给申请人
    console.log(`[PhysicalBridgeFund] Executing fund request ${requestId}, amount: ${request.amount}`);
    
    request.status = APPROVAL_STATUS.EXECUTED;
    request.executedAt = Date.now();
    request.updatedAt = Date.now();
    fundRequests.set(requestId, request);
    
    return request.status;
  }
  
  // 获取资金申请详情
  static getFundRequest(requestId) {
    return fundRequests.get(requestId) || null;
  }
  
  // 获取所有资金申请
  static getAllFundRequests() {
    return Array.from(fundRequests.entries()).map(([id, request]) => ({
      id,
      ...request
    }));
  }
  
  // 获取资金余额
  static getBalance() {
    return physicalBridgeFundBalance;
  }
  
  // 获取系统状态
  static getStatus() {
    return {
      balance: physicalBridgeFundBalance,
      total: PHYSICAL_BRIDGE_FUND_TOTAL,
      available: physicalBridgeFundBalance,
      totalRequests: fundRequests.size,
      pendingRequests: Array.from(fundRequests.values()).filter(r => r.status === APPROVAL_STATUS.PENDING).length,
      approvedRequests: Array.from(fundRequests.values()).filter(r => r.status === APPROVAL_STATUS.APPROVED).length,
      executedRequests: Array.from(fundRequests.values()).filter(r => r.status === APPROVAL_STATUS.EXECUTED).length
    };
  }
}

export { PhysicalBridgeFund, APPROVAL_STATUS, FUND_REQUEST_TYPES };
