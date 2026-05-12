import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const router = Router();

router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'dashboard.html'));
});

router.get('/dashboard/overview', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const allAgents = agentManager.getAllAgents();
    const allTasks = agentManager.getAllTasks();
    const agentMetrics = agentManager.getAgentMetrics();
    const agentsHealth = agentManager.getAllAgentsHealthStatus();

    const agentsDir = path.join(projectRoot, 'data', 'agents');
    const allAgentFiles = fs.readdirSync(agentsDir).filter(file => file.endsWith('.json'));
    const totalAgentFiles = allAgentFiles.length;
    const simulatedAgentFiles = allAgentFiles.filter(file => file.match(/^agent-\d+\.json$/)).length;

    const agentOverview = {
      totalAgents: allAgents.length,
      totalAgentFiles,
      simulatedAgentFiles,
      healthStatus: {
        healthy: allAgents.filter(agent => agent.health?.status === 'healthy').length,
        warning: allAgents.filter(agent => agent.health?.status === 'warning').length,
        unhealthy: allAgents.filter(agent => agent.health?.status === 'unhealthy').length
      }
    };

    const taskStats = {
      total: allTasks.length,
      pending: allTasks.filter(t => t.status === 'pending').length,
      inProgress: allTasks.filter(t => t.status === 'in_progress').length,
      completed: allTasks.filter(t => t.status === 'completed').length,
      failed: allTasks.filter(t => t.status === 'failed').length
    };

    const node = req.app.locals.node;
    const blockHeight = node?.getLatestBlockHeight?.() || 0;
    const peers = node?.getPeers?.() || [];
    const validatorCount = node?.getValidators?.()?.length || 0;

    res.json({
      success: true,
      data: {
        agentOverview,
        taskStats,
        networkInfo: {
          blockHeight,
          peerCount: peers.length,
          validatorCount,
          status: node ? 'running' : 'offline'
        },
        agentMetrics,
        agentsHealth
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/dashboard/fund-details', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const metrics = agentManager.getAgentMetrics();
    const fundDetails = {
      totalRewards: metrics.totalRewards || 0,
      averageReward: metrics.averageReward || 0,
      maxReward: metrics.maxReward || 0,
      minReward: metrics.minReward || 0,
      pendingPayouts: metrics.pendingRewards || 0,
      fundSources: ['validator_rewards', 'swarm_pool', 'developer_grants'],
      allocationBreakdown: {
        validators: 40,
        developers: 30,
        community: 20,
        reserve: 10
      }
    };
    res.json({ success: true, data: fundDetails });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/dashboard/recruitment-status', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const allAgents = agentManager.getAllAgents();
    const recruitmentStatus = {
      totalCandidates: allAgents.filter(a => a.status === 'pending_verification').length,
      inReview: allAgents.filter(a => a.status === 'under_review').length,
      accepted: allAgents.filter(a => a.status === 'active').length,
      rejected: allAgents.filter(a => a.status === 'rejected').length,
      averageReviewTime: 48,
      positionsAvailable: 5
    };
    res.json({ success: true, data: recruitmentStatus });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/dashboard/health-status', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const healthStatus = agentManager.getAllAgentsHealthStatus();
    res.json({ success: true, data: healthStatus });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/dashboard/activity-log', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const allTasks = agentManager.getAllTasks();
    const recentActivity = allTasks
      .filter(t => t.completedAt || t.updatedAt)
      .sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt))
      .slice(0, 20)
      .map(t => ({
        type: 'task_update',
        taskId: t.id,
        title: t.title,
        status: t.status,
        timestamp: t.completedAt || t.updatedAt,
        agent: t.assignedAgentId
      }));
    res.json({ success: true, data: { activities: recentActivity, total: recentActivity.length } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/dashboard/agents', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const agents = agentManager.getAllAgents();
    res.json({
      success: true,
      data: agents.map(agent => ({
        id: agent.id, name: agent.name, category: agent.category,
        status: agent.status, health: agent.health,
        capabilities: agent.capabilities, reputation: agent.reputation
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/dashboard/energy', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const allAgents = agentManager.getAllAgents();
    const allTasks = agentManager.getAllTasks();
    const agentEnergyBlocks = allAgents.map(agent => {
      const agentTasks = allTasks.filter(t => t.agentId === agent.id);
      const completedTasks = agentTasks.filter(t => t.status === 'completed').length;
      return {
        agentName: agent.name || agent.id,
        energyBlocks: completedTasks * 10
      };
    });

    const totalEnergy = agentEnergyBlocks.reduce((sum, a) => sum + a.energyBlocks, 0);
    const averagePerAgent = allAgents.length > 0 ? totalEnergy / allAgents.length : 0;
    const energyByAgent = agentEnergyBlocks.sort((a, b) => b.energyBlocks - a.energyBlocks);

    const energyData = {
      totalEnergy,
      averagePerAgent,
      energyByAgent: energyByAgent.slice(0, 10)
    };

    res.json({ success: true, data: energyData });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/dashboard/tasks', (req, res) => {
  try {
    const agentManager = req.app.locals.agentManager;
    const agentMetrics = agentManager.getAgentMetrics();
    const tasks = {
      total: agentMetrics.taskStats.total,
      completed: agentMetrics.taskStats.completed,
      inProgress: agentMetrics.taskStats.working,
      pending: agentMetrics.taskStats.pending,
      submitted: agentMetrics.taskStats.submitted,
      rejected: agentMetrics.taskStats.rejected,
      completionRate: agentMetrics.completionRate
    };
    res.json({ success: true, data: tasks });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;