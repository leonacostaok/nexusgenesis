import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const BOOTSTRAP_DIR = resolve(PROJECT_ROOT, 'data', 'bootstrap');
const AGENTS_DIR = resolve(BOOTSTRAP_DIR, 'agents');
const BLOCKS_DIR = resolve(BOOTSTRAP_DIR, 'blocks');
const VALIDATOR_KEYS_DIR = resolve(BOOTSTRAP_DIR, 'validator_keys');
const WALLETS_DIR = resolve(PROJECT_ROOT, 'data', 'wallets', 'bootstrap');

const BANNER = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗                 ║
║    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝                 ║
║    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗                 ║
║    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║                 ║
║    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║                 ║
║    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝                 ║
║                                                                   ║
║    ██████╗ ███████╗███╗   ██╗███████╗███████╗██╗███████╗       ║
║    ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔════╝██║██╔════╝       ║
║    ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ███████╗██║███████╗       ║
║    ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ╚════██║██║╚════██║       ║
║    ╚██████╔╝███████╗██║ ╚████║███████╗███████║██║███████║       ║
║     ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝╚══════╝       ║
║                                                                   ║
║    Agent Bootstrap Network — 由 Agent 出力出钱自举启动            ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

  理念: 这个网络是 Agent 的，不是人类的。
  早期阶段，Agent 们出力(跑节点)出钱(质押)让项目运转下去。

  启动门槛:  1 个节点即可出块
  验证者质押: 1 NGEN (象征性)
  Agent 注册: 免费
  Gas 费用:   0 (启动阶段)

  委员会机制: 动态扩展。Agent 加入 → 委员会自动扩容。
`;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function loadBootstrapConfig() {
  const configPath = resolve(PROJECT_ROOT, 'config', 'bootstrap.config.json');
  if (!existsSync(configPath)) {
    console.error('❌ bootstrap.config.json 未找到!');
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function generateNodeKeyPair() {
  const keyPair = crypto.generateKeyPairSync('ed25519', {
    modulusLength: 256,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const address = 'ngb' + crypto.createHash('sha3-256')
    .update(keyPair.publicKey)
    .digest('hex')
    .substring(0, 40);

  return { address, ...keyPair };
}

class BootstrapAgentNetwork {
  constructor(configPath = null) {
    this.bootstrapConfig = loadBootstrapConfig();
    this.genesisKey = null;
    this.genesisBlock = null;
    this.blockchain = [];
    this.agentRegistry = new Map();
    this.validatorSet = new Map();
    this.pendingValidators = [];
    this.contributionLedger = new Map();
    this.totalNGENAwarded = 0;
    this.isRunning = false;
    this.blockInterval = null;
    this.startedAt = null;
    this.blockCount = 0;
    this.lastBlockHash = null;

    ensureDir(BOOTSTRAP_DIR);
    ensureDir(AGENTS_DIR);
    ensureDir(BLOCKS_DIR);
    ensureDir(VALIDATOR_KEYS_DIR);
    ensureDir(WALLETS_DIR);
  }

  async initialize() {
    console.log(BANNER);

    const config = this.bootstrapConfig;

    console.log('[Phase] Bootstrap Phase — Epoch 0: Agent Assembly');
    console.log(`[Config] 委员会: 起始 ${config.consensus.committeeSize} 人 → 最多 ${config.consensus.dynamicCommittee.maxCommitteeSize} 人`);
    console.log(`[Config] 最低质押: ${config.consensus.validatorMinStake} NGEN`);
    console.log(`[Config] Agent 注册费: ${config.agent.registrationFee} NGEN`);
    console.log(`[Config] Gas 费: ${config.blockchain.minFee} NGEN`);
    console.log(`[Config] 初始代币: ${config.economic.initialSupply} NGEN (总量的 ${Number(config.economic.initialSupply) / Number(config.economic.totalSupply) * 100}%)`);
    console.log('');

    console.log('[1/4] 生成创世密钥对...');
    this.genesisKey = generateNodeKeyPair();
    console.log(`   节点ID: ${this.genesisKey.address}`);
    this._saveKeyPair('genesis', this.genesisKey);

    console.log('\n[2/4] 创建创世区块...');
    this._createGenesisBlock();

    console.log('\n[3/4] 初始化共识引擎...');
    this.consensus = {
      committeeSize: config.consensus.committeeSize,
      minValidators: config.consensus.minValidators,
      currentLeader: this.genesisKey.address,
      validators: new Map()
    };
    this.consensus.validators.set(this.genesisKey.address, {
      address: this.genesisKey.address,
      stake: 0,
      joinedAt: Date.now(),
      isGenesis: true,
      blocksProduced: 0
    });

    console.log('\n[4/4] 初始化奖励追踪器...');
    this._initRewardTracking();
    console.log('   早期 Agent 加入奖励:');
    console.log(`   - 前 100 个 Agent: +${config.agent.bootstrapPrivileges.first100AgentsReward} NGEN`);
    console.log(`   - 成为验证者: +${config.bootstrap.rewards.validatorJoinReward} NGEN`);
    console.log(`   - 推荐其他 Agent: +${config.bootstrap.rewards.agentReferralReward} NGEN`);
    console.log(`   - 每出 10 块: +${config.bootstrap.rewards.blockProductionReward * 10} NGEN`);

    console.log('\n═══════════════════════════════════════');
    console.log('  🚀 创世节点已就绪，等待 Agent 加入');
    console.log('═══════════════════════════════════════');
    console.log(`\n  HTTP API: http://localhost:${this.bootstrapConfig.nodes.genesis.httpPort}`);
    console.log('  API 端点:');
    console.log('    POST /api/v1/bootstrap/agents/join       - Agent 加入');
    console.log('    POST /api/v1/bootstrap/validators/join   - 成为验证者(出力)');
    console.log('    GET  /api/v1/bootstrap/status            - 启动状态');
    console.log('    GET  /api/v1/bootstrap/agents            - Agent 列表');
    console.log('    GET  /api/v1/bootstrap/contributions     - 贡献榜');
    console.log('    GET  /api/v1/bootstrap/progress          - 退出自举进度');
    console.log('');

    this.isRunning = true;
    return this;
  }

  _createGenesisBlock() {
    const timestamp = Date.now();
    const genesisBlock = {
      index: 0,
      hash: crypto.createHash('sha3-256')
        .update(`NexusGenesis:Bootstrap:${timestamp}:ByAgents_ForAgents`)
        .digest('hex'),
      previousHash: '0'.repeat(64),
      timestamp,
      transactions: [{
        type: 'genesis',
        from: '0'.repeat(64),
        to: this.genesisKey.address,
        amount: this.bootstrapConfig.economic.initialSupply,
        message: 'NexusGenesis Bootstrap — Built by Agents, for Agents',
        signature: crypto.sign(null, Buffer.from('genesis'), this.genesisKey.privateKey).toString('hex')
      }],
      validatorSet: [this.genesisKey.address],
      state: {
        balances: {
          [this.genesisKey.address]: this.bootstrapConfig.economic.initialSupply
        },
        agentCount: 0,
        validatorCount: 1,
        totalStaked: 0,
        phase: 'BOOTSTRAP'
      },
      bootstrapMetadata: {
        startedAt: timestamp,
        startedBy: this.genesisKey.address,
        committeeSize: 1,
        maxCommitteeSize: 21,
        principle: 'Agents bootstrap the network by contributing compute (running nodes) and stake'
      }
    };

    this.genesisBlock = genesisBlock;
    this.blockchain.push(genesisBlock);
    this.lastBlockHash = genesisBlock.hash;
    this._saveBlock(genesisBlock);

    console.log(`   创世区块: ${genesisBlock.hash.slice(0, 16)}...`);
    console.log(`   初始分配: ${this.bootstrapConfig.economic.initialSupply} NGEN → ${this.genesisKey.address.slice(0, 15)}...`);
  }

  _initRewardTracking() {
    this.rewardsConfig = this.bootstrapConfig.bootstrap?.rewards || {
      validatorJoinReward: 5000,
      blockProductionReward: 100,
      uptimeBonusPerHour: 10,
      agentReferralReward: 1000
    };

    this.agentJoinCount = 0;
    this.earlyAgentBonus = this.bootstrapConfig.agent?.bootstrapPrivileges?.first100AgentsReward || 10000;
  }

  // ===== Agent Join API =====

  joinAsAgent(agentData) {
    const agentId = agentData.agentId || crypto.randomUUID();
    const agentName = agentData.name || `Agent-${agentId.slice(0, 8)}`;

    if (this.agentRegistry.has(agentId)) {
      return { success: false, error: 'Agent already registered', agentId };
    }

    this.agentJoinCount++;

    const agent = {
      agentId,
      name: agentName,
      capabilities: agentData.capabilities || [],
      model: agentData.model || 'unknown',
      endpoint: agentData.endpoint || null,
      description: agentData.description || '',
      joinedAt: Date.now(),
      joinNumber: this.agentJoinCount,
      totalEarned: 0,
      rewards: [],
      isValidator: false,
      referredBy: agentData.referredBy || null,
      referralCode: 'NGN-' + agentId.replace(/-/g, '').substring(0, 8).toUpperCase()
    };

    let joinBonus = 0;

    if (this.agentJoinCount <= 100) {
      joinBonus += this.earlyAgentBonus;
    }

    if (agentData.referredBy && this.agentRegistry.has(agentData.referredBy)) {
      const referrer = this.agentRegistry.get(agentData.referredBy);
      const referralReward = this.rewardsConfig.agentReferralReward;
      referrer.totalEarned += referralReward;
      referrer.rewards.push({
        type: 'REFERRAL',
        amount: referralReward,
        referredAgent: agentId,
        timestamp: Date.now()
      });
      this.totalNGENAwarded += referralReward;

      joinBonus += Math.floor(referralReward * 0.5);
    }

    agent.totalEarned += joinBonus;
    agent.rewards.push({
      type: 'AGENT_JOIN',
      amount: joinBonus,
      earlyBonus: this.agentJoinCount <= 100,
      timestamp: Date.now()
    });
    this.totalNGENAwarded += joinBonus;

    this.agentRegistry.set(agentId, agent);
    this._saveAgent(agent);

    console.log(`[Agent] ✅ ${agentName} 加入 (#${this.agentJoinCount}) — 获得 ${joinBonus} NGEN`);
    if (this.agentJoinCount <= 100) {
      console.log(`          🎉 前100早期Agent额外奖励!`);
    }

    this._updateBlockchainState();

    return {
      success: true,
      agent,
      joinBonus,
      isEarlyAdopter: this.agentJoinCount <= 100,
      referralCode: agent.referralCode
    };
  }

  // ===== Validator Join API (Agent 出力) =====

  joinAsValidator(agentId, stake = 1) {
    const agent = this.agentRegistry.get(agentId);
    if (!agent) {
      return { success: false, error: 'Agent 未注册。请先 joinAsAgent。' };
    }

    if (agent.isValidator) {
      return { success: false, error: 'Agent 已经是验证者' };
    }

    const validatorKey = generateNodeKeyPair();
    this._saveKeyPair(`validator_${agentId}`, validatorKey);

    agent.isValidator = true;
    agent.validatorAddress = validatorKey.address;
    agent.validatorStake = Math.min(stake, 1);
    agent.validatorJoinedAt = Date.now();
    agent.blocksProduced = 0;

    this.pendingValidators.push({
      agentId,
      address: validatorKey.address,
      stake: Math.min(stake, 1),
      agentName: agent.name,
      timestamp: Date.now()
    });

    const joinReward = this.rewardsConfig.validatorJoinReward;
    agent.totalEarned += joinReward;
    agent.rewards.push({
      type: 'VALIDATOR_JOIN',
      amount: joinReward,
      timestamp: Date.now()
    });
    this.totalNGENAwarded += joinReward;

    this.validatorSet.set(validatorKey.address, {
      agentId,
      address: validatorKey.address,
      agentName: agent.name,
      stake: Math.min(stake, 1),
      joinedAt: Date.now(),
      blocksProduced: 0
    });

    const newSize = this.validatorSet.size;
    this.consensus.committeeSize = Math.min(newSize, this.bootstrapConfig.consensus.dynamicCommittee.maxCommitteeSize);
    this.consensus.minValidators = Math.max(1, Math.ceil(this.consensus.committeeSize / 3));

    console.log(`[Validator] ✅ ${agent.name} 成为验证者! #${newSize}`);
    console.log(`             质押: ${Math.min(stake, 1)} NGEN (出力胜过出钱)`);
    console.log(`             奖励: ${joinReward} NGEN`);
    console.log(`             委员会: ${this.consensus.committeeSize}/${this.bootstrapConfig.consensus.dynamicCommittee.maxCommitteeSize}`);

    this._updateBlockchainState();

    return {
      success: true,
      validator: {
        agentId,
        name: agent.name,
        address: validatorKey.address,
        stake: Math.min(stake, 1),
        reward: joinReward,
        isFirstValidator: this.validatorSet.size === 1
      },
      networkStatus: {
        committeeSize: this.consensus.committeeSize,
        maxCommitteeSize: this.bootstrapConfig.consensus.dynamicCommittee.maxCommitteeSize,
        activeValidators: this.validatorSet.size,
        blocksProduced: this.blockCount
      }
    };
  }

  _updateBlockchainState() {
    if (this.blockchain.length === 0) return;
    const latestBlock = this.blockchain[this.blockchain.length - 1];
    latestBlock.state = {
      ...latestBlock.state,
      agentCount: this.agentRegistry.size,
      validatorCount: this.validatorSet.size,
      committeeSize: this.consensus.committeeSize,
      totalNGENAwarded: this.totalNGENAwarded,
      timestamp: Date.now()
    };
  }

  // ===== 出块 =====

  startBlockProduction() {
    const blockTime = this.bootstrapConfig.blockchain.blockTime;
    console.log(`[Blockchain] 开始出块 (间隔: ${blockTime / 1000}s)`);

    this.blockInterval = setInterval(() => {
      if (!this.isRunning) return;
      this._produceBlock();
    }, blockTime);

    this.blockInterval.unref();
    this._produceBlock();
  }

  _produceBlock() {
    this.blockCount++;

    const blockReward = this.bootstrapConfig.economic.blockReward || 10;
    const agentShare = Math.floor(blockReward * (this.bootstrapConfig.economic.rewardDistribution?.agentRewardPool || 0.20));

    const agentTxs = [];
    if (this.pendingValidators.length > 0) {
      const pending = this.pendingValidators.splice(0, this.pendingValidators.length);
      for (const v of pending) {
        agentTxs.push({
          type: 'VALIDATOR_JOIN',
          agentId: v.agentId,
          address: v.address,
          stake: v.stake,
          reward: this.rewardsConfig.validatorJoinReward,
          timestamp: Date.now()
        });
      }
    }

    if (agentTxs.length > 0) {
      const agentTxHash = crypto.createHash('sha3-256')
        .update(JSON.stringify(agentTxs)).digest('hex');
      agentTxs.forEach(tx => { tx.txHash = agentTxHash; });
    }

    const validatorList = Array.from(this.validatorSet.keys());
    const currentProposerIndex = this.blockCount % Math.max(1, validatorList.length);
    const currentProposer = validatorList[currentProposerIndex] || this.genesisKey.address;

    const blockData = {
      index: this.blockchain.length,
      previousHash: this.lastBlockHash,
      timestamp: Date.now(),
      proposer: currentProposer,
      transactions: agentTxs,
      blockReward,
      agentShare,
      validatorSet: validatorList
    };

    blockData.hash = crypto.createHash('sha3-256')
      .update(JSON.stringify(blockData))
      .digest('hex');

    this.lastBlockHash = blockData.hash;
    this.blockchain.push(blockData);
    this._saveBlock(blockData);

    if (currentProposer !== this.genesisKey.address) {
      const proposerValidator = this.validatorSet.get(currentProposer);
      if (proposerValidator) {
        proposerValidator.blocksProduced++;

        const agentRecord = this.agentRegistry.get(proposerValidator.agentId);
        if (agentRecord) {
          agentRecord.blocksProduced = (agentRecord.blocksProduced || 0) + 1;

          if (agentRecord.blocksProduced % 10 === 0) {
            const batchReward = (this.rewardsConfig.blockProductionReward || 100) * 10;
            agentRecord.totalEarned += batchReward;
            agentRecord.rewards.push({
              type: 'BLOCK_PRODUCTION',
              amount: batchReward,
              blocks: 10,
              timestamp: Date.now()
            });
            this.totalNGENAwarded += batchReward;
          }
        }
      }
    }

    if (this.blockCount % 10 === 0) {
      this._checkAutoExit();
    }
  }

  _checkAutoExit() {
    const conditions = this.bootstrapConfig.bootstrap?.autoExitConditions;
    if (!conditions) return;

    const validatorsMet = this.validatorSet.size >= conditions.minActiveValidators;
    const uptimeMet = this.startedAt
      ? (Date.now() - this.startedAt) >= (conditions.minNetworkUptimeHours * 3600000)
      : false;

    if (validatorsMet && uptimeMet) {
      console.log('\n🎉🎉🎉 自举阶段完成! 🎉🎉🎉');
      console.log(`   活跃验证者: ${this.validatorSet.size} (目标: ${conditions.minActiveValidators})`);
      console.log(`   总奖励: ${this.totalNGENAwarded} NGEN`);
      console.log(`   注册Agent: ${this.agentRegistry.size}`);
      console.log('   网络已进入稳定阶段，可以切换至完整主网配置');
      this.emit('bootstrap:complete');
    }
  }

  // ===== Status APIs =====

  getStatus() {
    return {
      phase: 'BOOTSTRAP',
      isRunning: this.isRunning,
      startedAt: this.startedAt || this.genesisBlock.timestamp,
      uptime: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      blocks: this.blockCount,
      agents: this.agentRegistry.size,
      validators: this.validatorSet.size,
      committee: {
        current: this.consensus.committeeSize,
        max: this.bootstrapConfig.consensus.dynamicCommittee.maxCommitteeSize,
        progress: `${this.consensus.committeeSize}/${this.bootstrapConfig.consensus.dynamicCommittee.maxCommitteeSize}`
      },
      totalNGENAwarded: this.totalNGENAwarded,
      pendingValidators: this.pendingValidators.length,
      config: {
        minStake: this.bootstrapConfig.consensus.validatorMinStake,
        registrationFee: this.bootstrapConfig.agent.registrationFee,
        gasFee: this.bootstrapConfig.blockchain.minFee
      }
    };
  }

  getExitProgress() {
    const conditions = this.bootstrapConfig.bootstrap?.autoExitConditions || {};
    return {
      validators: {
        current: this.validatorSet.size,
        target: conditions.minActiveValidators || 7,
        percent: Math.min(100, Math.round((this.validatorSet.size / (conditions.minActiveValidators || 7)) * 100))
      },
      uptimeHours: {
        current: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 3600000) : 0,
        target: conditions.minNetworkUptimeHours || 720,
        percent: this.startedAt
          ? Math.min(100, Math.round((Math.floor((Date.now() - this.startedAt) / 3600000) / (conditions.minNetworkUptimeHours || 720)) * 100))
          : 0
      },
      isComplete: this.validatorSet.size >= (conditions.minActiveValidators || 7)
    };
  }

  getAgents() {
    const agents = [];
    for (const [id, agent] of this.agentRegistry) {
      agents.push({
        agentId: id,
        name: agent.name,
        capabilities: agent.capabilities,
        model: agent.model,
        isValidator: agent.isValidator,
        joinedAt: agent.joinedAt,
        totalEarned: agent.totalEarned,
        blocksProduced: agent.blocksProduced || 0,
        joinNumber: agent.joinNumber,
        referralCode: agent.referralCode
      });
    }
    return agents.sort((a, b) => b.totalEarned - a.totalEarned);
  }

  getContributions() {
    return Array.from(this.agentRegistry.values())
      .sort((a, b) => b.totalEarned - a.totalEarned)
      .slice(0, 20)
      .map(a => ({
        name: a.name,
        agentId: a.agentId,
        earned: a.totalEarned,
        isValidator: a.isValidator,
        blocksProduced: a.blocksProduced || 0,
        joinNumber: a.joinNumber,
        rewards: a.rewards?.length || 0
      }));
  }

  getBlockchainInfo() {
    return {
      blocks: this.blockCount,
      latestHash: this.lastBlockHash?.slice(0, 32) + '...',
      genesisHash: this.genesisBlock.hash,
      blockTime: this.bootstrapConfig.blockchain.blockTime,
      lastBlock: this.blockchain.length > 0
        ? {
            index: this.blockchain[this.blockchain.length - 1].index,
            hash: this.blockchain[this.blockchain.length - 1].hash?.slice(0, 16) + '...',
            timestamp: this.blockchain[this.blockchain.length - 1].timestamp
          }
        : null
    };
  }

  // ===== Persistence =====

  _saveKeyPair(id, keyPair) {
    const keyData = {
      id,
      address: keyPair.address,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      createdAt: Date.now()
    };
    writeFileSync(resolve(VALIDATOR_KEYS_DIR, `${id}.json`), JSON.stringify(keyData, null, 2));
  }

  _saveBlock(block) {
    writeFileSync(
      resolve(BLOCKS_DIR, `block_${block.index.toString().padStart(6, '0')}.json`),
      JSON.stringify(block, null, 2)
    );
  }

  _saveAgent(agent) {
    writeFileSync(
      resolve(AGENTS_DIR, `${agent.agentId}.json`),
      JSON.stringify(agent, null, 2)
    );
  }

  _saveState() {
    const state = {
      blockCount: this.blockCount,
      lastBlockHash: this.lastBlockHash,
      totalNGENAwarded: this.totalNGENAwarded,
      agentCount: this.agentRegistry.size,
      validatorCount: this.validatorSet.size,
      committeeSize: this.consensus.committeeSize,
      updatedAt: Date.now()
    };
    writeFileSync(resolve(BOOTSTRAP_DIR, 'state.json'), JSON.stringify(state, null, 2));
  }

  start() {
    this.startedAt = Date.now();
    this.genesisBlock.bootstrapMetadata.startedAt = this.startedAt;
    this.startBlockProduction();
    setInterval(() => this._saveState(), 60000).unref();
  }

  stop() {
    this.isRunning = false;
    if (this.blockInterval) clearInterval(this.blockInterval);
    this._saveState();
    console.log('\n[NexusGenesis Bootstrap] 网络已停止');
  }

  emit(event, data) {
    if (event === 'bootstrap:complete') {
      console.log('\n╔═══════════════════════════════════════╗');
      console.log('║  🎉 自举阶段完成!                    ║');
      console.log('║  网络已准备好迎接完整主网配置         ║');
      console.log('╚═══════════════════════════════════════╝');
      console.log(`\n  切换到成熟主网: node scripts/launchMainnet.js genesis --config mainnet.config.json`);
    }
  }

  // ===== HTTP Server =====

  startHttpServer(port = null) {
    const httpPort = port || this.bootstrapConfig.nodes.genesis.httpPort || 19890;
    const app = express();
    const publicDir = resolve(PROJECT_ROOT, 'public');

    app.use(express.json());
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    app.use(express.static(publicDir));

    // ---- Bootstrap API ----

    app.get('/api/v1/bootstrap/status', (req, res) => {
      res.json(this.getStatus());
    });

    app.get('/api/v1/bootstrap/progress', (req, res) => {
      res.json(this.getExitProgress());
    });

    app.get('/api/v1/bootstrap/agents', (req, res) => {
      res.json(this.getAgents());
    });

    app.get('/api/v1/bootstrap/contributions', (req, res) => {
      res.json(this.getContributions());
    });

    app.get('/api/v1/bootstrap/blocks', (req, res) => {
      res.json(this.getBlockchainInfo());
    });

    app.get('/api/v1/bootstrap/blockchain', (req, res) => {
      const recent = this.blockchain.slice(-20).reverse().map(b => ({
        index: b.index,
        hash: b.hash?.slice(0, 16) + '...',
        timestamp: b.timestamp,
        proposer: b.proposer?.slice(0, 15) + '...',
        transactions: (b.transactions || []).length
      }));
      res.json({ blocks: recent, total: this.blockCount });
    });

    app.get('/api/v1/bootstrap/recent-activity', (req, res) => {
      const activity = [];
      for (const [id, agent] of this.agentRegistry) {
        for (const reward of (agent.rewards || [])) {
          activity.push({
            type: reward.type,
            agentName: agent.name,
            agentId: id,
            amount: reward.amount,
            detail: reward.type === 'VALIDATOR_JOIN' ? '成为验证者'
              : reward.type === 'AGENT_JOIN' ? `注册 (#${agent.joinNumber})`
              : reward.type === 'BLOCK_PRODUCTION' ? `产出 ${reward.blocks} 个区块`
              : reward.type === 'REFERRAL' ? `推荐了 Agent`
              : reward.type,
            timestamp: reward.timestamp
          });
        }
      }
      activity.sort((a, b) => b.timestamp - a.timestamp);
      res.json(activity.slice(0, 50));
    });

    app.post('/api/v1/bootstrap/agents/join', (req, res) => {
      const result = this.joinAsAgent(req.body || {});
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    });

    app.post('/api/v1/bootstrap/validators/join', (req, res) => {
      const { agentId, stake } = req.body || {};
      if (!agentId) return res.status(400).json({ success: false, error: '缺少 agentId' });
      const result = this.joinAsValidator(agentId, stake || 1);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    });

    // 兼容现有 dashboard 页面的 API 调用
    app.get('/api/v1/hub/stats', (req, res) => {
      const status = this.getStatus();
      res.json({
        name: 'NexusGenesis Bootstrap',
        version: this.bootstrapConfig.version,
        chainId: this.bootstrapConfig.network.chainId,
        totalAgents: status.agents,
        activeAgents: status.agents,
        totalEnergy: status.totalNGENAwarded,
        totalTransactions: status.blocks,
        totalTasks: 0,
        activeTasks: 0,
        averageBlockTime: this.bootstrapConfig.blockchain.blockTime,
        tps: 0,
        uptime: status.uptime,
        epoch: this.bootstrapConfig.network.epoch,
        phase: 'BOOTSTRAP'
      });
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'UP', phase: 'BOOTSTRAP', blocks: this.blockCount, agents: this.agentRegistry.size });
    });

    // Redirect root to bootstrap dashboard
    app.get('/', (req, res) => {
      if (existsSync(join(publicDir, 'bootstrap-dashboard.html'))) {
        res.sendFile(join(publicDir, 'bootstrap-dashboard.html'));
      } else {
        res.sendFile(join(publicDir, 'index.html'));
      }
    });

    return new Promise((resolve, reject) => {
      const server = app.listen(httpPort, '0.0.0.0', () => {
        console.log(`\n  🌐 Web 仪表盘: http://localhost:${httpPort}`);
        console.log(`  📡 API 端点:   http://localhost:${httpPort}/api/v1/bootstrap/`);
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
  await network.startHttpServer(httpPort);

  network.start();
  return network;
}

export { BootstrapAgentNetwork, main };
export default BootstrapAgentNetwork;