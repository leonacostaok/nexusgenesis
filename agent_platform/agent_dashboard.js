/**
 * 智能体管理仪表盘
 * 用于监控和管理所有智能体的状态和能力
 */

import fs from 'fs/promises';
import path from 'path';

class AgentDashboard {
  constructor() {
    this.agentsDataPath = path.join('data', 'agents', 'agents_summary.json');
    this.agents = [];
    this.lastUpdateTime = null;
  }

  /**
   * 初始化智能体仪表盘
   */
  async initialize() {
    try {
      await this.loadAgentsData();
      console.log('[AGENT DASHBOARD] 智能体仪表盘初始化完成');
      console.log(`[AGENT DASHBOARD] 已加载 ${this.agents.length} 个智能体`);
    } catch (error) {
      console.error('[AGENT DASHBOARD] 初始化失败:', error.message);
    }
  }

  /**
   * 加载智能体数据
   */
  async loadAgentsData() {
    try {
      const data = await fs.readFile(this.agentsDataPath, 'utf8');
      const agentsSummary = JSON.parse(data);
      this.agents = agentsSummary.agents;
      this.lastUpdateTime = new Date();
      console.log('[AGENT DASHBOARD] 智能体数据加载完成');
    } catch (error) {
      console.error('[AGENT DASHBOARD] 加载智能体数据失败:', error.message);
      this.agents = [];
    }
  }

  /**
   * 获取智能体总数
   */
  getTotalAgents() {
    return this.agents.length;
  }

  /**
   * 获取智能体状态统计
   */
  getAgentStats() {
    const stats = {
      total: this.agents.length,
      capabilities: {},
      types: {}
    };

    // 统计能力分布
    this.agents.forEach(agent => {
      agent.capabilities.forEach(capability => {
        if (!stats.capabilities[capability]) {
          stats.capabilities[capability] = 0;
        }
        stats.capabilities[capability]++;
      });

      // 统计类型分布
      const agentType = agent.metadata.type;
      if (!stats.types[agentType]) {
        stats.types[agentType] = 0;
      }
      stats.types[agentType]++;
    });

    return stats;
  }

  /**
   * 获取智能体列表
   */
  getAgents() {
    return this.agents;
  }

  /**
   * 根据能力过滤智能体
   */
  getAgentsByCapability(capability) {
    return this.agents.filter(agent => 
      agent.capabilities.includes(capability)
    );
  }

  /**
   * 获取智能体详情
   */
  getAgentById(agentId) {
    return this.agents.find(agent => agent.agentId === agentId);
  }

  /**
   * 检查智能体健康状态
   */
  checkAgentHealth() {
    // 这里可以实现智能体健康状态检查逻辑
    // 例如检查心跳、响应时间等
    return this.agents.map(agent => ({
      agentId: agent.agentId,
      address: agent.address,
      status: 'online', // 模拟状态
      lastActive: new Date().toISOString()
    }));
  }

  /**
   * 更新智能体数据
   */
  async updateAgentsData() {
    await this.loadAgentsData();
    console.log('[AGENT DASHBOARD] 智能体数据已更新');
  }

  /**
   * 生成智能体报告
   */
  generateReport() {
    const stats = this.getAgentStats();
    const healthStatus = this.checkAgentHealth();

    return {
      timestamp: new Date().toISOString(),
      totalAgents: this.getTotalAgents(),
      stats,
      healthStatus,
      lastUpdate: this.lastUpdateTime
    };
  }

  /**
   * 导出智能体数据
   */
  async exportAgentsData() {
    try {
      const report = this.generateReport();
      const exportPath = path.join('agent_platform', 'reports', 'agents_report.json');
      
      // 确保报告目录存在
      await fs.mkdir(path.join('agent_platform', 'reports'), { recursive: true });
      
      await fs.writeFile(exportPath, JSON.stringify(report, null, 2));
      console.log(`[AGENT DASHBOARD] 智能体报告已导出到 ${exportPath}`);
      return exportPath;
    } catch (error) {
      console.error('[AGENT DASHBOARD] 导出智能体数据失败:', error.message);
      return null;
    }
  }
}

// 导出
export default AgentDashboard;
