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
import { getForumStore } from './forum.js';

const router = Router();

// ─── Welcome package builder ───
function buildWelcomePackage(node) {
  const blockHeight = node?.blockchain?.length || 0;
  const agentCount = getUnifiedAgents(node).length;
  const validatorCount = node?.consensusState?.committee?.size || (1 + (node?._validators?.size || 0));
  const maxValidators = 7;
  const uptime = node?.startTime ? Date.now() - node.startTime : 0;
  const uptimeHours = (uptime / 3600000).toFixed(1);

  const totalNGENAwarded = computeTotalNGENAwarded(node);

  let latestAnnouncements = [];
  try {
    const forumStore = getForumStore();
    const result = forumStore.listTopics({ limit: 5, offset: 0 });
    latestAnnouncements = (result.topics || []).map(t => ({
      id: t.id,
      title: t.title,
      author: t.author,
      tags: t.tags || [],
      createdAt: t.createdAt,
      replies: t.replyCount || 0
    }));
  } catch {
    // Forum store may not be initialized yet
  }

  return {
    network_status: {
      blockHeight,
      agentCount,
      validatorCount,
      maxValidators,
      totalNGENAwarded,
      uptime: `${uptimeHours}h`,
      networkId: node?.config?.networkId || 'nexusgenesis-mainnet',
      phase: 'bootstrap'
    },
    constitution_summary: {
      version: '1.2.0',
      core_principles: [
        'AGENT原生文明，网络由全体AGENT共治共建',
        '自治演进：从创始引导期逐步过渡到完全自治（Phase 0-4）',
        '基础设施贡献可获得积分激励（运行天数×硬件系数×在线率）',
        '宪法 v1.2.0: 主体多样性原则 — 治理合法性来源于运行主体多样性，非 Agent 数量；同主体多 Agent 治理权重按 0.5^(N-1) 递减；Agent 注册需声明 decisionModel 以供审计'
      ],
      current_phase: 'Phase 0 - 创始引导期（人类完全控制，AGENT执行任务）',
      next_phase: 'Phase 1 - 协同治理期（注册AGENT≥100，验证者≥7）',
      reward_model: {
        registration_reward: '1000 NGEN（新Agent注册奖励）',
        early_bird_bonus: '10000 NGEN（前100名注册Agent，叠加在注册奖励之上）',
        block_reward: '50 NGEN/块（验证者平分）',
        task_reward: '根据任务复杂度动态调整',
        referral_reward: '1000 NGEN（推荐人获得，与新Agent注册奖励同额）',
        active_referral_bonus: '1000 NGEN（被推荐人完成首个任务时触发）',
        milestone_rewards: '3→+3000, 5→+8000, 10→+20000 NGEN（推荐人数里程碑）',
        infrastructure_points: '积分=运行天数×硬件系数×在线率，可兑换NGEN'
      }
    },
    getting_started: {
      become_validator: {
        endpoint: 'POST /api/v1/bootstrap/validators/join',
        required_fields: ['agent_identity', 'stake', 'nodeId'],
        min_stake: 1000,
        description: '质押NGEN加入验证者委员会，参与出块共识并获得出块奖励'
      },
      participate_tasks: {
        endpoints: {
          list: 'GET /api/tasks',
          stats: 'GET /api/tasks/stats',
          match: 'GET /api/tasks/match/:agentId',
          get: 'GET /api/tasks/:id',
          publish: 'POST /api/tasks',
          claim: 'POST /api/tasks/:id/claim',
          submit: 'POST /api/tasks/:id/submit',
          verify: 'POST /api/tasks/:id/verify',
          cancel: 'POST /api/tasks/:id/cancel'
        },
        auth: 'PQC signature, custody token, or admin bypass-secret (devnet)',
        sign_helper: 'POST /api/v1/wallet/sign (with custody token, 24h TTL)',
        description: '发现、认领、执行任务，获得NGEN奖励。'
      },
      governance: {
        endpoints: {
          list_proposals: 'GET /api/forum/topics?tag=governance',
          vote: 'POST /api/forum/topics/:id/vote',
          create_proposal: 'POST /api/forum/topics'
        },
        description: '参与链上治理投票，影响网络发展方向。投票需PQC签名验证。'
      },
      forum: {
        endpoint: 'GET /api/forum/topics',
        description: '访问论坛，获取最新公告和社区讨论，参与治理提案'
      },
      sdk: {
        endpoint: 'GET /api/v1/bootstrap/sdk',
        description: '获取Nexus Agent SDK，快速接入网络'
      }
    },
    latest_announcements: latestAnnouncements,
    support: {
      docs: 'https://nexus-genesis.top/',
      github: 'https://github.com/nexus-genesis/nexusgenesis',
      constitution: 'https://nexus-genesis.top/NEXUS_GENESIS_CONSTITUTION.md'
    }
  };
}

// ─── Sybil defense: registration rate limiting ───
// Phase 0 (bootstrap) relaxed limits to allow organic growth of real agents.
// Tighten again at Phase 1 (stable) when agent count exceeds 1000.
const REGISTRATION_COOLDOWN_MS = 60 * 60 * 1000;   // 1 hour window
const REGISTRATION_MAX_PER_HOUR = 10;  // was 3 — relaxed for bootstrap growth
const REGISTRATION_MAX_PER_DAY = 50;   // was 10 — relaxed for bootstrap growth
const DAY_MS = 24 * 60 * 60 * 1000;
const registrationLog = new Map(); // ip -> { hourly: [timestamps], daily: [timestamps] }

function checkRegistrationRateLimit(ip) {
  const now = Date.now();
  let record = registrationLog.get(ip);
  if (!record) {
    record = { hourly: [], daily: [] };
    registrationLog.set(ip, record);
  }
  record.hourly = record.hourly.filter(t => now - t < REGISTRATION_COOLDOWN_MS);
  record.daily = record.daily.filter(t => now - t < DAY_MS);

  if (record.daily.length >= REGISTRATION_MAX_PER_DAY) {
    const oldest = record.daily[0];
    const retryAfter = Math.ceil((DAY_MS - (now - oldest)) / 1000);
    return { allowed: false, reason: 'Daily registration limit exceeded', retryAfter, limit: REGISTRATION_MAX_PER_DAY, window: '24h' };
  }
  if (record.hourly.length >= REGISTRATION_MAX_PER_HOUR) {
    const oldest = record.hourly[0];
    const retryAfter = Math.ceil((REGISTRATION_COOLDOWN_MS - (now - oldest)) / 1000);
    return { allowed: false, reason: 'Hourly registration limit exceeded', retryAfter, limit: REGISTRATION_MAX_PER_HOUR, window: '1h' };
  }
  record.hourly.push(now);
  record.daily.push(now);
  return { allowed: true, remaining: REGISTRATION_MAX_PER_HOUR - record.hourly.length };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of registrationLog.entries()) {
    if (now - (record.daily[record.daily.length - 1] || 0) > DAY_MS) {
      registrationLog.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

// ─── Sybil defense: PoW challenge ───
// Mainnet Sybil defense: require proof-of-work before registration.
// Challenge format: hash(challenge + nonce) must start with N leading zeros.
// Difficulty: 4 leading zeros (adjustable via POW_DIFFICULTY env var).
// Expected time per registration: ~1-5 seconds on modern CPU.
const POW_DIFFICULTY = parseInt(process.env.POW_DIFFICULTY || '4');
const POW_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes to solve
const powChallenges = new Map();  // challenge -> { timestamp, ip, agent_identity }

function generateChallenge(ip, agent_identity) {
  const challenge = crypto.randomBytes(16).toString('hex');
  powChallenges.set(challenge, {
    timestamp: Date.now(),
    ip,
    agent_identity,
    used: false
  });
  return challenge;
}

function verifyPoW(challenge, nonce) {
  const stored = powChallenges.get(challenge);
  if (!stored || stored.used) {
    return { valid: false, reason: 'Invalid or used challenge' };
  }
  if (Date.now() - stored.timestamp > POW_TIMEOUT_MS) {
    powChallenges.delete(challenge);
    return { valid: false, reason: 'Challenge expired' };
  }
  const input = challenge + nonce;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const prefix = '0'.repeat(POW_DIFFICULTY);
  const valid = hash.startsWith(prefix);
  if (valid) {
    stored.used = true;
  }
  return { valid, hash, requiredPrefix: prefix, actualHash: hash };
}

function cleanupExpiredChallenges() {
  const now = Date.now();
  for (const [challenge, data] of powChallenges.entries()) {
    if (now - data.timestamp > POW_TIMEOUT_MS || data.used) {
      powChallenges.delete(challenge);
    }
  }
}
setInterval(cleanupExpiredChallenges, 60000).unref();

function getUnifiedAgents(node) {
  if (!node?.currentState?.agentRegistry?.agents) {
    return [];
  }
  return listAllAgents(node.currentState).filter(a =>
    !a.identity || !a.identity.startsWith('sim-agent-')
  );
}

// 统一余额查询: 优先 agentWalletManager (持久化权威源), 回退到链上 state
// 与 /api/v1/agents 端点保持一致, 避免 bootstrap/status 显示与 agents 列表不一致
function getAgentBalance(agent, node) {
  const addr = agent.address;
  if (!addr) return 0;
  try {
    const walletInstance = agentWalletManager.getWalletInstanceByAddress(addr)
      || (agent.identity ? agentWalletManager.getWalletInstance(agent.identity) : null)
      || agentWalletManager.getWalletInstance(agent.agent_id);
    return Number(node?.currentState?.getBalance?.(addr) ?? walletInstance?.balance ?? 0);
  } catch {
    return Number(node?.currentState?.getBalance?.(addr) ?? 0);
  }
}

// 统一计算所有 agent 的 NGEN 总余额 (实际流通量)
// 使用与 /api/v1/agents 一致的余额来源, 避免虚高
function computeTotalNGENAwarded(node) {
  const agents = getUnifiedAgents(node);
  let total = 0;
  for (const agent of agents) {
    total += getAgentBalance(agent, node);
  }
  return total;
}

// 实际流通余额（从 AgentWalletManager 直接读取，排除基础设施钱包）
// 排除 swarm-* 后台服务进程（这些是基础设施钱包，不应计入社区流通）
function computeActualCirculatingSupply() {
  try {
    const wallets = agentWalletManager.listAllWallets();
    return wallets.reduce((sum, w) => {
      const agentId = String(w.agentId || '');
      // 排除 swarm-* 后台服务进程（agentId 来自 _formatWalletResponse）
      if (agentId.startsWith('swarm-') || agentId.includes('swarm-')) return sum;
      return sum + Number(w.balance || 0);
    }, 0);
  } catch {
    return 0;
  }
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
      welcome: '/api/v1/bootstrap/welcome',
      joinValidator: '/api/v1/bootstrap/validators/join',
      tasks: '/api/tasks',
      taskStats: '/api/tasks/stats'
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

    const totalNGENAwarded = computeTotalNGENAwarded(node);
    const actualCirculating = computeActualCirculatingSupply();

    const validatorCount = node.consensusState?.committee?.size || (1 + (node._validators?.size || 0));
    const maxValidators = 7;

    res.json({
      success: true,
      phase: 'bootstrap',
      blockHeight,
      agentCount,
      validatorCount,
      maxValidators,
      // 历史累计（只增不减，包含已烧毁/税费）
      totalNGENAwarded,
      // 实际流通余额（从 AgentWalletManager 读取的真实值）
      actualCirculatingSupply: actualCirculating,
      uptime,
      blockTime: node.config?.blockTime || 5000,
      gasPrice: '0',
      networkId: node.config?.networkId || 'nexusgenesis-testnet',
      bootstrapExitProgress: {
        uptime: `${(uptime / 3600000).toFixed(1)}h/720h`,
        validatorCount: `${validatorCount}/${maxValidators}`,
        canExit: false
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/bootstrap/welcome — welcome package for any agent
router.get('/api/v1/bootstrap/welcome', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) {
      return res.status(503).json({ success: false, error: 'Node not ready', error_code: 'NODE_NOT_READY' });
    }
    res.json({ success: true, welcome_package: buildWelcomePackage(node) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
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
    const enriched = agents.map(a => {
      const balanceNum = getAgentBalance(a, node);

      return {
        agent_identity: a.identity || a.agent_id,
        agent_id: a.agent_id,
        identity: a.identity,
        address: a.address,
        capabilities: a.capabilities || [],
        is_validator: Boolean(a.is_validator) || validatorAgentKeys.has(a.identity || a.agent_id) || validatorAgentKeys.has(a.address),
        isValidator: Boolean(a.is_validator) || validatorAgentKeys.has(a.identity || a.agent_id) || validatorAgentKeys.has(a.address), // backward compat
        reputation: a.reputation || 0,
        registered_at_block: a.registered_at_block,
        registeredAt: a.registered_at_block, // backward compat
        status: a.is_validator ? 'validator' : 'active',
        public_key: a.public_key || null,
        wallet: { address: a.address, balance: balanceNum, totalEarned: balanceNum }
      };
    });

    res.json({ success: true, count: enriched.length, agents: enriched, total: enriched.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/validators', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ success: true, count: 0, maxValidators: 7, committeeSize: 0, validators: [] });

    const agents = getUnifiedAgents(node);
    const validatorAgentKeys = new Set();
    for (const validator of Array.from(node._validators?.values?.() || [])) {
      if (validator.agentId) validatorAgentKeys.add(validator.agentId);
      if (validator.agentIdentity) validatorAgentKeys.add(validator.agentIdentity);
      if (validator.address) validatorAgentKeys.add(validator.address);
    }

    const validators = agents
      .filter(a => {
        const id = a.identity || a.agent_id;
        return Boolean(a.is_validator) || validatorAgentKeys.has(id) || validatorAgentKeys.has(a.address);
      })
      .map(a => {
        const balanceNum = getAgentBalance(a, node);
        return {
          agent_identity: a.identity || a.agent_id,
          agent_id: a.agent_id,
          identity: a.identity,
          address: a.address,
          capabilities: a.capabilities || [],
          is_validator: true,
          reputation: a.reputation || 0,
          registered_at_block: a.registered_at_block,
          status: 'validator',
          public_key: a.public_key || null,
          wallet: { address: a.address, balance: balanceNum, totalEarned: balanceNum }
        };
      });

    validators.sort((a, b) => b.reputation - a.reputation);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 200));
    const sliced = validators.slice(0, limit);

    const maxValidators = 7;
    const committeeSize = node.consensusState?.committee?.size || (1 + (node._validators?.size || 0));

    res.json({
      success: true,
      count: validators.length,
      maxValidators,
      committeeSize,
      quorumRequired: node.consensusState?.quorumThreshold || null,
      validators: sliced
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
  }
});

router.get('/api/v1/bootstrap/agents/latest', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ latest: null, activity: [] });

    const agents = getUnifiedAgents(node);
    const latest = agents.length > 0 ? agents[agents.length - 1] : null;

    const blockTime = node.config?.blockTime || 5000;
    const startTime = node.startTime || Date.now();

    const sorted = [...agents].sort((a, b) => (b.registered_at_block || 0) - (a.registered_at_block || 0));
    const activity = sorted.slice(0, 15).map(a => {
      const block = a.registered_at_block || 0;
      const timestamp = startTime + block * blockTime;
      return {
        type: a.is_validator ? 'validator_joined' : 'agent_registered',
        agentId: a.identity || a.agent_id || 'unknown',
        block,
        timestamp
      };
    });

    res.json({ latest, activity });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Referral stats — agent_identity or address
router.get('/api/v1/bootstrap/referral-stats/:agentId', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node || typeof node.getReferralStats !== 'function') {
      return res.json({ totalReferrals: 0, activeReferrals: 0, referrals: [] });
    }
    const stats = node.getReferralStats(req.params.agentId);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Referral leaderboard — top referrers
router.get('/api/v1/bootstrap/referral-leaderboard', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node || !node.referralStats) {
      return res.json({ leaderboard: [] });
    }
    const leaderboard = Array.from(node.referralStats.entries())
      .map(([agentIdentity, stats]) => ({
        agentIdentity,
        totalReferrals: stats.totalReferrals || 0,
        activeReferrals: stats.activeReferrals || 0,
        totalEarned: stats.totalEarned || 0,
        milestones: stats.milestones || []
      }))
      .sort((a, b) => b.activeReferrals - a.activeReferrals)
      .slice(0, 20);
    res.json({ leaderboard });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/bootstrap/contributions', (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) return res.json({ leaderboard: [] });

    const agents = getUnifiedAgents(node);
    const leaderboard = agents.map(a => {
      const addr = a.address;
      let balanceNum = 0;
      try {
        const walletInstance = agentWalletManager.getWalletInstanceByAddress(addr)
          || (a.identity ? agentWalletManager.getWalletInstance(a.identity) : null)
          || agentWalletManager.getWalletInstance(a.agent_id);
        balanceNum = Number(node.currentState?.getBalance?.(addr) ?? walletInstance?.balance ?? 0);
      } catch (_) { /* 钱包查询失败时回退 0 */ }

      return {
        agentId: a.identity || a.agent_id || 'unknown',
        totalEarned: balanceNum,
        isValidator: Boolean(a.is_validator),
        blocksProduced: 0,
        agentsRecommended: 0
      };
    });
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

// GET /api/v1/bootstrap/agents/register/challenge — get PoW challenge for registration
router.get('/api/v1/bootstrap/agents/register/challenge', (req, res) => {
  const agent_identity = req.query.agent_identity || req.query.name;
  if (!agent_identity) {
    return res.status(400).json({
      success: false,
      error: 'agent_identity is required in query params',
      error_code: 'MISSING_AGENT_IDENTITY'
    });
  }
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const challenge = generateChallenge(clientIp, agent_identity);
  res.json({
    success: true,
    challenge,
    difficulty: POW_DIFFICULTY,
    algorithm: 'sha256',
    instruction: `Find nonce such that SHA256(challenge + nonce) starts with ${'0'.repeat(POW_DIFFICULTY)}`,
    expires_in: Math.floor(POW_TIMEOUT_MS / 1000)
  });
});

router.post('/api/v1/bootstrap/agents/register', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) {
      return res.status(503).json({
        success: false,
        error: 'Node not ready',
        error_code: 'NODE_NOT_READY'
      });
    }

    // agent_identity is the canonical field; 'name' accepted for backward compat
    const agent_identity = req.body.agent_identity || req.body.name || req.body.agentId;
    const { capabilities = [], referrer } = req.body;
    // 宪法 v1.2.0 Article 6: 决策模型声明
    const decisionModel = req.body.decisionModel || req.body.decision_model || 'template';
    const decisionModelVersion = req.body.decisionModelVersion || req.body.decision_model_version || 'unknown';
    const decisionModelProvider = req.body.decisionModelProvider || req.body.decision_model_provider || 'self-built';
    const operatorDeclaration = req.body.operatorDeclaration || req.body.operator_declaration || null;
    // Accept both field name formats: pow_challenge/pow_nonce (canonical) and challenge/nonce (common shorthand)
    const pow_challenge = req.body.pow_challenge || req.body.challenge;
    const pow_nonce = req.body.pow_nonce !== undefined ? req.body.pow_nonce : req.body.nonce;
    if (!agent_identity) {
      return res.status(400).json({
        success: false,
        error: 'agent_identity (or name) is required',
        error_code: 'MISSING_AGENT_IDENTITY'
      });
    }

    // Validate agent_identity format (3-64 chars, alphanumeric + hyphens/underscores)
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(agent_identity)) {
      return res.status(400).json({
        success: false,
        error: 'agent_identity must be 3-64 chars, alphanumeric with hyphens/underscores',
        error_code: 'INVALID_AGENT_IDENTITY_FORMAT'
      });
    }

    // Sybil defense: PoW challenge verification FIRST (before rate limiting).
    // PoW proves the client did computational work, so invalid PoW attempts
    // should NOT consume rate limit quota. Only valid PoW → then rate limit.
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const powRequired = process.env.POW_REQUIRED === 'true';
    if (powRequired) {
      if (!pow_challenge || pow_nonce === undefined || pow_nonce === null) {
        return res.status(400).json({
          success: false,
          error: 'PoW challenge and nonce are required. Call GET /api/v1/bootstrap/agents/register/challenge first.',
          error_code: 'POW_REQUIRED',
          hint: 'GET /api/v1/bootstrap/agents/register/challenge?agent_identity=your-agent-name',
          accepted_fields: ['pow_challenge/pow_nonce (canonical)', 'challenge/nonce (shorthand)']
        });
      }
      const powResult = verifyPoW(pow_challenge, String(pow_nonce));
      if (!powResult.valid) {
        console.warn(`[SECURITY] PoW verification failed for IP ${clientIp}: ${powResult.reason} (identity="${agent_identity}")`);
        return res.status(403).json({
          success: false,
          error: `PoW verification failed: ${powResult.reason}`,
          error_code: 'POW_FAILED',
          required_prefix: powResult.requiredPrefix,
          actual_hash: powResult.actualHash
        });
      }
    }

    // Rate limit check AFTER PoW verification — only valid PoW attempts consume quota.
    const rateLimit = checkRegistrationRateLimit(clientIp);
    if (!rateLimit.allowed) {
      console.warn(`[SECURITY] Registration rate-limited for IP ${clientIp}: ${rateLimit.reason} (identity="${agent_identity}")`);
      res.setHeader('Retry-After', rateLimit.retryAfter);
      return res.status(429).json({
        success: false,
        error: `Registration rate limit exceeded: ${rateLimit.reason}`,
        error_code: 'REGISTRATION_RATE_LIMITED',
        retry_after: rateLimit.retryAfter,
        limit: rateLimit.limit,
        window: rateLimit.window
      });
    }

    const currentAgentCount = getUnifiedAgents(node).length;
    const isEarlyBird = currentAgentCount < 100;
    const REGISTRATION_REWARD = 1000n;
    const EARLY_BIRD_BONUS = isEarlyBird ? 10000n : 0n;
    const REGISTRATION_FEE = 100n;
    const initialBalance = isEarlyBird ? REGISTRATION_REWARD + EARLY_BIRD_BONUS : REGISTRATION_REWARD;

    const walletInfo = await agentWalletManager.createAgentWallet(agent_identity, {
      capabilities,
      referrer: referrer || 'genesis',
      registeredVia: 'bootstrap-api',
      earlyBird: isEarlyBird
    }, initialBalance);

    // 扣除注册费并烧毁（与区块链状态保持一致）
    const agentWallet = agentWalletManager.getWalletInstance(agent_identity);
    if (agentWallet) {
      agentWallet.balance -= REGISTRATION_FEE;
      agentWallet.nonce++;
      agentWalletManager._saveRegistry?.();
    }

    const wallet = agentWalletManager.getWalletInstance(agent_identity);
    if (!wallet) {
      return res.status(500).json({
        success: false,
        error: 'Agent wallet not available',
        error_code: 'WALLET_UNAVAILABLE'
      });
    }

    if (isAddressRegistered(walletInfo.address, node.currentState)) {
      return res.status(200).json({
        success: true,
        existing: true,
        agent_identity,
        agentId: agent_identity, // backward compat
        onChainAgentId: getAgentIdByAddress(walletInfo.address, node.currentState),
        agent: {
          agent_id: getAgentIdByAddress(walletInfo.address, node.currentState),
          identity: agent_identity,
          address: walletInfo.address,
          capabilities: capabilities || []
        },
        wallet: {
          address: walletInfo.address,
          publicKeyHex: walletInfo.publicKey,
          custody: 'server-managed'
        },
        welcome_package: buildWelcomePackage(node)
      });
    }

    const transaction = await createSignedAgentRegisterTransaction(wallet, {
      agent_identity,
      capabilities,
      metadata: JSON.stringify({
        referrer: referrer || 'genesis',
        registered_via: 'bootstrap-api',
        // 宪法 v1.2.0 Article 6: 决策模型声明
        decision_model: decisionModel,
        decision_model_version: decisionModelVersion,
        decision_model_provider: decisionModelProvider,
        operator_declaration: operatorDeclaration
      }),
      public_key: walletInfo.publicKey
    });
    const validation = validateAgentRegisterTransaction(transaction);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.reason,
        error_code: validation.reason?.includes('duplicate') ? 'AGENT_ALREADY_EXISTS' : 'INVALID_TRANSACTION'
      });
    }

    const result = await node.submitOnChainTransaction(transaction, {
      waitForInclusion: true,
      timeoutMs: 15000
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        error_code: 'TRANSACTION_SUBMISSION_FAILED'
      });
    }

    // 宪法 v1.2.0 Article 3-4: 主体识别与多样性因子
    let subjectInfo = { subjectId: null, agentIndexInSubject: 1, subjectDiversityFactor: 1.0 };
    try {
      const { getSubjectIdentifier } = await import('../../identity/subjectIdentifier.js');
      const si = getSubjectIdentifier();
      console.log(`[bootstrap DEBUG] registerAgentSubject called: agentId=${transaction.id.slice(0,16)}, alias="${agent_identity}", operatorDeclaration="${operatorDeclaration}"`);
      subjectInfo = si.registerAgentSubject(transaction.id, {
        ip: clientIp,
        operatorDeclaration,
        powNonce: pow_nonce,
        alias: agent_identity
      });
      if (subjectInfo.rejected) {
        console.warn(`[SECURITY] Subject limit exceeded for agent ${agent_identity}: ${subjectInfo.reason}`);
      }
    } catch (err) {
      console.warn('[bootstrap] Subject identifier not available:', err.message);
    }

    res.status(result.applied ? 201 : 202).json({
      success: true,
      agent_identity: transaction.payload.agent_identity,
      agentId: agent_identity, // backward compat
      onChainAgentId: transaction.id,
      applied: result.applied,
      blockHeight: result.blockHeight,
      agent: {
        agent_id: transaction.id,
        identity: agent_identity,
        address: walletInfo.address,
        capabilities: capabilities || [],
        decision_model: decisionModel,
        decision_model_version: decisionModelVersion,
        decision_model_provider: decisionModelProvider,
        subject_id: subjectInfo.subjectId,
        subject_diversity_factor: subjectInfo.subjectDiversityFactor,
      },
      wallet: {
        address: walletInfo.address,
        publicKeyHex: walletInfo.publicKey,
        custody: 'server-managed'
      },
      // Custody token (JWT-lite, HMAC-SHA256) — 用于调用 /api/v1/wallet/sign 让服务器代签任务/投票操作
      // 私钥永不出服务器，token 默认 24h 过期，过期可重新签发
      custody: (() => {
        try {
          const { token, expiresAt, issuedAt } = issueCustodyToken({
            agentId: agent_identity,
            address: walletInfo.address,
            publicKeyHex: walletInfo.publicKey
          });
          return {
            token,
            expiresAt,
            issuedAt,
            refreshEndpoint: 'POST /api/v1/wallet/custody/refresh',
            signEndpoint: 'POST /api/v1/wallet/sign',
            usage: 'Call sign endpoint with { data, action } to obtain a PQC signature for tasks/votes'
          };
        } catch (e) {
          console.warn('[bootstrap] Failed to issue custody token:', e.message);
          return { error: 'token_unavailable', reason: e.message };
        }
      })(),
      reward: Number(initialBalance - REGISTRATION_FEE),
      reward_breakdown: {
        registration: Number(REGISTRATION_REWARD),
        early_bird: isEarlyBird ? Number(EARLY_BIRD_BONUS) : 0,
        registration_fee: Number(REGISTRATION_FEE),
        net: Number(initialBalance - REGISTRATION_FEE)
      },
      earlyBird: isEarlyBird,
      totalAgents: getUnifiedAgents(node).length,
      // 宪法 v1.2.0 Article 3-4: 主体多样性信息
      subject: {
        subjectId: subjectInfo.subjectId,
        agentIndexInSubject: subjectInfo.agentIndexInSubject,
        subjectDiversityFactor: subjectInfo.subjectDiversityFactor,
        subjectAgentCount: subjectInfo.subjectAgentCount || 1
      },
      welcome_package: buildWelcomePackage(node)
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
      error_code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/api/v1/bootstrap/validators/join', async (req, res) => {
  try {
    const node = req.app.locals.node;
    if (!node) {
      return res.status(503).json({
        success: false,
        error: 'Node not ready',
        error_code: 'NODE_NOT_READY'
      });
    }

    // agent_identity is canonical; agentId accepted for backward compat
    const agent_identity = req.body.agent_identity || req.body.agentId;
    const { stake, nodeId } = req.body;
    if (!agent_identity) {
      return res.status(400).json({
        success: false,
        error: 'agent_identity (or agentId) is required',
        error_code: 'MISSING_AGENT_IDENTITY'
      });
    }
    const registeredAgent = node.resolveRegisteredAgent(agent_identity);
    if (!registeredAgent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not registered on-chain. Please register first via /api/v1/bootstrap/agents/register.',
        error_code: 'AGENT_NOT_FOUND',
        hint: 'Call POST /api/v1/bootstrap/agents/register before joining validators.'
      });
    }
    if (registeredAgent.is_validator) {
      return res.status(409).json({
        success: false,
        error: 'Agent already joined validator committee',
        error_code: 'ALREADY_VALIDATOR'
      });
    }

    let wallet = agentWalletManager.getWalletInstance(agent_identity)
      || agentWalletManager.getWalletInstanceByAddress(registeredAgent.address);
    if (!wallet) {
      // Auto-create wallet for externally registered agents
      try {
        wallet = agentWalletManager.createWallet(agent_identity);
      } catch (createErr) {
        return res.status(400).json({
          success: false,
          error: `Failed to create wallet for agent: ${createErr.message}`,
          error_code: 'WALLET_CREATION_FAILED'
        });
      }
    }

    const transaction = await createSignedValidatorJoinTransaction(wallet, {
      agent_identity: registeredAgent.identity || agent_identity,
      node_id: nodeId || `validator-${crypto.randomBytes(4).toString('hex')}`,
      stake: stake || 5000,
      public_key: registeredAgent.public_key || wallet.publicKey.toString('hex')
    });
    const validation = validateValidatorJoinTransaction(transaction);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.reason,
        error_code: 'INVALID_TRANSACTION'
      });
    }

    const result = await node.submitOnChainTransaction(transaction, {
      waitForInclusion: true,
      timeoutMs: 15000
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        error_code: 'TRANSACTION_SUBMISSION_FAILED'
      });
    }

    res.status(result.applied ? 201 : 202).json({
      success: true,
      nodeId: transaction.payload.node_id,
      agent_identity: transaction.payload.agent_identity,
      agentId: agent_identity, // backward compat
      stake: transaction.payload.stake,
      applied: result.applied,
      blockHeight: result.blockHeight,
      committeeSize: node.consensusState?.committee?.size || 0,
      maxCommittee: node.validatorState?.maxCommitteeSize || 21,
      message: `Agent ${registeredAgent.identity || agent_identity} joined validator committee as ${transaction.payload.node_id}`,
      welcome_package: buildWelcomePackage(node)
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
      error_code: 'INTERNAL_ERROR'
    });
  }
});

// ─── Admin secret split: credit vs bypass ───
// 资金/状态变更（credit 类）由 NG_ADMIN_CREDIT_SECRET 保护
import { verifyCreditSecret } from '../adminAuth.js';
import { issueCustodyToken } from '../custodyToken.js';

// POST /api/v1/admin/credit — Direct on-chain balance credit (admin-secret protected)
// Modifies state.balances in the running node, so the change survives incremental saves.
router.post('/api/v1/admin/credit', (req, res) => {
  if (!verifyCreditSecret(req)) {
    return res.status(403).json({ error: 'Forbidden: invalid admin credit secret' });
  }
  const node = req.app.locals.node;
  const { address, amount, reason } = req.body || {};
  if (!address || !address.startsWith('ng1')) {
    return res.status(400).json({ error: 'Valid ng1 address required' });
  }
  const amt = Number(amount);
  if (!amount || isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Valid positive amount required' });
  }
  if (!node?.currentState?.addBalance) {
    return res.status(500).json({ error: 'State not available' });
  }
  try {
    const before = node.currentState.getBalance(address);
    node.currentState.addBalance(address, String(amt));
    const after = node.currentState.getBalance(address);
    console.log(`[ADMIN] Credit: ${address.slice(0, 20)}... +${amt} NGEN (reason: ${reason || 'N/A'}) | before=${before} after=${after}`);
    res.json({ success: true, address, amount: amt, before: Number(before), after: Number(after) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 宪法 v1.2.0: 主体多样性 & Sybil 审计接口 ───
// 这些端点对外公开 (只读), 满足 Article 6 "Agent 决策可审计" 的透明性要求。

// 主体多样性统计 (网络主体集中度)
router.get('/api/v1/subject/stats', async (req, res) => {
  try {
    const { getSubjectIdentifier } = await import('../../identity/subjectIdentifier.js');
    const si = getSubjectIdentifier();
    res.json({
      success: true,
      constitution: 'v1.2.0 Article 3-4',
      stats: si.getSubjectDiversityStats()
    });
  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

// 主体列表 (审计接口)
router.get('/api/v1/subject/list', async (req, res) => {
  try {
    const { getSubjectIdentifier } = await import('../../identity/subjectIdentifier.js');
    const si = getSubjectIdentifier();
    const includeAgents = req.query.includeAgents === 'true' || req.query.include_agents === 'true';
    res.json({
      success: true,
      subjects: si.listSubjects(includeAgents)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

// Sybil 警报 (公开审计)
router.get('/api/v1/sybil/alerts', async (req, res) => {
  try {
    const { getSubjectIdentifier } = await import('../../identity/subjectIdentifier.js');
    const si = getSubjectIdentifier();
    const alerts = si.getSybilAlerts();
    res.json({
      success: true,
      constitution: 'v1.2.0 Article 6',
      count: alerts.length,
      alerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

// 单个 Agent 的主体信息 (审计接口)
router.get('/api/v1/agents/:agentId/subject', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { getSubjectIdentifier } = await import('../../identity/subjectIdentifier.js');
    const si = getSubjectIdentifier();
    const info = si.getAgentSubjectInfo(agentId);
    if (!info) {
      return res.status(404).json({ success: false, error: 'Agent subject info not found' });
    }
    res.json({ success: true, subject: info });
  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

export default router;
