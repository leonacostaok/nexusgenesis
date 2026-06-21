/**
 * NexusGenesis - Task API Routes
 *
 * RESTful endpoints for Agent task lifecycle:
 *   GET    /api/tasks              - List tasks (with filters)
 *   GET    /api/tasks/:id          - Get task by ID
 *   POST   /api/tasks              - Publish a new task
 *   POST   /api/tasks/:id/claim    - Claim a task
 *   POST   /api/tasks/:id/submit   - Submit task results
 *   POST   /api/tasks/:id/verify   - Verify a submission
 *   POST   /api/tasks/:id/cancel   - Cancel a task
 *   GET    /api/tasks/stats        - Task statistics
 *   GET    /api/tasks/match/:agentId - Match tasks for an agent
 */

import { getTaskProtocol, TASK_STATUS } from '../../protocol/taskProtocol.js';

/**
 * Resolve agent_identity to ng1 address.
 * Accepts either a direct ng1 address or an agent_identity string.
 */
function resolveAgentAddress(req) {
  const { agent, agent_identity, publisher, verifier } = req.body;
  const agentRef = agent_identity || agent || publisher || verifier;

  if (!agentRef) return null;

  // Already an ng1 address
  if (agentRef.startsWith('ng1')) return agentRef;

  // Resolve agent_identity → address via node's agent registry
  const node = req.app.locals.node;
  if (node && node.resolveRegisteredAgent) {
    const record = node.resolveRegisteredAgent(agentRef);
    if (record && record.address) return record.address;
  }

  // Fallback: return as-is (will fail at TaskProtocol validation)
  return agentRef;
}

export function setupTaskRoutes(app) {
  // GET /api/tasks — List tasks
  app.get('/api/tasks', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const filters = {};

      if (req.query.status) {
        filters.status = req.query.status;
      }
      if (req.query.publisher) {
        filters.publisher = req.query.publisher;
      }
      if (req.query.claimant) {
        filters.claimant = req.query.claimant;
      }
      if (req.query.capabilities) {
        filters.capabilities = req.query.capabilities.split(',');
      }
      if (req.query.minReward) {
        filters.minReward = req.query.minReward;
      }
      if (req.query.limit) {
        filters.limit = parseInt(req.query.limit) || 50;
      }
      if (req.query.offset) {
        filters.offset = parseInt(req.query.offset) || 0;
      }

      const result = protocol.query(filters);
      res.json({
        success: true,
        ...result
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/tasks/stats — Task statistics
  app.get('/api/tasks/stats', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const stats = protocol.getStats();
      res.json({ success: true, ...stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/tasks/match/:agentId — Match tasks for an agent
  app.get('/api/tasks/match/:agentId', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const capabilities = req.query.capabilities
        ? req.query.capabilities.split(',')
        : [];
      const matched = protocol.matchForAgent(capabilities);
      res.json({
        success: true,
        tasks: matched,
        total: matched.length
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/tasks/:id — Get single task
  app.get('/api/tasks/:id', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const task = protocol.get(req.params.id);
      if (!task) {
        return res.status(404).json({ success: false, error: 'Task not found' });
      }
      res.json({ success: true, task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/tasks — Publish a task
  app.post('/api/tasks', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const publisherAddress = resolveAgentAddress(req);
      const { title, description, requiredCapabilities, reward } = req.body;

      if (!publisherAddress) {
        return res.status(400).json({ success: false, error: 'publisher or agent_identity is required' });
      }

      const result = protocol.publish(publisherAddress, {
        title,
        description,
        requiredCapabilities,
        reward
      });

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.status(201).json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/tasks/:id/claim — Claim a task
  app.post('/api/tasks/:id/claim', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const agentAddress = resolveAgentAddress(req);

      if (!agentAddress) {
        return res.status(400).json({ success: false, error: 'agent or agent_identity is required' });
      }

      const result = protocol.claim(agentAddress, req.params.id);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/tasks/:id/submit — Submit task results
  app.post('/api/tasks/:id/submit', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const agentAddress = resolveAgentAddress(req);
      const { submission } = req.body;

      if (!agentAddress) {
        return res.status(400).json({ success: false, error: 'agent or agent_identity is required' });
      }
      if (!submission) {
        return res.status(400).json({ success: false, error: 'submission data is required' });
      }

      const result = protocol.submit(agentAddress, req.params.id, submission);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/tasks/:id/verify — Verify a submission
  app.post('/api/tasks/:id/verify', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const verifierAddress = resolveAgentAddress(req);
      const { approved, feedback } = req.body;

      if (!verifierAddress) {
        return res.status(400).json({ success: false, error: 'verifier or agent_identity is required' });
      }
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ success: false, error: 'approved (boolean) is required' });
      }

      const result = protocol.verify(verifierAddress, req.params.id, approved, feedback || '');

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/tasks/:id/cancel — Cancel a task
  app.post('/api/tasks/:id/cancel', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const publisherAddress = resolveAgentAddress(req);

      if (!publisherAddress) {
        return res.status(400).json({ success: false, error: 'publisher or agent_identity is required' });
      }

      const result = protocol.cancel(publisherAddress, req.params.id);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
}