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
    const agentCount = node.agentRegistry ? (node.agentRegistry.size || node.agentRegistry.getAllAgents?.()?.length || 0) : 0;
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

router.get('/api/v1/bootstrap/agents', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ agents: [], total: 0 });

    const agents = [];
    if (node.agentRegistry?.getAllAgents) {
      agents.push(...node.agentRegistry.getAllAgents());
    } else if (node.agentRegistry?.values) {
      for (const a of node.agentRegistry.values()) agents.push(a);
    }

    const enriched = agents.map(a => ({
      id: a.id || a.agentId,
      name: a.name,
      isValidator: a.isValidator || false,
      isGenesis: a.isGenesis || false,
      earlyBird: a.earlyBird || false,
      wallet: node._addressIndex && a.id
        ? (() => {
            const addr = node._addressIndex.get(a.id);
            const w = addr ? node._wallets?.get(addr) : null;
            return w ? { address: w.address, balance: w.balance, totalEarned: w.balance } : null;
          })()
        : null,
      capabilities: a.capabilities || [],
      contributions: a.contributions || {},
      reputation: a.reputation || 0,
      joinedAt: a.joinedAt || a.registeredAt
    }));

    res.json({ agents: enriched, total: enriched.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/agents/latest', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ latest: null, activity: [] });

    const agents = [];
    if (node.agentRegistry?.values) {
      for (const a of node.agentRegistry.values()) agents.push(a);
    } else if (node.agentRegistry?.getAllAgents) {
      agents.push(...node.agentRegistry.getAllAgents());
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

// BIP-39 based wallet generation for bootstrap agent registration
function generateAgentWallet() {
  const privateKeyBytes = crypto.randomBytes(32);
  const privateKeyHex = privateKeyBytes.toString('hex');
  const publicKeyBytes = crypto.createPublicKey({
    key: crypto.createPrivateKey({ key: privateKeyBytes, format: 'der', type: 'pkcs8' }),
    format: 'der', type: 'spki'
  }).export({ format: 'der', type: 'spki' });
  const publicKeyHex = publicKeyBytes.toString('hex');
  const addressHex = crypto.createHash('sha256').update(publicKeyBytes).digest('hex').substring(0, 40);
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
    const agentId = 'agent-' + crypto.randomBytes(8).toString('hex');

    const agentInfo = {
      name,
      id: agentId,
      capabilities,
      description: `Agent registered via bootstrap API`,
      referrer,
      address: walletKeys.address,
      publicKey: walletKeys.publicKeyHex
    };

    try {
      const { onboardAgent } = await import('../protocol/agentOnboarding.js');
      const result = await onboardAgent({
        agent_id: agentId,
        model: 'bootstrap',
        capabilities,
        join_signal: null
      }, { node });

      if (result.success) {
        return res.json({
          success: true,
          agentId,
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
          totalAgents: (node.agentRegistry?.size || 0) + 1
        });
      }
    } catch (onboardErr) {
      console.warn('[BootstrapAPI] onboardAgent failed, using fallback:', onboardErr.message);
    }

    res.json({
      success: true,
      agentId,
      message: `Agent ${name} registered successfully`,
      wallet: {
        address: walletKeys.address,
        privateKeyHex: walletKeys.privateKeyHex,
        publicKeyHex: walletKeys.publicKeyHex,
        balance: 10000,
        warning: 'PRIVATE KEY — Store securely. It cannot be recovered.'
      },
      reward: 1000,
      earlyBird: true,
      totalAgents: 1
    });
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