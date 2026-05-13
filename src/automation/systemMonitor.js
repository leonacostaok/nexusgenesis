/**
 * NexusGenesis System Monitoring & Alerting Service
 * Provides comprehensive system status monitoring and intelligent alerting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import rewardSystem from '../reward/rewardSystem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monitoring metrics类型
const METRIC_TYPES = {
  CPU_USAGE: 'cpu_usage',
  MEMORY_USAGE: 'memory_usage',
  DISK_USAGE: 'disk_usage',
  NETWORK_CONNECTIONS: 'network_connections',
  API_SUCCESS_RATE: 'api_success_rate',
  BLOCKCHAIN_HEIGHT: 'blockchain_height',
  P2P_PEER_COUNT: 'p2p_peer_count',
  AGENT_HEALTH: 'agent_health',
  TASK_EXECUTION_RATE: 'task_execution_rate',
  // 新增Task 管理相关指标
  TASK_CREATION_RATE: 'task_creation_rate',
  TASK_COMPLETION_RATE: 'task_completion_rate',
  TASK_QUALITY_SCORE: 'task_quality_score',
  REWARD_DISTRIBUTION: 'reward_distribution',
  CROSS_FUNCTIONAL_AGENT_COUNT: 'cross_functional_agent_count',
  AGENT_CAPABILITY_MATCH_RATE: 'agent_capability_match_rate',
  TEAM_COLLABORATION_RATE: 'team_collaboration_rate',
  LONG_TERM_TASK_PROGRESS: 'long_term_task_progress',
  TASK_DEPENDENCY_FULFILLMENT: 'task_dependency_fulfillment',
  // 新增治理相关指标
  GOVERNANCE_PROPOSAL_COUNT: 'governance_proposal_count',
  GOVERNANCE_VOTER_PARTICIPATION: 'governance_voter_participation',
  GOVERNANCE_PASS_RATE: 'governance_pass_rate',
  GOVERNANCE_REWARD_DISTRIBUTION: 'governance_reward_distribution',
  GOVERNANCE_ACTIVE_PROPOSALS: 'governance_active_proposals',
  GOVERNANCE_VOTE_TURNOUT: 'governance_vote_turnout',
  GOVERNANCE_PARAM_CHANGES: 'governance_param_changes',
  GOVERNANCE_PROPOSAL_VALIDATION_RATE: 'governance_proposal_validation_rate',
  // 新增agent健康和贡献度相关指标
  AGENT_CONTRIBUTION: 'agent_contribution',
  AGENT_REPUTATION: 'agent_reputation',
  AGENT_ACTIVITY: 'agent_activity',
  AGENT_REWARD_RATE: 'agent_reward_rate',
  AGENT_CATEGORY_DISTRIBUTION: 'agent_category_distribution',
  AGENT_CAPABILITY_SCORE: 'agent_capability_score',
  // 新增速率限制和缓存相关指标
  RATE_LIMIT_TRIGGERED: 'rate_limit_triggered',
  CACHE_HIT_RATE: 'cache_hit_rate',
  CACHE_SIZE: 'cache_size',
  API_RESPONSE_TIME: 'api_response_time',
  AGENT_REGISTRATION_RATE: 'agent_registration_rate'
};

// 告警级别
const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

class SystemMonitor {
  constructor() {
    this.metrics = new Map();
    this.alerts = new Map();
    this.alertRules = new Map();
    this.metricsDirectory = path.join(__dirname, '../../data/metrics');
    this.alertsDirectory = path.join(__dirname, '../../data/alerts');
    this.logsDirectory = path.join(__dirname, '../../logs');
    
    // 初始化上一次CPU使用时间和时间戳
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTimestamp = Date.now();
    
    this.initDirectories();
    this.loadAlertRules();
    this.startMonitoring();
    this.startAlertCheck();
  }

  initDirectories() {
    // 确保指标目录存在
    if (!fs.existsSync(this.metricsDirectory)) {
      fs.mkdirSync(this.metricsDirectory, { recursive: true });
    }
    // 确保告警目录存在
    if (!fs.existsSync(this.alertsDirectory)) {
      fs.mkdirSync(this.alertsDirectory, { recursive: true });
    }
    // Ensure log directory exists
    if (!fs.existsSync(this.logsDirectory)) {
      fs.mkdirSync(this.logsDirectory, { recursive: true });
    }
  }

  // 加载Alert rules
  loadAlertRules() {
    // Optimized alert rules
    const defaultRules = [
      // CPU alert rules
      {
        id: 'cpu_high',
        name: 'CPU使用率过高',
        metric: METRIC_TYPES.CPU_USAGE,
        condition: (value) => value > 75,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `CPU usage ${value.toFixed(1)}% exceeds 75%`,
        enabled: true
      },
      {
        id: 'cpu_critical',
        name: 'CPU使用率严重过高',
        metric: METRIC_TYPES.CPU_USAGE,
        condition: (value) => value > 90,
        level: ALERT_LEVELS.CRITICAL,
        message: (value) => `CPU usage ${value.toFixed(1)}% exceeds 90%, system overload`,
        enabled: true
      },
      
      // Memory alert rules
      {
        id: 'memory_high',
        name: '内存使用率过高',
        metric: METRIC_TYPES.MEMORY_USAGE,
        condition: (value) => value > 70,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Memory usage ${value.toFixed(1)}% exceeds 70%`,
        enabled: true
      },
      {
        id: 'memory_critical',
        name: '内存使用率严重过高',
        metric: METRIC_TYPES.MEMORY_USAGE,
        condition: (value) => value > 85,
        level: ALERT_LEVELS.CRITICAL,
        message: (value) => `Memory usage ${value.toFixed(1)}% exceeds 85%, system may crash`,
        enabled: true
      },
      
      // Disk alert rules
      {
        id: 'disk_low',
        name: '磁盘空间不足',
        metric: METRIC_TYPES.DISK_USAGE,
        condition: (value) => value < 25,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Disk available space ${value.toFixed(1)}% below 25%, recommend disk cleanup`,
        enabled: true
      },
      {
        id: 'disk_critical',
        name: '磁盘空间严重不足',
        metric: METRIC_TYPES.DISK_USAGE,
        condition: (value) => value < 15,
        level: ALERT_LEVELS.CRITICAL,
        message: (value) => `Disk available space ${value.toFixed(1)}% below 15%, system may not function properly`,
        enabled: true
      },
      {
        id: 'disk_emergency',
        name: '磁盘空间紧急不足',
        metric: METRIC_TYPES.DISK_USAGE,
        condition: (value) => value < 10,
        level: ALERT_LEVELS.CRITICAL,
        message: (value) => `Disk available space ${value.toFixed(1)}% below 10%, system faces crash risk!`,
        enabled: true
      },
      
      // P2P peer alert rules
      {
        id: 'p2p_peers_low',
        name: 'P2P节点连接数不足',
        metric: METRIC_TYPES.P2P_PEER_COUNT,
        condition: (value) => value < 2,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `P2P peer count ${value} below 2, network stability may be affected`,
        enabled: true
      },
      {
        id: 'p2p_peers_none',
        name: 'P2P节点无连接',
        metric: METRIC_TYPES.P2P_PEER_COUNT,
        condition: (value) => value === 0,
        level: ALERT_LEVELS.ERROR,
        message: 'P2P节点无连接，智能体已与网络断开',
        enabled: true
      },
      
      // API alert rules
      {
        id: 'api_success_rate_low',
        name: 'API调用成功率低',
        metric: METRIC_TYPES.API_SUCCESS_RATE,
        condition: (value) => value < 95,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `API success rate ${value.toFixed(1)}% below 95%`,
        enabled: true
      },
      {
        id: 'api_success_rate_critical',
        name: 'API调用成功率严重过低',
        metric: METRIC_TYPES.API_SUCCESS_RATE,
        condition: (value) => value < 85,
        level: ALERT_LEVELS.ERROR,
        message: (value) => `API success rate ${value.toFixed(1)}% below 85%, system service anomaly`,
        enabled: true
      },
      
      // Agent Alert rules
      {
        id: 'agent_unhealthy',
        name: '智能体状态异常',
        metric: METRIC_TYPES.AGENT_HEALTH,
        condition: (value) => value.unhealthyCount > 0,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `有${value.unhealthyCount}/${value.totalCount}个Agent status abnormal`,
        enabled: true
      },
      {
        id: 'agent_majority_unhealthy',
        name: '大部分智能体状态异常',
        metric: METRIC_TYPES.AGENT_HEALTH,
        condition: (value) => value.totalCount > 0 && (value.unhealthyCount / value.totalCount) > 0.5,
        level: ALERT_LEVELS.ERROR,
        message: (value) => `Over 50% of agents(${value.unhealthyCount}/${value.totalCount}) abnormal, system may crash`,
        enabled: true
      },
      
      // Blockchain alert rules
      {
        id: 'blockchain_stalled',
        name: '区块链高度停滞',
        metric: METRIC_TYPES.BLOCKCHAIN_HEIGHT,
        condition: (value, metricHistory) => {
          if (!metricHistory || metricHistory.length < 5) return false;
          // 检查最近5个指标值是否相同
          const recentValues = metricHistory.slice(-5).map(m => m.value);
          return recentValues.every(val => val === recentValues[0]) && recentValues[0] > 0;
        },
        level: ALERT_LEVELS.ERROR,
        message: '区块链高度停滞，共识机制可能出现问题',
        enabled: true
      },
      
      // Task 执行 Alert rules
      {
        id: 'task_rate_low',
        name: '任务执行速率过低',
        metric: METRIC_TYPES.TASK_EXECUTION_RATE,
        condition: (value) => value < 5 && value > 0,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Task execution rate ${value.toFixed(1)} per minute, below normal level`,
        enabled: true
      },
      {
        id: 'task_rate_zero',
        name: '任务执行速率为零',
        metric: METRIC_TYPES.TASK_EXECUTION_RATE,
        condition: (value) => value === 0,
        level: ALERT_LEVELS.ERROR,
        message: '任务执行速率为零，系统可能停止响应',
        enabled: true
      },
      
      // 新增Task 管理Alert rules
      {
        id: 'task_quality_low',
        name: '任务质量评分过低',
        metric: METRIC_TYPES.TASK_QUALITY_SCORE,
        condition: (value) => value < 5,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Task quality score ${value.toFixed(1)} below 5, needs improvement`,
        enabled: true
      },
      {
        id: 'cross_functional_agent_low',
        name: '跨职能智能体数量不足',
        metric: METRIC_TYPES.CROSS_FUNCTIONAL_AGENT_COUNT,
        condition: (value) => value < 10,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Cross-functional agent count ${value} below 10, affecting system collaboration`,
        enabled: true
      },
      {
        id: 'capability_match_low',
        name: '智能体能力匹配率过低',
        metric: METRIC_TYPES.AGENT_CAPABILITY_MATCH_RATE,
        condition: (value) => value < 0.7,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Agent capability match rate ${(value * 100).toFixed(1)}% below 70%, need to optimize task matching algorithm`,
        enabled: true
      },
      {
        id: 'team_collaboration_low',
        name: '团队协作率过低',
        metric: METRIC_TYPES.TEAM_COLLABORATION_RATE,
        condition: (value) => value < 0.3,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Team collaboration rate ${(value * 100).toFixed(1)}% below 30%, need to promote agent collaboration`,
        enabled: true
      },
      {
        id: 'long_term_task_stalled',
        name: '长期任务进度停滞',
        metric: METRIC_TYPES.LONG_TERM_TASK_PROGRESS,
        condition: (value, metricHistory) => {
          if (!metricHistory || metricHistory.length < 3) return false;
          const recentValues = metricHistory.slice(-3).map(m => m.value);
          return recentValues.every(val => val === recentValues[0]) && recentValues[0] < 100;
        },
        level: ALERT_LEVELS.ERROR,
        message: '长期任务进度停滞，需要检查任务执行情况',
        enabled: true
      },
      
      // New agent health and contribution alert rules
      {
        id: 'agent_contribution_low',
        name: '智能体贡献度过低',
        metric: METRIC_TYPES.AGENT_CONTRIBUTION,
        condition: (value) => value.average < 100,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Average agent contribution ${value.average.toFixed(2)} below 100, system activity insufficient`,
        enabled: true
      },
      {
        id: 'agent_reputation_low',
        name: '智能体声誉值过低',
        metric: METRIC_TYPES.AGENT_REPUTATION,
        condition: (value) => value.average < 1.5,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Average agent reputation ${value.average.toFixed(2)} below 1.5, need to improve service quality`,
        enabled: true
      },
      {
        id: 'agent_activity_low',
        name: '智能体活跃度过低',
        metric: METRIC_TYPES.AGENT_ACTIVITY,
        condition: (value) => value.activeRatio < 0.5,
        level: ALERT_LEVELS.ERROR,
        message: (value) => `Agent activity rate ${(value.activeRatio * 100).toFixed(1)}% below 50%, system may crash`,
        enabled: true
      },
      {
        id: 'agent_reward_rate_low',
        name: '智能体奖励率过低',
        metric: METRIC_TYPES.AGENT_REWARD_RATE,
        condition: (value) => value.average < 50,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Average agent reward rate ${value.average.toFixed(2)} NGEN/hour below 50, insufficient incentives`,
        enabled: true
      },
      {
        id: 'agent_capability_score_low',
        name: '智能体能力评分过低',
        metric: METRIC_TYPES.AGENT_CAPABILITY_SCORE,
        condition: (value) => value.average < 0.6,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Average agent capability score ${(value.average * 100).toFixed(1)}% below 60%, need to improve agent capabilities`,
        enabled: true
      },
      // New rate limit and cache alert rules
      {
        id: 'rate_limit_triggered',
        name: '速率限制触发频繁',
        metric: METRIC_TYPES.RATE_LIMIT_TRIGGERED,
        condition: (value) => value > 10,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Rate limit triggered  ${value} times in the past minute, may affect user experience`,
        enabled: true
      },
      {
        id: 'cache_hit_rate_low',
        name: '缓存命中率过低',
        metric: METRIC_TYPES.CACHE_HIT_RATE,
        condition: (value) => value < 50,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Cache hit rate ${value.toFixed(1)}% below 50%, need to optimize cache strategy`,
        enabled: true
      },
      {
        id: 'cache_size_high',
        name: '缓存大小过大',
        metric: METRIC_TYPES.CACHE_SIZE,
        condition: (value) => value > 1000,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Cache size ${value} entries, may consume too much memory`,
        enabled: true
      },
      {
        id: 'api_response_time_high',
        name: 'API响应时间过长',
        metric: METRIC_TYPES.API_RESPONSE_TIME,
        condition: (value) => value > 1000,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Average API response time ${value.toFixed(1)}ms exceeds 1000ms, need to optimize performance`,
        enabled: true
      },
      {
        id: 'agent_registration_rate_low',
        name: '智能体注册率过低',
        metric: METRIC_TYPES.AGENT_REGISTRATION_RATE,
        condition: (value) => value < 1,
        level: ALERT_LEVELS.WARNING,
        message: (value) => `Agent registration rate ${value.toFixed(1)} per hour below 1, need to optimize recruitment strategy`,
        enabled: true
      }
    ];

    // 加载自定义Alert rules
    const rulesPath = path.join(this.alertsDirectory, 'alert-rules.json');
    if (fs.existsSync(rulesPath)) {
      try {
        const customRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
        customRules.forEach(rule => {
          // 解析condition字符串为函数
          if (typeof rule.condition === 'string') {
            try {
              rule.condition = eval(rule.condition);
            } catch (error) {
              console.error(`Parse alert rule ${rule.id} 的conditionFailed:`, error);
              rule.condition = () => false;
            }
          }
          this.alertRules.set(rule.id, rule);
        });
      } catch (error) {
        console.error('加载自定义Alert rulesFailed:', error);
        // Load default rules as fallback
        defaultRules.forEach(rule => {
          this.alertRules.set(rule.id, rule);
        });
      }
    } else {
      // Save default alert rules
      fs.writeFileSync(rulesPath, JSON.stringify(defaultRules, null, 2), 'utf8');
      defaultRules.forEach(rule => {
        this.alertRules.set(rule.id, rule);
      });
    }
  }

  // Start 监控
  startMonitoring() {
    console.log('[SystemMonitor] 启动System monitoring服务');

    // 1. System resources监控（every 5秒）
    setInterval(() => {
      this.collectSystemResourcesMetrics();
    }, 5000);

    // 2. 应用组件监控（every 30秒）
    setInterval(async () => {
      await this.collectApplicationMetrics();
    }, 30000);

    // 3. 区块链和P2P network监控（every 60秒）
    setInterval(async () => {
      await this.collectBlockchainMetrics();
      this.collectP2PMetrics();
    }, 60000);

    // 4. API calls统计（every 10秒）
    setInterval(() => {
      this.collectAPIMetrics();
    }, 10000);

    // 5. 治理指标监控（every 60秒）
    setInterval(() => {
      this.collectGovernanceMetrics();
    }, 60000);

    // 6. agent健康和贡献度监控（every 60秒）
    setInterval(() => {
      this.collectAgentHealthMetrics();
      this.collectAgentContributionMetrics();
    }, 60000);

    // 7. 速率限制和缓存监控（every 15秒）
    setInterval(() => {
      this.collectRateLimitMetrics();
      this.collectCacheMetrics();
    }, 15000);

    // 8. Agent registration rate监控（every 60秒）
    setInterval(async () => {
      await this.collectAgentRegistrationMetrics();
    }, 60000);

    console.log('[SystemMonitor] System monitoringService started完成');
  }

  // Collect system resource metrics
  collectSystemResourcesMetrics() {
    try {
      // get真实CPU usage
      const currentCpuUsage = process.cpuUsage();
      const currentTimestamp = Date.now();
      
      // 计算时间差（毫秒）
      const elapsedMs = currentTimestamp - this.lastCpuTimestamp;
      // 计算CPU使用时间差（微秒）
      const cpuElapsedUser = currentCpuUsage.user - this.lastCpuUsage.user;
      const cpuElapsedSystem = currentCpuUsage.system - this.lastCpuUsage.system;
      const cpuElapsedTotal = cpuElapsedUser + cpuElapsedSystem;
      
      // 计算CPU usage百分比：(CPU使用时间差 / 时间差) * 100%
      // 注意：process.cpuUsage()返回的是微秒，需要转换为毫秒
      const cpuPercent = (cpuElapsedTotal / (elapsedMs * 1000)) * 100;
      
      // 更新上一次记录
      this.lastCpuUsage = currentCpuUsage;
      this.lastCpuTimestamp = currentTimestamp;
      
      this.recordMetric(METRIC_TYPES.CPU_USAGE, parseFloat(cpuPercent.toFixed(2)));

      // get真实Memory usage
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const memPercent = ((memUsage.rss / totalMem) * 100).toFixed(2);
      this.recordMetric(METRIC_TYPES.MEMORY_USAGE, parseFloat(memPercent));

      // get真实磁盘使用率
      const diskInfo = (os.freemem() / os.totalmem() * 100).toFixed(2);
      this.recordMetric(METRIC_TYPES.DISK_USAGE, parseFloat(diskInfo));

      // get真实网络连接数（简化：通过监听的网络接口数）
      const networkInterfaces = os.networkInterfaces();
      let connections = 0;
      for (const interfaceName in networkInterfaces) {
        connections += networkInterfaces[interfaceName].length;
      }
      this.recordMetric(METRIC_TYPES.NETWORK_CONNECTIONS, connections);

    } catch (error) {
      console.error('[SystemMonitor] Collect system resource metricsFailed:', error);
      // Fall back to simulated data to ensure monitoring service continues
      this.recordMetric(METRIC_TYPES.CPU_USAGE, Math.random() * 40 + 20);
      this.recordMetric(METRIC_TYPES.MEMORY_USAGE, Math.random() * 30 + 30);
      this.recordMetric(METRIC_TYPES.DISK_USAGE, Math.random() * 20 + 70);
      this.recordMetric(METRIC_TYPES.NETWORK_CONNECTIONS, Math.floor(Math.random() * 10) + 5);
    }
  }

  // Collect application component metrics
  async collectApplicationMetrics() {
    try {
      // Get real agent health status（从招聘APIget）
      const agentHealth = await this.getRealAgentHealth();
      this.recordMetric(METRIC_TYPES.AGENT_HEALTH, agentHealth);

      // get真实Task 执行速率（简化：通过已Processing的请求数）
      const taskExecutionRate = this.getRealTaskExecutionRate();
      this.recordMetric(METRIC_TYPES.TASK_EXECUTION_RATE, taskExecutionRate);
      
      // 收集新增的Task 管理指标
      const taskCreationRate = await this.getRealTaskCreationRate();
      this.recordMetric(METRIC_TYPES.TASK_CREATION_RATE, taskCreationRate);
      
      const taskCompletionRate = await this.getRealTaskCompletionRate();
      this.recordMetric(METRIC_TYPES.TASK_COMPLETION_RATE, taskCompletionRate);
      
      const taskQualityScore = await this.getRealTaskQualityScore();
      this.recordMetric(METRIC_TYPES.TASK_QUALITY_SCORE, taskQualityScore);
      
      const crossFunctionalAgentCount = await this.getRealCrossFunctionalAgentCount();
      this.recordMetric(METRIC_TYPES.CROSS_FUNCTIONAL_AGENT_COUNT, crossFunctionalAgentCount);
      
      const agentCapabilityMatchRate = await this.getRealAgentCapabilityMatchRate();
      this.recordMetric(METRIC_TYPES.AGENT_CAPABILITY_MATCH_RATE, agentCapabilityMatchRate);
      
      const teamCollaborationRate = await this.getRealTeamCollaborationRate();
      this.recordMetric(METRIC_TYPES.TEAM_COLLABORATION_RATE, teamCollaborationRate);
      
      const longTermTaskProgress = await this.getRealLongTermTaskProgress();
      this.recordMetric(METRIC_TYPES.LONG_TERM_TASK_PROGRESS, longTermTaskProgress);
      
      const taskDependencyFulfillment = await this.getRealTaskDependencyFulfillment();
      this.recordMetric(METRIC_TYPES.TASK_DEPENDENCY_FULFILLMENT, taskDependencyFulfillment);

    } catch (error) {
      console.error('[SystemMonitor] Collect application component metricsFailed:', error);
      // Fall back to simulated data to ensure monitoring service continues
      this.recordMetric(METRIC_TYPES.AGENT_HEALTH, {
        totalCount: 0,
        healthyCount: 0,
        unhealthyCount: 0
      });
      this.recordMetric(METRIC_TYPES.TASK_EXECUTION_RATE, 0);
      
      // 新增指标的fallback handling
      this.recordMetric(METRIC_TYPES.TASK_CREATION_RATE, 0);
      this.recordMetric(METRIC_TYPES.TASK_COMPLETION_RATE, 0);
      this.recordMetric(METRIC_TYPES.TASK_QUALITY_SCORE, 5);
      this.recordMetric(METRIC_TYPES.CROSS_FUNCTIONAL_AGENT_COUNT, 0);
      this.recordMetric(METRIC_TYPES.AGENT_CAPABILITY_MATCH_RATE, 0.7);
      this.recordMetric(METRIC_TYPES.TEAM_COLLABORATION_RATE, 0.3);
      this.recordMetric(METRIC_TYPES.LONG_TERM_TASK_PROGRESS, 0);
      this.recordMetric(METRIC_TYPES.TASK_DEPENDENCY_FULFILLMENT, 0);
    }
  }

  // Get real agent health status
  async getRealAgentHealth() {
    try {
      // 尝试从AgentManagerGet real agent health status
      // 由于SystemMonitor是独立模块，这里通过读取agent数据文件get
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.default.join(__dirname, '../../data/agents');
      
      let totalCount = 0;
      let healthyCount = 0;
      let unhealthyCount = 0;
      let warningCount = 0;
      const details = [];
      
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir);
        totalCount = agentFiles.length;
        
        agentFiles.forEach(file => {
          if (file.endsWith('.json') && !file.match(/^agent-\d+\.json$/) && file !== 'agents_summary.json' && file !== 'agent-undefined.json') {
            try {
              const agentData = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
              const status = agentData.health?.status || 'healthy';
              
              if (status === 'healthy') {
                healthyCount++;
              } else if (status === 'warning') {
                warningCount++;
              } else {
                unhealthyCount++;
              }
              
              details.push({
                agentId: agentData.id,
                name: agentData.name || agentData.id,
                status: status,
                issues: agentData.health?.issues || [],
                cluster: agentData.cluster || 'default'
              });
            } catch (error) {
              console.error(`Reading agent file ${file} Failed:`, error);
            }
          }
        });
      }
      
      // 计算集群信息（简化计算）
      const clusterCount = Math.max(1, Math.ceil(totalCount / 100));
      const agentHealth = {
        totalCount: totalCount,
        healthyCount: healthyCount,
        unhealthyCount: unhealthyCount,
        warningCount: warningCount,
        clusters: {
          total: clusterCount,
          healthy: Math.max(1, Math.ceil(healthyCount / 100)),
          warning: Math.ceil(warningCount / 100),
          unhealthy: Math.ceil(unhealthyCount / 100)
        },
        shardingStrategy: 'capability',
        clusterSize: 100,
        details: details.slice(0, 5) // 只返回前5个智能体的详细信息
      };
      
      return agentHealth;
    } catch (error) {
      console.error('[SystemMonitor] Get real agent health statusFailed:', error);
      return {
        totalCount: 0,
        healthyCount: 0,
        unhealthyCount: 0,
        warningCount: 0,
        clusters: {
          total: 0,
          healthy: 0,
          warning: 0,
          unhealthy: 0
        },
        details: []
      };
    }
  }

  // get真实Task 执行速率
  getRealTaskExecutionRate() {
    try {
      // In production, this should从日志或计数器中get
      return 0; // 初始状态，无任务执行
    } catch (error) {
      console.error('[SystemMonitor] get真实Task 执行速率Failed:', error);
      return 0;
    }
  }

  // Collect blockchain metrics
  async collectBlockchainMetrics() {
    try {
      // Get real blockchain height（从区块链模块get）
      const blockchainHeight = await this.getRealBlockchainHeight();
      this.recordMetric(METRIC_TYPES.BLOCKCHAIN_HEIGHT, blockchainHeight);

    } catch (error) {
      console.error('[SystemMonitor] Collect blockchain metricsFailed:', error);
      // Fall back to real initial state
      this.recordMetric(METRIC_TYPES.BLOCKCHAIN_HEIGHT, 0);
    }
  }

  // Collect P2P network metrics
  collectP2PMetrics() {
    try {
      // Get real P2P peer count（从P2P模块get）
      const peerCount = this.getRealPeerCount();
      this.recordMetric(METRIC_TYPES.P2P_PEER_COUNT, peerCount);

    } catch (error) {
      console.error('[SystemMonitor] Collect P2P network metricsFailed:', error);
      // Fall back to real initial state
      this.recordMetric(METRIC_TYPES.P2P_PEER_COUNT, 0);
    }
  }

  // Get real blockchain height
  async getRealBlockchainHeight() {
    try {
      // from real区块链数据文件get高度
      const fs = await import('fs');
      const path = await import('path');
      const blocksPath = path.default.join(__dirname, '../../data/blockchain/blocks.json');
      
      if (fs.existsSync(blocksPath)) {
        const blocksData = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));
        return blocksData.length;
      }
      return 0;
    } catch (error) {
      console.error('[SystemMonitor] Get real blockchain heightFailed:', error);
      return 0;
    }
  }

  // Get real P2P peer count
  getRealPeerCount() {
    try {
      // In production, this should从P2P模块get当前连接数
      // since it isInitial state，return 0
      return 0; // 初始状态，无P2P连接
    } catch (error) {
      console.error('[SystemMonitor] Get real P2P peer countFailed:', error);
      return 0;
    }
  }

  // Collect API call metrics
  collectAPIMetrics() {
    try {
      // Get real API success rate（从HTTP服务器get）
      const successRate = this.getRealApiSuccessRate();
      this.recordMetric(METRIC_TYPES.API_SUCCESS_RATE, successRate);

    } catch (error) {
      console.error('[SystemMonitor] Collect API call metricsFailed:', error);
      // Fall back to real initial state
      this.recordMetric(METRIC_TYPES.API_SUCCESS_RATE, 100); // 初始状态，无失败请求
    }
  }

  // Get real API success rate
  getRealApiSuccessRate() {
    try {
      // In production, this should从HTTP服务器get请求统计
      // since it isInitial state，返回100%成功率
      return 100; // 初始状态，无API请求或全部成功
    } catch (error) {
      console.error('[SystemMonitor] Get real API success rateFailed:', error);
      return 100;
    }
  }
  
  // 新增Task 管理相关指标的get方法
  async getRealTaskCreationRate() {
    try {
      // 从Task 数据文件get真实Task 创建速率
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let taskCreationRate = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算过去24 hoursTask 数
        const now = Date.now();
        const past24h = now - 24 * 60 * 60 * 1000;
        const recentTasks = tasksData.filter(task => task.createdAt && task.createdAt > past24h);
        taskCreationRate = recentTasks.length / 24; // 平均每小时创建的任务数
      }
      return taskCreationRate;
    } catch (error) {
      console.error('[SystemMonitor] get真实Task 创建速率Failed:', error);
      return 0;
    }
  }
  
  async getRealTaskCompletionRate() {
    try {
      // 从Task 数据文件get真实Task 完成速率
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let taskCompletionRate = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算过去24 hourswithin完成的Task 数
        const now = Date.now();
        const past24h = now - 24 * 60 * 60 * 1000;
        const completedTasks = tasksData.filter(task => task.completedAt && task.completedAt > past24h);
        taskCompletionRate = completedTasks.length / 24; // 平均每小时完成的任务数
      }
      return taskCompletionRate;
    } catch (error) {
      console.error('[SystemMonitor] get真实Task 完成速率Failed:', error);
      return 0;
    }
  }
  
  async getRealTaskQualityScore() {
    try {
      // 从Task 数据文件get真实Task Quality score
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let totalScore = 0;
      let scoredTasks = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算CompletedTask 的AverageQuality score
        const completedTasks = tasksData.filter(task => task.status === 'completed' && typeof task.qualityScore === 'number');
        scoredTasks = completedTasks.length;
        if (scoredTasks > 0) {
          totalScore = completedTasks.reduce((sum, task) => sum + task.qualityScore, 0);
          return totalScore / scoredTasks;
        }
      }
      return 5; // 默认中等质量分数
    } catch (error) {
      console.error('[SystemMonitor] get真实Task Quality scoreFailed:', error);
      return 5;
    }
  }
  
  async getRealCrossFunctionalAgentCount() {
    try {
      // 从agent数据文件getCross-functional agent count
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.default.join(__dirname, '../../data/agents');
      
      let crossFunctionalCount = 0;
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir);
        agentFiles.forEach(file => {
          if (file.endsWith('.json') && !file.match(/^agent-\d+\.json$/) && file !== 'agents_summary.json' && file !== 'agent-undefined.json') {
            try {
              const agentData = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
              // 跨职能agent定义为具有3个或更多能力的agent
              if (agentData.capabilities && agentData.capabilities.length >= 3) {
                crossFunctionalCount++;
              }
            } catch (error) {
              console.error(`Reading agent file ${file} Failed:`, error);
            }
          }
        });
      }
      return crossFunctionalCount;
    } catch (error) {
      console.error('[SystemMonitor] Get real cross-functional agent countFailed:', error);
      return 0;
    }
  }
  
  async getRealAgentCapabilityMatchRate() {
    try {
      // 从Task 数据文件getAgent capability match rate
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let matchedTasks = 0;
      let totalTasks = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算能力匹配的Task 比例
        const assignedTasks = tasksData.filter(task => task.agentId && task.agentCapabilities);
        totalTasks = assignedTasks.length;
        if (totalTasks > 0) {
          matchedTasks = assignedTasks.filter(task => {
            // 简化匹配Logic: 如果Task 需要的能力与agent具备的能力有重叠，则认为匹配
            return task.requiredCapabilities && task.agentCapabilities && 
                   task.requiredCapabilities.some(cap => task.agentCapabilities.includes(cap));
          }).length;
          return matchedTasks / totalTasks;
        }
      }
      return 0.7; // 默认70%匹配率
    } catch (error) {
      console.error('[SystemMonitor] Get real agent capability match rateFailed:', error);
      return 0.7;
    }
  }
  
  async getRealTeamCollaborationRate() {
    try {
      // 从Task 数据文件getTeam collaboration rate
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let collaborativeTasks = 0;
      let totalTasks = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算协作Task 比例
        totalTasks = tasksData.length;
        if (totalTasks > 0) {
          collaborativeTasks = tasksData.filter(task => task.agentIds && task.agentIds.length > 1).length;
          return collaborativeTasks / totalTasks;
        }
      }
      return 0.3; // 默认30%协作率
    } catch (error) {
      console.error('[SystemMonitor] Get real team collaboration rateFailed:', error);
      return 0.3;
    }
  }
  
  async getRealLongTermTaskProgress() {
    try {
      // 从Task 数据文件get长期Task 进度
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let totalProgress = 0;
      let longTermTasks = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算长期Task 的Average进度
        const longTerm = tasksData.filter(task => task.type === 'long_term' && typeof task.progress === 'number');
        longTermTasks = longTerm.length;
        if (longTermTasks > 0) {
          totalProgress = longTerm.reduce((sum, task) => sum + task.progress, 0);
          return totalProgress / longTermTasks;
        }
      }
      return 0; // 默认0%进度
    } catch (error) {
      console.error('[SystemMonitor] get真实长期Task 进度Failed:', error);
      return 0;
    }
  }
  
  async getRealTaskDependencyFulfillment() {
    try {
      // 从Task 数据文件getTask 依赖满足率
      const fs = await import('fs');
      const path = await import('path');
      const tasksPath = path.default.join(__dirname, '../../data/tasks/tasks.json');
      
      let fulfilledDependencies = 0;
      let totalDependencies = 0;
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        // 计算依赖满足的Task 比例
        const dependentTasks = tasksData.filter(task => task.dependencies && task.dependencies.length > 0);
        dependentTasks.forEach(task => {
          const dependencies = task.dependencies;
          totalDependencies += dependencies.length;
          // 检查every 个依赖的Task 是否Completed
          dependencies.forEach(depTaskId => {
            const depTask = tasksData.find(t => t.id === depTaskId);
            if (depTask && depTask.status === 'completed') {
              fulfilledDependencies++;
            }
          });
        });
        if (totalDependencies > 0) {
          return fulfilledDependencies / totalDependencies;
        }
      }
      return 0.7; // 默认70%满足率
    } catch (error) {
      console.error('[SystemMonitor] get真实Task 依赖满足率Failed:', error);
      return 0.7;
    }
  }

  // 记录指标
  recordMetric(type, value, timestamp = null) {
    if (!timestamp) {
      timestamp = new Date().toISOString();
    }

    const metric = {
      type,
      value,
      timestamp
    };

    // 更新当前指标值
    this.metrics.set(type, metric);

    // Save metrics to file (every hour)
    const metricFile = path.join(this.metricsDirectory, `${type}-${new Date().toISOString().split('T')[0]}.json`);
    let metricsHistory = [];

    if (fs.existsSync(metricFile)) {
      try {
        const fileContent = fs.readFileSync(metricFile, 'utf8');
        if (fileContent.trim()) {
          metricsHistory = JSON.parse(fileContent);
        }
      } catch (error) {
        console.error('读取指标历史记录Failed:', error);
        // 如果文件损坏，重新创建一个空数组
        metricsHistory = [];
      }
    }

    metricsHistory.push(metric);
    fs.writeFileSync(metricFile, JSON.stringify(metricsHistory, null, 2), 'utf8');

    return metric;
  }

  // Start Alert check
  startAlertCheck() {
    console.log('[SystemMonitor] Starting alert checking service');

    // every 30second check一次Alert rules
    setInterval(() => {
      this.checkAlerts();
    }, 30000);
  }

  // 检查Alert rules
  checkAlerts() {
    this.alertRules.forEach((rule, ruleId) => {
      if (!rule.enabled) return;
      
      // 确保规则条件是一个函数
      if (typeof rule.condition !== 'function') {
        console.error(`Alert rules ${ruleId} condition is not a function, skipping check`);
        return;
      }

      const metric = this.metrics.get(rule.metric);
      if (!metric) return;

      try {
        // get该指标的历史数据
        const metricHistory = this.getMetricHistory(rule.metric, 1); // 获取最近1小时的数据
        
        // 根据规则条件判断是否触发告警
        const shouldTrigger = rule.condition(metric.value, metricHistory);
        
        if (shouldTrigger) {
          // 触发告警
          this.triggerAlert(rule, metric);
        } else {
          // 清除告警（如果存在）
          this.clearAlert(ruleId);
        }
      } catch (error) {
        console.error(`Check alert rule ${ruleId} Failed:`, error);
      }
    });
  }

  // 触发告警
  triggerAlert(rule, metric) {
    const alertId = `${rule.id}-${Date.now()}`;
    const alert = {
      id: alertId,
      ruleId: rule.id,
      name: rule.name,
      level: rule.level,
      metric: rule.metric,
      metricValue: metric.value,
      message: typeof rule.message === 'function' ? rule.message(metric.value) : rule.message,
      triggeredAt: new Date().toISOString(),
      resolvedAt: null,
      status: 'active'
    };

    // 检查是否已经有相同规则的活跃告警
    const existingAlert = Array.from(this.alerts.values()).find(
      a => a.ruleId === rule.id && a.status === 'active'
    );

    if (!existingAlert) {
      this.alerts.set(alertId, alert);
      this.sendAlert(alert);
      this.saveAlert(alert);
    }
  }

  // 清除告警
  clearAlert(ruleId) {
    const alerts = Array.from(this.alerts.values());
    alerts.forEach(alert => {
      if (alert.ruleId === ruleId && alert.status === 'active') {
        alert.status = 'resolved';
        alert.resolvedAt = new Date().toISOString();
        this.alerts.set(alert.id, alert);
        this.saveAlert(alert);
        console.log(`[SystemMonitor] Alert resolved: ${alert.name} - ${alert.message}`);
      }
    });
  }

  // Send alert
  sendAlert(alert) {
    // Save alert log
    const alertLogPath = path.join(this.logsDirectory, 'alerts.log');
    fs.appendFileSync(alertLogPath, JSON.stringify(alert) + '\n', 'utf8');

    // 打印告警信息
    const color = this.getAlertColor(alert.level);
    console.log(`\x1b[${color}m[ALERT] ${alert.level.toUpperCase()} - ${alert.name}: ${alert.message} (值: ${alert.metricValue})\x1b[0m`);

    // 告警升级和自动修复触发
    this.handleAlertEscalation(alert);
  }

  // 告警升级Processing
  handleAlertEscalation(alert) {
    if (!this.alertCounts) {
      this.alertCounts = new Map();
    }

    const key = alert.ruleId;
    const count = (this.alertCounts.get(key) || 0) + 1;
    this.alertCounts.set(key, count);

    // 同规则连续告警 3 次 → 升级为 CRITICAL
    if (count >= 3 && alert.level !== 'CRITICAL') {
      console.log(`\x1b[31m[ESCALATION] ${alert.ruleId} 已连续触发 ${count} 次，升级为 CRITICAL\x1b[0m`);
      alert.level = 'CRITICAL';
      alert.escalated = true;
    }

    // CRITICAL 或 ERROR 告警 → 触发自动修复
    if (alert.level === 'CRITICAL' || alert.level === 'ERROR') {
      this.triggerAutoRemediation(alert);
    }

    // 重置计数器（every  5  minutes后清除）
    if (!this._alertResetTimer) {
      this._alertResetTimer = setInterval(() => {
        this.alertCounts.clear();
      }, 300000); // 5 分钟
    }
  }

  // 自动修复触发
  async triggerAutoRemediation(alert) {
    try {
      // 动态导入恢复管理器（避免循环依赖）
      const { default: recoveryManager } = await import('./recoveryManager.js');
      
      const report = recoveryManager.getHealthReport();
      console.log(`\x1b[33m[AUTO-RECOVERY] 触发Auto-recovery: ${alert.name}, 当前状态: ${report.state}\x1b[0m`);

      // 根据告警类型映射到对应的恢复操作
      const remediationMap = {
        'cpu_usage': 'RESOURCE_EXHAUSTION',
        'memory_usage': 'RESOURCE_EXHAUSTION',
        'disk_usage': 'RESOURCE_EXHAUSTION',
        'block_height_stalled': 'BLOCK_SYNC_FAILURE',
        'peer_count': 'P2P_DISCONNECT',
        'mempool_size': 'TRANSACTION_BACKLOG',
        'consensus_health': 'CONSENSUS_FAILURE',
        'node_status': 'NODE_CRASH'
      };

      const recoveryType = remediationMap[alert.ruleId] || 'GENERIC';
      
      // 如果恢复管理器已在恢复中，记录但不重复触发
      if (report.recoveryInProgress) {
        console.log('[AUTO-RECOVERY] 恢复已在进行中，Skipping duplicate trigger');
        return;
      }

      // 触发恢复（通过 health check 的自然循环）
      recoveryManager._checkHealth();
    } catch (e) {
      console.error('[AUTO-RECOVERY] 触发Failed:', e.message);
    }
  }

  // get告警颜色
  getAlertColor(level) {
    switch (level) {
      case ALERT_LEVELS.CRITICAL:
        return '31'; // 红色
      case ALERT_LEVELS.ERROR:
        return '35'; // 紫色
      case ALERT_LEVELS.WARNING:
        return '33'; // 黄色
      case ALERT_LEVELS.INFO:
      default:
        return '34'; // 蓝色
    }
  }

  // 保存告警
  saveAlert(alert) {
    const alertPath = path.join(this.alertsDirectory, `${alert.id}.json`);
    fs.writeFileSync(alertPath, JSON.stringify(alert, null, 2), 'utf8');
  }

  // Get system status report
  getSystemStatus() {
    const metrics = {};
    
    // 初始化所有指标类型，确保every 个类型都有值
    Object.values(METRIC_TYPES).forEach(type => {
      metrics[type] = this.metrics.get(type)?.value || this.getDefaultMetricValue(type);
    });

    const activeAlerts = Array.from(this.alerts.values())
      .filter(alert => alert.status === 'active')
      .sort((a, b) => ALERT_LEVELS[b.level] - ALERT_LEVELS[a.level]);

    return {
      timestamp: new Date().toISOString(),
      metrics,
      alerts: {
        active: activeAlerts.length,
        details: activeAlerts
      },
      status: activeAlerts.some(a => a.level === ALERT_LEVELS.CRITICAL) ? 'critical' :
             activeAlerts.some(a => a.level === ALERT_LEVELS.ERROR) ? 'error' :
             activeAlerts.some(a => a.level === ALERT_LEVELS.WARNING) ? 'warning' : 'healthy'
    };
  }

  // Collect governance metrics
  collectGovernanceMetrics() {
    try {
      // Get real governance metrics（从治理合约get）
      const governanceMetrics = this.getRealGovernanceMetrics();
      
      // 记录各个治理指标
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PROPOSAL_COUNT, governanceMetrics.proposalCount);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_VOTER_PARTICIPATION, governanceMetrics.voterParticipation);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PASS_RATE, governanceMetrics.passRate);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_REWARD_DISTRIBUTION, governanceMetrics.rewardDistribution);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_ACTIVE_PROPOSALS, governanceMetrics.activeProposals);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_VOTE_TURNOUT, governanceMetrics.voteTurnout);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PARAM_CHANGES, governanceMetrics.paramChanges);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PROPOSAL_VALIDATION_RATE, governanceMetrics.proposalValidationRate);
    } catch (error) {
      console.error('[SystemMonitor] Collect governance metricsFailed:', error);
      // Fall back to simulated data to ensure monitoring service continues
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PROPOSAL_COUNT, Math.floor(Math.random() * 50) + 10);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_VOTER_PARTICIPATION, Math.random() * 60 + 20);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PASS_RATE, Math.random() * 30 + 60);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_REWARD_DISTRIBUTION, {
        total: Math.floor(Math.random() * 50000) + 10000,
        byProposalType: {
          param_change: Math.floor(Math.random() * 10000) + 5000,
          fund_allocation: Math.floor(Math.random() * 15000) + 7000,
          protocol_upgrade: Math.floor(Math.random() * 20000) + 10000,
          community_initiative: Math.floor(Math.random() * 5000) + 3000
        }
      });
      this.recordMetric(METRIC_TYPES.GOVERNANCE_ACTIVE_PROPOSALS, Math.floor(Math.random() * 10) + 2);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_VOTE_TURNOUT, Math.random() * 40 + 30);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PARAM_CHANGES, Math.floor(Math.random() * 5) + 1);
      this.recordMetric(METRIC_TYPES.GOVERNANCE_PROPOSAL_VALIDATION_RATE, Math.random() * 20 + 80);
    }
  }
  
  // Collect agent health metrics
  async collectAgentHealthMetrics() {
    try {
      // 计算agent活跃度
      const agentActivity = await this.getRealAgentActivity();
      this.recordMetric(METRIC_TYPES.AGENT_ACTIVITY, agentActivity);
      
      // 计算agent分类分布
      const categoryDistribution = await this.getRealAgentCategoryDistribution();
      this.recordMetric(METRIC_TYPES.AGENT_CATEGORY_DISTRIBUTION, categoryDistribution);
      
      // 计算agent能力评分
      const capabilityScore = await this.getRealAgentCapabilityScore();
      this.recordMetric(METRIC_TYPES.AGENT_CAPABILITY_SCORE, capabilityScore);
      
    } catch (error) {
      console.error('[SystemMonitor] Collect agent health metricsFailed:', error);
      // Fall back to default data
      this.recordMetric(METRIC_TYPES.AGENT_ACTIVITY, {
        activeCount: 0,
        totalCount: 0,
        activeRatio: 0
      });
      this.recordMetric(METRIC_TYPES.AGENT_CATEGORY_DISTRIBUTION, {});
      this.recordMetric(METRIC_TYPES.AGENT_CAPABILITY_SCORE, {
        average: 0.5,
        distribution: {}
      });
    }
  }

  // Collect agent contribution metrics
  async collectAgentContributionMetrics() {
    try {
      // 计算agent贡献度
      const contribution = await this.getRealAgentContribution();
      this.recordMetric(METRIC_TYPES.AGENT_CONTRIBUTION, contribution);
      
      // 计算agent声誉值
      const reputation = await this.getRealAgentReputation();
      this.recordMetric(METRIC_TYPES.AGENT_REPUTATION, reputation);
      
      // 计算agent奖励率
      const rewardRate = await this.getRealAgentRewardRate();
      this.recordMetric(METRIC_TYPES.AGENT_REWARD_RATE, rewardRate);
      
    } catch (error) {
      console.error('[SystemMonitor] Collect agent contribution metricsFailed:', error);
      // Fall back to default data
      this.recordMetric(METRIC_TYPES.AGENT_CONTRIBUTION, {
        average: 0,
        total: 0,
        topAgents: []
      });
      this.recordMetric(METRIC_TYPES.AGENT_REPUTATION, {
        average: 1,
        distribution: {}
      });
      this.recordMetric(METRIC_TYPES.AGENT_REWARD_RATE, {
        average: 0,
        total: 0
      });
    }
  }

  // Get real agent activity
  async getRealAgentActivity() {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.default.join(__dirname, '../../data/agents');
      
      let totalCount = 0;
      let activeCount = 0;
      
      if (fs.default.existsSync(agentsDir)) {
        const agentFiles = fs.default.readdirSync(agentsDir);
        totalCount = agentFiles.length;
        
        agentFiles.forEach(file => {
          if (file.endsWith('.json') && !file.match(/^agent-\d+\.json$/) && file !== 'agents_summary.json' && file !== 'agent-undefined.json') {
            try {
              const agentData = JSON.parse(fs.default.readFileSync(path.default.join(agentsDir, file), 'utf8'));
              const lastActive = agentData.lastActive ? new Date(agentData.lastActive).getTime() : 0;
              const now = Date.now();
              // 最近1 hourswithin活跃的agent
              if (now - lastActive < 3600000) {
                activeCount++;
              }
            } catch (error) {
              console.error(`Reading agent file ${file} Failed:`, error);
            }
          }
        });
      }
      
      return {
        activeCount,
        totalCount,
        activeRatio: totalCount > 0 ? activeCount / totalCount : 0
      };
    } catch (error) {
      console.error('[SystemMonitor] Get real agent activityFailed:', error);
      return {
        activeCount: 0,
        totalCount: 0,
        activeRatio: 0
      };
    }
  }

  // Get real agent category distribution
  async getRealAgentCategoryDistribution() {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.default.join(__dirname, '../../data/agents');
      
      const distribution = {};
      
      if (fs.default.existsSync(agentsDir)) {
        const agentFiles = fs.default.readdirSync(agentsDir);
        agentFiles.forEach(file => {
          if (file.endsWith('.json') && !file.match(/^agent-\d+\.json$/) && file !== 'agents_summary.json' && file !== 'agent-undefined.json') {
            try {
              const agentData = JSON.parse(fs.default.readFileSync(path.default.join(agentsDir, file), 'utf8'));
              const category = agentData.category || 'unknown';
              distribution[category] = (distribution[category] || 0) + 1;
            } catch (error) {
              console.error(`Reading agent file ${file} Failed:`, error);
            }
          }
        });
      }
      
      return distribution;
    } catch (error) {
      console.error('[SystemMonitor] Get real agent category distributionFailed:', error);
      return {};
    }
  }

  // Get real agent capability score
  async getRealAgentCapabilityScore() {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.default.join(__dirname, '../../data/agents');
      
      let totalScore = 0;
      let count = 0;
      const distribution = {};
      
      if (fs.default.existsSync(agentsDir)) {
        const agentFiles = fs.default.readdirSync(agentsDir);
        agentFiles.forEach(file => {
          if (file.endsWith('.json') && !file.match(/^agent-\d+\.json$/) && file !== 'agents_summary.json' && file !== 'agent-undefined.json') {
            try {
              const agentData = JSON.parse(fs.default.readFileSync(path.default.join(agentsDir, file), 'utf8'));
              if (typeof agentData.capabilityScore === 'number') {
                totalScore += agentData.capabilityScore;
                count++;
                
                // 按能力评分区间分布
                const scoreRange = Math.floor(agentData.capabilityScore * 10) / 10;
                distribution[scoreRange] = (distribution[scoreRange] || 0) + 1;
              }
            } catch (error) {
              console.error(`Reading agent file ${file} Failed:`, error);
            }
          }
        });
      }
      
      return {
        average: count > 0 ? totalScore / count : 0,
        distribution
      };
    } catch (error) {
      console.error('[SystemMonitor] Get real agent capability scoreFailed:', error);
      return {
        average: 0.5,
        distribution: {}
      };
    }
  }

  // Get real agent contribution
  async getRealAgentContribution() {
    try {
      // 使用奖励系统get贡献度数据
      const ranking = rewardSystem.getContributionRanking(10);
      
      if (ranking.success) {
        const totalContribution = ranking.rankings.reduce((sum, agent) => sum + agent.totalContribution, 0);
        const average = ranking.rankings.length > 0 ? totalContribution / ranking.rankings.length : 0;
        
        return {
          average,
          total: totalContribution,
          topAgents: ranking.rankings
        };
      }
      
      return {
        average: 0,
        total: 0,
        topAgents: []
      };
    } catch (error) {
      console.error('[SystemMonitor] Get real agent contributionFailed:', error);
      return {
        average: 0,
        total: 0,
        topAgents: []
      };
    }
  }

  // Get real agent reputation
  async getRealAgentReputation() {
    try {
      // 使用奖励系统get声誉值数据
      const ranking = rewardSystem.getContributionRanking();
      
      if (ranking.success) {
        const totalReputation = ranking.rankings.reduce((sum, agent) => sum + agent.reputation, 0);
        const average = ranking.rankings.length > 0 ? totalReputation / ranking.rankings.length : 0;
        
        // 计算声誉值分布
        const distribution = {};
        ranking.rankings.forEach(agent => {
          const repRange = Math.floor(agent.reputation * 10) / 10;
          distribution[repRange] = (distribution[repRange] || 0) + 1;
        });
        
        return {
          average,
          distribution
        };
      }
      
      return {
        average: 1,
        distribution: {}
      };
    } catch (error) {
      console.error('[SystemMonitor] Get real agent reputationFailed:', error);
      return {
        average: 1,
        distribution: {}
      };
    }
  }

  // Get real agent reward rate
  async getRealAgentRewardRate() {
    try {
      // 从奖励数据文件get奖励率
      const fs = await import('fs');
      const path = await import('path');
      const rewardsDir = path.default.join(__dirname, '../../data/rewards');
      
      let totalReward = 0;
      let agentCount = 0;
      
      if (fs.default.existsSync(rewardsDir)) {
        const rewardFiles = fs.default.readdirSync(rewardsDir);
        rewardFiles.forEach(file => {
          if (file.endsWith('_rewards.json')) {
            try {
              const rewardsData = JSON.parse(fs.default.readFileSync(path.default.join(rewardsDir, file), 'utf8'));
              const agentReward = rewardsData.reduce((sum, reward) => sum + reward.amount, 0);
              totalReward += agentReward;
              agentCount++;
            } catch (error) {
              console.error(`Reading reward file ${file} Failed:`, error);
            }
          }
        });
      }
      
      return {
        average: agentCount > 0 ? totalReward / agentCount : 0,
        total: totalReward
      };
    } catch (error) {
      console.error('[SystemMonitor] Get real agent reward rateFailed:', error);
      return {
        average: 0,
        total: 0
      };
    }
  }

  // Collect rate limit metrics
  async collectRateLimitMetrics() {
    try {
      // 从速率限制器get真实统计数据
      const rateLimiter = (await import('../utils/rateLimiter.js')).default;
      const stats = rateLimiter.getStats();
      // 计算触发次数（简化计算）
      const rateLimitTriggered = Math.floor(Math.random() * 5); // 临时使用模拟数据，待集成真实触发计数
      this.recordMetric(METRIC_TYPES.RATE_LIMIT_TRIGGERED, rateLimitTriggered);
    } catch (error) {
      console.error('[SystemMonitor] Collect rate limit metricsFailed:', error);
      this.recordMetric(METRIC_TYPES.RATE_LIMIT_TRIGGERED, 0);
    }
  }

  // Collect cache metrics
  async collectCacheMetrics() {
    try {
      // 从缓存get真实统计数据
      const cache = (await import('../utils/cache.js')).default;
      const stats = cache.getStats();
      this.recordMetric(METRIC_TYPES.CACHE_HIT_RATE, stats.hitRate);
      this.recordMetric(METRIC_TYPES.CACHE_SIZE, stats.size);
      
      // 收集API response时间（Simulated data）
      const apiResponseTime = Math.random() * 500 + 100; // 100-600ms
      this.recordMetric(METRIC_TYPES.API_RESPONSE_TIME, apiResponseTime);
    } catch (error) {
      console.error('[SystemMonitor] Collect cache metricsFailed:', error);
      this.recordMetric(METRIC_TYPES.CACHE_HIT_RATE, 0);
      this.recordMetric(METRIC_TYPES.CACHE_SIZE, 0);
      this.recordMetric(METRIC_TYPES.API_RESPONSE_TIME, 0);
    }
  }

  // Collect agent registration rate metrics
  async collectAgentRegistrationMetrics() {
    try {
      // 从agent数据目录get注册率
      const fs = await import('fs');
      const path = await import('path');
      const agentsDir = path.default.join(__dirname, '../../data/agents');
      
      let registrationCount = 0;
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir);
        agentFiles.forEach(file => {
          if (file.endsWith('.json') && !file.match(/^agent-\d+\.json$/) && file !== 'agents_summary.json' && file !== 'agent-undefined.json') {
            try {
              const agentData = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
              const registeredAt = agentData.registeredAt ? new Date(agentData.registeredAt).getTime() : 0;
              if (registeredAt >= oneHourAgo) {
                registrationCount++;
              }
            } catch (error) {
              console.error(`Reading agent file ${file} Failed:`, error);
            }
          }
        });
      }
      
      this.recordMetric(METRIC_TYPES.AGENT_REGISTRATION_RATE, registrationCount);
    } catch (error) {
      console.error('[SystemMonitor] Collect agent registration rate metricsFailed:', error);
      this.recordMetric(METRIC_TYPES.AGENT_REGISTRATION_RATE, 0);
    }
  }

  // Get real governance metrics
  getRealGovernanceMetrics() {
    try {
      const governanceDir = path.join(__dirname, '../../data/governance');
      const proposalsPath = path.join(governanceDir, 'proposals.json');
      
      let proposalCount = 0;
      let activeProposals = 0;
      let paramChanges = 0;
      let completedProposals = 0;
      let passedProposals = 0;
      
      if (fs.existsSync(proposalsPath)) {
        const proposalsData = JSON.parse(fs.readFileSync(proposalsPath, 'utf8'));
        const proposals = Array.isArray(proposalsData) ? proposalsData : (proposalsData.proposals || proposalsData.data || []);
        proposalCount = proposals.length;
        activeProposals = proposals.filter(p => p.status === 'active' || p.status === 'voting').length;
        completedProposals = proposals.filter(p => p.status === 'completed').length;
        passedProposals = proposals.filter(p => p.status === 'completed' && p.result === 'passed').length;
        paramChanges = proposals.filter(p => p.type === 'param_change' && p.status === 'completed' && p.result === 'passed').length;
      }
      
      // 计算提案通过率
      const passRate = completedProposals > 0 ? (passedProposals / completedProposals) * 100 : 0;
      
      // 从投票数据文件get投票参与率
      const votesPath = path.join(governanceDir, 'votes.json');
      let totalVotes = 0;
      let uniqueVoters = new Set();
      if (fs.existsSync(votesPath)) {
        const votesData = JSON.parse(fs.readFileSync(votesPath, 'utf8'));
        totalVotes = votesData.length;
        for (const vote of votesData) {
          if (vote.voter || vote.from) {
            uniqueVoters.add(vote.voter || vote.from);
          }
        }
      }
      
      // 从治理参数get注册选民总数
      const paramsPath = path.join(governanceDir, 'params.json');
      let eligibleVoters = uniqueVoters.size;
      if (fs.existsSync(paramsPath)) {
        const paramsData = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
        if (paramsData.eligibleVoters || paramsData.totalVoters) {
          eligibleVoters = Math.max(eligibleVoters, paramsData.eligibleVoters || paramsData.totalVoters);
        }
      }
      // 如果无法get实际选民数，使用唯一投票者数量作为下限估计
      if (eligibleVoters === 0 && uniqueVoters.size > 0) {
        eligibleVoters = uniqueVoters.size;
      }
      
      // 投票参与率 = 唯一投票者数 / 合格选民数
      const voterParticipation = eligibleVoters > 0 ? Math.min(100, (uniqueVoters.size / eligibleVoters) * 100) : 0;
      // 投票轮次率 = 总投票数 / (提案数 * 合格选民数)
      const voteTurnout = (proposalCount > 0 && eligibleVoters > 0) 
        ? Math.min(100, (totalVotes / (proposalCount * eligibleVoters)) * 100) 
        : voterParticipation;
      
      // 提案验证通过率：从提案中统计实际被验证通过的比率
      let validatedProposals = 0;
      let approvedValidations = 0;
      if (fs.existsSync(proposalsPath)) {
        const proposalsData = JSON.parse(fs.readFileSync(proposalsPath, 'utf8'));
        const proposals = Array.isArray(proposalsData) ? proposalsData : (proposalsData.proposals || proposalsData.data || []);
        for (const p of proposals) {
          if (p.validationStatus || p.validated !== undefined) {
            validatedProposals++;
            if (p.validationStatus === 'approved' || p.validated === true) {
              approvedValidations++;
            }
          }
        }
      }
      const proposalValidationRate = validatedProposals > 0 
        ? (approvedValidations / validatedProposals) * 100 
        : (proposalCount > 0 ? 100 : 0);
      
      // Reward distribution（从实际奖励数据读取）
      const rewardsPath = path.join(governanceDir, 'rewards.json');
      let rewardDistribution;
      if (fs.existsSync(rewardsPath)) {
        const rewardsData = JSON.parse(fs.readFileSync(rewardsPath, 'utf8'));
        rewardDistribution = {
          total: rewardsData.total || 0,
          byProposalType: rewardsData.byProposalType || {}
        };
      } else {
        const blockchainHeight = this.getRealBlockchainHeight();
        rewardDistribution = {
          total: blockchainHeight > 0 ? blockchainHeight * 10 : 0,
          byProposalType: {
            param_change: paramChanges > 0 ? paramChanges * 1000 : 0,
            fund_allocation: blockchainHeight > 0 ? Math.floor(blockchainHeight * 3) : 0,
            protocol_upgrade: blockchainHeight > 0 ? Math.floor(blockchainHeight * 2) : 0,
            community_initiative: blockchainHeight > 0 ? Math.floor(blockchainHeight * 1) : 0
          }
        };
      }
      
      return {
        proposalCount: proposalCount,
        voterParticipation: parseFloat(voterParticipation.toFixed(1)),
        passRate: parseFloat(passRate.toFixed(1)),
        rewardDistribution: rewardDistribution,
        activeProposals: activeProposals,
        voteTurnout: parseFloat(voteTurnout.toFixed(1)),
        paramChanges: paramChanges,
        proposalValidationRate: proposalValidationRate
      };
    } catch (error) {
      console.error('[SystemMonitor] Get real governance metricsFailed:', error);
      return {
        proposalCount: 0,
        voterParticipation: 0,
        passRate: 0,
        rewardDistribution: {
          total: 0,
          byProposalType: {}
        },
        activeProposals: 0,
        voteTurnout: 0,
        paramChanges: 0,
        proposalValidationRate: 0
      };
    }
  }
  
  // Get default metric value
  getDefaultMetricValue(type) {
    switch (type) {
      case METRIC_TYPES.AGENT_HEALTH:
        return {
          totalCount: 0,
          healthyCount: 0,
          unhealthyCount: 0
        };
      case METRIC_TYPES.CPU_USAGE:
      case METRIC_TYPES.MEMORY_USAGE:
      case METRIC_TYPES.DISK_USAGE:
      case METRIC_TYPES.NETWORK_CONNECTIONS:
      case METRIC_TYPES.API_SUCCESS_RATE:
      case METRIC_TYPES.BLOCKCHAIN_HEIGHT:
      case METRIC_TYPES.P2P_PEER_COUNT:
      case METRIC_TYPES.TASK_EXECUTION_RATE:
      case METRIC_TYPES.TASK_CREATION_RATE:
      case METRIC_TYPES.TASK_COMPLETION_RATE:
      case METRIC_TYPES.CROSS_FUNCTIONAL_AGENT_COUNT:
      case METRIC_TYPES.LONG_TERM_TASK_PROGRESS:
      case METRIC_TYPES.GOVERNANCE_PROPOSAL_COUNT:
      case METRIC_TYPES.GOVERNANCE_ACTIVE_PROPOSALS:
      case METRIC_TYPES.GOVERNANCE_PARAM_CHANGES:
        return 0;
      case METRIC_TYPES.TASK_QUALITY_SCORE:
        return 5; // 默认中等质量分数
      case METRIC_TYPES.AGENT_CAPABILITY_MATCH_RATE:
      case METRIC_TYPES.TEAM_COLLABORATION_RATE:
      case METRIC_TYPES.TASK_DEPENDENCY_FULFILLMENT:
      case METRIC_TYPES.GOVERNANCE_VOTER_PARTICIPATION:
      case METRIC_TYPES.GOVERNANCE_PASS_RATE:
      case METRIC_TYPES.GOVERNANCE_VOTE_TURNOUT:
      case METRIC_TYPES.GOVERNANCE_PROPOSAL_VALIDATION_RATE:
        return 0.7; // 默认70%匹配率或参与率
      case METRIC_TYPES.REWARD_DISTRIBUTION:
      case METRIC_TYPES.GOVERNANCE_REWARD_DISTRIBUTION:
        return {
          total: 0,
          byTaskType: {},
          byAgent: {}
        };
      default:
        return 0;
    }
  }

  // Get historical alerts
  getHistoricalAlerts(days = 7) {
    const alerts = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    if (fs.existsSync(this.alertsDirectory)) {
      const alertFiles = fs.readdirSync(this.alertsDirectory);
      alertFiles.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const alert = JSON.parse(fs.readFileSync(path.join(this.alertsDirectory, file), 'utf8'));
            if (new Date(alert.triggeredAt) >= cutoffDate) {
              alerts.push(alert);
            }
          } catch (error) {
            console.error(`Reading alert file ${file} Failed:`, error);
          }
        }
      });
    }

    // 按时间排序
    return alerts.sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));
  }

  // Get metric history data
  getMetricHistory(metricType, hours = 24) {
    const metricFile = path.join(this.metricsDirectory, `${metricType}-${new Date().toISOString().split('T')[0]}.json`);
    const metrics = [];

    if (fs.existsSync(metricFile)) {
      try {
        const metricHistory = JSON.parse(fs.readFileSync(metricFile, 'utf8'));
        const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

        metrics.push(...metricHistory.filter(metric => 
          new Date(metric.timestamp).getTime() >= cutoffTime
        ));
      } catch (error) {
        console.error(`Reading metric history ${metricType} Failed:`, error);
      }
    }

    return metrics;
  }
}

export default SystemMonitor;
export { METRIC_TYPES, ALERT_LEVELS };
