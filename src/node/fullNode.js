/**
 * Full Node - 全节点实现
 * 
 * 全节点不参与共识投票，但维护完整的区块链状态副本，
 * 响应查询请求，并转发交易到验证节点。
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import crypto from 'crypto';
import { PQCWallet } from '../wallet/pqcWallet.js';
import { getNetworkConfig, getSeedNodes, getMainnetConfig } from '../config/mainnetConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

class FullNode {
  constructor() {
    this.nodeId = crypto.randomBytes(32).toString('hex');
    this.config = getMainnetConfig();
    this.networkConfig = getNetworkConfig();
    this.wallet = null;
    this.peers = new Map();
    this.blockStore = new Map();
    this.txPool = new Map();
    this.state = null;
    this.isRunning = false;
    this.startTime = null;
    this.lastBlockHeight = 0;
    this.knownPeers = new Set();
    this.httpServer = null;
  }

  async initialize() {
    console.log(`[FULL_NODE] Initializing full node: ${this.nodeId.slice(0, 16)}...`);

    this.wallet = await PQCWallet.generate();

    console.log(`[FULL_NODE] Wallet generated: ${this.wallet.address.slice(0, 24)}...`);

    this.state = this.loadState();
    this.startTime = Date.now();
    this.isRunning = true;

    console.log(`[FULL_NODE] Chain ID: ${this.networkConfig.chainId}`);
    console.log(`[FULL_NODE] Network ID: ${this.networkConfig.networkId}`);
    console.log(`[FULL_NODE] Environment: ${this.networkConfig.environment}`);

    return this;
  }

  loadState() {
    const statePath = resolve(PROJECT_ROOT, 'data', 'state', 'fullnode_state.json');
    try {
      if (existsSync(statePath)) {
        return JSON.parse(readFileSync(statePath, 'utf8'));
      }
    } catch (err) {
      console.warn(`[FULL_NODE] Could not load state: ${err.message}`);
    }
    return {
      blockHeight: 0,
      lastBlockHash: null,
      syncStatus: 'syncing',
      peerCount: 0
    };
  }

  async connectToNetwork() {
    const seeds = getSeedNodes();
    console.log(`[FULL_NODE] Connecting to ${seeds.length} seed nodes...`);

    for (const seedUrl of seeds) {
      try {
        await this.connectToPeer(seedUrl);
      } catch (err) {
        console.warn(`[FULL_NODE] Failed to connect to seed ${seedUrl}: ${err.message}`);
      }
    }
  }

  async connectToPeer(peerUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(peerUrl);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        const peerId = crypto.randomUUID();

        this.peers.set(peerId, {
          ws,
          url: peerUrl,
          connectedAt: Date.now(),
          lastHeartbeat: Date.now(),
          status: 'handshaking'
        });

        this.sendHello(peerId);

        ws.on('message', (data) => {
          this.handleMessage(peerId, data);
        });

        ws.on('close', () => {
          console.log(`[FULL_NODE] Peer disconnected: ${peerUrl}`);
          this.peers.delete(peerId);
        });

        ws.on('error', (err) => {
          console.error(`[FULL_NODE] Peer error ${peerUrl}: ${err.message}`);
          this.peers.delete(peerId);
        });

        resolve(peerId);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  sendHello(peerId) {
    const conn = this.peers.get(peerId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;

    const message = {
      type: 'HELLO',
      nodeId: this.nodeId,
      publicKey: this.wallet.publicKey.toString('hex'),
      version: '1.0.0',
      epoch: this.networkConfig.epoch || 'Epoch 1: Genesis',
      role: 'full_node',
      capabilities: ['query', 'forward', 'state_sync'],
      chainId: this.networkConfig.chainId,
      timestamp: Date.now()
    };

    conn.ws.send(JSON.stringify(message));
  }

  handleMessage(peerId, data) {
    try {
      const message = JSON.parse(data.toString());
      const conn = this.peers.get(peerId);
      if (!conn) return;

      switch (message.type) {
        case 'HELLO_ACK':
          conn.status = 'connected';
          conn.remoteNodeId = message.nodeId;
          this.knownPeers.add(message.nodeId);
          console.log(`[FULL_NODE] Connected to ${message.nodeId?.slice(0, 16)}...`);
          this.requestStateSync(peerId);
          break;

        case 'BLOCK':
          this.processBlock(message.block);
          break;

        case 'STATE_SYNC':
          this.processStateSync(message);
          break;

        case 'TRANSACTION':
          this.processTransaction(message.transaction);
          break;

        case 'HEARTBEAT':
          conn.lastHeartbeat = Date.now();
          break;

        default:
          break;
      }
    } catch (err) {
      console.error(`[FULL_NODE] Message handling error: ${err.message}`);
    }
  }

  processBlock(block) {
    const blockHash = block.hash || crypto.createHash('sha3-256')
      .update(JSON.stringify(block)).digest('hex');

    if (this.blockStore.has(blockHash)) return;

    this.blockStore.set(blockHash, {
      ...block,
      hash: blockHash,
      receivedAt: Date.now()
    });

    if (block.height > this.lastBlockHeight) {
      this.lastBlockHeight = block.height;
      this.state.blockHeight = block.height;
      this.state.lastBlockHash = blockHash;
    }

    console.log(`[FULL_NODE] Block received: ${blockHash.slice(0, 16)}... height=${block.height}`);
  }

  processTransaction(tx) {
    const txHash = crypto.createHash('sha3-256')
      .update(JSON.stringify(tx)).digest('hex');

    this.txPool.set(txHash, {
      ...tx,
      hash: txHash,
      receivedAt: Date.now()
    });

    this.forwardTransaction(tx);
  }

  forwardTransaction(tx) {
    const message = {
      type: 'TRANSACTION_FORWARD',
      transaction: tx,
      forwardedBy: this.nodeId,
      timestamp: Date.now()
    };

    this.broadcast(message);
  }

  requestStateSync(peerId) {
    const message = {
      type: 'STATE_SYNC_REQUEST',
      fromHeight: this.lastBlockHeight,
      maxBlocks: 100,
      requestId: crypto.randomUUID(),
      timestamp: Date.now()
    };
    this.sendToPeer(peerId, message);
  }

  processStateSync(message) {
    if (message.blocks) {
      for (const block of message.blocks) {
        this.processBlock(block);
      }
    }
    if (message.height > this.lastBlockHeight) {
      this.lastBlockHeight = message.height;
    }
    this.state.syncStatus = 'synced';
    console.log(`[FULL_NODE] State synced to height ${this.lastBlockHeight}`);
  }

  sendToPeer(peerId, message) {
    const conn = this.peers.get(peerId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    for (const [peerId, conn] of this.peers) {
      this.sendToPeer(peerId, message);
    }
  }

  startHeartbeat() {
    setInterval(() => {
      this.broadcast({
        type: 'HEARTBEAT',
        nodeId: this.nodeId,
        blockHeight: this.lastBlockHeight,
        peerCount: this.peers.size,
        timestamp: Date.now()
      });
    }, 30000);
  }

  query(filters = {}) {
    const results = {
      blocks: [],
      transactions: []
    };

    if (filters.blockHeight) {
      for (const [hash, block] of this.blockStore) {
        if (block.height === filters.blockHeight) {
          results.blocks.push({ hash, ...block });
        }
      }
    }

    if (filters.txHash) {
      const tx = this.txPool.get(filters.txHash);
      if (tx) results.transactions.push(tx);
    }

    return results;
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      role: 'full_node',
      isRunning: this.isRunning,
      uptime: Date.now() - (this.startTime || Date.now()),
      chainId: this.networkConfig.chainId,
      networkId: this.networkConfig.networkId,
      blockHeight: this.lastBlockHeight,
      syncStatus: this.state.syncStatus,
      peerCount: this.peers.size,
      knownPeers: this.knownPeers.size,
      txPoolSize: this.txPool.size,
      blockStoreSize: this.blockStore.size,
      walletAddress: this.wallet?.address
    };
  }

  async shutdown() {
    console.log(`[FULL_NODE] Shutting down...`);
    this.isRunning = false;

    for (const [peerId, conn] of this.peers) {
      conn.ws.close();
    }
    this.peers.clear();

    console.log(`[FULL_NODE] Shutdown complete`);
  }
}

export default FullNode;