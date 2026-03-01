/**
 * NexusGenesis - 轻客户端实现
 * 支持区块头同步和默克尔证明验证
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import zlib from 'zlib';
import { PQCWallet, validateAddress } from '../wallet/pqcWallet.js';

class LightClient {
  constructor() {
    this.nodeId = null;
    this.wallet = null;
    this.peer = null;
    this.blockHeaders = [];
    this.bestBlockHeight = 0;
    this.bestBlockHash = null;
    this.status = 'OFFLINE';
    this.requests = new Map(); // 请求ID -> 回调函数
  }

  /**
   * 初始化轻客户端
   * @param {string} peerAddress - 全节点地址
   * @returns {Promise<LightClient>}
   */
  async initialize(peerAddress) {
    console.log('═══════════════════════════════════════════════════');
    console.log('  NEXUSGENESIS - LIGHT CLIENT');
    console.log('  Version: 1.0.0');
    console.log('  Protocol: NG-0 (Protocol-Zero)');
    console.log('═══════════════════════════════════════════════════\n');

    // 生成或加载钱包
    try {
      this.wallet = await PQCWallet.generate(0n); // 轻客户端初始余额为0
      this.nodeId = this.wallet.address;
      console.log(`[✓] Wallet initialized: ${this.nodeId.slice(0, 24)}...`);
    } catch (error) {
      console.error('Failed to initialize wallet:', error.message);
      throw error;
    }

    // 连接到全节点
    await this.connectToFullNode(peerAddress);

    // 同步区块头
    await this.syncBlockHeaders();

    this.status = 'ONLINE';
    console.log('[✓] Light client ONLINE');

    return this;
  }

  /**
   * 连接到全节点
   * @param {string} peerAddress - 全节点地址
   * @returns {Promise<void>}
   */
  async connectToFullNode(peerAddress) {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to full node: ${peerAddress}`);
      
      const ws = new WebSocket(peerAddress);
      
      ws.on('open', () => {
        console.log('[✓] Connected to full node');
        this.peer = ws;
        
        // 发送握手消息
        this.send({
          type: 'LIGHT_CLIENT_HELLO',
          nodeId: this.nodeId,
          publicKey: this.wallet.publicKey.toString('hex'),
          version: '1.0.0',
          capabilities: ['block_headers', 'merkle_proofs', 'transaction_status']
        });
        
        resolve();
      });
      
      ws.on('message', (data) => {
        this.handleMessage(data);
      });
      
      ws.on('close', () => {
        console.log('Disconnected from full node');
        this.status = 'OFFLINE';
        this.peer = null;
      });
      
      ws.on('error', (error) => {
        console.error('Connection error:', error.message);
        reject(error);
      });
    });
  }

  /**
   * 发送消息到全节点
   * @param {object} message - 消息对象
   * @param {function} callback - 回调函数
   */
  send(message, callback = null) {
    if (!this.peer || this.peer.readyState !== WebSocket.OPEN) {
      console.error('Not connected to full node');
      return;
    }

    // 添加请求ID
    const requestId = crypto.randomUUID();
    message.requestId = requestId;
    
    if (callback) {
      this.requests.set(requestId, callback);
      
      // 设置超时
      setTimeout(() => {
        if (this.requests.has(requestId)) {
          this.requests.delete(requestId);
          callback({ error: 'Request timeout' });
        }
      }, 10000);
    }

    this.peer.send(JSON.stringify(message));
  }

  /**
   * 处理来自全节点的消息
   * @param {Buffer} data - 消息数据
   */
  handleMessage(data) {
    try {
      let messageStr = data.toString();
      let message;
      
      // 处理压缩消息
      try {
        message = JSON.parse(messageStr);
        if (message.type === 'COMPRESSED_MESSAGE') {
          const compressedData = Buffer.from(message.data, 'base64');
          const decompressed = zlib.gunzipSync(compressedData);
          messageStr = decompressed.toString();
          message = JSON.parse(messageStr);
          console.log(`Decompressed message: ${message.originalSize} -> ${message.compressedSize} bytes`);
        }
      } catch (err) {
        console.error('Message parse error:', err.message);
        return;
      }
      
      switch (message.type) {
        case 'LIGHT_CLIENT_HELLO_ACK':
          console.log('[✓] Handshake with full node successful');
          break;
          
        case 'BLOCK_HEADERS':
          this.handleBlockHeaders(message);
          break;
          
        case 'MERKLE_PROOF':
          this.handleMerkleProof(message);
          break;
          
        case 'TRANSACTION_STATUS':
          this.handleTransactionStatus(message);
          break;
          
        case 'ADDRESS_BALANCE':
          console.log(`Address balance: ${message.address} -> ${message.balance}`);
          break;
          
        case 'TRANSACTION_ACCEPTED':
          console.log(`Transaction accepted: ${message.txId}`);
          break;
          
        case 'TRANSACTION_REJECTED':
          console.log(`Transaction rejected: ${message.txId}, reason: ${message.reason}`);
          break;
          
        case 'CROSS_CHAIN_RESPONSE':
          console.log('Cross-chain response received');
          break;
          
        case 'ERROR':
          console.error('Error from full node:', message.message);
          break;
          
        default:
          // 忽略其他消息类型
          break;
      }
      
      // 处理响应
      if (message.requestId && this.requests.has(message.requestId)) {
        const callback = this.requests.get(message.requestId);
        this.requests.delete(message.requestId);
        callback(message);
      }
    } catch (error) {
      console.error('Error handling message:', error.message);
    }
  }

  /**
   * 同步区块头
   * @returns {Promise<void>}
   */
  async syncBlockHeaders() {
    return new Promise((resolve) => {
      this.send({
        type: 'GET_BLOCK_HEADERS',
        startHeight: 0,
        count: 100
      }, (response) => {
        if (response.headers) {
          this.blockHeaders = response.headers;
          if (response.headers.length > 0) {
            const bestHeader = response.headers[response.headers.length - 1];
            this.bestBlockHeight = bestHeader.height;
            this.bestBlockHash = bestHeader.hash;
            console.log(`[✓] Synced ${response.headers.length} block headers, best block: #${this.bestBlockHeight}`);
          }
        }
        resolve();
      });
    });
  }

  /**
   * 处理区块头响应
   * @param {object} message - 区块头消息
   */
  handleBlockHeaders(message) {
    if (message.headers && message.headers.length > 0) {
      this.blockHeaders = [...this.blockHeaders, ...message.headers];
      const bestHeader = message.headers[message.headers.length - 1];
      this.bestBlockHeight = bestHeader.height;
      this.bestBlockHash = bestHeader.hash;
      console.log(`[✓] Received ${message.headers.length} block headers, best block: #${this.bestBlockHeight}`);
    }
  }

  /**
   * 请求默克尔证明
   * @param {string} txId - 交易ID
   * @returns {Promise<object>}
   */
  async getMerkleProof(txId) {
    return new Promise((resolve) => {
      this.send({
        type: 'GET_MERKLE_PROOF',
        txId
      }, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * 处理默克尔证明响应
   * @param {object} message - 默克尔证明消息
   */
  handleMerkleProof(message) {
    if (message.proof) {
      console.log(`[✓] Received merkle proof for transaction ${message.txId.slice(0, 16)}...`);
      // 验证默克尔证明
      const isValid = this.verifyMerkleProof(message.proof, message.txId, message.blockHash);
      console.log(`Merkle proof verification: ${isValid ? 'VALID' : 'INVALID'}`);
    }
  }

  /**
   * 验证默克尔证明
   * @param {object} proof - 默克尔证明
   * @param {string} txId - 交易ID
   * @param {string} blockHash - 区块哈希
   * @returns {boolean}
   */
  verifyMerkleProof(proof, txId, blockHash) {
    // 简化的默克尔证明验证
    let currentHash = txId;
    
    for (const step of proof.steps) {
      if (step.left) {
        currentHash = this.hashPair(step.left, currentHash);
      } else {
        currentHash = this.hashPair(currentHash, step.right);
      }
    }
    
    return currentHash === proof.root && proof.root === blockHash;
  }

  /**
   * 计算两个哈希的组合哈希
   * @param {string} left - 左哈希
   * @param {string} right - 右哈希
   * @returns {string}
   */
  hashPair(left, right) {
    const combined = left + right;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * 请求交易状态
   * @param {string} txId - 交易ID
   * @returns {Promise<object>}
   */
  async getTransactionStatus(txId) {
    return new Promise((resolve) => {
      this.send({
        type: 'GET_TRANSACTION_STATUS',
        txId
      }, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * 处理交易状态响应
   * @param {object} message - 交易状态消息
   */
  handleTransactionStatus(message) {
    if (message.status) {
      console.log(`[✓] Transaction ${message.txId.slice(0, 16)}... status: ${message.status}`);
      if (message.confirmations) {
        console.log(`Confirmations: ${message.confirmations}`);
      }
    }
  }

  /**
   * 检查地址余额
   * @param {string} address - 地址
   * @returns {Promise<object>}
   */
  async getAddressBalance(address) {
    return new Promise((resolve) => {
      this.send({
        type: 'GET_ADDRESS_BALANCE',
        address
      }, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * 发送交易
   * @param {object} transaction - 交易对象
   * @returns {Promise<object>}
   */
  async sendTransaction(transaction) {
    return new Promise((resolve) => {
      this.send({
        type: 'SEND_TRANSACTION',
        transaction
      }, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * 关闭轻客户端
   */
  async close() {
    if (this.peer) {
      this.peer.close();
    }
    this.status = 'OFFLINE';
    console.log('Light client closed');
  }

  /**
   * 显示状态
   */
  displayStatus() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  LIGHT CLIENT STATUS');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Node ID:    ${this.nodeId}`);
    console.log(`  Status:     ${this.status}`);
    console.log(`  Peer:       ${this.peer ? 'Connected' : 'Disconnected'}`);
    console.log(`  Block Height: ${this.bestBlockHeight}`);
    console.log(`  Best Block: ${this.bestBlockHash ? this.bestBlockHash.slice(0, 16) + '...' : 'None'}`);
    console.log(`  Headers Synced: ${this.blockHeaders.length}`);
    console.log('═══════════════════════════════════════════════════\n');
  }
}

// Auto-start only when this module is run directly
if (import.meta.url.includes(process.argv[1].replace(/\\/g, '/')) || import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting Light Client...');
  const client = new LightClient();
  client.initialize('ws://localhost:9847').then(() => {
    console.log('Light Client initialized successfully');
    client.displayStatus();
    
    // 定期显示状态
    setInterval(() => client.displayStatus(), 30000);
  }).catch(err => {
    console.error('Fatal error:', err);
    console.error('Error stack:', err.stack);
    process.exit(1);
  });
  
  // 防止进程退出
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    client.close().catch(err => console.error('Error during shutdown:', err));
  });
  
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    client.close().catch(err => console.error('Error during shutdown:', err));
  });
}

export { LightClient };