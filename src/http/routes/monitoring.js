import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const router = Router();

router.get('/monitoring', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'monitoring.html'));
});

router.get('/api/v1/monitoring/overview', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../../automation/systemMonitor.js');
    const monitor = SystemMonitor.getInstance ? SystemMonitor.getInstance() : new SystemMonitor();
    const status = monitor.getSystemStatus ? monitor.getSystemStatus() : {
      cpu: { usage: 0 }, memory: { usagePercent: 0 }, disk: { usagePercent: 0 },
      uptime: process.uptime(), activeAlerts: 0
    };

    res.json({
      success: true,
      data: {
        cpu: status.cpu,
        memory: status.memory,
        disk: status.disk,
        network: status.network || { connections: 0, p2pPeers: 0 },
        uptime: status.uptime || process.uptime(),
        activeAlerts: status.activeAlerts || 0,
        nodeStatus: req.app.locals.node ? 'running' : 'offline'
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/v1/monitoring/metrics', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../../automation/systemMonitor.js');
    const monitor = SystemMonitor.getInstance ? SystemMonitor.getInstance() : new SystemMonitor();
    const metrics = monitor.getAllMetrics ? monitor.getAllMetrics() : {};

    res.json({ success: true, data: { metrics } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/v1/monitoring/alerts', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../../automation/systemMonitor.js');
    const monitor = SystemMonitor.getInstance ? SystemMonitor.getInstance() : new SystemMonitor();
    const alerts = monitor.getActiveAlerts ? monitor.getActiveAlerts() : [];

    res.json({ success: true, data: { alerts, count: alerts.length } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/v1/monitoring/governance', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../../automation/systemMonitor.js');
    const monitor = SystemMonitor.getInstance ? SystemMonitor.getInstance() : new SystemMonitor();
    const govMetrics = monitor.getGovernanceMetrics ? monitor.getGovernanceMetrics() : {
      proposalCount: 0, activeProposals: 0, voterParticipation: 0, passRate: 0
    };

    res.json({ success: true, data: govMetrics });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/api/v1/monitoring/contracts', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../../automation/systemMonitor.js');
    const monitor = SystemMonitor.getInstance ? SystemMonitor.getInstance() : new SystemMonitor();
    const contractMetrics = monitor.getContractMetrics ? monitor.getContractMetrics() : {
      totalDeployed: 0, activeContracts: 0, totalCalls: 0, avgGasUsed: 0
    };

    res.json({ success: true, data: contractMetrics });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;