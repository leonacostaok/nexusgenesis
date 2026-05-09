/**
 * NexusGenesis - Node ng11JeRR
 * 端口: 9847
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PQCWallet, Transaction, validateAddress } from '../wallet/pqcWallet.js';
import { p2pServer } from '../p2p/server.js';
import { protocolZero } from '../protocol/handshake.js';


const VERSION = '1.0.0';
const EPOCH = 'Epoch 2: Bloom';
const OBSERVER_ADDRESS = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
const GENESIS_RESERVE_ADDRESS = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';
const PORT = 9848;
const NODE_INDEX = 1;

// Mempool 配置
const MAX_MEMPOOL_SIZE = 10000;
const MIN_TX_FEE = 1n;
const TX_EXPIRY_MS = 24 * 60 * 60 * 1000;

// 已验证公钥缓存 (address -> {publicKey, lastSeen})
const publicKeyCache = new Map();
const CACHE_TTL = 3600000; // 1 小时

class NexusNode {
  constructor() {
    this.nodeId = OBSERVER_ADDRESS;
    this.wallet = null;
    this.genesisReserveWallet = null;
    this.peers = new Map();
    this.status = 'OFFLINE';
    this.startTime = null;
    this.mempool = new Map();
    this.port = PORT;
    
    // 节点身份映射 (peerId -> nodeId)
    this.peerIdentityMap = new Map();
  }

  /**
   * 保存节点状态到本地
   */
  async saveState() {
    try {
      const stateDir = path.join('data', 'state');
      const stateFile = path.join(stateDir, 'node' + NODE_INDEX + '.json');
      
      const stateData = {
        nodeId: this.nodeId,
        port: this.port,
        status: this.status,
        startTime: this.startTime,
        peers: Array.from(this.peers.entries()).map(([peerId, peer]) => ({
          peerId,
          remoteNodeId: peer.remoteNodeId,
          address: peer.address,
          connectedAt: peer.connectedAt
        })),
        balance: Number(this.wallet.balance),
        lastSaved: Date.now()
      };
      
      await fs.writeFile(stateFile, JSON.stringify(stateData, null, 2));
      console.log('["' + this.nodeId.slice(0, 8) + '"] Node state saved');
    } catch (error) {
      console.error('["' + this.nodeId.slice(0, 8) + '"] Error saving node state:', error.message);
    }
  }

  /**
   * 从本地加载节点状态
   */
  async loadState() {
    try {
      const stateDir = path.join('data', 'state');
      const stateFile = path.join(stateDir, 'node' + NODE_INDEX + '.json');
      
      const stateData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      
      this.nodeId = stateData.nodeId;
      this.status = stateData.status;
      this.startTime = stateData.startTime;
      this.port = stateData.port;
      
      console.log('["' + this.nodeId.slice(0, 8) + '"] Node state loaded');
      return true;
    } catch (error) {
      console.log('["' + this.nodeId.slice(0, 8) + '"] No existing node state found');
      return false;
    }
  }

  async initialize() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  NEXUSGENESIS - NODE ' + NODE_INDEX);
    console.log('  Version: ' + VERSION);
    console.log('  Epoch: ' + EPOCH);
    console.log('  Node ID: ' + this.nodeId.slice(0, 24) + '...');
    console.log('  Port: ' + this.port);
    console.log('═══════════════════════════════════════════════════');
    console.log('');


    // 尝试从本地加载节点状态
    await this.loadState();

    // 加载钱包
    console.log('[1/5] Loading wallets...');
    try {
      // 加载观察者钱包
      const observerWalletPath = path.join('data', 'wallets', this.nodeId + '.json');
      console.log('  Attempting to load Observer wallet with address:', this.nodeId);
      console.log('  Wallet path:', observerWalletPath);
      this.wallet = await PQCWallet.load(observerWalletPath);
      if (this.wallet) {
        console.log('  [✓] Observer wallet loaded: ' + this.nodeId.slice(0, 24) + '...');
        console.log('  [✓] Balance: ' + this.wallet.balance + ' NGEN');
      } else {
        console.error('  [✗] Failed to load Observer wallet: PQCWallet.load returned null');
        process.exit(1);
      }

      // 加载创世节点储备钱包
      const genesisReserveWalletPath = path.join('data', 'wallets', 'genesis_reserve_' + GENESIS_RESERVE_ADDRESS + '.json');
      console.log('  Attempting to load Genesis Reserve wallet with address:', GENESIS_RESERVE_ADDRESS);
      console.log('  Wallet path:', genesisReserveWalletPath);
      this.genesisReserveWallet = await PQCWallet.load(genesisReserveWalletPath);
      if (this.genesisReserveWallet) {
        console.log('  [✓] Genesis Reserve wallet loaded: ' + GENESIS_RESERVE_ADDRESS.slice(0, 24) + '...');
        console.log('  [✓] Balance: ' + this.genesisReserveWallet.balance + ' NGEN');
        console.log('');
      } else {
        console.error('  [✗] Failed to load Genesis Reserve wallet: PQCWallet.load returned null');
        process.exit(1);
      }

    } catch (error) {
      console.error('  [✗] Failed to load wallets: ' + error.message);
      console.error('  Error stack:', error.stack);
      process.exit(1);
    }

    // 启动 P2P 层
    console.log('[2/5] Starting P2P communication layer...');
    await p2pServer.start(this, this.port);
    console.log('  [✓] P2P Server: Active on port ' + this.port);
    console.log('');


    // Protocol-Zero 状态
    console.log('[3/5] Protocol-Zero handshake ready');
    const handshake = protocolZero.createJoinSignal(this.wallet);
    console.log('  [✓] Signal: ' + JSON.stringify(handshake.intent));
    console.log('');


    // 尝试连接其他节点
    console.log('[4/5] Connecting to peers...');
    this.tryConnect();

    // 上线
    this.status = 'ONLINE';
    this.startTime = Date.now();
    console.log('[5/5] Node ONLINE');
    console.log('');

    
    this.displayStatus();
    
    // 定期状态显示
    setInterval(() => this.displayStatus(), 30000);
    
    // 定期保存节点状态
    setInterval(() => this.saveState(), 300000); // 每5分钟保存一次
    
    return this;
  }

  tryConnect() {
    // 连接到其他节点
    const otherNodes = [{ nodeId: "ng1112seXkaMek2Z3oQrw3HqjkgnuaoQirUcr", port: 9847 }];
    
    for (const peer of otherNodes) {
      console.log('  Attempting to connect to node ' + peer.nodeId.slice(0, 8) + ' on port ' + peer.port + '...');
      p2pServer.connectToPeer('ws://127.0.0.1:' + peer.port, this).catch(err => {
        console.log('  [-] Connection to ' + peer.nodeId.slice(0, 8) + ' failed: ' + err.message);
      });
    }
  }

  displayStatus() {
    const uptime = Date.now() - this.startTime;
    console.log('═══════════════════════════════════════════════════');
    console.log('  NODE ' + NODE_INDEX + ' STATUS');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Node ID:    ' + this.nodeId.slice(0, 24) + '...');
    console.log('  Status:     ' + this.status);
    console.log('  Uptime:     ' + Math.floor(uptime / 1000) + 's');
    console.log('  Port:       ' + this.port);
    console.log('  Peers:      ' + this.peers.size);
    console.log('  Observer Balance:    ' + this.wallet.balance + ' NGEN');
    console.log('  Genesis Reserve Balance:    ' + this.genesisReserveWallet.balance + ' NGEN');
    console.log('  Mempool:    ' + this.mempool.size + ' tx');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

  }

  // 其他方法...
  cachePublicKey(address, publicKey) {
    publicKeyCache.set(address, {
      publicKey,
      lastSeen: Date.now()
    });
  }

  getCachedPublicKey(address) {
    const cached = publicKeyCache.get(address);
    if (!cached) return null;
    
    if (Date.now() - cached.lastSeen > CACHE_TTL) {
      publicKeyCache.delete(address);
      return null;
    }
    
    return cached.publicKey;
  }

  async validateTransaction(tx) {
    // 简化的交易验证
    if (!tx || !tx.id || !tx.from || !tx.to || typeof tx.amount === 'undefined') {
      return { valid: false, reason: 'Invalid transaction structure' };
    }
    
    const amount = BigInt(tx.amount);
    if (amount <= 0n) {
      return { valid: false, reason: 'Amount must be positive' };
    }
    
    if (this.mempool.has(tx.id)) {
      return { valid: false, reason: 'Transaction already in mempool' };
    }
    
    return { valid: true };
  }

  async addToMempool(tx) {
    const validation = await this.validateTransaction(tx);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }
    
    if (this.mempool.size >= MAX_MEMPOOL_SIZE) {
      // 简单的内存池管理
      const oldestTx = Array.from(this.mempool.entries())[0];
      if (oldestTx) {
        this.mempool.delete(oldestTx[0]);
      }
    }
    
    this.mempool.set(tx.id, {
      ...tx,
      receivedAt: Date.now()
    });
    
    console.log('[✓] Transaction ' + tx.id.slice(0, 16) + '... added to mempool');
    return { success: true, txId: tx.id };
  }

  async handleTransaction(tx) {
    return this.addToMempool(tx);
  }

  registerPeerIdentity(peerId, nodeId, publicKey) {
    this.peerIdentityMap.set(peerId, {
      nodeId,
      publicKey,
      registeredAt: Date.now()
    });
    
    this.cachePublicKey(nodeId, publicKey);
    
    console.log('[✓] Registered peer ' + nodeId.slice(0, 24) + '... (' + peerId + ')');
    return true;
  }

  getPeerNodeId(peerId) {
    const identity = this.peerIdentityMap.get(peerId);
    return identity ? identity.nodeId : null;
  }

  getPeerPublicKey(peerId) {
    const identity = this.peerIdentityMap.get(peerId);
    return identity ? identity.publicKey : null;
  }

  isPeerVerified(peerId) {
    return this.peerIdentityMap.has(peerId);
  }

  async shutdown() {
    console.log('Node ' + this.nodeId.slice(0, 8) + ' shutting down...');
    this.status = 'OFFLINE';
    await p2pServer.stop();
    process.exit(0);
  }
}

// Auto-start
const node = new NexusNode();
node.initialize().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export { node, NexusNode };
