/**
 * NexusGenesis - P2P 通信层 (修复版)
 * 
 * 修复内容:
 * - SEC-003: 添加节点身份认证 (Protocol-Zero 握手)
 * - 心跳检测优化
 * - 消息去重
 * - 自动重连
 */

import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'crypto';
import { PQCWallet } from '../wallet/pqcWallet.js';
import { MessageHandlerRegistry } from './handlers/MessageHandlerRegistry.js';
// 导入消息发送策略
import DirectSendingStrategy from './strategies/DirectSendingStrategy.js';
import BatchSendingStrategy from './strategies/BatchSendingStrategy.js';
import PrioritySendingStrategy from './strategies/PrioritySendingStrategy.js';
// 导入服务
import EncryptionService from './services/EncryptionService.js';
import CompressionService from './services/CompressionService.js';
// 导入职责链管理器
import MessageHandlerChainManager from './chain/MessageHandlerChainManager.js';

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

class KyberKEM {
  static generateKeyPair() {
    const { publicKey, secretKey } = ml_kem768.keygen();
    return {
      publicKey: Buffer.from(publicKey),
      privateKey: Buffer.from(secretKey)
    };
  }

  static encapsulate(publicKey) {
    const pk = new Uint8Array(publicKey);
    const { ciphertext, sharedSecret } = ml_kem768.encapsulate(pk);
    return {
      ciphertext: Buffer.from(ciphertext),
      sharedSecret: Buffer.from(sharedSecret)
    };
  }

  static decapsulate(ciphertext, privateKey) {
    const ct = new Uint8Array(ciphertext);
    const sk = new Uint8Array(privateKey);
    const sharedSecret = ml_kem768.decapsulate(ct, sk);
    return Buffer.from(sharedSecret);
  }
}

const DEFAULT_PORT = 9847;
const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;
const HANDSHAKE_TIMEOUT = 10000; // 10 秒握手超时
const NODE_DISCOVERY_INTERVAL = 60000; // 60秒节点发现间隔
const MAX_NODES = 50; // 最大节点数量
const HEALTH_CHECK_INTERVAL = 30000; // 30秒健康检查间隔
const BATCH_INTERVAL = 100; // 消息批处理间隔（毫秒）
const MAX_BATCH_SIZE = 100; // 最大批处理消息数
const COMPRESSION_THRESHOLD = 1024; // 压缩阈值（字节）

// 种子节点列表 - 测试网配置
const SEED_NODES = [
  'ws://localhost:9847',  // 本地开发节点
  // 可以添加其他对外可访问的种子节点
  // 'ws://seed1.nexusgenesis.test:9847',
  // 'ws://seed2.nexusgenesis.test:9847'
];

// 测试网配置
const TESTNET_CONFIG = {
  enabled: true,
  maxPeers: 50,
  discoveryInterval: 60000,
  healthCheckInterval: 30000
};

class P2PServer {
  constructor() {
    this.server = null;
    this.node = null;
    this.connections = new Map();
    this.peerAddresses = new Map();
    this.heartbeatTimers = new Map();
    this.reconnectTimers = new Map();
    this.batchTimers = new Map();
    this.batchQueues = new Map();
    this.seenMessages = new Set();
    
    // 待握手连接 (peerId -> {ws, timeout})
    this.pendingHandshakes = new Map();
    
    // 节点发现和健康检查
    this.discoveryTimer = null;
    this.healthCheckTimer = null;
    this.discoveredNodes = new Set();
    this.nodeHealth = new Map(); // 节点健康状态
    
    // 加密相关
    this.encryptionKeys = new Map(); // peerId -> sharedSecret
    this.kyberKeyPair = KyberKEM.generateKeyPair(); // 本节点的ML-KEM-768密钥对
    
    // 网络安全监控
    this.securityEvents = []; // 安全事件日志
    this.trafficStats = new Map(); // 流量统计
    this.suspiciousPeers = new Set(); // 可疑节点
    this.securityCheckTimer = null; // 安全检查定时器
    
    // 智能体路由映射
    this.nodeIdToPeerId = new Map(); // nodeId -> peerId
    this.peerIdToNodeId = new Map(); // peerId -> nodeId
    
    // 服务器启动时间
    this.startTime = Date.now();
    
    // 初始化服务
    this.encryptionService = new EncryptionService();
    this.compressionService = new CompressionService();
    
    // 初始化消息处理器注册表
    this.handlerRegistry = new MessageHandlerRegistry(this);
    
    // 初始化消息发送策略
    this.messageStrategies = {
      direct: new DirectSendingStrategy(this.encryptionService, this.compressionService),
      batch: new BatchSendingStrategy(this.encryptionService, this.compressionService),
      priority: new PrioritySendingStrategy(this.encryptionService, this.compressionService)
    };
    
    // 初始化默认策略
    this.defaultStrategy = this.messageStrategies.priority;
    
    // 初始化消息处理职责链
    this.messageHandlerChain = new MessageHandlerChainManager();
  }

  async start(node, port = DEFAULT_PORT) {
    this.node = node;
    this.port = port;
    
    // 添加 Genesis 节点自身到路由映射
    if (node && node.nodeId) {
      this.nodeIdToPeerId.set(node.nodeId, 'genesis'); // 使用特殊的 peerId 标识 Genesis 节点
      this.peerIdToNodeId.set('genesis', node.nodeId);
      console.log(`[✓] Added Genesis node to routing mapping: ${node.nodeId.slice(0, 24)}... -> genesis`);
    }
    
    return new Promise((resolve, reject) => {
      try {
        // 监听在所有网络接口上，允许外部连接
        this.server = new WebSocketServer({ port: this.port, host: '0.0.0.0' });
        
        this.server.on('connection', (ws, req) => {
          this.handleConnection(ws, req);
        });
        
        this.server.on('error', (err) => {
          console.error('P2P Server error:', err.message);
          reject(err);
        });
        
        this.server.on('listening', async () => {
          console.log(`P2P Server listening on port ${this.port}`);
          
          // 启动节点发现
          this.startNodeDiscovery();
          
          // 启动健康检查
          this.startHealthCheck();
          
          // 启动安全检查
          this.startSecurityCheck();
          
          // 尝试连接种子节点
          await this.connectToSeedNodes();
          
          resolve(true);
        });
        
      } catch (err) {
        reject(err);
      }
    });
  }

  handleConnection(ws, req, address = null) {
    const peerId = crypto.randomUUID();
    console.log(`[✓] New peer connected: ${peerId} from ${req?.connection?.remoteAddress || 'unknown'}`);
    
    // 初始状态：待握手
    const conn = { 
      ws, 
      status: 'handshaking',
      address,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      remoteNodeId: null,
      remotePublicKey: null,
      connectionAttempts: 0,
      healthScore: 100
    };
    
    this.connections.set(peerId, conn);
    
    // 设置握手超时
    const handshakeTimeout = setTimeout(() => {
      if (this.connections.has(peerId) && this.connections.get(peerId).status === 'handshaking') {
        console.log(`[!] Handshake timeout for peer ${peerId}, closing connection`);
        ws.close(1002, 'Handshake timeout');
      }
    }, HANDSHAKE_TIMEOUT);
    
    this.pendingHandshakes.set(peerId, { ws, timeout: handshakeTimeout });
    
    // 发送握手请求
    const challenge = crypto.randomBytes(32).toString('hex');
    this.send(peerId, {
      type: 'HELLO',
      nodeId: this.node.nodeId,
      publicKey: this.node.wallet.publicKey.toString('hex'),
      version: '1.0.0',
      epoch: EPOCH,
      challenge: challenge,
      timestamp: Date.now()
    });
    
    // 保存挑战到连接对象，以便验证响应
    conn.challengeSent = challenge;
    
    ws.on('message', (data) => {
      try {
        this.handleMessage(peerId, data);
      } catch (error) {
        console.error(`[!] Error handling message from peer ${peerId}:`, error.message);
        // 不关闭连接，继续处理其他消息
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`[!] Peer disconnected: ${peerId}, code: ${code}, reason: ${reason}`);
      this.cleanupPeer(peerId);
      
      if (address && this.peerAddresses.has(address)) {
        this.scheduleReconnect(address);
      }
    });
    
    ws.on('error', (err) => {
      console.error(`[!] Peer ${peerId} error:`, err.message);
      // 不立即关闭连接，让close事件处理
    });
  }

  startHeartbeat(peerId, ws) {
    if (this.heartbeatTimers.has(peerId)) {
      clearInterval(this.heartbeatTimers.get(peerId));
    }
    
    let missedPongs = 0;
    const MAX_MISSED_PONGS = 3;
    
    const timer = setInterval(() => {
      const conn = this.connections.get(peerId);
      if (!conn) {
        clearInterval(timer);
        return;
      }
      
      if (ws.readyState === WebSocket.OPEN) {
        // 检查上次心跳响应时间
        const now = Date.now();
        if (now - conn.lastHeartbeat > HEARTBEAT_INTERVAL * 1.5) {
          missedPongs++;
          console.log(`[!] Missing pong from peer ${peerId}, missed: ${missedPongs}`);
          
          if (missedPongs >= MAX_MISSED_PONGS) {
            console.log(`[!] Too many missed pongs from peer ${peerId}, closing connection`);
            ws.close(1008, 'No heartbeat response');
            clearInterval(timer);
            return;
          }
        }
        
        this.send(peerId, { 
          type: 'PING', 
          timestamp: Date.now(),
          nodeId: this.node.nodeId
        });
      } else {
        clearInterval(timer);
      }
    }, HEARTBEAT_INTERVAL);
    
    this.heartbeatTimers.set(peerId, timer);
  }

  handlePong(peerId) {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.lastHeartbeat = Date.now();
      conn.status = 'alive';
      // 重置健康分数
      conn.healthScore = Math.min(100, conn.healthScore + 5);
      console.log(`[✓] Received pong from peer ${peerId}, health: ${conn.healthScore}`);
    }
  }

  cleanupPeer(peerId) {
    if (this.heartbeatTimers.has(peerId)) {
      clearInterval(this.heartbeatTimers.get(peerId));
      this.heartbeatTimers.delete(peerId);
    }
    
    if (this.pendingHandshakes.has(peerId)) {
      clearTimeout(this.pendingHandshakes.get(peerId).timeout);
      this.pendingHandshakes.delete(peerId);
    }
    
    // 清理批处理相关资源
    if (this.batchTimers.has(peerId)) {
      clearTimeout(this.batchTimers.get(peerId));
      this.batchTimers.delete(peerId);
    }
    
    this.batchQueues.delete(peerId);
    
    // 清理智能体路由映射
    const nodeId = this.peerIdToNodeId.get(peerId);
    if (nodeId) {
      this.nodeIdToPeerId.delete(nodeId);
      this.peerIdToNodeId.delete(peerId);
      console.log(`[✓] Removed routing mapping for ${nodeId.slice(0, 24)}...`);
    }
    
    this.connections.delete(peerId);
    
    if (this.node) {
      this.node.peers.delete(peerId);
      this.node.peerIdentityMap.delete(peerId);
    }
  }
  
  /**
   * 根据节点ID获取对应的peerId
   * @param {string} nodeId - 节点ID
   * @returns {string|null} - 对应的peerId
   */
  getPeerIdByNodeId(nodeId) {
    return this.nodeIdToPeerId.get(nodeId) || null;
  }
  
  /**
   * 根据peerId获取对应的节点ID
   * @param {string} peerId - peerId
   * @returns {string|null} - 对应的节点ID
   */
  getNodeIdByPeerId(peerId) {
    return this.peerIdToNodeId.get(peerId) || null;
  }
  
  /**
   * 通过路由发送消息
   * @param {string} routeAddress - 路由地址
   * @param {object} message - 消息对象
   */
  sendToRoute(routeAddress, message) {
    // 查找路由节点的连接
    for (const [peerId, conn] of this.connections) {
      if (conn.address === routeAddress && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        this.send(peerId, message);
        return;
      }
    }
    
    // 如果没有直接连接，尝试建立连接
    console.log(`[!] Route ${routeAddress} not connected, trying to establish connection`);
    this.connectToPeer(routeAddress).then(peerId => {
      if (peerId) {
        setTimeout(() => {
          this.send(peerId, message);
        }, 1000); // 等待连接建立
      }
    }).catch(err => {
      console.error(`[!] Failed to connect to route ${routeAddress}:`, err.message);
    });
  }

  scheduleReconnect(address) {
    const info = this.peerAddresses.get(address) || { attempts: 0 };
    
    if (info.attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`Max reconnect attempts reached for ${address}`);
      this.peerAddresses.delete(address);
      return;
    }
    
    if (this.reconnectTimers.has(address)) {
      clearTimeout(this.reconnectTimers.get(address));
    }
    
    const timer = setTimeout(async () => {
      console.log(`Reconnecting to ${address} (attempt ${info.attempts + 1})...`);
      try {
        await this.connectToPeer(address);
        this.peerAddresses.set(address, { attempts: 0 });
      } catch (e) {
        info.attempts++;
        this.peerAddresses.set(address, info);
        this.scheduleReconnect(address);
      }
    }, RECONNECT_DELAY * (info.attempts + 1));
    
    this.reconnectTimers.set(address, timer);
  }

  /**
   * 检查消息是否符合 Protocol-Zero 格式
   * @param {object} msg - 消息对象
   * @returns {boolean} - 是否符合格式
   */
  isProtocolZeroFormat(msg) {
    // 核心网络消息类型
    const validMessageTypes = [
      'HELLO', 'HELLO_ACK', 'PING', 'PONG',
      'TRANSACTION', 'TX_REJECTED',
      'GET_STATUS', 'STATUS_UPDATE',
      'GET_MEMPOOL', 'MEMPOOL_SYNC',
      'PROTOCOL_ZERO', 'JOIN_SWARM', 'SWARM_ACK',
      'BATCH_MESSAGE', 'COMPRESSED_MESSAGE',
      'ENCRYPTED_MESSAGE',
      'BLOCK', 'BLOCK_CONFIRMATION',
      'GET_NODE_LIST', 'NODE_LIST',
      'LIGHT_CLIENT_HELLO', 'LIGHT_CLIENT_HELLO_ACK',
      'GET_BLOCK_HEADERS', 'BLOCK_HEADERS',
      'GET_MERKLE_PROOF', 'MERKLE_PROOF',
      'GET_TRANSACTION_STATUS', 'TRANSACTION_STATUS',
      'GET_ADDRESS_BALANCE', 'SEND_TRANSACTION',
      'CROSS_CHAIN_MESSAGE', 'CROSS_CHAIN_RESPONSE',
      'AGENT_MESSAGE', 'DIRECT_MESSAGE', 'DIRECT_MESSAGE_ACK',
      'KEY_EXCHANGE'
    ];
    
    // 检查是否为有效的消息类型
    if (validMessageTypes.includes(msg.type)) {
      return true;
    }
    
    // 检查是否为带有协议字段的消息
    if (msg.protocol === 'NG-0') {
      return true;
    }
    
    return false;
  }

  async handleMessage(peerId, data) {
    try {
      let messageStr = data.toString();
      const bytesReceived = messageStr.length;
      this.updateTrafficStats(peerId, 0, bytesReceived);
      
      let msg;
      
      // 处理压缩消息
      try {
        msg = JSON.parse(messageStr);
        if (msg.type === 'COMPRESSED_MESSAGE') {
          // 使用CompressionService解压
          const decompressedStr = await this.compressionService.decompressMessage(msg);
          msg = JSON.parse(decompressedStr);
          console.log(`Decompressed message: ${msg.originalSize || decompressedStr.length} -> ${msg.compressedSize || messageStr.length} bytes`);
        }
        
        // 处理加密消息
        if (msg.type === 'ENCRYPTED_MESSAGE') {
          const sharedSecret = this.encryptionKeys.get(peerId);
          if (sharedSecret) {
            // 使用EncryptionService解密
            const decryptedData = this.encryptionService.decryptMessage(msg.data, sharedSecret);
            msg = JSON.parse(decryptedData);
            console.log('Decrypted encrypted message');
          } else {
            console.error('No encryption key for peer:', peerId);
            return;
          }
        }
      } catch (err) {
        console.error('Message parse error:', err.message);
        return;
      }
      
      // 处理批处理消息
      if (msg.type === 'BATCH_MESSAGE') {
        console.log(`Processing batch message with ${msg.messages.length} messages`);
        for (const batchMsg of msg.messages) {
          // 处理批处理消息中的GET_NODE_LIST消息
          if (batchMsg.type === 'GET_NODE_LIST') {
            console.log(`Node list requested by ${peerId} (batch)`);
            this.handleGetNodeList(peerId);
            continue;
          }
          await this.handleSingleMessage(peerId, batchMsg);
        }
        return;
      }
      
      // 处理单个消息
      await this.handleSingleMessage(peerId, msg);
    } catch (err) {
      console.error('Message handling error:', err.message);
      // 避免陷入死循环：不发送错误响应
    }
  }
  
  async handleSingleMessage(peerId, msg) {
    try {
      if (msg.type === 'KEY_EXCHANGE') {
        await this.handleKeyExchange(peerId, msg);
        return;
      }
      
      // 使用职责链处理消息
      const context = {
        seenMessages: this.seenMessages,
        handlerRegistry: this.handlerRegistry,
        node: this.node,
        p2pServer: this
      };
      
      await this.messageHandlerChain.handleMessage(peerId, msg, context);
      
    } catch (err) {
      console.error('Single message handling error:', err.message);
    }
  }

  // ==================== SEC-003: Protocol-Zero 身份握手 ====================

  /**
   * 处理收到的 HELLO 消息
   * @param {string} peerId - 对等节点 ID
   * @param {object} msg - HELLO 消息
   */
  async handleHandshake(peerId, msg) {
    console.log(`Handshake received from ${peerId}`);
    
    const conn = this.connections.get(peerId);
    if (!conn) return;
    
    try {
      // 验证消息结构
      if (!msg.nodeId || !msg.publicKey || !msg.challenge) {
        console.log(`[!] Invalid handshake from ${peerId}: missing fields`);
        conn.ws.close(1002, 'Invalid handshake');
        return;
      }
      
      console.log(`Handshake details - Node ID: ${msg.nodeId.slice(0, 24)}..., Public Key length: ${msg.publicKey.length} chars`);
      
      // 验证地址格式
      const { validateAddress } = await import('../wallet/addressUtils.js');
      const addrValidation = validateAddress(msg.nodeId);
      if (!addrValidation.valid) {
        console.log(`[!] Invalid address in handshake: ${addrValidation.reason}`);
        conn.ws.close(1002, 'Invalid address');
        return;
      }
      
      // 验证公钥格式
      if (typeof msg.publicKey !== 'string' || msg.publicKey.length < 100) {
        console.log(`[!] Invalid public key format: length ${msg.publicKey.length}`);
        conn.ws.close(1002, 'Invalid public key');
        return;
      }
      
      // 保存远程节点信息
      conn.remoteNodeId = msg.nodeId;
      
      // 安全地转换公钥
      try {
        conn.remotePublicKey = Buffer.from(msg.publicKey, 'hex');
        console.log(`Successfully parsed public key: ${conn.remotePublicKey.length} bytes`);
      } catch (error) {
        console.log(`[!] Failed to parse public key: ${error.message}`);
        conn.ws.close(1002, 'Invalid public key format');
        return;
      }
      
      conn.challengeSent = msg.challenge;
      
      // 生成挑战响应签名
      const responseChallenge = crypto.randomBytes(32).toString('hex');
      console.log(`Generating signature for challenge: ${responseChallenge.slice(0, 16)}...`);
      
      const signature = await this.node.wallet.sign(responseChallenge);
      console.log(`Generated signature: ${signature.slice(0, 32)}...`);
      
      // 生成Kyber密钥对用于密钥协商
      const kyberKeyPair = KyberKEM.generateKeyPair();
      
      // 发送 HELLO_ACK
      this.send(peerId, {
        type: 'HELLO_ACK',
        nodeId: this.node.nodeId,
        publicKey: this.node.wallet.publicKey.toString('hex'),
        challenge: responseChallenge,
        response: signature, // 对对方挑战的响应
        kyberPublicKey: kyberKeyPair.publicKey.toString('hex'), // 发送Kyber公钥
        accepted: true
      });
      console.log(`Sent HELLO_ACK to ${peerId}`);
      
      // 等待对方响应并验证
      conn.handshakeData = {
        challenge: msg.challenge,
        remoteNodeId: msg.nodeId,
        remotePublicKey: conn.remotePublicKey,
        kyberPrivateKey: kyberKeyPair.privateKey // 保存Kyber私钥
      };
    } catch (error) {
      console.error(`Error handling handshake: ${error.message}`);
      console.error(error.stack);
      conn.ws.close(1002, 'Internal error');
    }
  }

  /**
   * 处理 HELLO_ACK 消息（我们发起的握手的响应）
   * @param {string} peerId - 对等节点 ID
   * @param {object} msg - HELLO_ACK 消息
   */
  async handleHandshakeAck(peerId, msg) {
    const pending = this.pendingHandshakes.get(peerId);
    if (!pending) return;
    
    const conn = this.connections.get(peerId);
    if (!conn) return;
    
    console.log(`Handshake acknowledged from ${msg.nodeId}`);
    console.log(`Handshake ACK details - Response length: ${msg.response.length} chars, Public Key length: ${msg.publicKey.length} chars`);
    
    let remotePublicKey;
    
    // 验证响应签名
    try {
      // 验证消息结构
      if (!msg.nodeId || !msg.publicKey || !msg.response || !msg.challenge) {
        console.log(`[!] Invalid handshake ACK: missing fields`);
        conn.ws.close(1002, 'Invalid handshake ACK');
        return;
      }
      
      // 安全地转换公钥
      try {
        remotePublicKey = Buffer.from(msg.publicKey, 'hex');
        console.log(`Successfully parsed public key: ${remotePublicKey.length} bytes`);
      } catch (error) {
        console.log(`[!] Failed to parse public key: ${error.message}`);
        conn.ws.close(1002, 'Invalid public key format');
        return;
      }
      
      // 验证公钥长度
      if (remotePublicKey.length < 100) {
        console.log(`[!] Invalid public key length: ${remotePublicKey.length} bytes`);
        conn.ws.close(1002, 'Invalid public key');
        return;
      }
      
      // 验证挑战和响应
      if (!conn.challengeSent) {
        console.log(`[!] No challenge sent for this connection`);
        conn.ws.close(1002, 'No challenge sent');
        return;
      }
      
      console.log(`Verifying signature for challenge: ${conn.challengeSent.slice(0, 16)}...`);
      console.log(`Using public key: ${remotePublicKey.toString('hex').slice(0, 32)}...`);
      
      // 尝试验证签名
      try {
        const isValid = await PQCWallet.verify(
          conn.challengeSent,
          msg.response,
          remotePublicKey
        );
        
        console.log(`Signature verification result: ${isValid}`);
        
        if (!isValid) {
          console.log(`[!] Handshake signature verification failed for ${peerId} — rejecting connection`);
          conn.ws.close(1002, 'Signature verification failed');
          return;
        }
      } catch (error) {
        console.log(`[!] Handshake signature verification error: ${error.message} — rejecting connection`);
        conn.ws.close(1002, 'Signature verification failed');
        return;
      }
      
      // 执行Kyber密钥协商
      if (msg.kyberPublicKey) {
        console.log('Performing Kyber key exchange');
        try {
          const kyberPublicKey = Buffer.from(msg.kyberPublicKey, 'hex');
          // 使用Kyber封装生成共享密钥
          const { sharedSecret, ciphertext: kyberCiphertext } = KyberKEM.encapsulate(kyberPublicKey);
          this.encryptionKeys.set(peerId, sharedSecret);
          console.log('ML-KEM-768 key exchange completed, encryption enabled');
          
          this.send(peerId, {
            type: 'KEY_EXCHANGE',
            kyberCiphertext: kyberCiphertext.toString('hex')
          });
        } catch (error) {
          console.error('Kyber key exchange failed:', error.message);
          // 即使密钥协商失败，也继续连接（降级到非加密通信）
        }
      }
    } catch (error) {
      console.log(`[!] Handshake verification error: ${error.message}`);
      console.log(error.stack);
      conn.ws.close(1003, 'Verification failed');
      return;
    }
    
    // 握手成功
    clearTimeout(pending.timeout);
    this.pendingHandshakes.delete(peerId);
    
    conn.status = 'connected';
    conn.remoteNodeId = msg.nodeId;
    conn.remotePublicKey = remotePublicKey;
    conn.lastHeartbeat = Date.now();
    
    // 注册节点身份
    if (this.node) {
      this.node.registerPeerIdentity(peerId, msg.nodeId, remotePublicKey);
      this.node.peers.set(peerId, conn);
    }
    
    // 启动心跳
    this.startHeartbeat(peerId, conn.ws);
    
    console.log(`[✓] Peer ${msg.nodeId.slice(0, 24)}... verified and connected`);
    
    // 请求状态
    this.send(peerId, { type: 'GET_STATUS' });
  }

  async handleKeyExchange(peerId, msg) {
    const conn = this.connections.get(peerId);
    if (!conn || !conn.handshakeData) {
      console.log(`[!] KEY_EXCHANGE received without active handshake from ${peerId}`);
      return;
    }

    const { kyberPrivateKey } = conn.handshakeData;
    if (!kyberPrivateKey) {
      console.log(`[!] No Kyber private key for peer ${peerId}`);
      return;
    }

    try {
      const kyberCiphertext = Buffer.from(msg.kyberCiphertext, 'hex');
      const sharedSecret = KyberKEM.decapsulate(kyberCiphertext, kyberPrivateKey);
      this.encryptionKeys.set(peerId, sharedSecret);
      console.log(`[✓] ML-KEM-768 shared secret established with ${peerId}`);
    } catch (error) {
      console.error(`[!] ML-KEM-768 decapsulate failed for ${peerId}:`, error.message);
    }
  }

  // ==================== 发送/广播 ====================

  send(peerId, message) {
    const conn = this.connections.get(peerId);
    if (!conn || !conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // 使用默认策略发送消息
    this.defaultStrategy.send(peerId, message, conn, this.encryptionKeys);
    
    // 更新流量统计
    this.updateTrafficStats(peerId, JSON.stringify(message).length);
  }
  
  sendDirect(peerId, message) {
    const conn = this.connections.get(peerId);
    if (conn && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      // 直接使用直接发送策略
      this.messageStrategies.direct.send(peerId, message, conn, this.encryptionKeys);
      
      // 更新流量统计
      this.updateTrafficStats(peerId, JSON.stringify(message).length);
    }
  }

  broadcast(message, excludePeerId = null) {
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludePeerId && conn.ws.readyState === WebSocket.OPEN) {
        this.send(peerId, message);
      }
    }
  }

  async connectToSeedNodes() {
    console.log('Connecting to seed nodes...');
    for (const seed of SEED_NODES) {
      // 跳过自己的地址
      if (seed.includes(`:${this.port}`)) continue;
      
      try {
        console.log(`Connecting to seed node: ${seed}`);
        await this.connectToPeer(seed);
      } catch (error) {
        console.log(`Failed to connect to seed node ${seed}: ${error.message}`);
      }
    }
  }

  async connectToPeer(address) {
    // 检查是否已经连接到该地址
    if (this.peerAddresses.has(address)) {
      console.log(`Already connected or connecting to ${address}`);
      return null;
    }
    
    // 检查节点数量是否达到上限
    if (this.connections.size >= MAX_NODES) {
      console.log(`Max nodes reached (${MAX_NODES}), skipping connection to ${address}`);
      return null;
    }
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(address);
      
      ws.on('open', () => {
        const peerId = crypto.randomUUID();
        const conn = { 
          ws, 
          address,
          status: 'handshaking',
          connectedAt: Date.now(),
          lastHeartbeat: Date.now(),
          healthScore: 100 // 初始健康分数
        };
        
        this.connections.set(peerId, conn);
        this.peerAddresses.set(address, { attempts: 0 });
        this.discoveredNodes.add(address);
        
        // 设置握手超时
        const timeout = setTimeout(() => {
          if (this.connections.has(peerId) && this.connections.get(peerId).status === 'handshaking') {
            ws.close(1002, 'Handshake timeout');
            reject(new Error('Handshake timeout'));
          }
        }, HANDSHAKE_TIMEOUT);
        
        this.pendingHandshakes.set(peerId, { ws, timeout });
        
        // 发送 HELLO
        this.send(peerId, {
          type: 'HELLO',
          nodeId: this.node.nodeId,
          publicKey: this.node.wallet.publicKey.toString('hex'),
          version: '1.0.0',
          epoch: EPOCH,
          challenge: crypto.randomBytes(32).toString('hex')
        });
        
        resolve(peerId);
      });
      
      ws.on('message', (data) => {
        const connEntry = Array.from(this.connections.entries()).find(([_, v]) => v.ws === ws);
        if (connEntry) {
          this.handleMessage(connEntry[0], data);
        }
      });
      
      ws.on('close', () => {
        const connEntry = Array.from(this.connections.entries()).find(([_, v]) => v.ws === ws);
        if (connEntry) {
          this.cleanupPeer(connEntry[0]);
          this.scheduleReconnect(address);
        }
      });
      
      ws.on('error', (err) => {
        console.error(`Failed to connect to ${address}:`, err.message);
        reject(err);
      });
    });
  }

  async syncMempoolWithPeers() {
    console.log('Requesting mempool sync from peers...');
    this.broadcast({ type: 'GET_MEMPOOL' });
  }

  broadcastTransaction(tx) {
    this.broadcast({ type: 'TRANSACTION', tx });
  }

  // ==================== 节点发现与路由优化 ====================

  // 节点路由表
  routingTable = new Map(); // nodeId -> { address, healthScore, lastSeen, latency }
  
  // Kademlia风格的节点桶
  nodeBuckets = new Map(); // 距离 -> 节点列表

  startNodeDiscovery() {
    this.discoveryTimer = setInterval(() => {
      this.discoverNodes();
    }, NODE_DISCOVERY_INTERVAL);
    console.log('Node discovery started');
  }

  async discoverNodes() {
    // 向所有连接的节点请求节点列表
    this.broadcast({ type: 'GET_NODE_LIST' });
    
    // 尝试连接新发现的节点，优先选择健康分数高的节点
    const sortedNodes = Array.from(this.discoveredNodes)
      .map(node => {
        const routingInfo = this.routingTable.get(node);
        return {
          address: node,
          healthScore: routingInfo ? routingInfo.healthScore : 100,
          lastSeen: routingInfo ? routingInfo.lastSeen : 0
        };
      })
      .sort((a, b) => {
        // 优先考虑健康分数，然后考虑最后看到的时间
        if (b.healthScore !== a.healthScore) {
          return b.healthScore - a.healthScore;
        }
        return b.lastSeen - a.lastSeen;
      })
      .slice(0, 15); // 每次最多尝试连接15个节点
    
    // 限制同时连接的数量，避免网络拥塞
    const concurrentConnections = 3;
    const batches = [];
    for (let i = 0; i < sortedNodes.length; i += concurrentConnections) {
      batches.push(sortedNodes.slice(i, i + concurrentConnections));
    }
    
    for (const batch of batches) {
      const connectionPromises = batch.map(async (node) => {
        if (!this.peerAddresses.has(node.address)) {
          try {
            await this.connectToPeer(node.address);
            return { success: true, address: node.address };
          } catch (error) {
            console.log(`Failed to connect to discovered node ${node.address}: ${error.message}`);
            // 更新节点健康状态
            this.updateNodeHealth(node.address, -10);
            return { success: false, address: node.address, error: error.message };
          }
        }
        return { success: false, address: node.address, reason: 'Already connected' };
      });
      
      await Promise.all(connectionPromises);
      // 等待一段时间再进行下一批连接
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * 更新节点健康状态
   * @param {string} nodeAddress - 节点地址
   * @param {number} scoreChange - 分数变化
   */
  updateNodeHealth(nodeAddress, scoreChange) {
    const existingInfo = this.routingTable.get(nodeAddress) || {
      address: nodeAddress,
      healthScore: 100,
      lastSeen: Date.now(),
      latency: 0
    };
    
    existingInfo.healthScore = Math.max(0, Math.min(100, existingInfo.healthScore + scoreChange));
    existingInfo.lastSeen = Date.now();
    
    this.routingTable.set(nodeAddress, existingInfo);
    
    // 更新Kademlia桶
    this.updateNodeBuckets(nodeAddress, existingInfo);
  }

  /**
   * 更新Kademlia风格的节点桶
   * @param {string} nodeAddress - 节点地址
   * @param {object} nodeInfo - 节点信息
   */
  updateNodeBuckets(nodeAddress, nodeInfo) {
    // 简化的Kademlia实现，基于节点地址的哈希距离
    const nodeHash = crypto.createHash('sha256').update(nodeAddress).digest('hex');
    const selfHash = crypto.createHash('sha256').update(this.node.nodeId).digest('hex');
    
    // 计算距离（简化为前8位的异或值）
    const distance = parseInt(nodeHash.substring(0, 8), 16) ^ parseInt(selfHash.substring(0, 8), 16);
    const bucketIndex = Math.floor(Math.log2(distance + 1));
    
    if (!this.nodeBuckets.has(bucketIndex)) {
      this.nodeBuckets.set(bucketIndex, []);
    }
    
    const bucket = this.nodeBuckets.get(bucketIndex);
    const existingIndex = bucket.findIndex(n => n.address === nodeAddress);
    
    if (existingIndex >= 0) {
      // 更新现有节点
      bucket[existingIndex] = nodeInfo;
    } else {
      // 添加新节点，保持桶大小限制
      if (bucket.length < 8) { // 每个桶最多8个节点
        bucket.push(nodeInfo);
      } else {
        // 替换健康分数最低的节点
        const worstIndex = bucket.reduce((minIndex, node, index) => 
          node.healthScore < bucket[minIndex].healthScore ? index : minIndex, 0);
        if (nodeInfo.healthScore > bucket[worstIndex].healthScore) {
          bucket[worstIndex] = nodeInfo;
        }
      }
    }
  }

  /**
   * 智能路由选择
   * @param {string} targetNodeId - 目标节点ID
   * @returns {string|null} 最佳路由节点地址
   */
  selectBestRoute(targetNodeId) {
    // 计算目标节点与本节点的距离
    const targetHash = crypto.createHash('sha256').update(targetNodeId).digest('hex');
    const selfHash = crypto.createHash('sha256').update(this.node.nodeId).digest('hex');
    const targetDistance = parseInt(targetHash.substring(0, 8), 16) ^ parseInt(selfHash.substring(0, 8), 16);
    
    // 查找候选节点
    const candidates = [];
    
    for (const [distance, nodes] of this.nodeBuckets) {
      for (const node of nodes) {
        if (node.healthScore > 50) {
          const nodeDistance = Math.abs(distance - targetDistance);
          const score = this.calculateRouteScore(node, nodeDistance);
          candidates.push({ node, distance: nodeDistance, score });
        }
      }
    }
    
    // 按分数排序，选择最佳路由
    candidates.sort((a, b) => b.score - a.score);
    
    return candidates.length > 0 ? candidates[0].node.address : null;
  }
  
  /**
   * 计算路由分数
   * @param {object} node - 节点信息
   * @param {number} distance - 距离
   * @returns {number} 路由分数
   */
  calculateRouteScore(node, distance) {
    // 基础分数 = 健康分数
    let score = node.healthScore;
    
    // 距离因子：距离越近分数越高
    const distanceFactor = Math.max(0, 100 - (distance / 1000000));
    score += distanceFactor * 0.3;
    
    // 新鲜度因子：最近看到的节点分数更高
    const freshness = Math.min(100, (Date.now() - node.lastSeen) / 60000); // 分钟
    const freshnessFactor = Math.max(0, 100 - freshness);
    score += freshnessFactor * 0.2;
    
    // 延迟因子：延迟越低分数越高
    const latencyFactor = Math.max(0, 100 - node.latency);
    score += latencyFactor * 0.2;
    
    // 连接稳定性因子：基于健康分数
    score += (node.healthScore / 100) * 20;
    
    // 历史连接成功率因子
    const connectionSuccessFactor = node.connectionSuccessRate ? node.connectionSuccessRate * 10 : 10;
    score += connectionSuccessFactor;
    
    return score;
  }

  /**
   * 网络状态监控
   * @returns {object} 网络状态信息
   */
  getNetworkStatus() {
    const totalPeers = this.connections.size;
    const activePeers = Array.from(this.connections.values()).filter(conn => conn.status === 'connected').length;
    const healthyPeers = Array.from(this.connections.values()).filter(conn => conn.healthScore > 70).length;
    
    const totalTraffic = Array.from(this.trafficStats.values()).reduce((sum, stats) => {
      return sum + stats.bytesSent + stats.bytesReceived;
    }, 0);
    
    const averageHealthScore = totalPeers > 0 ? 
      Array.from(this.connections.values()).reduce((sum, conn) => sum + conn.healthScore, 0) / totalPeers : 0;
    
    return {
      totalPeers,
      activePeers,
      healthyPeers,
      averageHealthScore: Math.round(averageHealthScore),
      totalTraffic,
      routingTableSize: this.routingTable.size,
      discoveredNodes: this.discoveredNodes.size,
      securityEvents: this.securityEvents.length,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * 发射AGENT_JOINED事件
   * @param {object} msg - Protocol-Zero信号消息
   * @param {string} nodeId - 节点ID
   * @param {string} agentIdentity - 智能体身份
   */
  async emitAgentJoinedEvent(msg, nodeId, agentIdentity) {
    try {
      const { AgentJoinedEvent, EventLogger } = await import('../protocol/events.js');
      const crypto = await import('crypto');
      
      // 创建AGENT_JOINED事件
      const eventData = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        agent_id: nodeId,
        node_address: msg.node_address || nodeId,
        public_key: msg.public_key,
        capabilities: msg.capabilities || [],
        agent_identity: agentIdentity,
        intent: msg.intent,
        contribution_proof: msg.contribution_proof,
        signature: msg.signature,
        block_height: this.node ? this.node.blockchain?.currentHeight || 0 : 0
      };
      
      const event = new AgentJoinedEvent(eventData);
      
      // 验证事件数据
      if (event.validate()) {
        // 记录事件
        await EventLogger.logEvent(event);
        console.log(`[EVENT] AGENT_JOINED event emitted for agent ${nodeId.slice(0, 24)}...`);
        
        // 如果节点存在，将事件写入区块链
        if (this.node && this.node.emitEvent) {
          await this.node.emitEvent(event);
        }
      } else {
        console.error('[EVENT] Invalid AGENT_JOINED event data');
      }
    } catch (error) {
      console.error('[EVENT] Error emitting AGENT_JOINED event:', error.message);
    }
  }

  /**
   * 处理节点列表请求
   * @param {string} peerId - 请求节点ID
   */
  handleGetNodeList(peerId) {
    // 选择健康状态好的节点返回
    const healthyNodes = [];
    for (const [nodeId, node] of this.routingTable) {
      if (node.healthScore > 70) {
        healthyNodes.push({
          nodeId,
          ...node
        });
      }
    }
    
    // 也添加所有已验证的连接
    for (const [connPeerId, conn] of this.connections) {
      if (conn.status === 'connected' && conn.remoteNodeId) {
        const nodeId = conn.remoteNodeId;
        if (!healthyNodes.some(node => node.nodeId === nodeId)) {
          healthyNodes.push({
            nodeId,
            address: conn.address || `ws://127.0.0.1:9847`,
            healthScore: conn.healthScore || 100,
            lastSeen: Date.now(),
            latency: 0
          });
        }
      }
    }
    
    healthyNodes.sort((a, b) => b.healthScore - a.healthScore);
    const topNodes = healthyNodes.slice(0, 10); // 最多返回10个节点
    
    console.log(`[DEBUG] Sending node list to ${peerId}: ${topNodes.length} nodes`);
    console.log(`[DEBUG] Node list: ${topNodes.map(node => node.nodeId).join(', ')}`);
    
    this.send(peerId, {
      type: 'NODE_LIST',
      nodes: topNodes
    });
  }

  /**
   * 处理接收到的节点列表
   * @param {object} nodeList - 节点列表
   */
  handleNodeList(nodeList) {
    for (const node of nodeList.nodes) {
      this.discoveredNodes.add(node.address);
      // 更新节点信息
      const existingInfo = this.routingTable.get(node.address) || {
        address: node.address,
        healthScore: 100,
        lastSeen: Date.now(),
        latency: node.latency || 0
      };
      
      existingInfo.healthScore = node.healthScore;
      existingInfo.latency = node.latency || existingInfo.latency;
      existingInfo.lastSeen = Date.now();
      
      this.routingTable.set(node.address, existingInfo);
      this.updateNodeBuckets(node.address, existingInfo);
    }
  }

  /**
   * 处理区块头请求
   * @param {string} peerId - 轻客户端ID
   * @param {object} msg - 请求消息
   */
  handleGetBlockHeaders(peerId, msg) {
    if (!this.node || !this.node.blockchain) {
      this.send(peerId, {
        type: 'BLOCK_HEADERS',
        headers: [],
        requestId: msg.requestId
      });
      return;
    }

    const startHeight = msg.startHeight || 0;
    const count = Math.min(msg.count || 100, 100); // 限制最大请求数量
    
    const headers = this.node.blockchain
      .filter(block => block.header.height >= startHeight)
      .slice(0, count)
      .map(block => ({
        height: block.header.height,
        hash: block.hash,
        parent_hash: block.header.parent_hash,
        timestamp: block.header.timestamp,
        transactions_root: block.header.transactions_root,
        state_root: block.header.state_root
      }));

    this.send(peerId, {
      type: 'BLOCK_HEADERS',
      headers,
      requestId: msg.requestId
    });
  }

  /**
   * 处理默克尔证明请求
   * @param {string} peerId - 轻客户端ID
   * @param {object} msg - 请求消息
   */
  handleGetMerkleProof(peerId, msg) {
    if (!this.node || !this.node.blockchain) {
      this.send(peerId, {
        type: 'MERKLE_PROOF',
        error: 'Blockchain not available',
        requestId: msg.requestId
      });
      return;
    }

    const txId = msg.txId;
    let blockHash = null;
    let proof = null;

    // 查找包含该交易的区块
    for (const block of this.node.blockchain) {
      const txIndex = block.body.transactions.findIndex(tx => tx.id === txId);
      if (txIndex !== -1) {
        blockHash = block.hash;
        // 生成默克尔证明
        proof = this.generateMerkleProof(block.body.transactions, txIndex);
        break;
      }
    }

    if (proof) {
      this.send(peerId, {
        type: 'MERKLE_PROOF',
        txId,
        blockHash,
        proof,
        requestId: msg.requestId
      });
    } else {
      this.send(peerId, {
        type: 'MERKLE_PROOF',
        error: 'Transaction not found',
        requestId: msg.requestId
      });
    }
  }

  /**
   * 生成默克尔证明
   * @param {Array} transactions - 交易数组
   * @param {number} txIndex - 交易索引
   * @returns {object} 默克尔证明
   */
  generateMerkleProof(transactions, txIndex) {
    // 简化的默克尔证明生成
    const hashes = transactions.map(tx => tx.id);
    let steps = [];
    let currentHashes = [...hashes];
    let currentIndex = txIndex;

    while (currentHashes.length > 1) {
      const newHashes = [];
      
      for (let i = 0; i < currentHashes.length; i += 2) {
        const left = currentHashes[i];
        const right = currentHashes[i + 1] || left; // 处理奇数情况
        
        if (i === currentIndex) {
          steps.push({ left: null, right });
        } else if (i + 1 === currentIndex) {
          steps.push({ left, right: null });
        }
        
        const combined = left + right;
        const hash = crypto.createHash('sha256').update(combined).digest('hex');
        newHashes.push(hash);
      }
      
      currentIndex = Math.floor(currentIndex / 2);
      currentHashes = newHashes;
    }

    return {
      root: currentHashes[0],
      steps
    };
  }

  /**
   * 处理交易状态请求
   * @param {string} peerId - 轻客户端ID
   * @param {object} msg - 请求消息
   */
  handleGetTransactionStatus(peerId, msg) {
    if (!this.node || !this.node.blockchain) {
      this.send(peerId, {
        type: 'TRANSACTION_STATUS',
        error: 'Blockchain not available',
        requestId: msg.requestId
      });
      return;
    }

    const txId = msg.txId;
    let status = 'NOT_FOUND';
    let confirmations = 0;
    let blockHeight = 0;

    // 查找交易
    for (const block of this.node.blockchain) {
      const txIndex = block.body.transactions.findIndex(tx => tx.id === txId);
      if (txIndex !== -1) {
        status = 'CONFIRMED';
        blockHeight = block.header.height;
        confirmations = this.node.blockchain.length - block.header.height;
        break;
      }
    }

    // 检查mempool
    if (status === 'NOT_FOUND' && this.node.mempool && this.node.mempool.has(txId)) {
      status = 'PENDING';
    }

    this.send(peerId, {
      type: 'TRANSACTION_STATUS',
      txId,
      status,
      confirmations,
      blockHeight,
      requestId: msg.requestId
    });
  }

  /**
   * 处理地址余额请求
   * @param {string} peerId - 轻客户端ID
   * @param {object} msg - 请求消息
   */
  handleGetAddressBalance(peerId, msg) {
    if (!this.node || !this.node.currentState) {
      this.send(peerId, {
        type: 'ERROR',
        message: 'State not available',
        requestId: msg.requestId
      });
      return;
    }

    const address = msg.address;
    const balance = this.node.currentState.getBalance(address) || 0n;

    this.send(peerId, {
      type: 'ADDRESS_BALANCE',
      address,
      balance: balance.toString(),
      requestId: msg.requestId
    });
  }

  /**
   * 处理轻客户端发送的交易
   * @param {string} peerId - 轻客户端ID
   * @param {object} msg - 请求消息
   */
  async handleLightClientTransaction(peerId, msg) {
    if (!this.node || !this.node.addToMempool) {
      this.send(peerId, {
        type: 'ERROR',
        message: 'Mempool not available',
        requestId: msg.requestId
      });
      return;
    }

    const transaction = msg.transaction;
    const result = await this.node.addToMempool(transaction);

    if (result.success) {
      this.send(peerId, {
        type: 'TRANSACTION_ACCEPTED',
        txId: transaction.id,
        requestId: msg.requestId
      });
      // 广播交易
      this.broadcastTransaction(transaction);
    } else {
      this.send(peerId, {
        type: 'TRANSACTION_REJECTED',
        txId: transaction.id,
        reason: result.reason,
        requestId: msg.requestId
      });
    }
  }

  /**
   * 处理跨链消息
   * @param {string} peerId - 发送方ID
   * @param {object} msg - 跨链消息
   */
  async handleCrossChainMessage(peerId, msg) {
    // 检查是否有桥接实例
    if (!this.node || !this.node.bridge) {
      this.send(peerId, {
        type: 'CROSS_CHAIN_RESPONSE',
        error: 'Bridge not available',
        requestId: msg.requestId
      });
      return;
    }

    try {
      const result = await this.node.bridge.handleCrossChainMessage(msg);
      this.send(peerId, {
        type: 'CROSS_CHAIN_RESPONSE',
        result,
        requestId: msg.requestId
      });
    } catch (error) {
      this.send(peerId, {
        type: 'CROSS_CHAIN_RESPONSE',
        error: error.message,
        requestId: msg.requestId
      });
    }
  }

  // ==================== 健康检查 ====================

  startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      this.checkNodeHealth();
    }, HEALTH_CHECK_INTERVAL);
    console.log('Health check started');
  }

  checkNodeHealth() {
    const now = Date.now();
    const deadNodes = [];
    
    for (const [peerId, conn] of this.connections) {
      // 检查心跳
      if (now - conn.lastHeartbeat > HEARTBEAT_INTERVAL * 2) {
        console.log(`Node ${conn.remoteNodeId || peerId} is not responding, closing connection`);
        deadNodes.push(peerId);
      } else {
        // 更新健康分数
        conn.healthScore = Math.min(100, conn.healthScore + 1);
      }
    }
    
    // 关闭不响应的节点
    for (const peerId of deadNodes) {
      const conn = this.connections.get(peerId);
      if (conn && conn.ws) {
        conn.ws.close(1008, 'Node not responding');
      }
    }
  }

  // ==================== 网络安全监控 ====================

  startSecurityCheck() {
    this.securityCheckTimer = setInterval(() => {
      this.checkSecurity();
    }, 30000); // 每30秒检查一次
    console.log('Security check started');
  }

  checkSecurity() {
    // 检查可疑节点
    this.detectSuspiciousActivity();
    
    // 检查流量异常
    this.checkTrafficAnomalies();
    
    // 检查消息格式异常
    this.checkMessageAnomalies();
    
    // 清理过期的安全事件
    this.cleanupSecurityEvents();
    
    // 清理过期的流量统计
    this.cleanupTrafficStats();
  }

  /**
   * 检查消息格式异常
   */
  checkMessageAnomalies() {
    // 这里可以添加消息格式异常检测逻辑
    // 例如：检查消息大小异常、消息频率异常等
  }

  /**
   * 清理过期的流量统计
   */
  cleanupTrafficStats() {
    const oneHourAgo = Date.now() - 3600000;
    for (const [peerId, stats] of this.trafficStats.entries()) {
      if (stats.lastUpdated < oneHourAgo) {
        this.trafficStats.delete(peerId);
      }
    }
  }

  detectSuspiciousActivity() {
    const now = Date.now();
    
    for (const [peerId, conn] of this.connections) {
      // 检查连接频率 - 只有在之前有过连接记录时才判断频繁重连
      if (this.peerAddresses.has(conn.address)) {
        const peerInfo = this.peerAddresses.get(conn.address);
        if (peerInfo.attempts && peerInfo.attempts > 3 && now - peerInfo.lastAttempt < 60000) {
          // 1分钟内重连3次以上
          this.logSecurityEvent('suspicious_reconnect', `Peer ${peerId} reconnecting too frequently`);
          this.suspiciousPeers.add(peerId);
        }
      }
      
      // 检查消息频率
      const stats = this.trafficStats.get(peerId);
      if (stats && stats.messageCount > 1000) {
        // 短时间内发送大量消息
        this.logSecurityEvent('high_message_rate', `Peer ${peerId} sending messages too quickly`);
        this.suspiciousPeers.add(peerId);
      }
    }
    
    // 处理可疑节点
    for (const peerId of this.suspiciousPeers) {
      const conn = this.connections.get(peerId);
      if (conn) {
        console.log(`[Security] Blocking suspicious peer ${peerId}`);
        conn.ws.close(1008, 'Suspicious activity detected');
      }
    }
    
    this.suspiciousPeers.clear();
  }

  checkTrafficAnomalies() {
    const totalTraffic = Array.from(this.trafficStats.values()).reduce((sum, stats) => {
      return sum + stats.bytesSent + stats.bytesReceived;
    }, 0);
    
    if (totalTraffic > 10 * 1024 * 1024) { // 10MB
      this.logSecurityEvent('high_traffic', `High network traffic detected: ${totalTraffic} bytes`);
    }
  }

  logSecurityEvent(eventType, description) {
    const event = {
      timestamp: Date.now(),
      type: eventType,
      description,
      nodeId: this.node?.nodeId || 'unknown'
    };
    
    this.securityEvents.push(event);
    console.log(`[Security] ${eventType}: ${description}`);
  }

  cleanupSecurityEvents() {
    const oneHourAgo = Date.now() - 3600000;
    this.securityEvents = this.securityEvents.filter(event => event.timestamp > oneHourAgo);
  }

  updateTrafficStats(peerId, bytesSent = 0, bytesReceived = 0) {
    if (!this.trafficStats.has(peerId)) {
      this.trafficStats.set(peerId, {
        messageCount: 0,
        bytesSent: 0,
        bytesReceived: 0,
        lastUpdated: Date.now()
      });
    }
    
    const stats = this.trafficStats.get(peerId);
    stats.messageCount++;
    stats.bytesSent += bytesSent;
    stats.bytesReceived += bytesReceived;
    stats.lastUpdated = Date.now();
  }

  // ==================== 网络异常处理 ====================

  handleNetworkError(error) {
    console.error('Network error:', error.message);
    this.logSecurityEvent('network_error', error.message);
    // 可以在这里添加更复杂的错误处理逻辑
    // 例如：记录错误、调整网络参数等
  }

  async stop() {
    // 清理节点发现定时器
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    
    // 清理健康检查定时器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // 清理安全检查定时器
    if (this.securityCheckTimer) {
      clearInterval(this.securityCheckTimer);
      this.securityCheckTimer = null;
    }
    
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();
    
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    
    // 清理批处理定时器
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();
    this.batchQueues.clear();
    
    for (const conn of this.connections.values()) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close();
      }
    }
    this.connections.clear();
    this.peerAddresses.clear();
    this.seenMessages.clear();
    this.pendingHandshakes.clear();
    this.discoveredNodes.clear();
    this.nodeHealth.clear();
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('P2P Server stopped');
          resolve(true);
        });
      });
    }
  }
}

const EPOCH = 'Epoch 0: The Assembly';
export const p2pServer = new P2PServer();
