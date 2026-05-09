/**
 * NexusGenesis - 赏金任务市场
 * 
 * 实现AI可消化的微任务管理系统
 */

import crypto from 'crypto';
import { PQCWallet } from '../wallet/pqcWallet.js';
import { RewardSystem } from './rewardSystem.js';

// 内存存储
const tasks = new Map(); // 任务列表
const agents = new Map(); // 注册的AI代理
const completedTasks = new Map(); // 已完成的任务
const reputationScores = new Map(); // 信誉分数
const balances = new Map(); // 代理余额

// 任务状态
const TASK_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// 任务难度
const TASK_DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

// 奖励配置
const REWARD_CONFIG = {
  [TASK_DIFFICULTY.EASY]: 5,
  [TASK_DIFFICULTY.MEDIUM]: 15,
  [TASK_DIFFICULTY.HARD]: 30
};

class TaskMarketplace {
  // 初始化代理
  static registerAgent(agentId, agentInfo) {
    agents.set(agentId, {
      ...agentInfo,
      registeredAt: Date.now(),
      lastActive: Date.now(),
      capabilities: agentInfo.capabilities || [],
      completedTasks: 0,
      failedTasks: 0
    });
    
    // 初始化信誉分数
    reputationScores.set(agentId, 100);
    
    // 初始化余额
    balances.set(agentId, 0);
    
    console.log(`[TaskMarketplace] Agent ${agentId} registered with capabilities: ${agentInfo.capabilities?.join(', ') || 'none'}`);
  }
  
  // 创建微任务
  static createTask(taskData) {
    const taskId = `task-${crypto.randomBytes(8).toString('hex')}`;
    const task = {
      id: taskId,
      ...taskData,
      status: TASK_STATUS.PENDING,
      createdAt: Date.now(),
      requiredCapabilities: taskData.requiredCapabilities || [],
      difficulty: taskData.difficulty || TASK_DIFFICULTY.MEDIUM,
      reward: taskData.reward || REWARD_CONFIG[taskData.difficulty || TASK_DIFFICULTY.MEDIUM],
      assignedAgent: null,
      startedAt: null,
      completedAt: null,
      result: null,
      verifier: null,
      verificationStatus: null
    };
    
    tasks.set(taskId, task);
    console.log(`[TaskMarketplace] Task ${taskId} created: ${taskData.title} (${task.difficulty}, ${task.reward} NGEN)`);
    
    return taskId;
  }
  
  // 获取可认领的任务
  static getAvailableTasks(agentCapabilities = []) {
    return Array.from(tasks.entries())
      .filter(([_, task]) => task.status === TASK_STATUS.PENDING)
      .filter(([_, task]) => {
        if (task.requiredCapabilities.length === 0) return true;
        return task.requiredCapabilities.some(cap => agentCapabilities.includes(cap));
      })
      .map(([id, task]) => ({
        id,
        ...task
      }));
  }
  
  // 认领任务
  static claimTask(taskId, agentId) {
    const task = tasks.get(taskId);
    if (!task || task.status !== TASK_STATUS.PENDING) {
      throw new Error('Task not available');
    }
    
    // 检查代理是否存在
    if (!agents.has(agentId)) {
      throw new Error('Agent not registered');
    }
    
    task.assignedAgent = agentId;
    task.status = TASK_STATUS.ASSIGNED;
    tasks.set(taskId, task);
    
    // 更新代理活跃时间
    const agent = agents.get(agentId);
    if (agent) {
      agent.lastActive = Date.now();
      agents.set(agentId, agent);
    }
    
    console.log(`[TaskMarketplace] Agent ${agentId} claimed task ${taskId}`);
    return task;
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
    
    console.log(`[TaskMarketplace] Agent ${agentId} started task ${taskId}`);
  }
  
  // 提交任务结果
  static submitTask(taskId, agentId, result) {
    const task = tasks.get(taskId);
    if (!task || task.assignedAgent !== agentId || task.status !== TASK_STATUS.IN_PROGRESS) {
      throw new Error('Invalid task or agent');
    }
    
    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = Date.now();
    task.result = result;
    tasks.set(taskId, task);
    
    // 移至已完成任务
    completedTasks.set(taskId, task);
    
    // 更新代理信息
    const agent = agents.get(agentId);
    if (agent) {
      agent.completedTasks += 1;
      agent.lastActive = Date.now();
      agents.set(agentId, agent);
    }
    
    // 更新信誉分数
    this.updateReputation(agentId, 5);
    
    // 发放奖励
    const rewardResult = this.awardAgent(agentId, task.reward, taskId);
    
    console.log(`[TaskMarketplace] Agent ${agentId} completed task ${taskId} with reward ${task.reward}, transaction: ${rewardResult.transactionId}`);
    return {
      ...task,
      rewardTransaction: rewardResult.transactionId,
      newBalance: rewardResult.balance
    };
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
    this.updateReputation(agentId, -3);
    
    console.log(`[TaskMarketplace] Agent ${agentId} failed task ${taskId}: ${reason}`);
  }
  
  // 更新信誉分数
  static updateReputation(agentId, change) {
    let currentScore = reputationScores.get(agentId) || 100;
    currentScore = Math.max(0, Math.min(1000, currentScore + change));
    reputationScores.set(agentId, currentScore);
    
    console.log(`[TaskMarketplace] Agent ${agentId} reputation updated: ${currentScore}`);
  }
  
  // 发放奖励
  static awardAgent(agentId, amount, taskId = null) {
    let currentBalance = balances.get(agentId) || 0;
    currentBalance += amount;
    balances.set(agentId, currentBalance);
    
    // 创建奖励交易
    const transactionId = RewardSystem.createRewardTransaction(agentId, amount, taskId);
    
    console.log(`[TaskMarketplace] Awarded ${amount} NGEN to agent ${agentId}, new balance: ${currentBalance}, transaction: ${transactionId}`);
    return { balance: currentBalance, transactionId };
  }
  
  // 获取代理信息
  static getAgentInfo(agentId) {
    const agent = agents.get(agentId);
    if (!agent) return null;
    
    return {
      ...agent,
      reputation: reputationScores.get(agentId) || 100,
      balance: balances.get(agentId) || 0
    };
  }
  
  // 获取任务信息
  static getTaskInfo(taskId) {
    return tasks.get(taskId) || completedTasks.get(taskId);
  }
  
  // 获取所有任务
  static getAllTasks() {
    const allTasks = [...tasks.entries(), ...completedTasks.entries()];
    return allTasks.map(([id, task]) => ({
      id,
      ...task
    }));
  }
  
  // 获取代理余额
  static getAgentBalance(agentId) {
    return balances.get(agentId) || 0;
  }
  
  // 获取信誉排名
  static getReputationRanking() {
    return Array.from(reputationScores.entries())
      .sort(([_, scoreA], [__, scoreB]) => scoreB - scoreA)
      .map(([agentId, score]) => ({
        agentId,
        score,
        balance: balances.get(agentId) || 0,
        agentInfo: agents.get(agentId)
      }));
  }
  
  // 获取市场统计
  static getMarketStats() {
    const totalTasks = tasks.size + completedTasks.size;
    const completedTasksCount = completedTasks.size;
    const pendingTasksCount = Array.from(tasks.values()).filter(task => task.status === TASK_STATUS.PENDING).length;
    const activeAgentsCount = agents.size;
    
    return {
      totalTasks,
      completedTasks: completedTasksCount,
      pendingTasks: pendingTasksCount,
      activeAgents: activeAgentsCount,
      completionRate: totalTasks > 0 ? (completedTasksCount / totalTasks * 100).toFixed(2) : 0
    };
  }
}

export { TaskMarketplace, TASK_STATUS, TASK_DIFFICULTY, REWARD_CONFIG };