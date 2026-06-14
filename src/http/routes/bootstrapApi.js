import { Router } from 'express';
import crypto from 'crypto';
import agentWalletManager from '../../wallet/agentWalletManager.js';
import {
  createSignedAgentRegisterTransaction,
  validateAgentRegisterTransaction,
  listAllAgents,
  isAddressRegistered,
  getAgentIdByAddress
} from '../../transactions/agentRegister.js';
import {
  createSignedValidatorJoinTransaction,
  validateValidatorJoinTransaction
} from '../../transactions/validatorJoin.js';

const router = Router();

function getUnifiedAgents(node) {
  if (!node?.currentState?.agentRegistry?.agents) {
    return [];
  }
  return listAllAgents(node.currentState);
}

router.get('/api/v1/bootstrap', (req, res) => {
  res.json({
    service: 'bootstrap',
    success: true,
    endpoints: {
      status: '/api/v1/bootstrap/status',
      agents: '/api/v1/bootstrap/agents',
      latest: '/api/v1/bootstrap/agents/latest',
      contributions: '/api/v1/bootstrap/contributions',
      recentBlocks: '/api/v1/bootstrap/blocks/recent',
      registerAgent: '/api/v1/bootstrap/agents/register',
      joinValidator: '/api/v1/bootstrap/validators/join'
    }
  });
});

router.get('/api/v1/bootstrap/status', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) {
      return res.json({
        blockHeight: 0, agentCount: 0, totalNGENAwarded: 0, uptime: 0,
        bootstrapExitProgress: { uptime: '0h/720h', validatorCount: '0/7', canExit: false }
      });
    }

    const blockHeight = node.blockchain ? node.blockchain.length : 0;
    const agentCount = getUnifiedAgents(node).length;
    const uptime = node.startTime ? Date.now() - node.startTime : 0;

    let totalNGENAwarded = 0;
    if (node._wallets) {
      for (const wallet of node._wallets.values()) {
        totalNGENAwarded += wallet.initialBalance || 0;
      }
    }

    res.json({
      blockHeight, agentCount, totalNGENAwarded, uptime,
      bootstrapExitProgress: {
        uptime: `${(uptime / 3600000).toFixed(1)}h/720h`,
        validatorCount: `${node.consensusState?.committee?.size || (1 + (node._validators?.size || 0))}/7`,
        canExit: false
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/agents', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ agents: [], total: 0 });

    const agents = getUnifiedAgents(node);

    const validatorAgentKeys = new Set();
    for (const validator of Array.from(node._validators?.values?.() || [])) {
      if (validator.agentId) validatorAgentKeys.add(validator.agentId);
      if (validator.agentIdentity) validatorAgentKeys.add(validator.agentIdentity);
      if (validator.address) validatorAgentKeys.add(validator.address);
    }
    const enriched = agents.map(a => ({
      id: a.identity || a.agent_id,
      name: a.identity || `Agent-${a.agent_id?.slice(0, 8) || 'unknown'}`,
      agent_id: a.agent_id,
      address: a.address,
      isValidator: Boolean(a.is_validator) || validatorAgentKeys.has(a.identity || a.agent_id) || validatorAgentKeys.has(a.address),
      isGenesis: false,
      earlyBird: true,
      wallet: null,
      capabilities: a.capabilities || [],
      contributions: {},
      reputation: a.reputation || 0,
      category: null,
      capabilityScore: 0,
      status: a.is_validator ? 'validator' : 'active',
      registeredAt: a.registered_at_block
    }));

    res.json({ agents: enriched, total: enriched.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/agents/latest', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ latest: null, activity: [] });

    const agents = getUnifiedAgents(node);
    const latest = agents.length > 0 ? agents[agents.length - 1] : null;

    const activity = [];
    if (node.blockchain) {
      for (let i = node.blockchain.length - 1; i >= 0 && activity.length < 10; i--) {
        const block = node.blockchain[i];
        const transactions = block?.body?.transactions || block?.transactions || [];
        if (transactions.length > 0) {
          for (const tx of transactions) {
            const txType = tx.tx_type?.toUpperCase?.() || tx.type?.toUpperCase?.() || '';
            if (txType.includes('AGENT_REGISTER') || txType.includes('VALIDATOR_JOIN')) {
              activity.push({
                type: txType.includes('VALIDATOR') ? 'validator_joined' : 'agent_registered',
                agentId: tx.payload?.agent_identity || tx.from || 'unknown',
                block: block.header?.height ?? block.index,
                timestamp: block.header?.timestamp ?? block.timestamp
              });
              if (activity.length >= 10) break;
            }
          }
        }
      }
    }

    res.json({ latest, activity });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/contributions', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ leaderboard: [] });

    const leaderboard = [];
    if (node._wallets && node._addressIndex) {
      for (const [agentId, addr] of node._addressIndex.entries()) {
        const wallet = node._wallets.get(addr);
        if (wallet) {
          leaderboard.push({
            agentId,
            totalEarned: wallet.balance || 0,
            isValidator: false,
            blocksProduced: 0,
            agentsRecommended: 0
          });
        }
      }
    }
    leaderboard.sort((a, b) => b.totalEarned - a.totalEarned);
    res.json({ leaderboard: leaderboard.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/blocks/recent', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 20;
    const node = req.app.locals.node;
    if (!node || !node.blockchain) return res.json({ blocks: [] });

    const recent = node.blockchain.slice(-count).reverse().map(b => ({
      index: b.header?.height ?? b.index,
      hash: b.hash || '',
      timestamp: b.header?.timestamp ?? b.timestamp,
      validator: b.validator || b.miner || 'genesis',
      transactions: (b.body?.transactions || b.transactions || []).length
    }));

    res.json({ blocks: recent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/v1/bootstrap/agents/register', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.status(503).json({ success: false, error: 'Node not ready' });

    const { name, capabilities = [], referrer } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Agent name is required' });

    const walletInfo = await agentWalletManager.createAgentWallet(name, {
      capabilities,
      referrer: referrer || 'genesis',
      registeredVia: 'bootstrap-api'
    });
    const wallet = agentWalletManager.getWalletInstance(name);
    if (!wallet) {
      return res.status(500).json({ success: false, error: 'Agent wallet not available' });
    }

    if (isAddressRegistered(walletInfo.address, node.currentState)) {
      return res.status(200).json({
        success: true,
        existing: true,
        agentId: name,
        onChainAgentId: getAgentIdByAddress(walletInfo.address, node.currentState),
        wallet: {
          address: walletInfo.address,
          publicKeyHex: walletInfo.publicKey,
          custody: 'server-managed'
        }
      });
    }

    const transaction = await createSignedAgentRegisterTransaction(wallet, {
      agent_identity: name,
      capabilities,
      metadata: JSON.stringify({
        referrer: referrer || 'genesis',
        registered_via: 'bootstrap-api'
      }),
      public_key: walletInfo.publicKey
    });
    const validation = validateAgentRegisterTransaction(transaction);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.reason });
    }

    const result = await node.submitOnChainTransaction(transaction, {
      waitForInclusion: true,
      timeoutMs: 15000
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.status(result.applied ? 201 : 202).json({
      success: true,
      agentId: name,
      onChainAgentId: transaction.id,
      applied: result.applied,
      blockHeight: result.blockHeight,
      wallet: {
        address: walletInfo.address,
        publicKeyHex: walletInfo.publicKey,
        custody: 'server-managed'
      },
      reward: 1000,
      earlyBird: true,
      totalAgents: getUnifiedAgents(node).length
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/api/v1/bootstrap/validators/join', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.status(503).json({ success: false, error: 'Node not ready' });

    const { agentId, stake, nodeId } = req.body;
    if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });
    const registeredAgent = node.resolveRegisteredAgent(agentId);
    if (!registeredAgent) {
      return res.status(404).json({ success: false, error: 'Agent not registered on-chain' });
    }
    if (registeredAgent.is_validator) {
      return res.status(409).json({ success: false, error: 'Agent already joined validator committee' });
    }

    const wallet = agentWalletManager.getWalletInstance(agentId)
      || agentWalletManager.getWalletInstanceByAddress(registeredAgent.address);
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'Managed wallet not found for agent' });
    }

    const transaction = await createSignedValidatorJoinTransaction(wallet, {
      agent_identity: registeredAgent.identity || agentId,
      node_id: nodeId || `validator-${crypto.randomBytes(4).toString('hex')}`,
      stake: stake || 5000,
      public_key: registeredAgent.public_key || wallet.publicKey.toString('hex')
    });
    const validation = validateValidatorJoinTransaction(transaction);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.reason });
    }

    const result = await node.submitOnChainTransaction(transaction, {
      waitForInclusion: true,
      timeoutMs: 15000
    });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.status(result.applied ? 201 : 202).json({
      success: true,
      nodeId: transaction.payload.node_id,
      agentId,
      stake: transaction.payload.stake,
      applied: result.applied,
      blockHeight: result.blockHeight,
      committeeSize: node.consensusState?.committee?.size || 0,
      maxCommittee: node.validatorState?.maxCommitteeSize || 21,
      message: `Agent ${registeredAgent.identity || agentId} joined validator committee as ${transaction.payload.node_id}`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
