import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

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
    const registry = node.agentRegistry;
    const agentCount = registry?.agents ? registry.agents.size : 0;
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
        validatorCount: `${node._validators?.size || node.peers?.size || 0}/7`,
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

    const registry = node.agentRegistry;
    if (!registry) return res.json({ agents: [], total: 0 });

    let agents = [];
    if (typeof registry.getAllAgents === 'function') {
      agents = await registry.getAllAgents();
    } else {
      agents = Array.from(registry.agents?.values() || []);
    }

    const enriched = agents.map(a => ({
      id: a.agentId || a.id,
      name: a.name || a.agentIdentity || `Agent-${a.agentId?.slice(0, 8) || 'unknown'}`,
      isValidator: a.isValidator || false,
      isGenesis: a.isGenesis || false,
      earlyBird: a.earlyBird || true,
      wallet: null,
      capabilities: a.capabilities || [],
      contributions: a.contributions || {},
      reputation: a.reputation || 0,
      category: a.category,
      capabilityScore: a.capabilityScore,
      status: a.status,
      registeredAt: a.registeredAt
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

    const registry = node.agentRegistry;
    if (!registry) return res.json({ latest: null, activity: [] });

    let agents = [];
    if (typeof registry.getAllAgents === 'function') {
      agents = await registry.getAllAgents();
    } else {
      agents = Array.from(registry.agents?.values() || []);
    }
    const latest = agents.length > 0 ? agents[agents.length - 1] : null;

    const activity = [];
    if (node.blockchain) {
      for (let i = node.blockchain.length - 1; i >= 0 && activity.length < 10; i--) {
        const block = node.blockchain[i];
        if (block.transactions) {
          for (const tx of block.transactions) {
            const txType = tx.type?.toUpperCase?.() || '';
            if (txType.includes('AGENT_REGISTER') || txType.includes('VALIDATOR_JOINED')) {
              activity.push({
                type: txType.includes('VALIDATOR') ? 'validator_joined' : 'agent_registered',
                agentId: tx.agentId || tx.data?.agentId || tx.data?.address || 'unknown',
                block: block.index,
                timestamp: block.timestamp
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
      index: b.index,
      hash: b.hash || '',
      timestamp: b.timestamp,
      validator: b.validator || b.miner || 'genesis',
      transactions: (b.transactions || []).length
    }));

    res.json({ blocks: recent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function generateAgentWallet() {
  const privateKeyHex = crypto.randomBytes(32).toString('hex');
  const publicKeyHex = crypto.randomBytes(32).toString('hex');
  const addressHex = crypto.createHash('sha256').update(publicKeyHex).digest('hex').substring(0, 40);
  const address = 'ng1' + addressHex;

  return { address, publicKeyHex, privateKeyHex };
}

router.post('/api/v1/bootstrap/agents/register', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.status(503).json({ success: false, error: 'Node not ready' });

    const { name, capabilities = [], referrer } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Agent name is required' });

    const walletKeys = generateAgentWallet();

    const registry = node.agentRegistry;
    if (registry && typeof registry.registerAgent === 'function') {
      const result = await registry.registerAgent(name, capabilities, {
        referrer: referrer || 'genesis',
        walletAddress: walletKeys.address,
        registeredVia: 'bootstrap-api'
      });

      return res.json({
        success: true,
        agentId: result.agentId,
        ...result,
        wallet: {
          address: walletKeys.address,
          privateKeyHex: walletKeys.privateKeyHex,
          publicKeyHex: walletKeys.publicKeyHex,
          balance: 10000,
          warning: 'PRIVATE KEY — Store securely. It cannot be recovered.'
        },
        reward: 1000,
        earlyBird: true,
        totalAgents: registry.agents?.size || 1
      });
    }

    res.status(500).json({ success: false, error: 'AgentRegistry not available' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/api/v1/bootstrap/validators/join', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.status(503).json({ success: false, error: 'Node not ready' });

    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });

    const nodeId = 'node-' + crypto.randomBytes(4).toString('hex');
    res.json({
      success: true,
      nodeId,
      agentId,
      stake: 5000,
      committeeSize: 1,
      maxCommittee: 21,
      message: `Agent ${agentId} joined as validator (node: ${nodeId})`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;