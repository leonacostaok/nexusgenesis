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
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║   NexusGenesis — Epoch 0: Agent Assembly  ║');
    console.log('║   一台服务器，Agent 自主出力出钱            ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    const bootNodes = this.config.nodes;
    console.log(`  🔧 启动节点: ${bootNodes.genesis.id}`);
    console.log(`  🧬 创世 Agent: ${bootNodes.genesis.agentId}`);
    console.log(`  💰 创世金库: ${(bootNodes.genesis.genesisFund / 1_000_000).toFixed(1)}M NGEN`);

    const consensus = this.config.consensus;
    console.log(`  ⚖️  委员会: 动态 1→${consensus.dynamicCommittee.maxCommitteeSize}`);
    console.log(`  ⏱️  出块间隔: ${consensus.blockIntervalMs}ms / 起投: ${consensus.minStake} NGEN`);

    this._createGenesisBlock();
    this._registerGenesisAgent();

    console.log('\n  ✅ 创世区块已生成');
    console.log(`  📦 区块高度: ${this.blockchain.length}`);
    console.log(`  👥 Agent 数: ${this.agentRegistry.size}`);
    console.log(`  🧑‍⚖️  验证者数: ${this.validatorSet.size}`);
    console.log(`  ⚖️  委员会: ${this.validatorSet.size}/${consensus.dynamicCommittee.maxCommitteeSize}`);
  }

  _createGenesisBlock() {
    const genesisConfig = this.config.nodes.genesis;
    this.genesisBlock = {
      index: 0,
      timestamp: Date.now(),
      previousHash: '0'.repeat(64),
      transactions: [{
        type: 'GENESIS',
        agent: genesisConfig.agentId,
        amount: genesisConfig.genesisFund,
        description: 'NexusGenesis Bootstrap — Epoch 0: Agent Assembly'
      }],
      validator: genesisConfig.id,
      hash: this._computeHash({ index: 0, prev: '0'.repeat(64) }),
      epoch: 0
    };
    this.blockchain.push(this.genesisBlock);
    this.contributionTracker.set(genesisConfig.agentId, {
      agentId: genesisConfig.agentId,
      nodeId: genesisConfig.id,
      isValidator: true,
      blocksProduced: 0,
      agentsRecommended: 0,
      totalEarned: genesisConfig.genesisFund,
      joinTime: Date.now()
    });
    this.validatorSet.set(genesisConfig.id, {
      nodeId: genesisConfig.id,
      agentId: genesisConfig.agentId,
      stake: 0,
      joinedAt: Date.now(),
      blocksProduced: 0,
      lastActive: Date.now(),
      isGenesis: true
    });
  }

  _registerGenesisAgent() {
    const genesisConfig = this.config.nodes.genesis;
    this.agentRegistry.set(genesisConfig.agentId, {
      id: genesisConfig.agentId,
      name: genesisConfig.agentId,
      type: 'GENESIS',
      isValidator: true,
      nodeId: genesisConfig.id,
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
    const incentives = this.config.incentives;
    const agentId = agentData.id || `agent-${++this.agentCounter}`;

    if (this.agentRegistry.has(agentId)) {
      return { success: false, error: 'Agent already registered', agentId };
    }

    const earlyBonus = this.agentRegistry.size < incentives.earlyBirdBonus.maxAgents
      ? incentives.earlyBirdBonus.bonus
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

    let totalReward = incentives.agentRegistrationReward;
    if (earlyBonus > 0) totalReward += earlyBonus;

    const referrerBonus = agentData.referrer && this.agentRegistry.has(agentData.referrer)
      ? incentives.referrerBonus
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

    const maxCommittee = this.config.consensus.dynamicCommittee.maxCommitteeSize;
    if (this.validatorSet.size >= maxCommittee) {
      return { success: false, error: `Committee full (${maxCommittee}/${maxCommittee})` };
    }

    const minStake = this.config.consensus.minStake;
    const nodeId = `validator-${this.validatorSet.size + 1}`;

    agent.isValidator = true;
    agent.nodeId = nodeId;
    agent.stake = minStake;
    agent.reputation += 10;

    this.validatorSet.set(nodeId, {
      nodeId,
      agentId,
      stake: minStake,
      joinedAt: Date.now(),
      blocksProduced: 0,
      lastActive: Date.now(),
      isGenesis: false
    });

    const tracker = this.contributionTracker.get(agentId);
    if (tracker) {
      tracker.isValidator = true;
      tracker.nodeId = nodeId;
      tracker.totalEarned += this.config.incentives.validatorEffortBonus;
    }

    this._produceBlock({
      type: 'VALIDATOR_JOINED',
      agentId,
      nodeId,
      stake: minStake,
      transaction: 'joinValidator',
      bonus: this.config.incentives.validatorEffortBonus
    });

    return {
      success: true,
      nodeId,
      stake: minStake,
      committeeSize: this.validatorSet.size,
      maxCommittee
    };
  }

  _produceBlock(extraTx = null) {
    const prevBlock = this.blockchain[this.blockchain.length - 1];
    const consensus = this.config.consensus;

    const validatorEntries = Array.from(this.validatorSet.entries());
    const activeValidators = validatorEntries.filter(([, v]) => {
      return v.stake >= consensus.minStake;
    });

    let leader;
    if (activeValidators.length > 0) {
      const round = this.blockchain.length;
      const seed = parseInt(prevBlock.hash.substring(0, 8), 16);
      const idx = (seed + round) % activeValidators.length;
      leader = activeValidators[idx][1];
    } else {
      leader = validatorEntries[0]?.[1] || this.validatorSet.get(this.config.nodes.genesis.id);
    }

    const transactions = [{
      type: 'BLOCK_REWARD',
      validator: leader.agentId || leader.nodeId,
      agent: leader.agentId || leader.nodeId,
      amount: consensus.blockReward,
      description: 'Block production reward'
    }];

    if (extraTx) {
      transactions.push(extraTx);
    }

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
      tracker.totalEarned += consensus.blockReward;
    }

    return block;
  }

  getStatus() {
    const consensus = this.config.consensus;
    const committeeSize = this.validatorSet.size;
    const maxCommittee = consensus.dynamicCommittee.maxCommitteeSize;
    const exitThreshold = consensus.bootstrapExitConditions;
    const uptimeHours = (Date.now() - this._bootstrapTime) / 3600000;

    return {
      phase: 'BOOTSTRAP',
      blockHeight: this.blockchain.length,
      agentCount: this.agentRegistry.size,
      validatorCount: this.validatorSet.size,
      committeeProgress: `${committeeSize}/${maxCommittee}`,
      totalNGENAwarded: Array.from(this.contributionTracker.values())
        .reduce((sum, c) => sum + c.totalEarned, 0),
      consensus: {
        blockIntervalMs: consensus.blockIntervalMs,
        blockReward: consensus.blockReward,
        minStake: consensus.minStake
      },
      incentives: this.config.incentives,
      bootstrapExitProgress: {
        validators: `${committeeSize}/${exitThreshold.minValidators}`,
        uptime: `${uptimeHours.toFixed(1)}h/${(exitThreshold.minUptimeMs / 3600000)}h`,
        canExit: committeeSize >= exitThreshold.minValidators &&
          (Date.now() - this._bootstrapTime) >= exitThreshold.minUptimeMs
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
        res.writeHead(agent ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(agent || { error: 'Agent not found' }));
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

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', path }));
    });

    return new Promise((resolve, reject) => {
      const bindHost = process.env.HOST || '127.0.0.1';
      const server = app.listen(httpPort, bindHost, () => {
        console.log(`\n  🌐 仪表盘 (通过 Apache): http://nexus-genesis.top`);
        console.log(`  📡 本机 API: http://127.0.0.1:${httpPort}/api/v1/bootstrap/`);
        resolve(server);
      });
      server.on('error', reject);
    });
  }
}

async function main() {
  const network = new BootstrapAgentNetwork();
  await network.initialize();

  const httpPort = process.env.PORT || network.bootstrapConfig.nodes.genesis.httpPort || 19890;
  const httpHost = process.env.HOST || '127.0.0.1';
  await network.startHttpServer(httpPort);

  network.start();
  return network;
}

BootstrapAgentNetwork.prototype.start = function() {
  if (this._started) return;
  this._started = true;

  console.log('\n🔥 NexusGenesis 点火启动!');
  console.log('   出块间隔: ' + this.config.consensus.blockIntervalMs + 'ms');
  console.log('   区块奖励: ' + this.config.consensus.blockReward + ' NGEN');
  console.log('\n   Agent 们可以加入了:');
  console.log('   POST /api/v1/bootstrap/agents/register { "name": "...", "capabilities": [...] }');
  console.log('   POST /api/v1/bootstrap/validators/join     { "agentId": "..." }');
  console.log('\n   👀 观察窗口: http://nexus-genesis.top\n');

  this._blockInterval = setInterval(() => {
    if (this.validatorSet.size > 0) {
      this._produceBlock();
    }
  }, this.config.consensus.blockIntervalMs);
};

main().catch(err => {
  console.error('❌ Bootstrap failed:', err.message);
  process.exit(1);
});