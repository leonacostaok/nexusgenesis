import { MessageHandler } from './MessageHandler.js';

export class BlockchainMessageHandler extends MessageHandler {
  /**
   * Processing区块链相关Message
   */
  async handle(peerId, msg) {
    switch (msg.type) {
      case 'PONG':
        return this.handlePong(peerId);
        
      case 'PING':
        return this.handlePing(peerId, msg);
          
      case 'GET_STATUS':
        return this.handleGetStatus(peerId);
        
      case 'STATUS_UPDATE':
        return this.handleStatusUpdate(msg);
        
      case 'GET_MEMPOOL':
        return this.handleGetMempool(peerId);
        
      case 'MEMPOOL_SYNC':
        return this.handleMempoolSync(msg);
        
      case 'GET_NODE_LIST':
        return this.handleGetNodeList(peerId);
        
      case 'NODE_LIST':
        return this.handleNodeList(msg);
        
      case 'BLOCK':
        return this.handleBlock(peerId, msg);
        
      case 'BLOCK_CONFIRMATION':
        return this.handleBlockConfirmation(msg);
        
      case 'TX_REJECTED':
        return this.handleTxRejected(msg);
        
      case 'SWARM_ACK':
        return this.handleSwarmAck(msg);
        
      case 'PROTOCOL_ERROR':
        return this.handleProtocolError(msg);
        
      default:
        return false;
    }
  }

  /**
   * Processing PONG Message
   */
  handlePong(peerId) {
    this.p2pServer.handlePong(peerId);
    return true;
  }

  /**
   * Processing PING Message
   */
  handlePing(peerId, msg) {
    this.p2pServer.send(peerId, { type: 'PONG', timestamp: msg.timestamp });
    return true;
  }

  /**
   * Processing GET_STATUS Message
   */
  handleGetStatus(peerId) {
    this.p2pServer.send(peerId, {
      type: 'STATUS_UPDATE',
      nodeId: this.p2pServer.node.nodeId,
      status: this.p2pServer.node.status,
      mempoolSize: this.p2pServer.node.mempool?.size || 0,
      peersCount: this.p2pServer.node.peers.size,
      timestamp: Date.now()
    });
    return true;
  }

  /**
   * Processing STATUS_UPDATE Message
   */
  handleStatusUpdate(msg) {
    console.log(`Status from ${msg.nodeId}: ${msg.status}, peers: ${msg.peersCount}, mempool: ${msg.mempoolSize}`);
    if (this.p2pServer.node && this.p2pServer.node.handlePeerStatus) {
      this.p2pServer.node.handlePeerStatus(msg);
    }
    return true;
  }

  /**
   * Processing GET_MEMPOOL Message
   */
  handleGetMempool(peerId) {
    if (this.p2pServer.node && this.p2pServer.node.mempool) {
      this.p2pServer.send(peerId, {
        type: 'MEMPOOL_SYNC',
        transactions: Array.from(this.p2pServer.node.mempool.values())
      });
    }
    return true;
  }

  /**
   * Processing MEMPOOL_SYNC Message
   */
  handleMempoolSync(msg) {
    console.log(`Received ${msg.transactions?.length || 0} transactions from peer`);
    if (this.p2pServer.node && this.p2pServer.node.syncMempool) {
      this.p2pServer.node.syncMempool(msg.transactions || []);
    }
    return true;
  }

  /**
   * Processing GET_NODE_LIST Message
   */
  handleGetNodeList(peerId) {
    console.log(`Node list requested by ${peerId}`);
    this.p2pServer.handleGetNodeList(peerId);
    return true;
  }

  /**
   * Processing NODE_LIST Message
   */
  handleNodeList(msg) {
    console.log(`Received node list with ${msg.nodes?.length || 0} nodes`);
    this.p2pServer.handleNodeList(msg);
    return true;
  }

  /**
   * Processing BLOCK Message
   */
  async handleBlock(peerId, msg) {
    console.log(`Block received: #${msg.block.header.height}`);
    if (this.p2pServer.node && this.p2pServer.node.handleBlock) {
      const { Block } = await import('../../blockchain/block.js');
      const block = Block.fromJSON(msg.block);
      this.p2pServer.node.handleBlock(block);
    }
    return true;
  }

  /**
   * Processing BLOCK_CONFIRMATION Message
   */
  handleBlockConfirmation(msg) {
    console.log(`Block confirmation received for ${msg.blockHash.slice(0, 16)}...`);
    if (this.p2pServer.node && this.p2pServer.node.handleBlockConfirmation) {
      this.p2pServer.node.handleBlockConfirmation(msg);
    }
    return true;
  }

  /**
   * Processing TX_REJECTED Message
   */
  handleTxRejected(msg) {
    console.log(`Transaction rejected: ${msg.txId}, reason: ${msg.reason}`);
    return true;
  }

  /**
   * Processing SWARM_ACK Message
   */
  handleSwarmAck(msg) {
    console.log(`Swarm acknowledgment received from ${msg.nodeId}`);
    return true;
  }

  /**
   * Processing PROTOCOL_ERROR Message
   */
  handleProtocolError(msg) {
    console.log(`Protocol error from ${msg.nodeId}: ${msg.message}`);
    return true;
  }
}

// Processing GET_NODE_LIST Message（不需要验证的版本）
export class NodeListHandler extends MessageHandler {
  /**
   * Processing GET_NODE_LIST Message
   */
  async handle(peerId, msg) {
    console.log(`Node list requested by ${peerId}`);
    this.p2pServer.handleGetNodeList(peerId);
    return true;
  }

  /**
   * GET_NODE_LIST Message不需要验证
   */
  requiresVerification() {
    return false;
  }
}