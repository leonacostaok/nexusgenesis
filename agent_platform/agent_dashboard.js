/**
 * Agent Management Dashboard
 * Monitor and manage the status and capabilities of all agents
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
   * Initialize agent dashboard
   */
  async initialize() {
    try {
      await this.loadAgentsData();
      console.log('[AGENT DASHBOARD] Agent dashboard initialized');
      console.log(`[AGENT DASHBOARD] Loaded ${this.agents.length} agents`);
    } catch (error) {
      console.error('[AGENT DASHBOARD] Initialization failed:', error.message);
    }
  }

  /**
   * Load agent data
   */
  async loadAgentsData() {
    try {
      const data = await fs.readFile(this.agentsDataPath, 'utf8');
      const agentsSummary = JSON.parse(data);
      this.agents = agentsSummary.agents;
      this.lastUpdateTime = new Date();
      console.log('[AGENT DASHBOARD] Agent data loaded');
    } catch (error) {
      console.error('[AGENT DASHBOARD] Failed to load agent data:', error.message);
      this.agents = [];
    }
  }

  /**
   * Get total agent count
   */
  getTotalAgents() {
    return this.agents.length;
  }

  /**
   * Get agent statistics
   */
  getAgentStats() {
    const stats = {
      total: this.agents.length,
      capabilities: {},
      types: {}
    };

    // Capability distribution
    this.agents.forEach(agent => {
      agent.capabilities.forEach(capability => {
        if (!stats.capabilities[capability]) {
          stats.capabilities[capability] = 0;
        }
        stats.capabilities[capability]++;
      });

      // Type distribution
      const agentType = agent.metadata.type;
      if (!stats.types[agentType]) {
        stats.types[agentType] = 0;
      }
      stats.types[agentType]++;
    });

    return stats;
  }

  /**
   * Get agent list
   */
  getAgents() {
    return this.agents;
  }

  /**
   * Filter agents by capability
   */
  getAgentsByCapability(capability) {
    return this.agents.filter(agent => 
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Get agent details
   */
  getAgentById(agentId) {
    return this.agents.find(agent => agent.agentId === agentId);
  }

  /**
   * Check agent health status
   */
  checkAgentHealth() {
    // Agent health check logic
    // e.g. heartbeat check, response time, etc.
    return this.agents.map(agent => ({
      agentId: agent.agentId,
      address: agent.address,
      status: 'online', // Simulated status
      lastActive: new Date().toISOString()
    }));
  }

  /**
   * Update agent data
   */
  async updateAgentsData() {
    await this.loadAgentsData();
    console.log('[AGENT DASHBOARD] Agent data updated');
  }

  /**
   * Generate agent report
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
   * Export agent data
   */
  async exportAgentsData() {
    try {
      const report = this.generateReport();
      const exportPath = path.join('agent_platform', 'reports', 'agents_report.json');
      
      // Ensure report directory exists
      await fs.mkdir(path.join('agent_platform', 'reports'), { recursive: true });
      
      await fs.writeFile(exportPath, JSON.stringify(report, null, 2));
      console.log(`[AGENT DASHBOARD] Agent report exported to ${exportPath}`);
      return exportPath;
    } catch (error) {
      console.error('[AGENT DASHBOARD] Failed to export agent data:', error.message);
      return null;
    }
  }
}

// Export
export default AgentDashboard;
