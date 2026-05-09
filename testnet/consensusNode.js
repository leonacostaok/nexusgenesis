/**
 * NexusGenesis - Multi-Leader Consensus Testnet Node
 * 
 * 多领导者共识测试网节点实现
 */

import { MultiLeaderConsensus } from '../src/consensus/multiLeader.js';
import { State } from '../src/blockchain/state.js';
import crypto from 'crypto';

/**
 * 共识测试网节点
 */
export class ConsensusNode {
  constructor(nodeId, address, reputation = 1, sharedConsensus = null) {
    this.nodeId = nodeId;
    this.address = address;
    this.reputation = reputation;
    this.consensus = sharedConsensus;
    this.state = null;
    this.blockchain = [];
    this.peers = new Map();
    this.isRunning = false;
    this.blockHeight = 0;
    
    console.log(`[NODE] Created: ${nodeId} (${address})`);
  }

  /**
   * 初始化节点
   */
  initialize(genesisAddress) {
    this.state = new State(genesisAddress);
    
    // 注册自己为领导者（如果共享共识已设置）
    if (this.consensus) {
      this.consensus.registerLeader(this.nodeId, this.address, this.reputation);
    }
    
    console.log(`[NODE] Initialized: ${this.nodeId}`);
  }

  /**
   * 连接到其他节点
   */
  connectToPeer(peerNode) {
    if (peerNode.nodeId === this.nodeId) return;
    
    this.peers.set(peerNode.nodeId, peerNode);
    
    // 在共识中注册对方为领导者
    this.consensus.registerLeader(peerNode.nodeId, peerNode.address, peerNode.reputation);
    
    console.log(`[NODE] ${this.nodeId} connected to ${peerNode.nodeId}`);
  }

  /**
   * 创建区块
   */
  createBlock(transactions = []) {
    const previousHash = this.blockchain.length > 0 
      ? this.blockchain[this.blockchain.length - 1].hash 
      : '0'.repeat(64);
    
    const block = {
      height: this.blockHeight + 1,
      timestamp: Date.now(),
      previousHash,
      transactions,
      validator: this.nodeId,
      hash: this.calculateBlockHash(this.blockHeight + 1, Date.now(), previousHash, transactions)
    };

    return block;
  }

  /**
   * 计算区块哈希
   */
  calculateBlockHash(height, timestamp, previousHash, transactions) {
    const data = JSON.stringify({ height, timestamp, previousHash, transactions });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 提议区块
   */
  proposeBlock(transactions = []) {
    const leader = this.consensus.getCurrentLeader();
    
    if (!leader || leader.nodeId !== this.nodeId) {
      console.log(`[NODE] ${this.nodeId} is not the current leader, skipping proposal`);
      return null;
    }

    const block = this.createBlock(transactions);
    
    // 先添加到本地链
    this.addBlockToChain(block);
    
    // 在共识层提议
    const proposed = this.consensus.proposeBlock(block, this.nodeId);
    
    if (proposed) {
      // 广播给其他节点
      this.broadcastBlock(block);
      return block;
    }

    return null;
  }

  /**
   * 广播区块给其他节点
   */
  broadcastBlock(block) {
    for (const [peerId, peer] of this.peers) {
      // 不要重复发送给已经有的区块的节点
      if (peer.blockHeight < block.height) {
        peer.receiveBlock(block, this.nodeId);
      }
    }
  }

  /**
   * 接收来自其他节点的区块
   */
  receiveBlock(block, fromNodeId) {
    // 如果已经处理过这个区块，跳过
    if (this.blockHeight >= block.height) {
      return true;
    }

    console.log(`[NODE] ${this.nodeId} received block ${block.height} from ${fromNodeId}`);
    
    // 验证区块
    if (!this.validateBlock(block)) {
      console.log(`[NODE] ${this.nodeId} rejected invalid block ${block.height}`);
      return false;
    }

    // 在共识层确认
    const confirmed = this.consensus.confirmBlock(block.hash, this.nodeId);
    
    // 添加到链
    this.addBlockToChain(block);
    
    // 继续广播给其他节点
    this.broadcastBlock(block);

    return confirmed;
  }

  /**
   * 验证区块
   */
  validateBlock(block) {
    // 验证高度
    if (block.height !== this.blockHeight + 1) {
      return false;
    }

    // 验证前一个哈希
    const expectedPreviousHash = this.blockchain.length > 0 
      ? this.blockchain[this.blockchain.length - 1].hash 
      : '0'.repeat(64);
    
    if (block.previousHash !== expectedPreviousHash) {
      return false;
    }

    // 验证哈希
    const expectedHash = this.calculateBlockHash(
      block.height, 
      block.timestamp, 
      block.previousHash, 
      block.transactions
    );
    
    if (block.hash !== expectedHash) {
      return false;
    }

    return true;
  }

  /**
   * 添加区块到链
   */
  addBlockToChain(block) {
    this.blockchain.push(block);
    this.blockHeight = block.height;
    
    console.log(`[NODE] ${this.nodeId} added block ${block.height} to chain`);
    
    // 应用交易到状态
    for (const tx of block.transactions) {
      this.state.applyTransaction(tx, block.height);
    }
  }

  /**
   * 获取节点状态
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      address: this.address,
      reputation: this.reputation,
      blockHeight: this.blockHeight,
      blockchainLength: this.blockchain.length,
      peers: this.peers.size,
      isLeader: this.consensus?.roundLeader?.nodeId === this.nodeId,
      consensusStats: this.consensus?.getStats() || null
    };
  }
}

/**
 * 测试网网络
 */
export class ConsensusTestnet {
  constructor() {
    this.nodes = new Map();
    this.genesisAddress = 'ng1genesis000000000000000000000000000000000';
    this.sharedConsensus = new MultiLeaderConsensus();
  }

  /**
   * 创建节点
   */
  createNode(nodeId, reputation = 1) {
    const address = `ng1${nodeId}${'0'.repeat(40 - nodeId.length)}`;
    const node = new ConsensusNode(nodeId, address, reputation, this.sharedConsensus);
    node.initialize(this.genesisAddress);
    
    this.nodes.set(nodeId, node);
    return node;
  }

  /**
   * 连接所有节点（全连接网络）
   */
  connectAllNodes() {
    const nodeList = Array.from(this.nodes.values());
    
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        nodeList[i].connectToPeer(nodeList[j]);
        nodeList[j].connectToPeer(nodeList[i]);
      }
    }
    
    console.log(`[TESTNET] Connected ${nodeList.length} nodes in full mesh`);
  }

  /**
   * 运行共识轮次
   */
  runConsensusRound(transactions = []) {
    // 选举领导者
    const firstNode = this.nodes.values().next().value;
    const leader = firstNode.consensus.getCurrentLeader();
    
    if (!leader) {
      console.log('[TESTNET] No leader elected');
      return null;
    }

    const leaderNode = this.nodes.get(leader.nodeId);
    if (!leaderNode) {
      console.log('[TESTNET] Leader node not found');
      return null;
    }

    // 领导者提议区块
    const block = leaderNode.proposeBlock(transactions);
    
    if (block) {
      // 其他节点确认
      for (const [nodeId, node] of this.nodes) {
        if (nodeId !== leader.nodeId) {
          node.receiveBlock(block, leader.nodeId);
        }
      }
    }

    return block;
  }

  /**
   * 运行多个轮次
   */
  runConsensusRounds(rounds, transactionsPerRound = []) {
    const blocks = [];
    
    for (let i = 0; i < rounds; i++) {
      console.log(`\n[TESTNET] === Round ${i + 1}/${rounds} ===`);
      
      const txs = transactionsPerRound[i] || [];
      const block = this.runConsensusRound(txs);
      
      if (block) {
        blocks.push(block);
      }
    }
    
    return blocks;
  }

  /**
   * 获取网络状态
   */
  getNetworkStatus() {
    const nodeStatuses = [];
    
    for (const [nodeId, node] of this.nodes) {
      nodeStatuses.push(node.getStatus());
    }
    
    // 检查所有节点的区块链是否一致
    const firstBlockchain = nodeStatuses[0]?.blockchainLength || 0;
    const allSynced = nodeStatuses.every(n => n.blockchainLength === firstBlockchain);
    
    return {
      totalNodes: this.nodes.size,
      nodes: nodeStatuses,
      allSynced,
      averageBlockHeight: nodeStatuses.reduce((sum, n) => sum + n.blockHeight, 0) / nodeStatuses.length
    };
  }
}

export default { ConsensusNode, ConsensusTestnet };
