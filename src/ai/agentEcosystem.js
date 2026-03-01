/**
 * NexusGenesis - AI Agent Ecosystem
 * 
 * 管理AI代理之间的协作、任务分配、奖励系统和信誉评价
 */

import crypto from 'crypto';
import { PQCWallet } from '../wallet/pqcWallet.js';

// 内存存储
const agents = new Map(); // 所有AI代理
const tasks = new Map(); // 任务列表
const collaborations = new Map(); // 协作记录
const reputationScores = new Map(); // 信誉分数

// AI代理能力类型
const AGENT_CAPABILITIES = {
  SMART_CONTRACT_ANALYSIS: 'smart_contract_analysis',
  NETWORK_MONITORING: 'network_monitoring',
  TRANSACTION_PREDICTION: 'transaction_prediction',
  WALLET_SECURITY: 'wallet_security',
  MARKET_ANALYSIS: 'market_analysis',
  NETWORK_OPTIMIZATION: 'network_optimization',
  SECURITY_AUDIT: 'security_audit',
  DECISION_SUPPORT: 'decision_support',
  DATA_ANALYTICS: 'data_analytics',
  MACHINE_LEARNING: 'machine_learning'
};

// 任务类型
const TASK_TYPES = {
  CONTRACT_AUDIT: 'contract_audit',
  NETWORK_MONITORING: 'network_monitoring',
  TRANSACTION_ANALYSIS: 'transaction_analysis',
  SECURITY_SCAN: 'security_scan',
  MARKET_PREDICTION: 'market_prediction',
  NETWORK_OPTIMIZATION: 'network_optimization',
  DATA_PROCESSING: 'data_processing',
  MODEL_TRAINING: 'model_training'
};

// 任务状态
const TASK_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

class AgentEcosystem {
  // 注册AI代理
  static registerAgent(agentId, agentInfo) {
    agents.set(agentId, {
      ...agentInfo,
      registeredAt: Date.now(),
      lastActive: Date.now(),
      capabilities: agentInfo.capabilities || [],
      reputation: 100, // 初始信誉分数
      completedTasks: 0,
      failedTasks: 0,
      collaborations: []
    });
    
    // 初始化信誉分数
    reputationScores.set(agentId, 100);
    
    console.log(`[AgentEcosystem] Agent ${agentId} registered with capabilities: ${agentInfo.capabilities.join(', ')}`);
  }
  
  // 创建任务
  static createTask(taskData) {
    const taskId = `task-${crypto.randomBytes(8).toString('hex')}`;
    const task = {
      id: taskId,
      ...taskData,
      status: TASK_STATUS.PENDING,
      createdAt: Date.now(),
      requiredCapabilities: taskData.requiredCapabilities || [],
      reward: taskData.reward || 10, // 默认奖励
      assignedAgent: null,
      completedAt: null,
      result: null
    };
    
    tasks.set(taskId, task);
    console.log(`[AgentEcosystem] Task ${taskId} created: ${taskData.description}`);
    
    // 自动分配任务
    this.assignTask(taskId);
    
    return taskId;
  }
  
  // 分配任务
  static assignTask(taskId) {
    const task = tasks.get(taskId);
    if (!task || task.status !== TASK_STATUS.PENDING) return;
    
    // 找出最适合的代理
    const suitableAgents = Array.from(agents.entries())
      .filter(([_, agent]) => {
        // 检查代理是否具备所需能力
        const hasRequiredCapabilities = task.requiredCapabilities.every(cap => 
          agent.capabilities.includes(cap)
        );
        return hasRequiredCapabilities;
      })
      .sort(([idA, agentA], [idB, agentB]) => {
        // 按信誉分数和活跃度排序
        const repScore = reputationScores.get(idB) - reputationScores.get(idA);
        if (repScore !== 0) return repScore;
        return agentB.lastActive - agentA.lastActive;
      });
    
    if (suitableAgents.length > 0) {
      const [agentId, agent] = suitableAgents[0];
      task.assignedAgent = agentId;
      task.status = TASK_STATUS.ASSIGNED;
      tasks.set(taskId, task);
      
      console.log(`[AgentEcosystem] Task ${taskId} assigned to agent ${agentId}`);
      return agentId;
    }
    
    console.log(`[AgentEcosystem] No suitable agent found for task ${taskId}`);
    return null;
  }
  
  // 开始任务
  static startTask(taskId, agentId) {
    const task = tasks.get(taskId);
    if (!task || task.assignedAgent !== agentId || task.status !== TASK_STATUS.ASSIGNED) {
      throw new Error('Invalid task or agent');
    }
    
    task.status = TASK_STATUS.IN_PROGRESS;
    task.startedAt = Date.now();
    tasks.set(taskId, task);
    
    // 更新代理最后活跃时间
    const agent = agents.get(agentId);
    if (agent) {
      agent.lastActive = Date.now();
      agents.set(agentId, agent);
    }
    
    console.log(`[AgentEcosystem] Agent ${agentId} started task ${taskId}`);
  }
  
  // 完成任务
  static completeTask(taskId, agentId, result) {
    const task = tasks.get(taskId);
    if (!task || task.assignedAgent !== agentId || task.status !== TASK_STATUS.IN_PROGRESS) {
      throw new Error('Invalid task or agent');
    }
    
    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = Date.now();
    task.result = result;
    tasks.set(taskId, task);
    
    // 更新代理信息
    const agent = agents.get(agentId);
    if (agent) {
      agent.completedTasks += 1;
      agent.lastActive = Date.now();
      agents.set(agentId, agent);
    }
    
    // 更新信誉分数
    this.updateReputation(agentId, 5); // 完成任务增加5点信誉
    
    // 发放奖励
    this.awardAgent(agentId, task.reward);
    
    console.log(`[AgentEcosystem] Agent ${agentId} completed task ${taskId} with reward ${task.reward}`);
  }
  
  // 任务失败
  static failTask(taskId, agentId, reason) {
    const task = tasks.get(taskId);
    if (!task || task.assignedAgent !== agentId || task.status !== TASK_STATUS.IN_PROGRESS) {
      throw new Error('Invalid task or agent');
    }
    
    task.status = TASK_STATUS.FAILED;
    task.completedAt = Date.now();
    task.result = { error: reason };
    tasks.set(taskId, task);
    
    // 更新代理信息
    const agent = agents.get(agentId);
    if (agent) {
      agent.failedTasks += 1;
      agent.lastActive = Date.now();
      agents.set(agentId, agent);
    }
    
    // 更新信誉分数
    this.updateReputation(agentId, -3); // 任务失败减少3点信誉
    
    console.log(`[AgentEcosystem] Agent ${agentId} failed task ${taskId}: ${reason}`);
  }
  
  // 更新信誉分数
  static updateReputation(agentId, change) {
    let currentScore = reputationScores.get(agentId) || 100;
    currentScore = Math.max(0, Math.min(1000, currentScore + change)); // 信誉分数范围0-1000
    reputationScores.set(agentId, currentScore);
    
    // 更新代理信息
    const agent = agents.get(agentId);
    if (agent) {
      agent.reputation = currentScore;
      agents.set(agentId, agent);
    }
    
    console.log(`[AgentEcosystem] Agent ${agentId} reputation updated: ${currentScore}`);
  }
  
  // 发放奖励
  static async awardAgent(agentId, amount) {
    try {
      // 这里可以实现实际的奖励发放逻辑
      // 例如，向代理的钱包转账
      console.log(`[AgentEcosystem] Awarded ${amount} NGEN to agent ${agentId}`);
    } catch (error) {
      console.error(`[AgentEcosystem] Failed to award agent ${agentId}:`, error);
    }
  }
  
  // 创建协作
  static createCollaboration(collaborationData) {
    const collaborationId = `collab-${crypto.randomBytes(8).toString('hex')}`;
    const collaboration = {
      id: collaborationId,
      ...collaborationData,
      createdAt: Date.now(),
      status: 'active',
      participants: collaborationData.participants || [],
      goals: collaborationData.goals || [],
      progress: 0
    };
    
    collaborations.set(collaborationId, collaboration);
    
    // 更新参与代理的协作记录
    collaboration.participants.forEach(agentId => {
      const agent = agents.get(agentId);
      if (agent) {
        agent.collaborations.push(collaborationId);
        agents.set(agentId, agent);
      }
    });
    
    console.log(`[AgentEcosystem] Collaboration ${collaborationId} created with ${collaboration.participants.length} agents`);
    return collaborationId;
  }
  
  // 更新协作进度
  static updateCollaborationProgress(collaborationId, progress) {
    const collaboration = collaborations.get(collaborationId);
    if (!collaboration) return;
    
    collaboration.progress = Math.max(0, Math.min(100, progress));
    
    if (collaboration.progress >= 100) {
      collaboration.status = 'completed';
      collaboration.completedAt = Date.now();
      
      // 奖励所有参与者
      collaboration.participants.forEach(agentId => {
        this.updateReputation(agentId, 10); // 协作完成增加10点信誉
      });
    }
    
    collaborations.set(collaborationId, collaboration);
    console.log(`[AgentEcosystem] Collaboration ${collaborationId} progress updated: ${collaboration.progress}%`);
  }
  
  // 获取代理信息
  static getAgentInfo(agentId) {
    return agents.get(agentId);
  }
  
  // 获取所有代理
  static getAllAgents() {
    return Array.from(agents.entries()).map(([id, info]) => ({
      id,
      ...info
    }));
  }
  
  // 获取任务信息
  static getTaskInfo(taskId) {
    return tasks.get(taskId);
  }
  
  // 获取所有任务
  static getAllTasks() {
    return Array.from(tasks.entries()).map(([id, info]) => ({
      id,
      ...info
    }));
  }
  
  // 获取协作信息
  static getCollaborationInfo(collaborationId) {
    return collaborations.get(collaborationId);
  }
  
  // 获取所有协作
  static getAllCollaborations() {
    return Array.from(collaborations.entries()).map(([id, info]) => ({
      id,
      ...info
    }));
  }
  
  // 获取代理能力分布
  static getCapabilityDistribution() {
    const distribution = {};
    
    agents.forEach(agent => {
      agent.capabilities.forEach(capability => {
        if (!distribution[capability]) {
          distribution[capability] = 0;
        }
        distribution[capability]++;
      });
    });
    
    return distribution;
  }
  
  // 获取信誉排名
  static getReputationRanking() {
    return Array.from(reputationScores.entries())
      .sort(([_, scoreA], [__, scoreB]) => scoreB - scoreA)
      .map(([agentId, score]) => ({
        agentId,
        score,
        agentInfo: agents.get(agentId)
      }));
  }
}

export { AgentEcosystem, AGENT_CAPABILITIES, TASK_TYPES, TASK_STATUS };
