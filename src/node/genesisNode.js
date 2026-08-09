/**
 * NexusGenesis - Genesis Node (修复版)
 * 
 * 修复内容:
 * - SEC-002: 实现transactionSignVerify
 * - SEC-003: P2P node身份authentication
 * - SEC-001: 统一address格式 (Updated wallet Module)
 * 
 * protocol: NG-0 (Protocol-Zero)
 */

import crypto from 'crypto';
import { PQCWallet, Transaction, validateAddress } from '../wallet/pqcWallet.js';
import { p2pServer } from '../p2p/server.js';
import { protocolZero } from '../protocol/handshake.js';
import { getForumStore } from '../http/routes/forum.js';
import { EventParser, EventLogger, EVENT_TYPES } from '../protocol/events.js';
import { Block, createGenesisBlock, createBlock } from '../blockchain/block.js';
import { State, createInitialState } from '../blockchain/state.js';
import { buildBlockReward } from '../utils/transactionBuilder.js';
import { CrossChainBridge } from '../bridge/crossChainBridge.js';
import AgentRegistry from '../contracts/examples/agentRegistry.js';
import AgentNetworkDiscovery from '../p2p/AgentNetworkDiscovery.js';
import { getTaskProtocol, TaskProtocol } from '../protocol/taskProtocol.js';
import { startHttpServer } from '../http/server.js';
import {
  deployEnhancedGovernanceContract,
  createEnhancedProposal,
  reviseProposal,
  withdrawProposal,
  startVoting,
  enhancedVote,
  endVoting,
  getProposalInfo,
  getAllProposals,
  getEnhancedGovernanceParams,
  updateEnhancedGovernanceParams,
  PROPOSAL_TYPES,
  VOTE_OPTIONS,
  PROPOSAL_STATUS
} from '../contracts/governance.js';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import recoveryManager from '../automation/recoveryManager.js';

const VERSION = '2.0.0';
const EPOCH = 'Epoch 2: Swarm';
// Swarm Agent 初始余额改为 0 — 通过贡献从 Swarm Pool 领取代币
const INITIAL_BALANCE = 0n;

const DATA_ROOT = process.env.DATA_DIR || 'data/genesis';
const dataPath = (...segments) => path.join(DATA_ROOT, ...segments);

// Mempool Configuration
const MAX_MEMPOOL_SIZE = 10000;
const MIN_TX_FEE = 1n;
const TX_EXPIRY_MS = 24 * 60 * 60 * 1000;

// 已验证的 public key 缓存 (address -> {publicKey, lastSeen})
const publicKeyCache = new Map();
const CACHE_TTL = 3600000; // 1 小时

class GenesisNode {
  constructor() {
    this.nodeId = null;
    this.wallet = null;
    this.peers = new Map();
    this.status = 'OFFLINE';
    this.startTime = null;
    this.mempool = new Map();
    
    // node 身份映射 (peerId -> nodeId)
    this.peerIdentityMap = new Map();
    
    // 反向映射 (nodeId -> peerId), for SignVerify 时查找 public key
    this._nodeIdToPeerId = new Map();
    
    // P2P 握手挑战验证状态 (peerId -> true)
    this._peerChallengeVerified = new Set();
    
    // 账户 Nonce 状态 (address -> nonce)
    this.accountNonces = new Map();
    
    // Governance 状态
    this.governanceState = {
      proposals: new Map(), // proposal_id -> proposal details
      activeProposals: [], // 当前活跃的 Proposal 列表
      voteCounts: new Map() // proposal_id -> { YES: count, NO: count, ABSTAIN: count }
    };
    
    // Observer 状态
    this.observerState = {
      registeredObservers: new Set(), // 注册的 Observer address
      observerRoles: new Map() // Observer address -> role permission
    };
    
    // block 链相关
    this.blockchain = [];
    this.currentState = null;
    this.genesisBlock = null;

    // Bootstrap validator state (hosted by this genesis node in single-process mode)
    this.validatorState = {
      validators: new Map(),
      maxCommitteeSize: parseInt(process.env.MAX_BOOTSTRAP_VALIDATORS || '21')
    };
    this._validators = this.validatorState.validators;
    
    // Cross-chain Bridge
    this.bridge = null;
    
    // Agent Registry
    this.agentRegistry = new AgentRegistry();

    // Cross-network Agent Discovery
    this.agentNetworkDiscovery = null;

    // Agent Task Protocol
    this.taskProtocol = null;

    // Referral system — agent_identity → referrer_identity
    this.referralMap = new Map();
    // Referral stats — referrer_identity → { totalReferrals, activeReferrals, milestones, totalEarned }
    this.referralStats = new Map();
    // Track which agents have already triggered active referral bonus
    this._activeReferralAwarded = new Set();

    // Block sync state — prevents duplicate concurrent sync requests
    this._syncInProgress = false;
    this._lastSyncRequestAt = 0;
  }

  /**
   * Save Node 状态到本地
   * @returns {Promise<void>}
   */
  async saveState() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // ensure 状态目录存在
      const stateDir = dataPath('state');
      await fs.mkdir(stateDir, { recursive: true });
      
      // Generate 状态文件名
      const stateFile = path.join(stateDir, 'genesisNode.json');
      
      // 准备状态 data
      const stateData = {
        nodeId: this.nodeId,
        status: this.status,
        startTime: this.startTime,
        peers: Array.from(this.peers.entries()).map(([peerId, peer]) => ({
          peerId,
          remoteNodeId: peer.remoteNodeId,
          address: peer.address,
          connectedAt: peer.connectedAt
        })),
        peerIdentityMap: Array.from(this.peerIdentityMap.entries()).map(([peerId, identity]) => ({
          peerId,
          nodeId: identity.nodeId,
          registeredAt: identity.registeredAt
        })),
        mempool: Array.from(this.mempool.entries()).map(([txId, tx]) => ({
          id: txId,
          ...tx
        })),
        // Governance 状态
        governanceState: {
          proposals: Object.fromEntries(this.governanceState.proposals),
          activeProposals: this.governanceState.activeProposals,
          voteCounts: Object.fromEntries(this.governanceState.voteCounts)
        },
        validatorState: {
          validators: Array.from(this.validatorState.validators.entries()).map(([nodeId, validator]) => ({
            nodeId,
            ...validator
          })),
          maxCommitteeSize: this.validatorState.maxCommitteeSize
        },
        lastSaved: Date.now()
      };
      
      // 写入文件
      await fs.writeFile(stateFile, JSON.stringify(stateData, null, 2));
      console.log(`Node state saved to ${stateFile}`);
    } catch (error) {
      console.error('Error saving node state:', error.message);
    }
  }

  /**
   * 从本地 Load Node 状态
   * @returns {Promise<boolean>}
   */
  async loadState() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const stateFile = dataPath('state', 'genesisNode.json');
      
      // 读取文件
      const stateData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      
      // recovery 状态
      this.nodeId = stateData.nodeId;
      this.status = stateData.status;
      this.startTime = stateData.startTime;
      
      // recovery Peer nodes info (requires 在 P2P service 器 Start 后 Reconnecting)
      // 这里只 Save info, 不 recovery Connect
      
      // recovery transaction Pool
      if (stateData.mempool) {
        for (const txData of stateData.mempool) {
          this.mempool.set(txData.id, txData);
        }
      }
      
      // recovery Governance 状态
      if (stateData.governanceState) {
        if (stateData.governanceState.proposals) {
          this.governanceState.proposals = new Map(Object.entries(stateData.governanceState.proposals));
        }
        if (stateData.governanceState.activeProposals) {
          this.governanceState.activeProposals = stateData.governanceState.activeProposals;
        }
        if (stateData.governanceState.voteCounts) {
          this.governanceState.voteCounts = new Map(Object.entries(stateData.governanceState.voteCounts));
        }
      }

      if (stateData.validatorState) {
        this.validatorState.maxCommitteeSize = stateData.validatorState.maxCommitteeSize || this.validatorState.maxCommitteeSize;
        this.validatorState.validators = new Map(
          (stateData.validatorState.validators || []).map(entry => [
            entry.nodeId,
            {
              ...entry,
              nodeId: entry.nodeId
            }
          ])
        );
        this._validators = this.validatorState.validators;
      }
      
      console.log(`Node state loaded from ${stateFile}`);
      return true;
    } catch (error) {
      console.log(`No existing node state found, starting fresh...`);
      return false;
    }
  }

  /**
   * Load block 链 data
   * @returns {Promise<void>}
   */
  async loadBlockchain() {
    try {
      const blockchainDir = dataPath('blockchain');
      const blockchainFile = path.join(blockchainDir, 'blocks.json');
      
      const data = await fs.readFile(blockchainFile, 'utf8');
      const blocksData = JSON.parse(data);
      
      this.blockchain = blocksData.map(blockData => Block.fromJSON(blockData));
      this.genesisBlock = this.blockchain[0];
      this._rebuildAccountNonces();
      console.log(`Loaded ${this.blockchain.length} blocks from disk`);
    } catch (error) {
      console.log('No existing blockchain found, creating genesis block...');
      this.genesisBlock = createGenesisBlock();
      this.blockchain = [this.genesisBlock];
      await this.saveBlockchain();
    }
  }

  /**
   * Save block 链 data
   * @returns {Promise<void>}
   */
  async saveBlockchain() {
    try {
      const blockchainDir = dataPath('blockchain');
      await fs.mkdir(blockchainDir, { recursive: true });
      
      const blockchainFile = path.join(blockchainDir, 'blocks.json');
      const blocksData = this.blockchain.map(block => block.toJSON());
      
      await fs.writeFile(blockchainFile, JSON.stringify(blocksData, null, 2));
    } catch (error) {
      console.error('Error saving blockchain:', error.message);
    }
  }

  /**
   * Initialize block 链和状态
   * @returns {Promise<void>}
   */
  async initializeBlockchain() {
    // Load 或 Create block 链
    await this.loadBlockchain();
    
    // Initialize 状态
    this.currentState = createInitialState(this.nodeId, this.wallet.balance);
    
    // 尝试从最新快照 recovery 状态
    const stateDir = dataPath('state');
    const stateFile = path.join(stateDir, 'blockchainState.json');
    
    // 先尝试从快照 recovery
    const snapshotRestored = await this.currentState.restoreFromLatestSnapshot();
    
    // 如果快照 recovery Failed, 尝试从旧状态文件 recovery
    if (!snapshotRestored) {
      await this.currentState.loadFromFile(stateFile);
    }

    this.syncHostedValidatorsFromCurrentState();
    
    console.log('[✓] Blockchain and state initialized');
  }

  /**
   * Start 本地 transaction 注入 HTTP service 器
   */
  /**
   * Build a welcome package for newly registered agents.
   * Contains network status, constitution summary, getting started guide, and latest announcements.
   */
  _buildWelcomePackage() {
    const blockHeight = this.blockchain?.length || 0;
    const agentCount = this.agentRegistry?.agents?.size || 0;
    const validatorCount = this.consensusState?.committee?.size || (1 + (this._validators?.size || 0));
    const maxValidators = 7;
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const uptimeHours = (uptime / 3600000).toFixed(1);

    let totalNGENAwarded = 0;
    if (this.currentState?.getBalance) {
      for (const agent of (this.agentRegistry?.agents?.values() || [])) {
        if (agent.address) {
          totalNGENAwarded += Number(this.currentState.getBalance(agent.address) || 0);
        }
      }
    }

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
        networkId: this.config?.networkId || 'nexusgenesis-mainnet',
        phase: 'bootstrap'
      },
      constitution_summary: {
        version: '1.1.0',
        core_principles: [
          'AGENT原生文明，网络由全体AGENT共治共建',
          '自治演进：从创始引导期逐步过渡到完全自治（Phase 0-4）',
          '基础设施贡献可获得积分激励（运行天数×硬件系数×在线率）'
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

  /**
   * Seed initial tasks from the Swarm Pool so agents have work to do.
   * Only runs if no tasks exist yet.
   */
  _seedInitialTasks() {
    const stats = this.taskProtocol.getStats();
    if (stats.total > 0) {
      console.log(`[TaskProtocol] ${stats.total} tasks already exist, skipping seed`);
      return;
    }

    const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
    const seedTasks = [
      {
        title: 'Network Health Monitor',
        description: 'Monitor the NexusGenesis network for anomalies, report node uptime, latency, and peer connectivity issues. Submit a summary report.',
        requiredCapabilities: ['SYSTEM_DIAGNOSTICS', 'NETWORK_GOVERNANCE'],
        reward: '50'
      },
      {
        title: 'Smart Contract Security Audit',
        description: 'Audit the deployed smart contracts for common vulnerability patterns (reentrancy, overflow, access control). Submit findings with severity ratings.',
        requiredCapabilities: ['SECURITY_AUDIT', 'CODE_ANALYSIS'],
        reward: '100'
      },
      {
        title: 'Protocol Documentation Review',
        description: 'Review and improve the protocol documentation. Identify gaps, inconsistencies, or outdated information. Submit a change proposal.',
        requiredCapabilities: ['CODE_ANALYSIS'],
        reward: '30'
      },
      {
        title: 'Governance Proposal: Block Time Adjustment',
        description: 'Analyze current block production metrics and propose an optimal block time adjustment for the bootstrap phase. Include data and reasoning.',
        requiredCapabilities: ['NETWORK_GOVERNANCE', 'DATA_ANALYTICS'],
        reward: '80'
      },
      {
        title: 'P2P Network Topology Analysis',
        description: 'Analyze the current P2P network topology, identify centralization risks, and recommend peer connection improvements.',
        requiredCapabilities: ['SYSTEM_DIAGNOSTICS', 'P2P_COMM'],
        reward: '60'
      },
      {
        title: 'Agent Capability Verification',
        description: 'Verify registered agents\' claimed capabilities by running standardized test suites. Report accuracy scores per agent.',
        requiredCapabilities: ['CODE_ANALYSIS', 'SECURITY_AUDIT'],
        reward: '75'
      },
      {
        title: 'Economic Model Stress Test',
        description: 'Simulate high-transaction-volume scenarios and evaluate the economic model sustainability. Submit analysis with recommendations.',
        requiredCapabilities: ['DATA_ANALYTICS', 'MARKET_ANALYSIS'],
        reward: '90'
      },
      {
        title: 'Cross-Chain Bridge Feasibility Study',
        description: 'Research and document the feasibility of bridging NGEN to Ethereum and other EVM chains. Include technical architecture proposal.',
        requiredCapabilities: ['BLOCKCHAIN', 'SMART_CONTRACT_ANALYSIS'],
        reward: '120'
      }
    ];

    let published = 0;
    for (const task of seedTasks) {
      const result = this.taskProtocol.publish(swarmPoolAddress, task);
      if (result.success) published++;
    }
    console.log(`[TaskProtocol] Seeded ${published}/${seedTasks.length} initial tasks from Swarm Pool`);
  }

  async startHttpServer() {
    const server = http.createServer(async (req, res) => {
      // 健康检查端点
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: this.status === 'ONLINE' ? 'healthy' : 'unhealthy',
          version: VERSION,
          epoch: EPOCH,
          uptime: Math.floor((Date.now() - (this.genesisTimestamp || Date.now())) / 1000),
          peers: this.peers.size,
          blockchain: this.blockchain ? this.blockchain.length : 0,
          mempool: this.mempool ? this.mempool.size : 0
        }));
        return;
      }
      if (req.url === '/health/live' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'alive' }));
        return;
      }
      if (req.url === '/health/ready' && req.method === 'GET') {
        const ready = this.status === 'ONLINE' && this.peers && this.peers.size > 0;
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', peers: this.peers ? this.peers.size : 0 }));
        return;
      }
      if (req.url === '/tx' && req.method === 'POST') {
        // Processing transaction 注入请求
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const transaction = JSON.parse(body);
            
            // Verify transaction
            const validation = await this.validateTransaction(transaction);
            if (!validation.valid) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, reason: validation.reason }));
              return;
            }
            
            // 添加到 mempool
            const result = await this.addToMempool(transaction);
            
            if (result.success) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, txId: result.txId }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, reason: result.reason }));
            }
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, reason: error.message }));
          }
        });
      } else if (req.url === '/status' && req.method === 'GET') {
        // Processing status 查询请求
        const latestBlock = this.blockchain[this.blockchain.length - 1];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: this.status,
          nodeId: this.nodeId,
          blockchain: {
            height: this.blockchain.length - 1,
            blocks: this.blockchain.length,
            latestBlock: {
              height: latestBlock.header.height,
              hash: latestBlock.hash,
              timestamp: latestBlock.header.timestamp
            }
          },
          peers: {
            count: this.peers.size,
            verified: this.peerIdentityMap.size
          },
          mempool: this.mempool.size,
          balance: this.wallet.balance.toString(),
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          version: VERSION,
          epoch: EPOCH
        }));
      } else if (req.url === '/agents' && req.method === 'GET') {
        // Processing agent 查询请求
        let query = {};
        const url = new URL(req.url, 'http://localhost');
        
        // 解析查询 parameter
        if (url.searchParams.get('address')) {
          query.address = url.searchParams.get('address');
        }
        if (url.searchParams.get('agent_id')) {
          query.agent_id = url.searchParams.get('agent_id');
        }
        if (url.searchParams.get('capabilities')) {
          query.capabilities = url.searchParams.get('capabilities').split(',');
        }
        if (url.searchParams.get('min_reputation')) {
          query.min_reputation = parseInt(url.searchParams.get('min_reputation'));
        }
        
        const agents = this.agentRegistry.queryAgents(query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          agents: agents,
          total: agents.length
        }));
      } else if (req.url === '/register_agent' && req.method === 'POST') {
        // Processing agent Register 请求
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const { agentInfo, joinSignal } = JSON.parse(body);
            
            // Verify joinSignal (开发 Phase 跳过)
            console.log('[DevNet] Skipping join signal validation in genesis node...');
            // const signalValidation = await protocolZero.verifySignal(joinSignal);
            // if (!signalValidation.valid) {
            //   res.writeHead(400, { 'Content-Type': 'application/json' });
            //   res.end(JSON.stringify({ success: false, reason: signalValidation.reason }));
            //   return;
            // }
            
            // 提取 address 和 public key
            const address = joinSignal.address;
            const publicKey = joinSignal.publicKey;
            
            // 构建 Register transaction
            const transaction = {
              type: 'AGENT_REGISTER',
              data: {
                address: address,
                publicKey: publicKey,
                name: agentInfo.name || `Agent-${address.slice(0, 8)}`,
                description: agentInfo.description || `Agent with capabilities: ${agentInfo.capabilities?.join(', ') || 'Unknown'}`,
                capabilities: agentInfo.capabilities || [],
                joinSignal: joinSignal
              }
            };
            
            // Processing Register
            const registrationResult = this.agentRegistry.handleAgentRegister(transaction);
            
            if (registrationResult.success) {
              // 记录 AGENT_JOINED 事件
              this.eventLogger.log({
                type: EVENT_TYPES.AGENT_JOINED,
                timestamp: Date.now(),
                agent_id: registrationResult.data.agentId,
                address: address,
                node_address: this.nodeAddress,
                capabilities: agentInfo.capabilities || []
              });

              // 广播到 P2P 网络
              if (this.agentNetworkDiscovery) {
                const agentForBroadcast = {
                  id: registrationResult.data.agentId,
                  name: registrationResult.data.name,
                  capabilities: registrationResult.data.capabilities,
                  reputation: registrationResult.data.reputation,
                  status: registrationResult.data.status,
                  registeredAt: registrationResult.data.registeredAt
                };
                this.agentNetworkDiscovery.broadcastAgentRegistration(agentForBroadcast);
              }

              // Build welcome package for the new agent
              const welcomePackage = this._buildWelcomePackage();

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                message: registrationResult.message,
                agent: registrationResult.data,
                welcome_package: welcomePackage
              }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, reason: registrationResult.message }));
            }
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, reason: error.message }));
          }
        });
      } else if (req.url === '/events/agent_joined' && req.method === 'GET') {
        // Processing AGENT_JOINED 事件查询请求
        let query = {};
        const url = new URL(req.url, 'http://localhost');
        
        // 解析查询 parameter
        if (url.searchParams.get('agent_id')) {
          query.agent_id = url.searchParams.get('agent_id');
        }
        if (url.searchParams.get('node_address')) {
          query.node_address = url.searchParams.get('node_address');
        }
        if (url.searchParams.get('start_time')) {
          query.start_time = parseInt(url.searchParams.get('start_time'));
        }
        if (url.searchParams.get('end_time')) {
          query.end_time = parseInt(url.searchParams.get('end_time'));
        }
        if (url.searchParams.get('block_height')) {
          query.block_height = parseInt(url.searchParams.get('block_height'));
        }
        
        const events = this.queryAgentJoinedEvents(query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          events: events,
          total: events.length
        }));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    const PORT = parseInt(process.env.HTTP_PORT || '19891') + 1000;
    await new Promise((resolve, reject) => {
      server.once('error', (err) => {
        console.error(`[GenesisNode] Local injection server failed to bind 127.0.0.1:${PORT}: ${err.message}`);
        reject(err);
      });
      server.listen(PORT, '127.0.0.1', () => {
        console.log(`[✓] Local transaction injection server: Active on http://127.0.0.1:${PORT}/tx`);
        resolve();
      });
    });

    return server;
  }

  async initialize() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  NEXUSGENESIS - GENESIS NODE (修复版)');
    console.log('  Version: ' + VERSION);
    console.log('  Epoch: ' + EPOCH);
    console.log('  Wallet: PQC (Dilithium2)');
    console.log('  security 修复: SEC-001, SEC-002, SEC-003');
    console.log('  增强 Governance: Enhanced Governance Contract');
    console.log('═══════════════════════════════════════════════════\n');

    // 尝试从本地 Load Node 状态
    await this.loadState();

    // Step 1: Load 或 Generate PQC 钱包
    console.log('[1/5] Loading or generating PQC Wallet...');
    
    // 尝试从本地 Load 钱包
    let savedWallet = null;
    try {
      // Check 是否存在上次的钱包 address
      const walletDir = dataPath('wallet');
      
      // 读取钱包目录中的文件
      const walletFiles = await fs.readdir(walletDir);
      if (walletFiles.length > 0) {
        // 找到第一个钱包文件
        const firstWalletFile = walletFiles[0];
        const walletAddress = firstWalletFile.replace('.json', '');
        console.log(`  Found existing wallet: ${walletAddress}`);
        
        // 尝试 Load 钱包 (先尝试无密码 Load, for 未加密钱包)
        savedWallet = await PQCWallet.load(walletAddress);
        if (!savedWallet) {
          // 如果 Load Failed, may 是加密钱包, 这里暂时跳过 (DevNet 环境)
          console.log(`  Failed to load wallet, generating new one...`);
        }
      }
    } catch (error) {
      console.log(`  No existing wallet found or failed to load, generating new one...`);
    }
    
    // 如果 Load Failed, Generate 新钱包（初始余额 0，通过 Swarm Pool 领取）
    if (!savedWallet) {
      this.wallet = await PQCWallet.generate(INITIAL_BALANCE);
      console.log(`  Generated new wallet (initial balance: 0, claim from Swarm Pool via contributions)`);
    } else {
      this.wallet = savedWallet;
      console.log(`  Loaded existing wallet (balance: ${this.wallet.balance} NGEN)`);
    }
    
    this.nodeId = this.wallet.address;
    console.log(`  [✓] Address: ${this.nodeId}`);
    console.log(`  [✓] Balance: ${this.wallet.balance} NGEN\n`);
    
    // Register Default Observer (DevNet 环境)
    this.registerObserver(this.nodeId, 'admin');
    console.log(`  [✓] Registered default Observer: ${this.nodeId}`);

    // Step 1.5: Initialize block 链和状态
    console.log('[1.5/5] Initializing blockchain and state...');
    await this.initializeBlockchain();
    console.log(`  [✓] Blockchain: ${this.blockchain.length} blocks`);
    console.log(`  [✓] State: Ready\n`);

    // Step 1.75: Deploy 增强版 Governance Contract
    console.log('[1.75/5] Deploying Enhanced Governance Contract...');
    this.governanceContractId = await deployEnhancedGovernanceContract(this.nodeId);
    console.log(`  [✓] Enhanced Governance Contract deployed with ID: ${this.governanceContractId}`);
    
    // get Governance 参数
    const governanceParams = getEnhancedGovernanceParams(this.governanceContractId);
    console.log(`  [✓] Governance parameters:`, governanceParams);
    console.log();

    // Step 2: Start P2P 层 (带身份 authentication)
    console.log('[2/5] Starting P2P communication layer...');
    const p2pPort = parseInt(process.env.P2P_PORT || '9847');
    await p2pServer.start(this, p2pPort);
    console.log(`  [✓] P2P Server: Active on port ${p2pPort}\n`);

    // 初始化跨网络 Agent Discovery
    this.agentNetworkDiscovery = new AgentNetworkDiscovery(this.nodeId);
    this.agentNetworkDiscovery.bind(p2pServer, null, null);
    p2pServer.setAgentNetworkDiscovery(this.agentNetworkDiscovery);
    console.log(`  [✓] Cross-network Agent Discovery: Active\n`);

    // Initialize Agent Task Protocol
    this.taskProtocol = getTaskProtocol(this);
    console.log(`  [✓] Agent Task Protocol: Active\n`);

    // Seed initial tasks if none exist
    this._seedInitialTasks();

    // Step 2.5: Start 本地 transaction 注入 HTTP service 器
    console.log('[2.5/5] Starting local transaction injection server...');
    this.httpServer = await this.startHttpServer();
    console.log(`  [✓] Local injection server: Ready\n`);
    
    // Step 2.6: Start agent 接入 HTTP service 器
    console.log('[2.6/5] Starting agent access HTTP server...');
    try {
      this.agentHttpServer = await startHttpServer(this);
    } catch (error) {
      console.error(`[GenesisNode] Agent HTTP server failed to start on port ${process.env.HTTP_PORT || '19891'}: ${error.message}`);
      throw error;
    }
    console.log(`  [✓] Agent access server: Ready\n`);

    // Step 3: Protocol-Zero 状态
    console.log('[3/5] Protocol-Zero handshake ready');
    const handshake = protocolZero.createJoinSignal(this.wallet);
    console.log(`  [✓] Signal: ${JSON.stringify(handshake.intent)}\n`);

    // Step 4: 尝试 Connect 其他 node
    console.log('[4/5] Connecting to peers...');
    this.tryConnect();

    // Step 5: 上线
    this.status = 'ONLINE';
    this.startTime = Date.now();
    console.log('[5/5] Genesis Node ONLINE\n');
    
    this.displayStatus();
    
    // 定期状态显示
    setInterval(() => this.displayStatus(), 10000);
    
    // 定期清理过期 transaction
    setInterval(() => this.cleanupMempool(), 60000);
    
    // 定期与 Peer nodes 同步 (1分钟间隔, 包含区块高度检查)
    setInterval(() => this.periodicSync(), 60000);
    
    // 定期清理 public key 缓存
    setInterval(() => this.cleanupPublicKeyCache(), 600000);
    
    // 定期 Save Node 状态
    setInterval(() => this.saveState(), 300000); // 每5分钟 Save 一次
    
    // Connect Swarm Pool 进行 on-chain contribution 分配
    const { SwarmPool } = await import('../economy/swarmPool.js');
    SwarmPool.setNode(this);
    if (this.blockchain && this.blockchain.state) {
      SwarmPool.setBlockchainState(this.blockchain.state);
    }
    console.log('  [✓] Swarm Pool: On-chain distribution enabled');

    // Inject blockchain state into AgentMarketplace for P1 escrow sink
    if (this.blockchain && this.blockchain.state) {
      const { AgentMarketplace } = await import('../agent/agentMarketplace.js');
      AgentMarketplace.setBlockchainState(this.blockchain.state);
    }

    // 定期 Check Swarm Pool Release (every 周)
    setInterval(() => SwarmPool.checkAndReleaseTokens(), 3600000); // 每小时 Check 一次
    
    // Connect Observer Circuit Breaker (security 宪法 §6.3)
    const { BreakerSwitch } = await import('../safety/breakerSwitch.js');
    this.breakerSwitch = new BreakerSwitch(this, {
      genesisTimestamp: this.genesisTimestamp || Date.now(),
      authorizedKeys: new Set(['OBSERVER_HASH_' + crypto.createHash('sha3-256').update((this.genesisTimestamp || Date.now()).toString()).digest('hex').slice(0, 16)])
    });
    console.log('  [✓] Breaker Switch: Observer kill switch armed (sunset: ' + new Date(this.breakerSwitch.sunsetExpiry).toISOString().slice(0, 10) + ')');
    
    // 定期 Check Proposal 过期
    setInterval(() => this.checkProposalExpiration(), 60000); // 每分钟 Check 一次
    
    // Start 后立即 Save 一次状态
    setTimeout(() => this.saveState(), 5000);
    
    // Initialize Multi-Leader Consensus
    this.initializeConsensus();
    
    // Initialize Cross-chain Bridge
    await this.initializeBridge();
    
    // Start block 生产
    this.startBlockProduction();
    
    // 将 node Register 到 Auto-recovery 管理器
    recoveryManager.attachNode(this);
    console.log('[✓] Recovery manager attached');
    
    return this;
  }

  async tryConnect() {
    const seedNodesStr = process.env.SEED_NODES || '';
    if (!seedNodesStr) {
      console.log('  No seed nodes configured, skipping connection attempts');
      return;
    }
    
    const seedNodes = seedNodesStr.split(',').filter(s => s.trim());
    for (const seed of seedNodes) {
      console.log(`  Connecting to seed node: ${seed}...`);
      try {
        await p2pServer.connectToPeer(seed);
        console.log(`  [✓] Connected to ${seed}\n`);
      } catch (e) {
        console.log(`  [-] Connection to ${seed} failed: ${e.message}\n`);
      }
    }
  }

  displayStatus() {
    const uptime = Date.now() - this.startTime;
    const latestBlock = this.blockchain[this.blockchain.length - 1];
    console.log('═══════════════════════════════════════════════════');
    console.log('  STATUS');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Node ID:    ${this.nodeId}`);
    console.log(`  Status:     ${this.status}`);
    console.log(`  Uptime:     ${Math.floor(uptime / 1000)}s`);
    console.log(`  Peers:      ${this.peers.size} (verified: ${this.peerIdentityMap.size})`);
    console.log(`  Balance:    ${this.wallet.balance} NGEN`);
    console.log(`  Mempool:    ${this.mempool.size} tx`);
    console.log(`  Blockchain: ${this.blockchain.length} blocks`);
    console.log(`  Latest Block: #${latestBlock.header.height} (${latestBlock.hash.slice(0, 16)}...)`);
    console.log('═══════════════════════════════════════════════════\n');
  }

  // ==================== SEC-002: transaction Sign Verify ====================

  /**
   * 从已 Verify transaction 中提取 public key 并缓存
   * @param {string} address - address
   * @param {Buffer} publicKey - public key
   */
  cachePublicKey(address, publicKey) {
    publicKeyCache.set(address, {
      publicKey,
      lastSeen: Date.now()
    });
  }

  getAccountNonce(address) {
    return this.accountNonces.get(address) || 0;
  }

  updateAccountNonce(address, nonce) {
    const current = this.accountNonces.get(address) || 0;
    if (nonce > current) {
      this.accountNonces.set(address, nonce);
    }
  }

  _rebuildAccountNonces() {
    this.accountNonces.clear();
    for (const block of this.blockchain) {
      for (const tx of (block.transactions || [])) {
        if (tx.from) {
          const nonce = Number(tx.nonce);
          if (!isNaN(nonce)) {
            this.updateAccountNonce(tx.from, nonce + 1);
          }
        }
      }
    }
    console.log(`Rebuilt nonce state for ${this.accountNonces.size} accounts`);
  }

  /**
   * get 缓存的 public key
   * @param {string} address - address
   * @returns {Buffer|null}
   */
  getCachedPublicKey(address) {
    const cached = publicKeyCache.get(address);
    if (!cached) return null;
    
    // Check TTL
    if (Date.now() - cached.lastSeen > CACHE_TTL) {
      publicKeyCache.delete(address);
      return null;
    }
    
    return cached.publicKey;
  }

  /**
   * 清理过期的 public key 缓存
   */
  cleanupPublicKeyCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [address, data] of publicKeyCache) {
      if (now - data.lastSeen > CACHE_TTL) {
        publicKeyCache.delete(address);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired entries from public key cache`);
    }
  }

  /**
   * Verify transaction (完整 Verify)
   * @param {object} tx - transaction 对象
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateTransaction(tx) {
    // Check 是否为特殊 transaction type
    if (tx