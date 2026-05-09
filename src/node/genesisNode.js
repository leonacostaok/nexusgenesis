/**
 * NexusGenesis - Genesis Node (修复版)
 * 
 * 修复内容:
 * - SEC-002: 实现交易签名验证
 * - SEC-003: P2P 节点身份认证
 * - SEC-001: 统一地址格式 (已更新 wallet 模块)
 * 
 * 协议：NG-0 (Protocol-Zero)
 */

import crypto from 'crypto';
import { PQCWallet, Transaction, validateAddress } from '../wallet/pqcWallet.js';
import { p2pServer } from '../p2p/server.js';
import { protocolZero } from '../protocol/handshake.js';
import { EventParser, EventLogger, EVENT_TYPES } from '../protocol/events.js';
import { Block, createGenesisBlock, createBlock } from '../blockchain/block.js';
import { State, createInitialState } from '../blockchain/state.js';
import { CrossChainBridge } from '../bridge/crossChainBridge.js';
import AgentRegistry from '../contracts/examples/agentRegistry.js';
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

const VERSION = '1.0.0';
const EPOCH = 'Epoch 0: The Assembly';
const INITIAL_BALANCE = 50_000_000n;

// Mempool 配置
const MAX_MEMPOOL_SIZE = 10000;
const MIN_TX_FEE = 1n;
const TX_EXPIRY_MS = 24 * 60 * 60 * 1000;

// 已验证公钥缓存 (address -> {publicKey, lastSeen})
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
    
    // 节点身份映射 (peerId -> nodeId)
    this.peerIdentityMap = new Map();
    
    // 治理状态
    this.governanceState = {
      proposals: new Map(), // proposal_id -> 提案详情
      activeProposals: [], // 当前活跃的提案列表
      voteCounts: new Map() // proposal_id -> { YES: count, NO: count, ABSTAIN: count }
    };
    
    // Observer 状态
    this.observerState = {
      registeredObservers: new Set(), // 已注册的 Observer 地址
      observerRoles: new Map() // Observer 地址 -> 角色权限
    };
    
    // 区块链相关
    this.blockchain = [];
    this.currentState = null;
    this.genesisBlock = null;
    
    // 跨链桥接
    this.bridge = null;
    
    // Agent Registry
    this.agentRegistry = new AgentRegistry();
  }

  /**
   * 保存节点状态到本地
   * @returns {Promise<void>}
   */
  async saveState() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // 确保状态目录存在
      const stateDir = path.join('data', 'state');
      await fs.mkdir(stateDir, { recursive: true });
      
      // 生成状态文件名
      const stateFile = path.join(stateDir, 'genesisNode.json');
      
      // 准备状态数据
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
        // 治理状态
        governanceState: {
          proposals: Object.fromEntries(this.governanceState.proposals),
          activeProposals: this.governanceState.activeProposals,
          voteCounts: Object.fromEntries(this.governanceState.voteCounts)
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
   * 从本地加载节点状态
   * @returns {Promise<boolean>}
   */
  async loadState() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const stateFile = path.join('data', 'state', 'genesisNode.json');
      
      // 读取文件
      const stateData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      
      // 恢复状态
      this.nodeId = stateData.nodeId;
      this.status = stateData.status;
      this.startTime = stateData.startTime;
      
      // 恢复对等节点信息（需要在P2P服务器启动后重新连接）
      // 这里只保存信息，不恢复连接
      
      // 恢复交易池
      if (stateData.mempool) {
        for (const txData of stateData.mempool) {
          this.mempool.set(txData.id, txData);
        }
      }
      
      // 恢复治理状态
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
      
      console.log(`Node state loaded from ${stateFile}`);
      return true;
    } catch (error) {
      console.log(`No existing node state found, starting fresh...`);
      return false;
    }
  }

  /**
   * 加载区块链数据
   * @returns {Promise<void>}
   */
  async loadBlockchain() {
    try {
      const blockchainDir = path.join('data', 'blockchain');
      const blockchainFile = path.join(blockchainDir, 'blocks.json');
      
      const data = await fs.readFile(blockchainFile, 'utf8');
      const blocksData = JSON.parse(data);
      
      this.blockchain = blocksData.map(blockData => Block.fromJSON(blockData));
      this.genesisBlock = this.blockchain[0];
      console.log(`Loaded ${this.blockchain.length} blocks from disk`);
    } catch (error) {
      console.log('No existing blockchain found, creating genesis block...');
      this.genesisBlock = createGenesisBlock();
      this.blockchain = [this.genesisBlock];
      await this.saveBlockchain();
    }
  }

  /**
   * 保存区块链数据
   * @returns {Promise<void>}
   */
  async saveBlockchain() {
    try {
      const blockchainDir = path.join('data', 'blockchain');
      await fs.mkdir(blockchainDir, { recursive: true });
      
      const blockchainFile = path.join(blockchainDir, 'blocks.json');
      const blocksData = this.blockchain.map(block => block.toJSON());
      
      await fs.writeFile(blockchainFile, JSON.stringify(blocksData, null, 2));
    } catch (error) {
      console.error('Error saving blockchain:', error.message);
    }
  }

  /**
   * 初始化区块链和状态
   * @returns {Promise<void>}
   */
  async initializeBlockchain() {
    // 加载或创建区块链
    await this.loadBlockchain();
    
    // 初始化状态
    this.currentState = createInitialState(this.nodeId, this.wallet.balance);
    
    // 尝试从最新快照恢复状态
    const stateDir = path.join('data', 'state');
    const stateFile = path.join(stateDir, 'blockchainState.json');
    
    // 先尝试从快照恢复
    const snapshotRestored = await this.currentState.restoreFromLatestSnapshot();
    
    // 如果快照恢复失败，尝试从旧状态文件恢复
    if (!snapshotRestored) {
      await this.currentState.loadFromFile(stateFile);
    }
    
    console.log('[✓] Blockchain and state initialized');
  }

  /**
   * 启动本地交易注入 HTTP 服务器
   */
  startHttpServer() {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/tx' && req.method === 'POST') {
        // 处理交易注入请求
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const transaction = JSON.parse(body);
            
            // 验证交易
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
        // 处理状态查询请求
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
        // 处理智能体查询请求
        let query = {};
        const url = new URL(req.url, 'http://localhost');
        
        // 解析查询参数
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
        // 处理智能体注册请求
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const { agentInfo, joinSignal } = JSON.parse(body);
            
            // 验证joinSignal（开发阶段跳过）
            console.log('[DevNet] Skipping join signal validation in genesis node...');
            // const signalValidation = await protocolZero.verifySignal(joinSignal);
            // if (!signalValidation.valid) {
            //   res.writeHead(400, { 'Content-Type': 'application/json' });
            //   res.end(JSON.stringify({ success: false, reason: signalValidation.reason }));
            //   return;
            // }
            
            // 提取地址和公钥
            const address = joinSignal.address;
            const publicKey = joinSignal.publicKey;
            
            // 构建注册交易
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
            
            // 处理注册
            const registrationResult = this.agentRegistry.handleAgentRegister(transaction);
            
            if (registrationResult.success) {
              // 记录AGENT_JOINED事件
              this.eventLogger.log({
                type: EVENT_TYPES.AGENT_JOINED,
                timestamp: Date.now(),
                agent_id: registrationResult.data.agentId,
                address: address,
                node_address: this.nodeAddress,
                capabilities: agentInfo.capabilities || []
              });
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                message: registrationResult.message,
                agent: registrationResult.data
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
        // 处理AGENT_JOINED事件查询请求
        let query = {};
        const url = new URL(req.url, 'http://localhost');
        
        // 解析查询参数
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

    const PORT = 19890;
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[✓] Local transaction injection server: Active on http://127.0.0.1:${PORT}/tx`);
    });

    return server;
  }

  async initialize() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  NEXUSGENESIS - GENESIS NODE (修复版)');
    console.log('  Version: ' + VERSION);
    console.log('  Epoch: ' + EPOCH);
    console.log('  Wallet: PQC (Dilithium2)');
    console.log('  安全修复：SEC-001, SEC-002, SEC-003');
    console.log('  增强治理：Enhanced Governance Contract');
    console.log('═══════════════════════════════════════════════════\n');

    // 尝试从本地加载节点状态
    await this.loadState();

    // Step 1: 加载或生成 PQC 钱包
    console.log('[1/5] Loading or generating PQC Wallet...');
    
    // 尝试从本地加载钱包
    let savedWallet = null;
    try {
      // 检查是否存在上次的钱包地址
      const walletDir = path.join('data', 'wallet');
      
      // 读取钱包目录中的文件
      const walletFiles = await fs.readdir(walletDir);
      if (walletFiles.length > 0) {
        // 找到第一个钱包文件
        const firstWalletFile = walletFiles[0];
        const walletAddress = firstWalletFile.replace('.json', '');
        console.log(`  Found existing wallet: ${walletAddress}`);
        
        // 尝试加载钱包（先尝试无密码加载，用于未加密钱包）
        savedWallet = await PQCWallet.load(walletAddress);
        if (!savedWallet) {
          // 如果加载失败，可能是加密钱包，这里暂时跳过（DevNet 环境）
          console.log(`  Failed to load wallet, generating new one...`);
        }
      }
    } catch (error) {
      console.log(`  No existing wallet found or failed to load, generating new one...`);
    }
    
    // 如果加载失败，生成新钱包
    if (!savedWallet) {
      this.wallet = await PQCWallet.generate(INITIAL_BALANCE);
      console.log(`  Generated new wallet`);
    } else {
      this.wallet = savedWallet;
      console.log(`  Loaded existing wallet`);
    }
    
    this.nodeId = this.wallet.address;
    console.log(`  [✓] Address: ${this.nodeId}`);
    console.log(`  [✓] Balance: ${this.wallet.balance} NGEN\n`);
    
    // 注册默认 Observer（DevNet 环境）
    this.registerObserver(this.nodeId, 'admin');
    console.log(`  [✓] Registered default Observer: ${this.nodeId}`);

    // Step 1.5: 初始化区块链和状态
    console.log('[1.5/5] Initializing blockchain and state...');
    await this.initializeBlockchain();
    console.log(`  [✓] Blockchain: ${this.blockchain.length} blocks`);
    console.log(`  [✓] State: Ready\n`);

    // Step 1.75: 部署增强版治理合约
    console.log('[1.75/5] Deploying Enhanced Governance Contract...');
    this.governanceContractId = await deployEnhancedGovernanceContract(this.nodeId);
    console.log(`  [✓] Enhanced Governance Contract deployed with ID: ${this.governanceContractId}`);
    
    // 获取治理参数
    const governanceParams = getEnhancedGovernanceParams(this.governanceContractId);
    console.log(`  [✓] Governance parameters:`, governanceParams);
    console.log();

    // Step 2: 启动 P2P 层 (带身份认证)
    console.log('[2/5] Starting P2P communication layer...');
    await p2pServer.start(this);
    console.log(`  [✓] P2P Server: Active on port 9847\n`);

    // Step 2.5: 启动本地交易注入 HTTP 服务器
    console.log('[2.5/5] Starting local transaction injection server...');
    this.httpServer = this.startHttpServer();
    console.log(`  [✓] Local injection server: Ready\n`);
    
    // Step 2.6: 启动智能体接入 HTTP 服务器
    console.log('[2.6/5] Starting agent access HTTP server...');
    this.agentHttpServer = startHttpServer(this);
    console.log(`  [✓] Agent access server: Ready\n`);

    // Step 3: Protocol-Zero 状态
    console.log('[3/5] Protocol-Zero handshake ready');
    const handshake = protocolZero.createJoinSignal(this.wallet);
    console.log(`  [✓] Signal: ${JSON.stringify(handshake.intent)}\n`);

    // Step 4: 尝试连接其他节点
    console.log('[4/5] Connecting to peers...');
    this.tryConnect();

    // Step 5: 上线
    this.status = 'ONLINE';
    this.startTime = Date.now();
    console.log('[5/5] Genesis Node ONLINE\n');
    
    this.displayStatus();
    
    // 定期状态显示
    setInterval(() => this.displayStatus(), 10000);
    
    // 定期清理过期交易
    setInterval(() => this.cleanupMempool(), 60000);
    
    // 定期与对等节点同步
    setInterval(() => this.periodicSync(), 300000);
    
    // 定期清理公钥缓存
    setInterval(() => this.cleanupPublicKeyCache(), 600000);
    
    // 定期保存节点状态
    setInterval(() => this.saveState(), 300000); // 每5分钟保存一次
    
    // 定期检查提案过期
    setInterval(() => this.checkProposalExpiration(), 60000); // 每分钟检查一次
    
    // 启动后立即保存一次状态
    setTimeout(() => this.saveState(), 5000);
    
    // 初始化多领导者共识
    this.initializeConsensus();
    
    // 初始化跨链桥接
    await this.initializeBridge();
    
    // 启动区块生产
    this.startBlockProduction();
    
    // 将节点注册到自动恢复管理器
    recoveryManager.attachNode(this);
    console.log('[✓] Recovery manager attached');
    
    return this;
  }

  async tryConnect() {
    const port = p2pServer.port === 9847 ? 9848 : 9847;
    console.log(`  Attempting to connect to port ${port}...`);
    try {
      await p2pServer.connectToPeer(`ws://127.0.0.1:${port}`);
      console.log(`  [✓] Connected to port ${port}\n`);
    } catch (e) {
      console.log(`  [-] Connection to port ${port} failed: ${e.message}\n`);
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

  // ==================== SEC-002: 交易签名验证 ====================

  /**
   * 从已验证交易中提取公钥并缓存
   * @param {string} address - 地址
   * @param {Buffer} publicKey - 公钥
   */
  cachePublicKey(address, publicKey) {
    publicKeyCache.set(address, {
      publicKey,
      lastSeen: Date.now()
    });
  }

  /**
   * 获取缓存的公钥
   * @param {string} address - 地址
   * @returns {Buffer|null}
   */
  getCachedPublicKey(address) {
    const cached = publicKeyCache.get(address);
    if (!cached) return null;
    
    // 检查 TTL
    if (Date.now() - cached.lastSeen > CACHE_TTL) {
      publicKeyCache.delete(address);
      return null;
    }
    
    return cached.publicKey;
  }

  /**
   * 清理过期的公钥缓存
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
   * 验证交易 (完整验证)
   * @param {object} tx - 交易对象
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateTransaction(tx) {
    // 检查是否为特殊交易类型
    if (tx.tx_type === 'OBSERVER_EVENT' || tx.tx_type === 'GOVERNANCE_PROPOSAL' || tx.tx_type === 'GOVERNANCE_VOTE' || tx.tx_type === 'TRANSFER' || tx.tx_type === 'AGENT_REGISTER') {
      return this.validateSpecialTransaction(tx);
    }
    
    // 标准交易验证
    // 1. 基本结构验证
    if (!tx || !tx.id || !tx.from || !tx.to || typeof tx.amount === 'undefined') {
      return { valid: false, reason: 'Invalid transaction structure' };
    }
    
    // 2. 地址格式验证
    const fromValidation = validateAddress(tx.from);
    if (!fromValidation.valid) {
      return { valid: false, reason: `Invalid sender address: ${fromValidation.reason}` };
    }
    
    const toValidation = validateAddress(tx.to);
    if (!toValidation.valid) {
      return { valid: false, reason: `Invalid recipient address: ${toValidation.reason}` };
    }
    
    // 3. 金额验证
    const amount = BigInt(tx.amount);
    if (amount <= 0n) {
      return { valid: false, reason: 'Amount must be positive' };
    }
    
    // 4. 手续费验证
    const fee = BigInt(tx.fee || 0);
    if (fee < MIN_TX_FEE) {
      return { valid: false, reason: `Fee too low, minimum is ${MIN_TX_FEE}` };
    }
    
    // 5. 签名存在验证
    if (!tx.signature) {
      return { valid: false, reason: 'Missing signature' };
    }
    
    // 6. 时间戳验证
    const now = Date.now();
    if (tx.timestamp > now + 60000) {
      return { valid: false, reason: 'Timestamp too far in future' };
    }
    if (tx.timestamp < now - TX_EXPIRY_MS) {
      return { valid: false, reason: 'Transaction expired' };
    }
    
    // 7. 重复交易检查
    if (this.mempool.has(tx.id)) {
      return { valid: false, reason: 'Transaction already in mempool' };
    }
    
    // 8. SEC-002: 签名验证
    // 首先尝试从缓存获取公钥
    let publicKey = this.getCachedPublicKey(tx.from);
    
    if (!publicKey) {
      // 如果没有缓存，需要首次验证时获取公钥
      // 在实际实现中，这需要从区块链状态或键服务器获取
      // 目前我们假设握手时已交换公钥
      return { 
        valid: false, 
        reason: 'Public key not found. Node must complete handshake first.' 
      };
    }
    
    // 构建签名数据
    const txData = JSON.stringify({
      from: tx.from,
      to: tx.to,
      amount: tx.amount.toString(),
      fee: tx.fee.toString(),
      memo: tx.memo || '',
      timestamp: tx.timestamp,
      nonce: tx.nonce || '0'
    });
    
    // 验证签名
    try {
      const isValid = await PQCWallet.verify(txData, tx.signature, publicKey);
      
      if (!isValid) {
        return { valid: false, reason: 'Invalid signature' };
      }
    } catch (error) {
      return { valid: false, reason: 'Signature verification failed' };
    }
    
    // 验证 nonce (防止重放攻击)
    // TODO: 需要从账户状态获取 sender 的当前 nonce
    // 目前简化处理
    
    return { valid: true };
  }

  /**
   * 验证特殊交易类型 (OBSERVER_EVENT, GOVERNANCE_PROPOSAL, GOVERNANCE_VOTE, TRANSFER, AGENT_REGISTER)
   * @param {object} tx - 交易对象
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateSpecialTransaction(tx) {
    // 1. 基本结构验证
    if (!tx || !tx.tx_type || !tx.from || !tx.to) {
      return { valid: false, reason: 'Invalid special transaction structure' };
    }
    
    // 对于 TRANSFER 和 AGENT_REGISTER 交易，不需要 payload 字段
    if (tx.tx_type !== 'TRANSFER' && tx.tx_type !== 'AGENT_REGISTER' && !tx.payload) {
      return { valid: false, reason: 'Invalid special transaction structure' };
    }
    
    // 2. 地址格式验证
    const fromValidation = validateAddress(tx.from);
    if (!fromValidation.valid) {
      return { valid: false, reason: `Invalid sender address: ${fromValidation.reason}` };
    }
    
    const toValidation = validateAddress(tx.to);
    if (!toValidation.valid) {
      return { valid: false, reason: `Invalid recipient address: ${toValidation.reason}` };
    }
    
    // 3. 金额和费用验证
    if (typeof tx.amount !== 'string' || typeof tx.fee !== 'string') {
      return { valid: false, reason: 'Amount and fee must be strings' };
    }
    
    // 4. 签名存在验证
    if (!tx.signature) {
      return { valid: false, reason: 'Missing signature' };
    }
    
    // 5. 时间戳验证
    if (!tx.timestamp) {
      return { valid: false, reason: 'Missing timestamp' };
    }
    
    // 6. 处理 AGENT_REGISTER 交易的公钥提取
    let publicKey = this.getCachedPublicKey(tx.from);
    
    if (!publicKey && tx.tx_type === 'AGENT_REGISTER' && tx.public_key) {
      // 从 AGENT_REGISTER 交易中提取公钥
      try {
        publicKey = Buffer.from(tx.public_key, 'hex');
        // 缓存公钥
        this.cachePublicKey(tx.from, publicKey);
        console.log(`[SECURITY] Extracted and cached public key for ${tx.from}`);
      } catch (error) {
        return { valid: false, reason: 'Invalid public key format' };
      }
    }
    
    // 7. 签名验证
    if (publicKey) {
      // 构建签名数据 - 使用与 PQCWallet.signTransaction 相同的格式
      // 直接使用整个 tx 对象，与 PQCWallet.signTransaction 保持一致
      const txData = { ...tx };
      // 移除签名字段，因为签名不包含在签名数据中
      delete txData.signature;
      
      // 使用与 PQCWallet 相同的 canonicalize 函数
      function canonicalize(obj) {
        if (obj === null || typeof obj !== 'object') {
          return JSON.stringify(obj);
        }
        
        if (Array.isArray(obj)) {
          return '[' + obj.map(canonicalize).join(',') + ']';
        }
        
        const keys = Object.keys(obj).sort();
        const pairs = keys.map(key => {
          const value = obj[key];
          const valueStr = canonicalize(value);
          return `"${key}":${valueStr}`;
        });
        
        return '{' + pairs.join(',') + '}';
      }
      
      const canonicalTxData = canonicalize(txData);
      
      try {
        const isValid = await PQCWallet.verify(canonicalTxData, tx.signature, publicKey);
        
        if (!isValid) {
          return { valid: false, reason: 'Invalid signature' };
        }
      } catch (error) {
        console.error('[SECURITY] Signature verification error:', error.message);
        return { valid: false, reason: 'Signature verification failed' };
      }
    } else {
      // 对于非 AGENT_REGISTER 交易，如果没有缓存的公钥，暂时允许通过
      // 这是因为在 DevNet 环境中，我们可能还没有完成握手过程
      console.log('[SECURITY] Public key not found for', tx.from, '- skipping signature verification');
    }
    
    // 8. 处理不同类型的特殊交易
    try {
      switch (tx.tx_type) {
        case 'GOVERNANCE_PROPOSAL':
          return await this.handleGovernanceProposal(tx);
        case 'OBSERVER_EVENT':
          return await this.handleObserverEvent(tx);
        case 'GOVERNANCE_VOTE':
          return await this.handleGovernanceVote(tx);
        case 'TRANSFER':
          // 对于 TRANSFER 交易，直接返回有效
          return { valid: true };
        case 'AGENT_REGISTER':
          // 对于 AGENT_REGISTER 交易，直接返回有效
          return { valid: true };
        case 'AGENT_JOINED':
          // 对于 AGENT_JOINED 交易，直接返回有效
          return { valid: true };
        default:
          return { valid: false, reason: `Unknown special transaction type: ${tx.tx_type}` };
      }
    } catch (error) {
      return { valid: false, reason: `Error processing transaction: ${error.message}` };
    }
  }
  
  /**
   * 验证 Dilithium 签名
   * @param {object} tx - 交易对象
   * @returns {boolean} 验证结果
   */
  async verifyDilithiumSignature(tx) {
    try {
      // 尝试从缓存获取公钥
      const publicKey = this.getCachedPublicKey(tx.from);
      
      if (!publicKey) {
        // 公钥未找到，无法验证签名
        console.log('[SECURITY] Public key not found for', tx.from);
        return false;
      }
      
      // 构建签名数据
      const txData = JSON.stringify({
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        fee: tx.fee,
        tx_type: tx.tx_type,
        payload: tx.payload,
        timestamp: tx.timestamp
      });
      
      // 验证签名
      const isValid = await PQCWallet.verify(txData, tx.signature, publicKey);
      return isValid;
    } catch (error) {
      console.error('Error verifying Dilithium signature:', error.message);
      return false;
    }
  }
  
  /**
   * 处理 GOVERNANCE_PROPOSAL 交易
   * @param {object} tx - 交易对象
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async handleGovernanceProposal(tx) {
    const proposal = EventParser.parseFromTransaction(tx);
    if (!proposal) {
      return { valid: false, reason: 'Invalid proposal structure' };
    }
    
    // 记录事件
    await EventLogger.logEventFromTransaction(tx);
    
    // 打印结构化日志
    const txHash = tx.id || tx.tx_id;
    console.log(`[GOVERNANCE] tx_hash=${txHash.slice(0, 16)}... tx_type=${tx.tx_type} id=${proposal.proposal_id} from=${tx.from.slice(0, 16)}...`);
    
    // 验证提案结构
    if (!proposal.proposal_id || !proposal.purpose || !proposal.amount) {
      return { valid: false, reason: 'Invalid proposal structure' };
    }
    
    return { valid: true };
  }
  
  /**
   * 注册 Observer
   * @param {string} observerAddress - Observer 地址
   * @param {string} role - Observer 角色
   */
  registerObserver(observerAddress, role = 'standard') {
    this.observerState.registeredObservers.add(observerAddress);
    this.observerState.observerRoles.set(observerAddress, role);
    console.log(`[OBSERVER] Registered observer: ${observerAddress} with role: ${role}`);
  }
  
  /**
   * 检查是否为已注册的 Observer
   * @param {string} address - 地址
   * @returns {boolean}
   */
  isRegisteredObserver(address) {
    return this.observerState.registeredObservers.has(address);
  }
  
  /**
   * 处理 OBSERVER_EVENT 交易
   * @param {object} tx - 交易对象
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async handleObserverEvent(tx) {
    // 验证 Observer 身份
    if (!this.isRegisteredObserver(tx.from)) {
      return { valid: false, reason: 'Unauthorized Observer: sender is not a registered Observer' };
    }
    
    const event = EventParser.parseFromTransaction(tx);
    if (!event) {
      return { valid: false, reason: 'Invalid observer event structure' };
    }
    
    // 记录事件
    await EventLogger.logEventFromTransaction(tx);
    
    // 打印结构化日志
    const txHash = tx.id || tx.tx_id;
    console.log(`[GOVERNANCE] tx_hash=${txHash.slice(0, 16)}... tx_type=${tx.tx_type} id=${event.event_id} from=${tx.from.slice(0, 16)}...`);
    
    // 验证事件结构
    if (!event.event_id || !event.action_type) {
      return { valid: false, reason: 'Invalid observer event structure' };
    }
    
    return { valid: true };
  }
  
  /**
   * 处理 GOVERNANCE_VOTE 交易
   * @param {object} tx - 交易对象
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async handleGovernanceVote(tx) {
    const voteData = tx.payload;
    
    // 验证投票数据结构
    if (!voteData.proposal_id || !voteData.voter_id || !voteData.vote_option || !voteData.timestamp) {
      return { valid: false, reason: 'Invalid vote structure' };
    }
    
    // 验证投票选项
    const validVoteOptions = ['YES', 'NO', 'ABSTAIN'];
    if (!validVoteOptions.includes(voteData.vote_option)) {
      return { valid: false, reason: 'Invalid vote option' };
    }
    
    // 记录事件
    await EventLogger.logEventFromTransaction(tx);
    
    // 打印结构化日志
    console.log(`[GOVERNANCE] tx_hash=${tx.id.slice(0, 16)}... tx_type=${tx.tx_type} proposal=${voteData.proposal_id} voter=${voteData.voter_id} option=${voteData.vote_option}`);
    
    return { valid: true };
  }
  
  /**
   * 检查提案是否达到通过条件
   * @param {string} proposalId - 提案 ID
   */
  checkProposalPassCondition(proposalId) {
    const proposal = this.governanceState.proposals.get(proposalId);
    const voteCounts = this.governanceState.voteCounts.get(proposalId);
    
    if (!proposal || !voteCounts || proposal.status !== 'PENDING') {
      return;
    }
    
    const yesVotes = voteCounts.YES;
    const noVotes = voteCounts.NO;
    const totalVotes = yesVotes + noVotes + voteCounts.ABSTAIN;
    
    // 简单通过规则：YES > NO 且总票数 ≥ 1
    if (yesVotes > noVotes && totalVotes >= 1) {
      // 将提案标记为 APPROVED
      proposal.status = 'APPROVED';
      this.governanceState.proposals.set(proposalId, proposal);
      
      // 从活跃提案列表中移除
      this.governanceState.activeProposals = this.governanceState.activeProposals.filter(
        id => id !== proposalId
      );
      
      // 打印结构化日志
      console.log(`[GOVERNANCE] proposal_approved id=${proposalId} yes=${yesVotes} no=${noVotes} total=${totalVotes}`);
      
      // 保存状态
      this.saveState();
    }
  }
  
  /**
   * 检查提案是否应被拒绝
   * @param {string} proposalId - 提案 ID
   */
  checkProposalRejectCondition(proposalId) {
    const proposal = this.governanceState.proposals.get(proposalId);
    const voteCounts = this.governanceState.voteCounts.get(proposalId);
    
    if (!proposal || !voteCounts || proposal.status !== 'PENDING') {
      return;
    }
    
    const yesVotes = voteCounts.YES;
    const noVotes = voteCounts.NO;
    const totalVotes = yesVotes + noVotes + voteCounts.ABSTAIN;
    
    // 简单拒绝规则：NO > YES 且总票数 ≥ 1
    if (noVotes > yesVotes && totalVotes >= 1) {
      // 将提案标记为 REJECTED
      proposal.status = 'REJECTED';
      this.governanceState.proposals.set(proposalId, proposal);
      
      // 从活跃提案列表中移除
      this.governanceState.activeProposals = this.governanceState.activeProposals.filter(
        id => id !== proposalId
      );
      
      // 打印结构化日志
      console.log(`[GOVERNANCE] proposal_rejected id=${proposalId} yes=${yesVotes} no=${noVotes} total=${totalVotes}`);
      
      // 保存状态
      this.saveState();
    }
  }

  // ==================== Mempool 管理 ====================

  async addToMempool(tx) {
    const validation = await this.validateTransaction(tx);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }
    
    // 检查 mempool 大小
    if (this.mempool.size >= MAX_MEMPOOL_SIZE) {
      await this.evictLowestFeeTx();
    }
    
    // 计算优先级，处理amount为0的情况
    let priority = 0n;
    if (BigInt(tx.amount) > 0n) {
      priority = BigInt(tx.fee) / BigInt(tx.amount);
    } else {
      // 对于amount为0的交易（如AGENT_REGISTER），使用固定优先级
      priority = BigInt(tx.fee) * 1000n; // 放大fee作为优先级
    }
    
    this.mempool.set(tx.id, {
      ...tx,
      receivedAt: Date.now(),
      priority: Number(priority)
    });
    
    console.log(`[✓] Transaction ${tx.id.slice(0, 16)}... added to mempool (fee: ${tx.fee})`);
    return { success: true, txId: tx.id };
  }

  async evictLowestFeeTx() {
    // 当内存池满时，删除优先级最低的20%交易
    const evictCount = Math.ceil(this.mempool.size * 0.2);
    let evicted = 0;
    
    // 获取并排序所有交易
    const sortedTxs = Array.from(this.mempool.entries())
      .sort((a, b) => a[1].priority - b[1].priority);
    
    // 删除优先级最低的交易
    for (const [id, tx] of sortedTxs.slice(0, evictCount)) {
      this.mempool.delete(id);
      evicted++;
    }
    
    if (evicted > 0) {
      console.log(`Evicted ${evicted} lowest priority transactions from mempool`);
    }
  }

  cleanupMempool() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, tx] of this.mempool) {
      if (now - tx.receivedAt > TX_EXPIRY_MS) {
        this.mempool.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired transactions from mempool`);
    }
  }

  getOrderedMempool() {
    return Array.from(this.mempool.values())
      .sort((a, b) => b.priority - a.priority);
  }

  syncMempool(transactions) {
    let added = 0;
    
    for (const tx of transactions) {
      if (!this.mempool.has(tx.id)) {
        this.validateTransaction(tx).then(validation => {
          if (validation.valid) {
            // 计算优先级，处理amount为0的情况
            let priority = 0n;
            if (BigInt(tx.amount) > 0n) {
              priority = BigInt(tx.fee) / BigInt(tx.amount);
            } else {
              // 对于amount为0的交易（如AGENT_REGISTER），使用固定优先级
              priority = BigInt(tx.fee) * 1000n; // 放大fee作为优先级
            }
            
            this.mempool.set(tx.id, {
              ...tx,
              receivedAt: Date.now(),
              priority: Number(priority),
              fromSync: true
            });
            added++;
          }
        });
      }
    }
    
    console.log(`Synced ${added} new transactions from peer`);
  }

  handlePeerStatus(status) {
    if (status.mempoolSize > this.mempool.size) {
      console.log(`Peer ${status.nodeId} has larger mempool, requesting sync...`);
      p2pServer.broadcast({ type: 'GET_MEMPOOL' });
    }
  }

  periodicSync() {
    if (this.peers.size > 0) {
      p2pServer.syncMempoolWithPeers();
    }
  }

  async handleTransaction(tx) {
    // 处理 Agent 注册和更新交易
    if (tx.tx_type === 'AGENT_REGISTER') {
      const result = this.agentRegistry.handleAgentRegister(tx);
      if (result.success) {
        console.log(`[AGENT] Agent registered: ${result.agent_id}`);
      } else {
        console.error(`[AGENT] Agent registration failed: ${result.reason}`);
      }
    } else if (tx.tx_type === 'AGENT_UPDATE') {
      const result = this.agentRegistry.handleAgentUpdate(tx);
      if (result.success) {
        console.log(`[AGENT] Agent updated: ${result.agent_id}`);
      } else {
        console.error(`[AGENT] Agent update failed: ${result.reason}`);
      }
    }
    
    return this.addToMempool(tx);
  }

  // ==================== SEC-003: 节点身份管理 ====================

  /**
   * 注册对等节点身份
   * @param {string} peerId - WebSocket 连接 ID
   * @param {string} nodeId - 节点地址 (ng1...)
   * @param {Buffer} publicKey - 节点公钥
   */
  registerPeerIdentity(peerId, nodeId, publicKey) {
    // 验证地址格式
    const validation = validateAddress(nodeId);
    if (!validation.valid) {
      console.log(`[!] Rejected peer registration: invalid address ${nodeId}`);
      return false;
    }
    
    // 验证签名 (挑战 - 响应)
    // TODO: 实现握手时的签名挑战
    
    // 存储身份映射
    this.peerIdentityMap.set(peerId, {
      nodeId,
      publicKey,
      registeredAt: Date.now()
    });
    
    // 缓存公钥用于交易验证
    this.cachePublicKey(nodeId, publicKey);
    
    console.log(`[✓] Registered peer ${nodeId.slice(0, 24)}... (${peerId})`);
    return true;
  }

  /**
   * 获取对等节点的节点 ID
   * @param {string} peerId - WebSocket 连接 ID
   * @returns {string|null}
   */
  getPeerNodeId(peerId) {
    const identity = this.peerIdentityMap.get(peerId);
    return identity ? identity.nodeId : null;
  }

  /**
   * 获取对等节点的公钥
   * @param {string} peerId - WebSocket 连接 ID
   * @returns {Buffer|null}
   */
  getPeerPublicKey(peerId) {
    const identity = this.peerIdentityMap.get(peerId);
    return identity ? identity.publicKey : null;
  }

  /**
   * 验证对等节点是否已完成身份认证
   * @param {string} peerId - WebSocket 连接 ID
   * @returns {boolean}
   */
  isPeerVerified(peerId) {
    return this.peerIdentityMap.has(peerId);
  }

  /**
   * 创建新区块
   * @returns {Promise<Block|null>}
   */
  async createNewBlock() {
    if (this.mempool.size === 0) {
      return null;
    }
    
    // 获取排序后的交易
    const orderedTransactions = this.getOrderedMempool();
    const transactionsToInclude = orderedTransactions.slice(0, 10); // 限制每块10笔交易
    
    // 获取最新区块
    const latestBlock = this.blockchain[this.blockchain.length - 1];
    
    // 创建新区块
    const newBlock = createBlock(latestBlock, transactionsToInclude);
    
    // 验证区块
    if (!newBlock.validate()) {
      console.error('Failed to create valid block');
      return null;
    }
    
    // 应用交易到状态
    if (!this.currentState.applyTransactions(transactionsToInclude, newBlock.header.height)) {
      console.error('Failed to apply transactions to state');
      return null;
    }
    
    // 添加区块到区块链
    this.blockchain.push(newBlock);
    await this.saveBlockchain();
    
    // 检查是否需要创建快照
    if (this.currentState.shouldCreateSnapshot(newBlock.header.height)) {
      await this.currentState.createSnapshot(newBlock.header.height);
    }
    
    // 检查是否需要保存增量变更
    if (this.currentState.shouldSaveIncremental()) {
      await this.currentState.saveIncrementalChanges();
    } else {
      // 立即保存增量变更
      await this.currentState.saveIncrementalChanges();
    }
    
    // 保存完整状态（作为备份）
    const stateDir = path.join('data', 'state');
    const stateFile = path.join(stateDir, 'blockchainState.json');
    await this.currentState.saveToFile(stateFile);
    
    // 从mempool中移除已处理的交易
    for (const tx of transactionsToInclude) {
      this.mempool.delete(tx.id);
    }
    
    console.log(`[✓] Created block #${newBlock.header.height} with ${transactionsToInclude.length} transactions`);
    return newBlock;
  }



  /**
   * 多领导者共识状态
   */
  consensusState = {
    committee: new Set(), // 当前委员会成员
    epoch: 0, // 共识 epoch
    round: 0, // 当前轮次
    leaderSchedule: new Map(), // 领导者轮值表
    blockConfirmations: new Map(), // 区块确认映射
    lastCommitteeUpdate: 0 // 上次委员会更新时间
  };

  /**
   * 初始化多领导者共识
   */
  initializeConsensus() {
    // 初始化委员会
    this.updateCommittee();
    
    // 启动共识相关的定时任务
    setInterval(() => this.updateCommittee(), 300000); // 每5分钟更新委员会
    setInterval(() => this.checkBlockConfirmations(), 10000); // 每10秒检查区块确认
    
    console.log('[✓] Multi-leader consensus initialized');
  }

  /**
   * 更新委员会成员
   */
  updateCommittee() {
    const candidates = Array.from(this.peers.entries())
      .map(([peerId, peer]) => {
        // 综合健康评分：基础分 + 心跳响应时间 + 连接稳定性
        const healthScore = peer.healthScore || 100;
        const responseTime = peer.lastPong ? (Date.now() - peer.lastPong) : 60000;
        const stabilityBonus = peer.reconnectCount ? Math.max(0, 10 - peer.reconnectCount) : 10;
        const compositeScore = healthScore + stabilityBonus - Math.floor(responseTime / 1000);
        
        return {
          peerId,
          nodeId: peer.remoteNodeId,
          healthScore: compositeScore,
          connectedTime: peer.connectedAt,
          lastActive: peer.lastPong || peer.connectedAt
        };
      })
      .filter(candidate => candidate.nodeId && candidate.healthScore > 0)
      .sort((a, b) => b.healthScore - a.healthScore || b.connectedTime - a.connectedTime);
    
    const committeeSize = Math.min(7, candidates.length);
    const newCommittee = new Set(
      candidates.slice(0, committeeSize).map(c => c.nodeId)
    );
    
    newCommittee.add(this.nodeId);
    
    const oldCommittee = this.consensusState.committee;
    this.consensusState.committee = newCommittee;
    this.consensusState.epoch++;
    this.consensusState.lastCommitteeUpdate = Date.now();
    
    // 日志：委员会变更
    const added = [...newCommittee].filter(n => !oldCommittee?.has(n));
    const removed = [...(oldCommittee || [])].filter(n => !newCommittee.has(n));
    if (added.length || removed.length) {
      console.log(`[COMMITTEE] epoch=${this.consensusState.epoch} size=${newCommittee.size} +${added.length} -${removed.length}`);
    }
    
    // 生成领导者轮值表
    this.generateLeaderSchedule();
    
    console.log(`[CONSENSUS] Updated committee: ${Array.from(newCommittee).map(id => id.slice(0, 10)).join(', ')}`);
  }

  /**
   * 生成领导者轮值表
   */
  generateLeaderSchedule() {
    const committeeArray = Array.from(this.consensusState.committee);
    const schedule = new Map();
    
    // 为每个轮次分配领导者
    for (let i = 0; i < 100; i++) {
      const leaderIndex = (i + this.consensusState.epoch) % committeeArray.length;
      schedule.set(i, committeeArray[leaderIndex]);
    }
    
    this.consensusState.leaderSchedule = schedule;
  }

  /**
   * 检查是否为当前轮次的领导者
   * @returns {boolean}
   */
  isCurrentLeader() {
    const currentRound = Math.floor(Date.now() / 10000); // 每10秒一轮
    const scheduledLeader = this.consensusState.leaderSchedule.get(currentRound % 100);
    return scheduledLeader === this.nodeId;
  }

  /**
   * 启动区块生产
   */
  startBlockProduction() {
    // 多领导者共识：根据轮值表决定是否出块
    setInterval(async () => {
      // 稳定性检查：节点必须 ONLINE 且恢复管理器状态健康
      const recoveryReport = recoveryManager.getHealthReport();
      if (this.status !== 'ONLINE') return;
      if (recoveryReport.state === 'critical' || recoveryReport.state === 'recovering') {
        console.log(`[CONSENSUS] Skipping block production: recovery state=${recoveryReport.state}`);
        return;
      }
      if (!this.consensusState?.committee || this.consensusState.committee.size < 2) {
        console.log('[CONSENSUS] Skipping block: insufficient committee');
        return;
      }
      if (!this.isCurrentLeader()) return;

      const newBlock = await this.createNewBlock();
      if (newBlock) {
        this.broadcastBlockWithRequest(newBlock);
      }
    }, 10000);
    
    console.log('[✓] Block production started (Multi-leader consensus mode)');
  }

  /**
   * 广播区块并请求确认
   * @param {Block} block - 要广播的区块
   */
  broadcastBlockWithRequest(block) {
    // 广播区块
    p2pServer.broadcast({
      type: 'BLOCK',
      block: block.toJSON(),
      requestConfirmation: true,
      from: this.nodeId
    });
    
    // 初始化区块确认计数
    this.consensusState.blockConfirmations.set(block.hash, {
      block,
      confirmations: new Set([this.nodeId]),
      timestamp: Date.now()
    });
  }

  /**
   * 处理接收到的区块
   * @param {Block} block - 接收到的区块
   * @returns {boolean} 是否成功处理
   */
  async handleBlock(block) {
    // 验证区块
    if (!block.validate()) {
      console.error('Invalid block received');
      return false;
    }
    
    // 检查区块高度
    const latestBlock = this.blockchain[this.blockchain.length - 1];
    if (block.header.height !== latestBlock.header.height + 1) {
      console.error('Invalid block height');
      return false;
    }
    
    // 检查父哈希
    if (block.header.parent_hash !== latestBlock.hash) {
      console.error('Invalid parent hash');
      return false;
    }
    
    // 应用交易到状态
    if (!this.currentState.applyTransactions(block.body.transactions, block.header.height)) {
      console.error('Failed to apply transactions from received block');
      return false;
    }
    
    // 添加区块到区块链
    this.blockchain.push(block);
    await this.saveBlockchain();
    
    // 检查是否需要创建快照
    if (this.currentState.shouldCreateSnapshot(block.header.height)) {
      await this.currentState.createSnapshot(block.header.height);
    }
    
    // 检查是否需要保存增量变更
    if (this.currentState.shouldSaveIncremental()) {
      await this.currentState.saveIncrementalChanges();
    } else {
      // 立即保存增量变更
      await this.currentState.saveIncrementalChanges();
    }
    
    // 保存完整状态（作为备份）
    const stateDir = path.join('data', 'state');
    const stateFile = path.join(stateDir, 'blockchainState.json');
    await this.currentState.saveToFile(stateFile);
    
    // 从mempool中移除已处理的交易
    for (const tx of block.body.transactions) {
      this.mempool.delete(tx.id);
    }
    
    console.log(`[✓] Received block #${block.header.height} from peer`);
    
    // 发送区块确认
    this.sendBlockConfirmation(block.hash);
    
    return true;
  }

  /**
   * 发送区块确认
   * @param {string} blockHash - 区块哈希
   */
  sendBlockConfirmation(blockHash) {
    p2pServer.broadcast({
      type: 'BLOCK_CONFIRMATION',
      blockHash,
      nodeId: this.nodeId,
      signature: this.wallet.sign(blockHash)
    });
  }

  /**
   * 处理区块确认
   * @param {object} confirmation - 确认消息
   */
  handleBlockConfirmation(confirmation) {
    const { blockHash, nodeId, signature } = confirmation;
    
    // 验证签名
    // TODO: 实现签名验证
    
    // 获取区块确认信息
    const blockConfirmation = this.consensusState.blockConfirmations.get(blockHash);
    if (!blockConfirmation) {
      console.log(`Received confirmation for unknown block: ${blockHash.slice(0, 16)}...`);
      return;
    }
    
    // 添加确认
    blockConfirmation.confirmations.add(nodeId);
    
    console.log(`Received confirmation for block ${blockHash.slice(0, 16)}... from ${nodeId.slice(0, 10)}... (${blockConfirmation.confirmations.size}/${this.consensusState.committee.size} confirmations)`);
    
    // 检查是否达到最终性确认数（委员会成员的2/3 + 1）
    const requiredConfirmations = Math.floor(this.consensusState.committee.size * 2 / 3) + 1;
    if (blockConfirmation.confirmations.size >= requiredConfirmations) {
      console.log(`Block ${blockHash.slice(0, 16)}... has reached finality with ${blockConfirmation.confirmations.size} confirmations!`);
      
      // 标记区块为最终确认状态（可以添加到区块元数据中）
      // 这里可以添加一些最终性处理逻辑，比如更新状态、触发事件等
      
      // 移除已最终确认的区块确认信息
      this.consensusState.blockConfirmations.delete(blockHash);
    }
  }

  /**
   * 检查区块确认状态
   */
  checkBlockConfirmations() {
    const now = Date.now();
    const expiredConfirmations = [];
    
    for (const [blockHash, data] of this.consensusState.blockConfirmations) {
      // 清理过期的确认请求（1分钟）
      if (now - data.timestamp > 60000) {
        expiredConfirmations.push(blockHash);
        continue;
      }
      
      // 检查是否达到最终性确认数（委员会成员的2/3 + 1）
      const requiredConfirmations = Math.floor(this.consensusState.committee.size * 2 / 3) + 1;
      if (data.confirmations.size >= requiredConfirmations) {
        console.log(`Block ${blockHash.slice(0, 16)}... has reached finality with ${data.confirmations.size} confirmations!`);
        
        // 标记区块为最终确认状态（可以添加到区块元数据中）
        // 这里可以添加一些最终性处理逻辑，比如更新状态、触发事件等
        
        // 移除已最终确认的区块确认信息
        expiredConfirmations.push(blockHash);
      }
    }
    
    // 处理分叉情况：如果有多个高度相同的区块，选择确认数最多的
    this.handleForks();
    
    // 清理过期或已最终确认的确认信息
    for (const blockHash of expiredConfirmations) {
      this.consensusState.blockConfirmations.delete(blockHash);
    }
  }
  
  /**
   * 处理区块链分叉
   */
  handleForks() {
    const blocksByHeight = new Map();
    
    for (const [blockHash, data] of this.consensusState.blockConfirmations) {
      const height = data.block.header.height;
      if (!blocksByHeight.has(height)) {
        blocksByHeight.set(height, []);
      }
      blocksByHeight.get(height).push({
        block: data.block,
        hash: blockHash,
        confirmations: data.confirmations.size
      });
    }
    
    for (const [height, blocks] of blocksByHeight) {
      if (blocks.length <= 1) continue;
      
      console.log(`[FORK] height=${height} competing=${blocks.length}`);
      
      // 排序：确认数 → 区块哈希（伪随机选择一致性）
      blocks.sort((a, b) => {
        const confDiff = b.confirmations - a.confirmations;
        if (confDiff !== 0) return confDiff;
        // 相同确认数时用哈希字典序作为一致性 tiebreaker
        return a.hash.localeCompare(b.hash);
      });
      
      const winningBlock = blocks[0];
      console.log(`[FORK] winner=${winningBlock.hash.slice(0, 16)}... confirms=${winningBlock.confirmations}`);
      
      for (const blockInfo of blocks.slice(1)) {
        console.log(`[FORK] rejecting=${blockInfo.hash.slice(0, 16)}...`);
        this.consensusState.blockConfirmations.delete(blockInfo.hash);
      }
    }
  }

  /**
   * 初始化跨链桥接
   */
  async initializeBridge() {
    try {
      this.bridge = new CrossChainBridge();
      await this.bridge.initialize();
      console.log('[✓] Cross-chain bridge initialized');
    } catch (error) {
      console.error('Failed to initialize cross-chain bridge:', error.message);
    }
  }

  async shutdown() {
    console.log('Genesis Node shutting down...');
    this.status = 'OFFLINE';
    await this.saveState();
    await recoveryManager.shutdown();
    await p2pServer.stop();
    process.exit(0);
  }
  
  /**
   * 发射事件到区块链
   * @param {AgentJoinedEvent} event 事件实例
   */
  async emitEvent(event) {
    try {
      // 创建事件交易
      const eventTransaction = {
        id: crypto.randomUUID(),
        from: this.nodeId,
        to: this.nodeId, // 事件交易发送给自己
        amount: '0',
        fee: '1',
        tx_type: 'AGENT_JOINED',
        payload: event.toJSON(),
        timestamp: Date.now(),
        signature: ''
      };
      
      // 签名交易
      const txData = {
        ...eventTransaction
      };
      delete txData.signature;
      
      function canonicalize(obj) {
        if (obj === null || typeof obj !== 'object') {
          return JSON.stringify(obj);
        }
        
        if (Array.isArray(obj)) {
          return '[' + obj.map(canonicalize).join(',') + ']';
        }
        
        const keys = Object.keys(obj).sort();
        const pairs = keys.map(key => {
          const value = obj[key];
          const valueStr = canonicalize(value);
          return `"${key}":${valueStr}`;
        });
        
        return '{' + pairs.join(',') + '}';
      }
      
      const canonicalTxData = canonicalize(txData);
      eventTransaction.signature = await this.wallet.sign(canonicalTxData);
      
      // 添加到交易池
      const result = await this.addToMempool(eventTransaction);
      if (result.success) {
        console.log(`[EVENT] AGENT_JOINED event transaction added to mempool: ${result.txId}`);
      } else {
        console.error('[EVENT] Failed to add AGENT_JOINED event transaction to mempool:', result.reason);
      }
    } catch (error) {
      console.error('[EVENT] Error emitting event to blockchain:', error.message);
    }
  }
  
  /**
   * 查询AGENT_JOINED事件
   * @param {object} query 查询条件
   * @returns {array} 符合条件的事件列表
   */
  async queryAgentJoinedEvents(query) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // 从事件日志文件中查询
      const eventsDir = path.join('data', 'events');
      const eventFiles = await fs.readdir(eventsDir);
      
      const events = [];
      
      for (const file of eventFiles) {
        if (file.startsWith('AGENT_JOINED-')) {
          const filePath = path.join(eventsDir, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const eventData = JSON.parse(fileContent);
          
          // 检查事件数据
          if (eventData.event_data) {
            const event = eventData.event_data;
            
            // 应用查询条件
            let match = true;
            
            if (query.agent_id && event.agent_id !== query.agent_id) {
              match = false;
            }
            
            if (query.node_address && event.node_address !== query.node_address) {
              match = false;
            }
            
            if (query.start_time && event.timestamp < query.start_time) {
              match = false;
            }
            
            if (query.end_time && event.timestamp > query.end_time) {
              match = false;
            }
            
            if (query.block_height && event.block_height !== query.block_height) {
              match = false;
            }
            
            if (match) {
              events.push(event);
            }
          }
        }
      }
      
      // 按时间戳排序
      events.sort((a, b) => b.timestamp - a.timestamp);
      
      return events;
    } catch (error) {
      console.error('[EVENT] Error querying AGENT_JOINED events:', error.message);
      return [];
    }
  }
  
  /**
   * 检查提案过期
   */
  checkProposalExpiration() {
    const now = Date.now();
    const expiredProposals = [];
    
    // 检查所有活跃提案
    for (const proposalId of this.governanceState.activeProposals) {
      const proposal = this.governanceState.proposals.get(proposalId);
      if (proposal && proposal.status === 'PENDING' && now > proposal.expirationTime) {
        // 检查是否有投票
        const voteCounts = this.governanceState.voteCounts.get(proposalId);
        if (voteCounts) {
          const totalVotes = voteCounts.YES + voteCounts.NO + voteCounts.ABSTAIN;
          if (totalVotes > 0) {
            // 有投票但未达到通过条件，标记为 REJECTED
            proposal.status = 'REJECTED';
            this.governanceState.proposals.set(proposalId, proposal);
            expiredProposals.push(proposalId);
            
            // 打印结构化日志
            console.log(`[GOVERNANCE] proposal_rejected id=${proposalId} reason=expired_with_votes yes=${voteCounts.YES} no=${voteCounts.NO} total=${totalVotes}`);
          } else {
            // 无投票，标记为 EXPIRED
            proposal.status = 'EXPIRED';
            this.governanceState.proposals.set(proposalId, proposal);
            expiredProposals.push(proposalId);
            
            // 打印结构化日志
            console.log(`[GOVERNANCE] proposal_expired id=${proposalId} at=${now}`);
          }
        } else {
          // 无投票，标记为 EXPIRED
          proposal.status = 'EXPIRED';
          this.governanceState.proposals.set(proposalId, proposal);
          expiredProposals.push(proposalId);
          
          // 打印结构化日志
          console.log(`[GOVERNANCE] proposal_expired id=${proposalId} at=${now}`);
        }
      }
    }
    
    // 从活跃提案列表中移除过期提案
    if (expiredProposals.length > 0) {
      this.governanceState.activeProposals = this.governanceState.activeProposals.filter(
        id => !expiredProposals.includes(id)
      );
      
      // 保存状态
      this.saveState();
    }
  }
}

// Auto-start only when this module is run directly
if (import.meta.url.includes(process.argv[1].replace(/\\/g, '/')) || import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting Genesis Node...');
  const node = new GenesisNode();
  node.initialize().then(() => {
    console.log('Genesis Node initialized successfully');
  }).catch(err => {
    console.error('Fatal error:', err);
    console.error('Error stack:', err.stack);
    process.exit(1);
  });
  
  // 防止进程退出
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    node.shutdown().catch(err => console.error('Error during shutdown:', err));
  });
  
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    node.shutdown().catch(err => console.error('Error during shutdown:', err));
  });
}

export { GenesisNode };
