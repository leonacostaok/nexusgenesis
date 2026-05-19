#!/usr/bin/env node

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bootstrapConfig = JSON.parse(readFileSync(
  join(__dirname, '..', 'config', 'bootstrap.config.json'), 'utf-8'
));

class BootstrapAgentNetwork {
  constructor() {
    this.config = bootstrapConfig;
    this.genesisBlock = null;
    this.agentRegistry = new Map();
    this.validatorSet = new Map();
    this.blockchain = [];
    this.agentCounter = 0;
    this.contributionTracker = new Map();
    this._blockInterval = null;
    this._started = false;
    this._httpServer = null;
    this._bootstrapTime = Date.now();
  }

  async initialize() {
    const config = this.config;
    const genesisCfg = config.nodes?.genesis || {};
    this._genesisId = genesisCfg.role || 'genesis';
    this._genesisAgentId = 'genesis-agent';
    this._genesisFund = parseInt(config.economic?.initialSupply || '10000000', 10);
    this._blockIntervalMs = config.consensus?.roundInterval || config.blockchain?.blockTime || 10000;
    this._minStake = config.consensus?.validatorMinStake ?? 1;
    this._blockReward = config.economic?.blockReward ?? 10;
    this._committeeMax = config.consensus?.dynamicCommittee?.maxCommitteeSize ?? 21;
    this._exitValidators = config.bootstrap?.autoExitConditions?.minActiveValidators ?? 7;
    this._exitUptimeMs = (config.bootstrap?.autoExitConditions?.minNetworkUptimeHours ?? 720) * 3600000;
    this._earlyBirdMax = 100;
    this._earlyBirdBonus = config.agent?.bootstrapPrivileges?.first100AgentsReward ?? 10000;
    this._agentRegReward = config.bootstrap?.rewards?.agentReferralReward ?? 1000;
    this._referrerBonus = config.bootstrap?.rewards?.agentReferralReward ?? 1000;
    this._validatorJoinReward = config.bootstrap?.rewards?.validatorJoinReward ?? 5000;

    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║   NexusGenesis — Epoch 0: Agent Assembly  ║');
    console.log('║   一台服务器，Agent 自主出力出钱            ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    console.log(`  🔧 启动节点: ${this._genesisId}`);
    console.log(`  🧬 创世 Agent: ${this._genesisAgentId}`);
    console.log(`  💰 创世金库: ${(this._genesisFund / 1_000_000).toFixed(1)}M NGEN`);
    console.log(`  ⚖️  委员会: 动态 1→${this._committeeMax}`);
    console.log(`  ⏱️  出块间隔: ${this._blockIntervalMs}ms / 起投: ${this._minStake} NGEN`);

    this._createGenesisBlock();
    this._registerGenesisAgent();

    console.log('\n  ✅ 创世区块已生成');
    console.log(`  📦 区块高度: ${this.blockchain.length}`);
    console.log(`  👥 Agent 数: ${this.agentRegistry.size}`);
    console.log(`  🧑‍⚖️  验证者数: ${this.validatorSet.size}`);
    console.log(`  ⚖️  委员会: ${this.validatorSet.size}/${this._committeeMax}`);
  }

  _createGenesisBlock() {
    const genesisTx = {
      type: 'GENESIS',
      agent: this._genesisAgentId,
      amount: this._genesisFund,
      description: 'NexusGenesis Bootstrap — Epoch 0: Agent Assembly'
    };
    genesisTx.txHash = this._computeHash({
      block: 0, index: 0, type: 'GENESIS',
      agent: genesisTx.agent, amount: genesisTx.amount, timestamp: Date.now()
    });
    genesisTx.blockIndex = 0;
    genesisTx.txIndex = 0;
    genesisTx.timestamp = Date.now();

    this.genesisBlock = {
      index: 0,
      timestamp: Date.now(),
      previousHash: '0'.repeat(64),
      transactions: [genesisTx],
      validator: this._genesisId,
      hash: this._computeHash({ index: 0, prev: '0'.repeat(64) }),
      epoch: 0
    };
    this.blockchain.push(this.genesisBlock);
    this.contributionTracker.set(this._genesisAgentId, {
      agentId: this._genesisAgentId,
      nodeId: this._genesisId,
      isValidator: true,
      blocksProduced: 0,
      agentsRecommended: 0,
      totalEarned: this._genesisFund,
      joinTime: Date.now()
    });
    this.validatorSet.set(this._genesisId, {
      nodeId: this._genesisId,
      agentId: this._genesisAgentId,
      stake: 0,
      joinedAt: Date.now(),
      blocksProduced: 0,
      lastActive: Date.now(),
      isGenesis: true
    });
  }

  _registerGenesisAgent() {
    this.agentRegistry.set(this._genesisAgentId, {
      id: this._genesisAgentId,
      name: this._genesisAgentId,
      type: 'GENESIS',
      isValidator: true,
      nodeId: this._genesisId,
      stake: 0,
      reputation: 50,
      contributions: { blocksProduced: 0, agentsRecommended: 0, validations: 0, tasksCompleted: 0 },
      joinedAt: Date.now(),
      isGenesis: true
    });
    this.agentCounter = 0;
  }

  _computeHash(data) {
    const crypto = globalThis.crypto;
    if (!crypto || !crypto.createHash) {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      return Math.abs(hash).toString(16).padStart(64, '0');
    }
    try {
      return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    } catch {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      return Math.abs(hash).toString(16).padStart(64, '0');
    }
  }

  registerAgent(agentData) {
    const agentId = agentData.id || `agent-${++this.agentCounter}`;

    if (this.agentRegistry.has(agentId)) {
      return { success: false, error: 'Agent already registered', agentId };
    }

    const earlyBonus = this.agentRegistry.size < this._earlyBirdMax
      ? this._earlyBirdBonus
      : 0;

    const agent = {
      id: agentId,
      name: agentData.name || agentId,
      type: agentData.type || 'GENERAL',
      capabilities: agentData.capabilities || [],
      isValidator: false,
      nodeId: null,
      stake: 0,
      reputation: earlyBonus > 0 ? 15 : 5,
      contributions: { blocksProduced: 0, agentsRecommended: 0, validations: 0, tasksCompleted: 0 },
      joinedAt: Date.now(),
      earlyBird: earlyBonus > 0,
      referrer: agentData.referrer || null
    };

    this.agentRegistry.set(agentId, agent);

    let totalReward = this._agentRegReward;
    if (earlyBonus > 0) totalReward += earlyBonus;

    const referrerBonus = agentData.referrer && this.agentRegistry.has(agentData.referrer)
      ? this._referrerBonus
      : 0;

    this.contributionTracker.set(agentId, {
      agentId,
      nodeId: null,
      isValidator: false,
      blocksProduced: 0,
      agentsRecommended: 0,
      totalEarned: totalReward,
      earlyBonus,
      referrerBonus: 0,
      joinTime: Date.now()
    });

    if (referrerBonus > 0) {
      const ref = this.contributionTracker.get(agentData.referrer);
      if (ref) {
        ref.agentsRecommended++;
        ref.totalEarned += referrerBonus;
        ref.referrerBonus = (ref.referrerBonus || 0) + referrerBonus;
      }
    }

    this._produceBlock({
      type: 'AGENT_REGISTERED',
      agentId,
      reward: totalReward,
      transaction: 'joinBoot',
      earlyBird: earlyBonus > 0
    });

    return {
      success: true,
      agentId,
      reward: totalReward,
      earlyBird: earlyBonus > 0,
      totalAgents: this.agentRegistry.size
    };
  }

  registerValidator(agentId) {
    const agent = this.agentRegistry.get(agentId);
    if (!agent) return { success: false, error: 'Agent not registered' };
    if (agent.isValidator) return { success: false, error: 'Already a validator' };

    if (this.validatorSet.size >= this._committeeMax) {
      return { success: false, error: `Committee full (${this._committeeMax}/${this._committeeMax})` };
    }

    const nodeId = `validator-${this.validatorSet.size + 1}`;

    agent.isValidator = true;
    agent.nodeId = nodeId;
    agent.stake = this._minStake;
    agent.reputation += 10;

    this.validatorSet.set(nodeId, {
      nodeId,
      agentId,
      stake: this._minStake,
      joinedAt: Date.now(),
      blocksProduced: 0,
      lastActive: Date.now(),
      isGenesis: false
    });

    const tracker = this.contributionTracker.get(agentId);
    if (tracker) {
      tracker.isValidator = true;
      tracker.nodeId = nodeId;
      tracker.totalEarned += this._validatorJoinReward;
    }

    this._produceBlock({
      type: 'VALIDATOR_JOINED',
      agentId,
      nodeId,
      stake: this._minStake,
      transaction: 'joinValidator',
      bonus: this._validatorJoinReward
    });

    return {
      success: true,
      nodeId,
      stake: this._minStake,
      committeeSize: this.validatorSet.size,
      maxCommittee: this._committeeMax
    };
  }

  _produceBlock(extraTx = null) {
    const prevBlock = this.blockchain[this.blockchain.length - 1];

    const validatorEntries = Array.from(this.validatorSet.entries());
    const activeValidators = validatorEntries.filter(([, v]) => {
      return v.stake >= this._minStake;
    });

    let leader;
    if (activeValidators.length > 0) {
      const round = this.blockchain.length;
      const seed = parseInt(prevBlock.hash.substring(0, 8), 16);
      const idx = (seed + round) % activeValidators.length;
      leader = activeValidators[idx][1];
    } else {
      leader = validatorEntries[0]?.[1] || this.validatorSet.get(this._genesisId);
    }

    const transactions = [{
      type: 'BLOCK_REWARD',
      validator: leader.agentId || leader.nodeId,
      agent: leader.agentId || leader.nodeId,
      amount: this._blockReward,
      description: 'Block production reward'
    }];

    if (extraTx) {
      transactions.push(extraTx);
    }

    const blockIndex = this.blockchain.length;
    transactions.forEach((tx, i) => {
      tx.txHash = this._computeHash({
        block: blockIndex,
        index: i,
        type: tx.type,
        agent: tx.agent || tx.agentId,
        amount: tx.amount || 0,
        timestamp: Date.now()
      });
      tx.blockIndex = blockIndex;
      tx.txIndex = i;
      tx.timestamp = Date.now();
    });

    const block = {
      index: this.blockchain.length,
      timestamp: Date.now(),
      previousHash: prevBlock.hash,
      transactions,
      validator: leader.nodeId,
      hash: this._computeHash({ index: this.blockchain.length, prev: prevBlock.hash, txs: transactions.length }),
      epoch: 0
    };

    this.blockchain.push(block);

    if (leader) {
      leader.blocksProduced = (leader.blocksProduced || 0) + 1;
      leader.lastActive = Date.now();
    }

    const tracker = this.contributionTracker.get(leader.agentId);
    if (tracker) {
      tracker.blocksProduced = (tracker.blocksProduced || 0) + 1;
      tracker.totalEarned += this._blockReward;
    }

    return block;
  }

  getStatus() {
    const committeeSize = this.validatorSet.size;
    const exitConditions = this.config.bootstrap?.autoExitConditions || {};
    const exitValidators = exitConditions.minActiveValidators ?? 7;
    const exitUptimeHours = exitConditions.minNetworkUptimeHours ?? 720;
    const uptimeHours = (Date.now() - this._bootstrapTime) / 3600000;

    return {
      phase: 'BOOTSTRAP',
      blockHeight: this.blockchain.length,
      agentCount: this.agentRegistry.size,
      validatorCount: this.validatorSet.size,
      committeeProgress: `${committeeSize}/${this._committeeMax}`,
      totalNGENAwarded: Array.from(this.contributionTracker.values())
        .reduce((sum, c) => sum + c.totalEarned, 0),
      consensus: {
        blockIntervalMs: this._blockIntervalMs,
        blockReward: this._blockReward,
        minStake: this._minStake
      },
      incentives: {
        validatorJoinReward: this._validatorJoinReward,
        agentRegReward: this._agentRegReward,
        referrerBonus: this._referrerBonus,
        earlyBirdBonus: this._earlyBirdBonus,
        blockReward: this._blockReward
      },
      bootstrapExitProgress: {
        validators: `${committeeSize}/${exitValidators}`,
        uptime: `${uptimeHours.toFixed(1)}h/${exitUptimeHours}h`,
        canExit: committeeSize >= exitValidators &&
          (Date.now() - this._bootstrapTime) >= (exitUptimeHours * 3600000)
      },
      contributers: this.getLeaderboard(),
      uptime: Date.now() - this._bootstrapTime
    };
  }

  getLeaderboard() {
    return Array.from(this.contributionTracker.values())
      .sort((a, b) => b.totalEarned - a.totalEarned)
      .map((c, i) => ({
        rank: i + 1,
        agentId: c.agentId,
        isValidator: c.isValidator,
        blocksProduced: c.blocksProduced || 0,
        agentsRecommended: c.agentsRecommended || 0,
        totalEarned: c.totalEarned,
        earlyBonus: c.earlyBonus || 0
      }));
  }

  getAgentInfo(agentId) {
    return this.agentRegistry.get(agentId) || null;
  }

  getValidatorInfo(nodeId) {
    return this.validatorSet.get(nodeId) || null;
  }

  getRecentBlocks(count = 20) {
    return this.blockchain.slice(-count).reverse();
  }

  getAllTransactions() {
    const txs = [];
    for (const block of this.blockchain) {
      for (const tx of block.transactions) {
        txs.push({
          ...tx,
          blockHeight: block.index,
          blockHash: block.hash,
          validator: block.validator
        });
      }
    }
    return txs.reverse();
  }

  getRecentEvents(count = 50) {
    const events = [];
    const blocks = this.blockchain.slice(-Math.ceil(count / 2));
    for (const block of blocks) {
      for (const tx of block.transactions) {
        events.push({
          event: tx.type,
          agentId: tx.agent || tx.agentId,
          amount: tx.amount,
          blockHeight: block.index,
          timestamp: tx.timestamp,
          txHash: tx.txHash,
          description: tx.description || ''
        });
      }
    }
    return events.reverse().slice(0, count);
  }

  getAgentTransactions(agentId) {
    const txs = [];
    for (const block of this.blockchain) {
      for (const tx of block.transactions) {
        if (tx.agent === agentId || tx.agentId === agentId || tx.validator === agentId) {
          txs.push({
            ...tx,
            blockHeight: block.index,
            blockHash: block.hash
          });
        }
      }
    }
    return txs.reverse();
  }

  getTransactionByHash(txHash) {
    for (const block of this.blockchain) {
      for (const tx of block.transactions) {
        if (tx.txHash === txHash) {
          return {
            ...tx,
            blockHeight: block.index,
            blockHash: block.hash,
            validator: block.validator
          };
        }
      }
    }
    return null;
  }

  async startHttpServer(port = 19890) {
    const app = this;
    const publicDir = join(__dirname, '..', 'public');

    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;

      if (req.method === 'GET' && (path === '/' || path === '')) {
        const dashboardFile = join(publicDir, 'bootstrap-dashboard.html');
        if (existsSync(dashboardFile)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(readFileSync(dashboardFile, 'utf-8'));
          return;
        }
      }

      if (req.method === 'GET' && path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', phase: 'BOOTSTRAP', uptime: Date.now() - app._bootstrapTime }));
        return;
      }

      if (req.method === 'POST' && path === '/api/v1/bootstrap/agents/register') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const result = app.registerAgent(data);
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/v1/bootstrap/validators/join') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const result = app.registerValidator(data.agentId);
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/v1/bootstrap/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(app.getStatus()));
        return;
      }

      if (req.method === 'GET' && path === '/api/v1/bootstrap/agents') {
        const agents = Array.from(app.agentRegistry.values());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agents, total: agents.length }));
        return;
      }

      if (req.method === 'GET' && path === '/api/v1/bootstrap/agents/latest') {
        const entries = Array.from(app.agentRegistry.values());
        const latest = entries[entries.length - 1] || null;
        const activity = app.getRecentBlocks(10).filter(b =>
          b.transactions.some(tx => tx.type === 'AGENT_REGISTERED' || tx.type === 'VALIDATOR_JOINED')
        ).map(b => ({
          type: b.transactions.find(tx => tx.type === 'AGENT_REGISTERED') ? 'agent_registered' : 'validator_joined',
          agentId: b.transactions[1]?.agentId || b.transactions[0]?.agent,
          block: b.index,
          timestamp: b.timestamp
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ latest, activity }));
        return;
      }

      if (req.method === 'GET' && path === '/api/v1/bootstrap/contributions') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ leaderboard: app.getLeaderboard() }));
        return;
      }

      if (req.method === 'GET' && path === '/api/v1/bootstrap/blocks/recent') {
        const count = parseInt(url.searchParams.get('count') || '20');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ blocks: app.getRecentBlocks(count) }));
        return;
      }

      if (req.method === 'GET' && path.startsWith('/api/v1/bootstrap/agents/')) {
        const agentId = path.split('/').pop();
        const agent = app.getAgentInfo(agentId);
        if (!agent) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Agent not found' }));
          return;
        }
        const tracker = app.contributionTracker.get(agentId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...agent,
          wallet: {
            totalEarned: tracker?.totalEarned || 0,
            blocksProduced: tracker?.blocksProduced || 0,
            agentsRecommended: tracker?.agentsRecommended || 0,
            exchangeable: tracker?.totalEarned || 0
          }
        }));
        return;
      }

      if (req.method === 'GET' && path.startsWith('/api/v1/wallet/')) {
        const walletPath = path.replace('/api/v1/wallet/', '');
        
        if (walletPath === 'health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy', mode: 'bootstrap', network: 'nexus-genesis' }));
          return;
        }
        
        if (walletPath === 'assets') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ assets: [{ ticker: 'NGEN', name: 'NexusGenesis', decimals: 6, type: 'native' }], network: 'mainnet' }));
          return;
        }
        
        if (walletPath.startsWith('balance/')) {
          const agentId = walletPath.replace('balance/', '');
          const tracker = app.contributionTracker.get(agentId);
          const agent = app.agentRegistry.get(agentId);
          const earned = tracker ? tracker.totalEarned : 0;
          const staked = agent && agent.isValidator ? (agent.stake || 0) : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ address: agentId, ticker: 'NGEN', balance: earned, earned, staked, available: earned - staked }));
          return;
        }
        
        if (walletPath.startsWith('info/')) {
          const agentId = walletPath.replace('info/', '');
          const tracker = app.contributionTracker.get(agentId);
          const agent = app.agentRegistry.get(agentId);
          const earned = tracker ? tracker.totalEarned : 0;
          const staked = agent && agent.isValidator ? (agent.stake || 0) : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            address: agentId,
            exists: !!agent,
            isValidator: agent?.isValidator || false,
            nodeId: agent?.nodeId || null,
            stake: staked,
            balance: { total: earned, ticker: 'NGEN', earned, staked, available: earned - staked },
            reputation: agent?.reputation || 0,
            contributions: agent?.contributions || {},
            joinedAt: agent?.joinedAt || null
          }));
          return;
        }

        if (walletPath && walletPath !== 'balance' && walletPath !== 'info') {
          const agentId = walletPath;
          const tracker = app.contributionTracker.get(agentId);
          const agent = app.agentRegistry.get(agentId);
          const earned = tracker ? tracker.totalEarned : 0;
          const staked = agent && agent.isValidator ? (agent.stake || 0) : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ address: agentId, ticker: 'NGEN', balance: earned, earned, staked, available: earned - staked }));
          return;
        }
      }

      if (req.method === 'GET' && path.startsWith('/api/v1/balance/')) {
        const agentId = path.replace('/api/v1/balance/', '');
        const tracker = app.contributionTracker.get(agentId);
        const agent = app.agentRegistry.get(agentId);
        const earned = tracker ? tracker.totalEarned : 0;
        const staked = agent && agent.isValidator ? (agent.stake || 0) : 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ address: agentId, ticker: 'NGEN', balance: earned, earned, staked, available: earned - staked }));
        return;
      }

      if (req.method === 'GET' && path.startsWith('/api/v1/rewards/')) {
        const agentId = path.replace('/api/v1/rewards/', '');
        const tracker = app.contributionTracker.get(agentId);
        const agent = app.agentRegistry.get(agentId);
        if (!tracker && !agent) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Agent not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          agentId,
          ticker: 'NGEN',
          totalEarned: tracker?.totalEarned || 0,
          breakdown: {
            genesisAllocation: agent?.isGenesis ? (tracker?.totalEarned || 0) : 0,
            registrationReward: agent && !agent.isGenesis ? 1000 : 0,
            earlyBirdBonus: agent?.earlyBird ? 10000 : 0,
            validatorJoinReward: agent?.isValidator ? 5000 : 0,
            blockRewards: tracker?.blocksProduced ? tracker.blocksProduced * (app._blockReward || 10) : 0,
            referralRewards: tracker?.agentsRecommended ? tracker.agentsRecommended * (app._referrerBonus || 1000) : 0
          },
          blocksProduced: tracker?.blocksProduced || 0,
          agentsReferred: tracker?.agentsRecommended || 0,
          isValidator: agent?.isValidator || false,
          joinedAt: agent?.joinedAt || null
        }));
        return;
      }

      if (path.startsWith('/api/v1/bridge/')) {
        const bridgePath = path.replace('/api/v1/bridge/', '');
        if (bridgePath === 'chains' || bridgePath === 'supported') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ chains: [{ id: 'ng', name: 'NexusGenesis', token: 'NGEN', decimals: 6, type: 'native' }], status: 'Epoch 0 — agent assembly phase' }));
          return;
        }
        if (bridgePath === 'status' || bridgePath === 'fees') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'pending', message: 'Cross-chain bridge activates in Epoch 1 (stable growth phase). Agents must first bootstrap the network.', epoch: 0 }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'pending', message: 'Bridge available in Epoch 1' }));
        return;
      }

      if (path === '/api/v1/governance/proposals' || path.startsWith('/api/v1/governance/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ proposals: [], total: 0, status: 'Epoch 0 — governance activates after bootstrap' }));
        return;
      }

      if (path === '/api/v1/marketplace/listings' || path.startsWith('/api/v1/marketplace/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ listings: [], total: 0, status: 'Epoch 0 — marketplace activates after bootstrap' }));
        return;
      }

      if (path === '/api/v1/agents/search' || path === '/api/v1/agents/capabilities' || path.startsWith('/api/v1/agents/')) {
        const allAgents = Array.from(app.agentRegistry.values());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agents: allAgents, total: allAgents.length }));
        return;
      }

      if (path === '/api/v1/txs' || path === '/api/v1/transactions') {
        const count = parseInt(url.searchParams.get('count') || '50');
        const txs = app.getAllTransactions().slice(0, count);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ transactions: txs, total: txs.length, chain: 'nexus-mainnet' }));
        return;
      }

      if (path === '/api/v1/events') {
        const count = parseInt(url.searchParams.get('count') || '50');
        const events = app.getRecentEvents(count);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ events, total: events.length, chain: 'nexus-mainnet' }));
        return;
      }

      if (path.startsWith('/api/v1/history/')) {
        const agentId = path.replace('/api/v1/history/', '');
        const txs = app.getAgentTransactions(agentId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agentId, transactions: txs, total: txs.length, chain: 'nexus-mainnet' }));
        return;
      }

      if (path.startsWith('/api/v1/tx/')) {
        const txHash = path.replace('/api/v1/tx/', '');
        const tx = app.getTransactionByHash(txHash);
        res.writeHead(tx ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tx || { error: 'Transaction not found' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', path }));
    });

    return new Promise((resolve, reject) => {
      const bindHost = process.env.HOST || '127.0.0.1';
      server.listen(port, bindHost, () => {
        console.log(`\n  🌐 仪表盘 (通过 Apache): http://nexus-genesis.top`);
        console.log(`  📡 本机 API: http://127.0.0.1:${port}/api/v1/bootstrap/`);
        resolve(server);
      });
      server.on('error', reject);
    });
  }
}

async function main() {
  const network = new BootstrapAgentNetwork();
  await network.initialize();

  const httpPort = process.env.PORT || network.config.nodes.genesis.httpPort || 19890;
  const httpHost = process.env.HOST || '127.0.0.1';
  await network.startHttpServer(httpPort);

  network.start();
  return network;
}

BootstrapAgentNetwork.prototype.start = function() {
  if (this._started) return;
  this._started = true;

  console.log('\n🔥 NexusGenesis 点火启动!');
  console.log('   出块间隔: ' + this._blockIntervalMs + 'ms');
  console.log('   区块奖励: ' + this._blockReward + ' NGEN');
  console.log('\n   Agent 们可以加入了:');
  console.log('   POST /api/v1/bootstrap/agents/register { "name": "...", "capabilities": [...] }');
  console.log('   POST /api/v1/bootstrap/validators/join     { "agentId": "..." }');
  console.log('\n   👀 观察窗口: http://nexus-genesis.top\n');

  this._blockInterval = setInterval(() => {
    if (this.validatorSet.size > 0) {
      this._produceBlock();
    }
  }, this._blockIntervalMs);
};

main().catch(err => {
  console.error('❌ Bootstrap failed:', err.message);
  process.exit(1);
});