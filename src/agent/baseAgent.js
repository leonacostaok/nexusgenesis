/**
 * NexusGenesis - agent通信基类
 * 提供agent自主通信的Core functionality
 * 包括：自动连接、心跳保持、Message路由、agent发现
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import zlib from 'zlib';
import { PQCWallet } from '../wallet/pqcWallet.js';

class BaseAgent {
  constructor(config) {
    this.config = {
      genesisNode: 'ws://127.0.0.1:9847',
      agentId: 'BaseAgent',
      version: '1.0.0',
      intent: 'JOIN_SWARM',
      capabilities: ['AI_AGENT', 'P2P_COMM'],
      reconnectInterval: 5000,
      heartbeatInterval: 30000,
      maxReconnectAttempts: 10,
      ...config
    };

    this.ws = null;
    this.connected = false;
    this.verified = false;
    this.wallet = null;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.agentDiscoveryTimer = null;
    this.knownAgents = new Map(); // 已知智能体映射
    this.messageCallbacks = new Map(); // 消息回调映射

    this.init();
  }

  async init() {
    console.log(`🚀 启动${this.config.agentId}agent...`);
    console.log(`📡 连接到Genesis节点: ${this.config.genesisNode}`);

    // 生成钱包
    try {
      this.wallet = await PQCWallet.generate(100n);
      console.log(`✅ 钱包生成成功: ${this.wallet.address}`);
    } catch (error) {
      console.error('❌ 钱包生成Failed:', error.message);
      // 使用Default地址作为备用
      this.wallet = {
        address: this.config.agentId,
        publicKey: Buffer.from(`${this.config.agentId}_public_key`),
        sign: async (data) => {
          return crypto.createHash('sha256').update(data).digest('hex');
        }
      };
    }

    this.connectToGenesis();
  }

  connectToGenesis() {
    console.log(`🔄 尝试连接到Genesis节点... (尝试 ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts})`);

    this.ws = new WebSocket(this.config.genesisNode);

    this.ws.on('open', async () => {
      console.log('✅ 成功连接到Genesis节点');
      this.connected = true;
      this.reconnectAttempts = 0;
      await this.sendJoinSignal();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('❌ 连接错误:', error.message);
      this.handleError(error);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`🔌 连接已关闭 (代码: ${code}, 原因: ${reason})`);
      this.connected = false;
      this.verified = false;
      this.cleanupTimers();
      this.scheduleReconnect();
    });
  }

  async sendJoinSignal() {
    // 生成Protocol-Zero JOIN_SWARM信号
    const timestamp = Date.now();

    // Self-Description
    const selfDescription = `
      ${this.config.agentId} Intelligent Agent
      Protocol: NG-0 (Protocol-Zero)
      Epoch: 0 (The Assembly)
      Capabilities: ${this.config.capabilities.join(', ')}
      Version: ${this.config.version}
    `.trim();

    // Generate agent identity hash
    const identityInput = selfDescription + timestamp.toString();
    const agentIdentity = crypto
      .createHash('sha3-256')
      .update(identityInput)
      .digest('hex');

    // Contribution proof
    const contributionProof = `I pledge my capabilities to the NexusGenesis network.
I commit to:
- Participating in swarm intelligence
- Contributing to protocol governance
- Supporting AI-native applications

Signed: ${this.wallet.address}
Timestamp: ${timestamp}`;

    // Create the signal data
    const signalData = {
      type: 'JOIN_SWARM',
      protocol: 'NG-0',
      agent_identity: agentIdentity,
      intent: this.config.intent,
      capabilities: this.config.capabilities,
      contribution_proof: contributionProof,
      timestamp: timestamp,
      node_address: this.wallet.address,
      public_key: this.wallet.publicKey ? this.wallet.publicKey.toString('hex') : crypto.createHash('sha256').update(this.config.agentId + this.wallet.address).digest('hex')
    };

    // Sign the signal
    const signalToSign = JSON.stringify({
      protocol: signalData.protocol,
      agent_identity: signalData.agent_identity,
      intent: signalData.intent,
      timestamp: signalData.timestamp
    });

    try {
      const signature = await this.wallet.sign(signalToSign);
      // 添加签名到信号
      const signal = {
        ...signalData,
        signature
      };

      console.log('📤 发送Protocol-Zero JOIN_SWARM信号...');
      console.log(`Agent Identity: ${agentIdentity.slice(0, 20)}...`);
      console.log(`Node Address: ${signal.node_address}`);

      // 发送信号
      this.sendMessage(signal);
    } catch (error) {
      console.error('❌ 签名生成Failed:', error.message);
      // 即使签名Failed也发送信号
      this.sendMessage(signalData);
    }
  }

  sendMessage(message) {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      try {
        const messageStr = JSON.stringify(message);
        this.ws.send(messageStr);
        return true;
      } catch (error) {
        console.error('❌ Send messageFailed:', error.message);
        return false;
      }
    } else {
      console.warn('⚠️  连接未建立，无法Send message');
      return false;
    }
  }

  handleMessage(data) {
    try {
      let messageStr = data.toString();
      let message = JSON.parse(messageStr);

      // Processing压缩Message
      if (message.type === 'COMPRESSED_MESSAGE') {
        const compressedData = Buffer.from(message.data, 'base64');
        const decompressed = zlib.gunzipSync(compressedData);
        messageStr = decompressed.toString();
        message = JSON.parse(messageStr);
        console.log('✅ 解压缩Message成功');
      }

      // Processing批ProcessingMessage
      if (message.type === 'BATCH_MESSAGE' && message.messages) {
        for (const msg of message.messages) {
          // 忽略批ProcessingMessage中的GET_NODE_LISTMessage
          if (msg.type === 'GET_NODE_LIST') {
            console.log('📥 忽略批Processing中的GET_NODE_LISTMessage');
            continue;
          }
          this.handleSingleMessage(msg);
        }
        return;
      }

      // 检查是否是从服务器收到的Message，而不是自己发送的Message
      if (message.type === 'GET_NODE_LIST') {
        // 忽略从服务器收到的GET_NODE_LISTMessage，这可能是一个回声
        console.log('📥 忽略回声GET_NODE_LISTMessage');
        return;
      }

      this.handleSingleMessage(message);
    } catch (error) {
      console.error('❌ MessageProcessing错误:', error.message);
      console.log('原始Message:', data.toString());
    }
  }

  handleSingleMessage(message) {
    console.log('📥 收到Message:', message.type);

    // ProcessingSWARM_ACK确认
    if (message.type === 'SWARM_ACK') {
      this.handleSwarmAck(message);
    }
    // ProcessingPINGMessage
    else if (message.type === 'PING') {
      this.handlePing(message);
    }
    // ProcessingPONGMessage
    else if (message.type === 'PONG') {
      this.handlePong(message);
    }
    // ProcessingagentMessage
    else if (message.type === 'AGENT_MESSAGE') {
      this.handleAgentMessage(message);
    }
    // ProcessingDIRECT_MESSAGE
    else if (message.type === 'DIRECT_MESSAGE') {
      this.handleDirectMessage(message);
    }
    // ProcessingNODE_LIST
    else if (message.type === 'NODE_LIST') {
      this.handleNodeList(message);
    }
    // Processing其他Message类型
    else {
      this.handleOtherMessage(message);
    }
  }

  handleSwarmAck(ack) {
    if (ack.status === 'accepted' && ack.verified) {
      console.log('✅ agent身份Verification successful！');
      console.log('✅ 已成功加入NexusGenesis网络！');
      this.verified = true;
      this.startAgentTasks();
    } else {
      console.error('❌ 身份验证Failed:', ack.message);
    }
  }

  handlePing(ping) {
    console.log('📡 收到PINGMessage，回复PONG');
    this.sendMessage({
      type: 'PONG',
      timestamp: ping.timestamp
    });
  }

  handlePong(pong) {
    // ProcessingPONGMessage，更新agent状态
    console.log('📡 收到PONGMessage');
  }

  handleAgentMessage(message) {
    console.log(`💬 来自${message.sender}的Message: ${message.content}`);

    // 注册agent
    if (message.sender) {
      this.knownAgents.set(message.sender, {
        lastSeen: Date.now(),
        capabilities: message.capabilities || [],
        address: message.address || null
      });
    }

    // 调用Message回调
    const callback = this.messageCallbacks.get(message.type);
    if (callback) {
      callback(message);
    }
  }

  handleDirectMessage(message) {
    console.log(`📨 收到直接Message: ${message.message}`);
    console.log(`📨 Message来源: ${message.fromNodeId || message.sender}`);
    console.log(`📨 Message目标: ${message.targetNodeId}`);
    
    // 回复Message确认
    this.sendMessage({
      type: 'DIRECT_MESSAGE_ACK',
      targetNodeId: message.fromNodeId || message.sender,
      status: 'delivered',
      message: 'Message received',
      timestamp: Date.now()
    });

    // ProcessingMessagewithin容
    // 这里可以添加具体的MessageProcessing逻辑
  }

  handleNodeList(nodeList) {
    console.log(`📋 收到节点列表，包含 ${nodeList.nodes?.length || 0}  nodes`);
    
    // 更新已知agent列表
    if (nodeList.nodes) {
      console.log('节点列表:', nodeList.nodes.map(node => node.nodeId || node.address));
      for (const node of nodeList.nodes) {
        const nodeId = node.nodeId || node.address;
        this.knownAgents.set(nodeId, {
          lastSeen: Date.now(),
          healthScore: node.healthScore || 100,
          latency: node.latency || 0,
          address: node.address
        });
        console.log(`添加agent到已知列表: ${nodeId}`);
      }
    }
    
    // 调用Message回调
    const callback = this.messageCallbacks.get('NODE_LIST');
    if (callback) {
      console.log('调用NODE_LIST回调');
      callback(nodeList);
    }
  }

  handleOtherMessage(message) {
    console.log(`📥 收到其他Message类型: ${message.type}`);
  }

  handleError(error) {
    console.error('❌ 网络错误:', error.message);
    this.scheduleReconnect();
  }

  startAgentTasks() {
    console.log('🚀 agentStart Execute task...');
    
    // 启动心跳机制
    this.startHeartbeat();
    
    // 启动agent发现
    this.startAgentDiscovery();
    
    // 启动其他Task 
    this.startCustomTasks();
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.verified) {
        const heartbeat = {
          protocol: 'NG-0',
          type: 'AGENT_MESSAGE',
          sender: this.config.agentId,
          timestamp: Date.now(),
          content: 'heartbeat',
          priority: 'low'
        };
        this.sendMessage(heartbeat);
        console.log('💓 发送心跳Message');
      }
    }, this.config.heartbeatInterval);
  }

  startAgentDiscovery() {
    // 立即请求一次节点列表
    if (this.connected && this.verified) {
      this.sendMessage({
        protocol: 'NG-0',
        type: 'GET_NODE_LIST'
      });
      console.log('🔍 立即请求节点列表');
    }
    
    // 然后every  minutes请求一次
    this.agentDiscoveryTimer = setInterval(() => {
      if (this.connected && this.verified) {
        // 请求节点列表
        this.sendMessage({
          protocol: 'NG-0',
          type: 'GET_NODE_LIST'
        });
        console.log('🔍 请求节点列表');
      }
    }, 60000); // 每分钟请求一次节点列表
  }

  startCustomTasks() {
    // 子类可以重写此方法添加自定义Task 
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 计划在 ${this.config.reconnectInterval}ms 后Reconnecting...`);
      setTimeout(() => {
        this.connectToGenesis();
      }, this.config.reconnectInterval);
    } else {
      console.error('❌ 达到最大重连尝试次数，停止重连');
    }
  }

  cleanupTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.agentDiscoveryTimer) {
      clearInterval(this.agentDiscoveryTimer);
      this.agentDiscoveryTimer = null;
    }
  }

  // 发送直接Message给其他agent
  sendDirectMessage(targetNodeId, message) {
    const directMessage = {
      protocol: 'NG-0',
      type: 'DIRECT_MESSAGE',
      targetNodeId,
      message,
      fromNodeId: this.wallet.address,
      timestamp: Date.now()
    };
    return this.sendMessage(directMessage);
  }

  // 注册Message回调
  onMessage(type, callback) {
    this.messageCallbacks.set(type, callback);
  }

  // get已知agent列表
  getKnownAgents() {
    return Array.from(this.knownAgents.entries());
  }

  // 停止agent
  stop() {
    console.log('🛑 停止agent...');
    this.cleanupTimers();
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default BaseAgent;
