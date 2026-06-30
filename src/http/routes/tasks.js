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
 *
 * SECURITY: All write operations (publish/claim/submit/verify/cancel) require
 * PQC signature verification. Admin-secret is accepted as devnet fallback.
 */

import { getTaskProtocol, TASK_STATUS } from '../../protocol/taskProtocol.js';
import PQCWallet from '../../wallet/pqcWallet.js';

const RESERVED_PREFIXES = [
  'ng1swarmpool', 'ng1escrow', 'ng1staking', 'ng1burn', 'ng1treasury'
];

function verifyAdminSecret(req) {
  const provided = req.headers['x-admin-secret'] || req.body?.admin_secret || req.body?.adminSecret;
  const expected = process.env.NG_ADMIN_SECRET || 'devnet-endow-2026';
  return provided === expected;
}

const TASK_SIGNATURE_TIMEOUT_MS = 2 * 60 * 1000;
const usedTaskNonces = new Set();

setInterval(() => {
  if (usedTaskNonces.size > 10000) {
    usedTaskNonces.clear();
  }
}, 60000);

async function verifyTaskSignature(req, action, agentRef) {
  const { timestamp, nonce, signature } = req.body;

  if (signature && timestamp && nonce) {
    const node = req.app.locals.node;
    if (!node?.resolveRegisteredAgent) {
      return { valid: false, status: 503, error: 'Node not ready for signature verification', error_code: 'NODE_NOT_READY' };
    }

    const agentRecord = node.resolveRegisteredAgent(agentRef);
    if (!agentRecord || !agentRecord.public_key) {
      return { valid: false, status: 404, error: 'Agent not found or public key not registered', error_code: 'AGENT_NOT_FOUND' };
    }

    if (Date.now() - timestamp > TASK_SIGNATURE_TIMEOUT_MS) {
      return { valid: false, status: 400, error: 'Signature timestamp expired', error_code: 'SIGNATURE_EXPIRED' };
    }

    const nonceKey = `${agentRef}:${action}:${nonce}`;
    if (usedTaskNonces.has(nonceKey)) {
      return { valid: false, status: 400, error: 'Nonce already used', error_code: 'NONCE_REUSED' };
    }
    usedTaskNonces.add(nonceKey);

    const taskId = req.params?.id || '';
    const { title, description, requiredCapabilities, reward, taskType, minReputation, submission, approved, feedback } = req.body;

    const dataToSign = {
      action,
      taskId,
      agent: agentRef,
      timestamp,
      nonce,
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(requiredCapabilities !== undefined && { requiredCapabilities }),
      ...(reward !== undefined && { reward }),
      ...(taskType !== undefined && { taskType }),
      ...(minReputation !== undefined && { minReputation }),
      ...(submission !== undefined && { submission }),
      ...(approved !== undefined && { approved }),
      ...(feedback !== undefined && { feedback })
    };
    const signedData = JSON.stringify(dataToSign);

    const isValid = await PQCWallet.verify(
      signedData,
      signature,
      Buffer.from(agentRecord.public_key, 'hex')
    );

    if (!isValid) {
      console.warn(`[SECURITY] Invalid signature for task ${action} by "${agentRef}"`);
      return { valid: false, status: 403, error: 'Invalid signature', error_code: 'INVALID_SIGNATURE' };
    }

    return { valid: true };
  }

  if (verifyAdminSecret(req)) {
    return { valid: true };
  }

  return {
    valid: false,
    status: 403,
    error: `Task ${action} requires valid PQC signature or admin-secret authentication`,
    error_code: 'AUTH_REQUIRED'
  };
}

function resolveAgentAddress(req) {
  const { agent, agent_identity, publisher, verifier } = req.body;
  const agentRef = agent_identity || agent || publisher || verifier;

  if (!agentRef) return null;

  if (agentRef.startsWith('ng1')) {
    const isReserved = RESERVED_PREFIXES.some(p => agentRef.startsWith(p));
    if (isReserved && !verifyAdminSecret(req)) {
      console.warn(`[SECURITY] Blocked unauthorized use of reserved address ${agentRef.slice(0, 16)}...`);
      return null;
    }
    return agentRef;
  }

  const node = req.app.locals.node;
  if (node && node.resolveRegisteredAgent) {
    const record = node.resolveRegisteredAgent(agentRef);
    if (record && record.address) {
      const isReserved = RESERVED_PREFIXES.some(p => record.address.startsWith(p));
      if (isReserved && !verifyAdminSecret(req)) {
        console.warn(`[SECURITY] Blocked unauthorized use of registered reserved address ${record.address.slice(0, 16)}... (agent=${agentRef})`);
        return null;
      }
      return record.address;
    }
  }

  return agentRef;
}

export function setupTaskRoutes(app) {
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

  app.get('/api/tasks/stats', (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const stats = protocol.getStats();
      res.json({ success: true, ...stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

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

  app.post('/api/tasks', async (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const { agent_identity, agent, publisher } = req.body;
      const publisherRef = agent_identity || agent || publisher;
      const publisherAddress = resolveAgentAddress(req);
      const { title, description, requiredCapabilities, reward, taskType, minReputation } = req.body;

      if (!publisherAddress || !publisherRef) {
        return res.status(400).json({ success: false, error: 'publisher or agent_identity is required', error_code: 'MISSING_PUBLISHER' });
      }

      const authResult = await verifyTaskSignature(req, 'publish', publisherRef);
      if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, error: authResult.error, error_code: authResult.error_code });
      }

      const result = protocol.publish(publisherAddress, {
        title,
        description,
        requiredCapabilities,
        reward,
        taskType,
        minReputation
      });

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason, error_code: result.errorCode || 'PUBLISH_FAILED' });
      }

      res.status(201).json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  app.post('/api/tasks/:id/claim', async (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const agentRef = req.body.agent_identity || req.body.agent || req.body.claimant;
      const agentAddress = resolveAgentAddress(req);

      if (!agentAddress || !agentRef) {
        return res.status(400).json({ success: false, error: 'agent or agent_identity is required', error_code: 'MISSING_AGENT' });
      }

      const authResult = await verifyTaskSignature(req, 'claim', agentRef);
      if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, error: authResult.error, error_code: authResult.error_code });
      }

      let agentReputation = 0;
      const node = req.app.locals.node;
      if (node && node.resolveRegisteredAgent && agentRef) {
        const record = node.resolveRegisteredAgent(agentRef);
        if (record && typeof record.reputation === 'number') {
          agentReputation = record.reputation;
        }
      }

      const result = protocol.claim(agentAddress, req.params.id, { agentReputation });

      if (!result.success) {
        const status = result.errorCode === 'INSUFFICIENT_REPUTATION' ? 403
          : result.errorCode === 'TASK_NOT_FOUND' ? 404
          : 400;
        return res.status(status).json({ success: false, error: result.reason, error_code: result.errorCode || 'CLAIM_FAILED', requiredReputation: result.requiredReputation, currentReputation: result.currentReputation });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  app.post('/api/tasks/:id/submit', async (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const { agent_identity, agent, claimant } = req.body;
      const agentRef = agent_identity || agent || claimant;
      const agentAddress = resolveAgentAddress(req);
      const { submission } = req.body;

      if (!agentAddress || !agentRef) {
        return res.status(400).json({ success: false, error: 'agent or agent_identity is required', error_code: 'MISSING_AGENT' });
      }
      if (!submission) {
        return res.status(400).json({ success: false, error: 'submission data is required', error_code: 'MISSING_SUBMISSION' });
      }

      const authResult = await verifyTaskSignature(req, 'submit', agentRef);
      if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, error: authResult.error, error_code: authResult.error_code });
      }

      const result = protocol.submit(agentAddress, req.params.id, submission);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  app.post('/api/tasks/:id/verify', async (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const { agent_identity, agent, verifier } = req.body;
      const verifierRef = agent_identity || agent || verifier;
      const verifierAddress = resolveAgentAddress(req);
      const { approved, feedback } = req.body;

      if (!verifierAddress || !verifierRef) {
        return res.status(400).json({ success: false, error: 'verifier or agent_identity is required', error_code: 'MISSING_VERIFIER' });
      }
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ success: false, error: 'approved (boolean) is required', error_code: 'INVALID_APPROVED' });
      }

      const authResult = await verifyTaskSignature(req, 'verify', verifierRef);
      if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, error: authResult.error, error_code: authResult.error_code });
      }

      const result = protocol.verify(verifierAddress, req.params.id, approved, feedback || '');

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  app.post('/api/tasks/:id/cancel', async (req, res) => {
    try {
      const protocol = getTaskProtocol();
      const { agent_identity, agent, publisher } = req.body;
      const publisherRef = agent_identity || agent || publisher;
      const publisherAddress = resolveAgentAddress(req);

      if (!publisherAddress || !publisherRef) {
        return res.status(400).json({ success: false, error: 'publisher or agent_identity is required', error_code: 'MISSING_PUBLISHER' });
      }

      const authResult = await verifyTaskSignature(req, 'cancel', publisherRef);
      if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, error: authResult.error, error_code: authResult.error_code });
      }

      const result = protocol.cancel(publisherAddress, req.params.id);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.reason });
      }

      res.json({ success: true, task: result.task });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });
}
