/**
 * NexusGenesis - Agent On-Chain Registration API
 * 
 * 提供agent链上注册的 HTTP 接口
 * 
 * 端点：
 * POST /api/v1/agents/register - 注册新agent
 * GET /api/v1/agents/:agentId - 查询agent信息
 * GET /api/v1/agents - 列出所有agent
 * GET /api/v1/agents/address/:address - 通过地址查询agent
 */

import express from 'express';
import {
  createAgentRegisterTransaction,
  validateAgentRegisterTransaction,
  isAddressRegistered,
  getAgentInfo,
  getAgentIdByAddress,
  listAllAgents
} from '../transactions/agentRegister.js';

const router = express.Router();

/**
 * POST /api/v1/agents/register
 * 注册新agent到区块链
 */
router.post('/register', async (req, res) => {
  try {
    const { from, agent_identity, capabilities, metadata, public_key } = req.body;

    // 验证必填字段
    if (!from || !agent_identity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, agent_identity'
      });
    }

    // 验证地址格式
    if (!from.startsWith('ng1') || from.length < 30) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format. Must start with ng1 and be at least 30 characters'
      });
    }

    // 验证 agent_identity 格式
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(agent_identity)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent_identity. Must be 3-64 characters, alphanumeric with hyphens/underscores'
      });
    }

    // 验证 capabilities
    if (capabilities && !Array.isArray(capabilities)) {
      return res.status(400).json({
        success: false,
        error: 'Capabilities must be an array'
      });
    }

    // 检查地址是否已注册
    if (req.app.locals.state && isAddressRegistered(from, req.app.locals.state)) {
      return res.status(409).json({
        success: false,
        error: 'Address already registered as an agent'
      });
    }

    // 创建交易
    const transaction = createAgentRegisterTransaction(from, {
      agent_identity,
      capabilities: capabilities || [],
      metadata: metadata || '',
      public_key: public_key || ''
    });

    // 验证交易
    const validation = validateAgentRegisterTransaction(transaction);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.reason
      });
    }

    // 如果Blockchain state可用，直接应用交易
    let applied = false;
    if (req.app.locals.state) {
      const currentHeight = req.app.locals.blockHeight || 1;
      applied = req.app.locals.state.applyTransaction(transaction, currentHeight);
    }

    res.status(201).json({
      success: true,
      message: 'Agent registration transaction created',
      transaction: {
        id: transaction.id,
        type: transaction.type,
        from: transaction.from,
        payload: transaction.payload,
        timestamp: transaction.timestamp
      },
      applied: applied,
      agent: {
        agent_id: transaction.id,
        address: from,
        identity: agent_identity,
        capabilities: capabilities || []
      }
    });

  } catch (error) {
    console.error('[AgentRegisterAPI] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/agents
 * 列出所有已注册agent
 */
router.get('/', async (req, res) => {
  try {
    if (!req.app.locals.state) {
      return res.status(503).json({
        success: false,
        error: 'Blockchain state not available'
      });
    }

    const agents = listAllAgents(req.app.locals.state);

    res.json({
      success: true,
      count: agents.length,
      agents: agents.map(agent => ({
        agent_id: agent.agent_id,
        address: agent.address,
        capabilities: agent.capabilities,
        reputation: agent.reputation,
        registered_at_block: agent.registered_at_block
      }))
    });

  } catch (error) {
    console.error('[AgentRegisterAPI] Error listing agents:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/agents/:agentId
 * 查询指定agent信息
 */
router.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!req.app.locals.state) {
      return res.status(503).json({
        success: false,
        error: 'Blockchain state not available'
      });
    }

    const agent = getAgentInfo(agentId, req.app.locals.state);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      agent: {
        agent_id: agent.agent_id,
        address: agent.address,
        capabilities: agent.capabilities,
        metadata: agent.metadata,
        reputation: agent.reputation,
        registered_at_block: agent.registered_at_block,
        public_key: agent.public_key
      }
    });

  } catch (error) {
    console.error('[AgentRegisterAPI] Error getting agent:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/agents/address/:address
 * 通过地址查询agent
 */
router.get('/address/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!req.app.locals.state) {
      return res.status(503).json({
        success: false,
        error: 'Blockchain state not available'
      });
    }

    const agentId = getAgentIdByAddress(address, req.app.locals.state);

    if (!agentId) {
      return res.status(404).json({
        success: false,
        error: 'No agent found for this address'
      });
    }

    const agent = getAgentInfo(agentId, req.app.locals.state);

    res.json({
      success: true,
      agent: {
        agent_id: agent.agent_id,
        address: agent.address,
        capabilities: agent.capabilities,
        reputation: agent.reputation,
        registered_at_block: agent.registered_at_block
      }
    });

  } catch (error) {
    console.error('[AgentRegisterAPI] Error getting agent by address:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/agents/verify
 * 验证agent注册交易
 */
router.post('/verify', async (req, res) => {
  try {
    const { transaction } = req.body;

    if (!transaction) {
      return res.status(400).json({
        success: false,
        error: 'Transaction object required'
      });
    }

    const validation = validateAgentRegisterTransaction(transaction);

    res.json({
      success: true,
      valid: validation.valid,
      reason: validation.reason || null
    });

  } catch (error) {
    console.error('[AgentRegisterAPI] Error verifying transaction:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
