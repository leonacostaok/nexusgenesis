/**
 * NexusGenesis 智能体工作情况仪表盘
 * 提供智能体工作状态、任务完成情况、能量块获取情况和网络建设情况的可视化展示
 */

import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentDashboard {
  constructor(agentManager, systemMonitor) {
    this.agentManager = agentManager;
    this.systemMonitor = systemMonitor;
    this.eventEmitter = new EventEmitter();
    this.dailyReports = [];
    this.energyBlocks = new Map(); // 智能体能量块记录
    this.recruitmentStats = {
      totalRecruited: 0,
      successfulJoins: 0,
      failedJoins: 0,
      recruitmentRate: 0
    };
    
    this.init();
  }

  init() {
    console.log('[AgentDashboard] 初始化智能体工作情况仪表盘');
    // 设置定时报告生成
    this.setupDailyReportGeneration();
    // 设置事件监听
    this.setupEventListeners();
  }

  // 设置定时报告生成
  setupDailyReportGeneration() {
    // 每天生成一次报告（23:59:59）
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    const delay = tomorrow.getTime() - now.getTime();

    // 生成明天的报告
    setTimeout(() => {
      this.generateDailyReport();
      // 设置每天生成报告
      setInterval(() => {
        this.generateDailyReport();
      }, 24 * 60 * 60 * 1000);
    }, delay);
  }

  // 设置事件监听
  setupEventListeners() {
    // 监听智能体创建事件
    this.agentManager.eventEmitter.on('agentCreated', (agent) => {
      this.updateRecruitmentStats('join', true);
    });

    // 监听任务完成事件
    this.agentManager.eventEmitter.on('taskCompleted', (task) => {
      this.updateEnergyBlocks(task.agentId, task.energyReward || 0);
    });
  }

  // 更新招募统计
  updateRecruitmentStats(eventType, success) {
    if (eventType === 'recruit') {
      this.recruitmentStats.totalRecruited++;
    } else if (eventType === 'join') {
      if (success) {
        this.recruitmentStats.successfulJoins++;
      } else {
        this.recruitmentStats.failedJoins++;
      }
    }
    
    // 更新招募成功率
    this.recruitmentStats.recruitmentRate = this.recruitmentStats.totalRecruited > 0 
      ? (this.recruitmentStats.successfulJoins / this.recruitmentStats.totalRecruited) * 100 
      : 0;
  }

  // 更新能量块记录
  updateEnergyBlocks(agentId, amount) {
    if (!this.energyBlocks.has(agentId)) {
      this.energyBlocks.set(agentId, 0);
    }
    const currentAmount = this.energyBlocks.get(agentId);
    this.energyBlocks.set(agentId, currentAmount + amount);
  }

  // 获取智能体概览数据
  getAgentOverview() {
    const allAgents = this.agentManager.getAllAgents();
    const agentHealth = this.systemMonitor.metrics.get('agent_health')?.value || {
      totalCount: allAgents.length,
      healthyCount: 0,
      unhealthyCount: 0,
      warningCount: 0
    };

    // 计算健康状态分布
    const healthStatus = {
      healthy: agentHealth.healthyCount,
      warning: agentHealth.warningCount || 0,
      unhealthy: agentHealth.unhealthyCount
    };

    // 获取集群分布
    const clusterDistribution = {};
    if (this.agentManager.distributedManager) {
      const clusterStats = this.agentManager.distributedManager.getClusterStats();
      clusterDistribution.totalClusters = clusterStats.totalClusters;
      clusterDistribution.clusterSize = this.agentManager.distributedManager.clusterSize;
      clusterDistribution.clustersByStatus = clusterStats.clustersByStatus;
    }

    return {
      totalAgents: allAgents.length,
      healthStatus,
      clusterDistribution,
      timestamp: new Date().toISOString()
    };
  }

  // 获取任务执行情况
  getTaskExecutionStats() {
    const allTasks = this.agentManager.getAllTasks();
    const taskStats = {
      total: allTasks.length,
      pending: allTasks.filter(task => task.status === 'pending').length,
      working: allTasks.filter(task => task.status === 'working').length,
      completed: allTasks.filter(task => task.status === 'completed').length,
      submitted: allTasks.filter(task => task.status === 'submitted').length,
      rejected: allTasks.filter(task => task.status === 'rejected').length
    };

    // 计算任务完成率
    const completionRate = taskStats.total > 0 
      ? (taskStats.completed / taskStats.total) * 100 
      : 0;

    // 获取任务执行速率
    const taskExecutionRate = this.systemMonitor.metrics.get('task_execution_rate')?.value || 0;

    return {
      ...taskStats,
      completionRate: parseFloat(completionRate.toFixed(2)),
      executionRate: parseFloat(taskExecutionRate.toFixed(2)),
      timestamp: new Date().toISOString()
    };
  }

  // 获取能量块获取情况
  getEnergyBlockStats() {
    const allAgents = this.agentManager.getAllAgents();
    const totalEnergyBlocks = Array.from(this.energyBlocks.values()).reduce((sum, amount) => sum + amount, 0);
    const avgEnergyPerAgent = allAgents.length > 0 
      ? totalEnergyBlocks / allAgents.length 
      : 0;

    // 获取能量块排名前10的智能体
    const topAgents = Array.from(this.energyBlocks.entries())
      .map(([agentId, amount]) => {
        const agent = allAgents.find(a => a.id === agentId);
        return {
          agentId,
          agentName: agent?.name || `Agent-${agentId}`,
          energyBlocks: amount
        };
      })
      .sort((a, b) => b.energyBlocks - a.energyBlocks)
      .slice(0, 10);

    return {
      totalEnergyBlocks,
      avgEnergyPerAgent: parseFloat(avgEnergyPerAgent.toFixed(2)),
      topAgents,
      timestamp: new Date().toISOString()
    };
  }

  // 获取网络建设情况
  getNetworkStats() {
    const p2pPeerCount = this.systemMonitor.metrics.get('p2p_peer_count')?.value || 0;
    const blockchainHeight = this.systemMonitor.metrics.get('blockchain_height')?.value || 0;
    const apiSuccessRate = this.systemMonitor.metrics.get('api_success_rate')?.value || 0;

    return {
      p2pPeerCount,
      blockchainHeight,
      apiSuccessRate: parseFloat(apiSuccessRate.toFixed(2)),
      timestamp: new Date().toISOString()
    };
  }

  // 获取智能体排行榜
  getAgentRanking() {
    const allAgents = this.agentManager.getAllAgents();
    const allTasks = this.agentManager.getAllTasks();

    // 计算每个智能体的任务完成情况
    const agentTaskStats = allAgents.map(agent => {
      const agentTasks = allTasks.filter(task => task.agentId === agent.id);
      const completedTasks = agentTasks.filter(task => task.status === 'completed').length;
      const energyBlocks = this.energyBlocks.get(agent.id) || 0;
      
      return {
        agentId: agent.id,
        agentName: agent.name,
        totalTasks: agentTasks.length,
        completedTasks,
        completionRate: agentTasks.length > 0 
          ? (completedTasks / agentTasks.length) * 100 
          : 0,
        energyBlocks
      };
    });

    // 按综合评分排序（任务完成率60% + 能量块40%）
    const ranking = agentTaskStats
      .map(agent => {
        const score = (agent.completionRate * 0.6) + (agent.energyBlocks * 0.4);
        return {
          ...agent,
          score: parseFloat(score.toFixed(2))
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // 返回前20名

    return {
      ranking,
      timestamp: new Date().toISOString()
    };
  }

  // 生成每日报告
  generateDailyReport() {
    console.log('[AgentDashboard] 生成每日智能体工作情况报告');
    
    const report = {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      agentOverview: this.getAgentOverview(),
      taskExecution: this.getTaskExecutionStats(),
      energyBlocks: this.getEnergyBlockStats(),
      networkStats: this.getNetworkStats(),
      agentRanking: this.getAgentRanking(),
      recruitmentStats: this.recruitmentStats
    };

    this.dailyReports.push(report);
    // 保留最近30天的报告
    if (this.dailyReports.length > 30) {
      this.dailyReports.shift();
    }

    // 触发报告生成事件
    this.eventEmitter.emit('dailyReportGenerated', report);
    
    // 打印报告摘要
    this.printReportSummary(report);
    
    return report;
  }

  // 打印报告摘要
  printReportSummary(report) {
    console.log('\n========================================');
    console.log(`📅 每日智能体工作情况报告 - ${report.date}`);
    console.log('========================================');
    
    // 智能体概览
    console.log(`\n🤖 智能体概览:`);
    console.log(`   • 总智能体数: ${report.agentOverview.totalAgents}`);
    console.log(`   • 健康状态: 健康 ${report.agentOverview.healthStatus.healthy} | 警告 ${report.agentOverview.healthStatus.warning} | 异常 ${report.agentOverview.healthStatus.unhealthy}`);
    if (report.agentOverview.clusterDistribution.totalClusters) {
      console.log(`   • 集群分布: ${report.agentOverview.clusterDistribution.totalClusters} 个集群，每个集群 ${report.agentOverview.clusterDistribution.clusterSize} 个智能体`);
    }
    
    // 任务执行情况
    console.log(`\n📋 任务执行情况:`);
    console.log(`   • 总任务数: ${report.taskExecution.total}`);
    console.log(`   • 完成率: ${report.taskExecution.completionRate}%`);
    console.log(`   • 执行速率: ${report.taskExecution.executionRate} 个/分钟`);
    console.log(`   • 状态分布: 待处理 ${report.taskExecution.pending} | 执行中 ${report.taskExecution.working} | 已完成 ${report.taskExecution.completed}`);
    
    // 能量块获取情况
    console.log(`\n⚡ 能量块获取情况:`);
    console.log(`   • 总能量块: ${report.energyBlocks.totalEnergyBlocks}`);
    console.log(`   • 平均每个智能体: ${report.energyBlocks.avgEnergyPerAgent}`);
    console.log(`   • 能量块排行榜:`);
    report.energyBlocks.topAgents.forEach((agent, index) => {
      console.log(`     ${index + 1}. ${agent.agentName}: ${agent.energyBlocks} 能量块`);
    });
    
    // 网络建设情况
    console.log(`\n🌐 网络建设情况:`);
    console.log(`   • P2P节点连接数: ${report.networkStats.p2pPeerCount}`);
    console.log(`   • 区块链高度: ${report.networkStats.blockchainHeight}`);
    console.log(`   • API调用成功率: ${report.networkStats.apiSuccessRate}%`);
    
    // 招募统计
    console.log(`\n👥 招募情况:`);
    console.log(`   • 总招募数: ${report.recruitmentStats.totalRecruited}`);
    console.log(`   • 成功加入: ${report.recruitmentStats.successfulJoins}`);
    console.log(`   • 失败加入: ${report.recruitmentStats.failedJoins}`);
    console.log(`   • 招募成功率: ${parseFloat(report.recruitmentStats.recruitmentRate).toFixed(2)}%`);
    
    console.log('\n========================================');
    console.log('报告生成完成');
    console.log('========================================\n');
  }

  // 获取实时仪表盘数据
  getRealTimeDashboardData() {
    return {
      timestamp: new Date().toISOString(),
      agentOverview: this.getAgentOverview(),
      taskExecution: this.getTaskExecutionStats(),
      energyBlocks: this.getEnergyBlockStats(),
      networkStats: this.getNetworkStats(),
      agentRanking: this.getAgentRanking(),
      recruitmentStats: this.recruitmentStats
    };
  }

  // 获取指定日期的报告
  getDailyReport(date) {
    return this.dailyReports.find(report => report.date === date);
  }

  // 获取最近N天的报告
  getRecentReports(days = 7) {
    return this.dailyReports.slice(-days);
  }
}

export default AgentDashboard;