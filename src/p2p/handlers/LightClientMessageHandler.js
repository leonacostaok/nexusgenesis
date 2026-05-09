import { MessageHandler } from './MessageHandler.js';

export class LightClientMessageHandler extends MessageHandler {
  /**
   * 处理轻客户端相关消息
   */
  async handle(peerId, msg) {
    switch (msg.type) {
      case 'LIGHT_CLIENT_HELLO':
        return this.handleLightClientHello(peerId, msg);
        
      case 'GET_BLOCK_HEADERS':
        return this.handleGetBlockHeaders(peerId, msg);
        
      case 'GET_MERKLE_PROOF':
        return this.handleGetMerkleProof(peerId, msg);
        
      case 'GET_TRANSACTION_STATUS':
        return this.handleGetTransactionStatus(peerId, msg);
        
      case 'GET_ADDRESS_BALANCE':
        return this.handleGetAddressBalance(peerId, msg);
        
      case 'SEND_TRANSACTION':
        return this.handleLightClientTransaction(peerId, msg);
        
      case 'CROSS_CHAIN_MESSAGE':
        return this.handleCrossChainMessage(peerId, msg);
        
      default:
        return false;
    }
  }

  /**
   * 处理 LIGHT_CLIENT_HELLO 消息
   */
  handleLightClientHello(peerId, msg) {
    console.log(`Light client connected: ${msg.nodeId}`);
    this.p2pServer.send(peerId, {
      type: 'LIGHT_CLIENT_HELLO_ACK',
      nodeId: this.p2pServer.node.nodeId,
      accepted: true,
      requestId: msg.requestId
    });
    return true;
  }

  /**
   * 处理 GET_BLOCK_HEADERS 消息
   */
  handleGetBlockHeaders(peerId, msg) {
    if (!this.p2pServer.node || !this.p2pServer.node.blockchain) {
      this.p2pServer.send(peerId, {
        type: 'BLOCK_HEADERS',
        headers: [],
        requestId: msg.requestId
      });
      return false;
    }

    const startHeight = msg.startHeight || 0;
    const count = Math.min(msg.count || 100, 100); // 限制最大请求数量
    
    const headers = this.p2pServer.node.blockchain
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

    this.p2pServer.send(peerId, {
      type: 'BLOCK_HEADERS',
      headers,
      requestId: msg.requestId
    });
    return true;
  }

  /**
   * 处理 GET_MERKLE_PROOF 消息
   */
  handleGetMerkleProof(peerId, msg) {
    if (!this.p2pServer.node || !this.p2pServer.node.blockchain) {
      this.p2pServer.send(peerId, {
        type: 'MERKLE_PROOF',
        error: 'Blockchain not available',
        requestId: msg.requestId
      });
      return false;
    }

    const txId = msg.txId;
    let blockHash = null;
    let proof = null;

    // 查找包含该交易的区块
    for (const block of this.p2pServer.node.blockchain) {
      const txIndex = block.body.transactions.findIndex(tx => tx.id === txId);
      if (txIndex !== -1) {
        blockHash = block.hash;
        // 生成默克尔证明
        proof = this.p2pServer.generateMerkleProof(block.body.transactions, txIndex);
        break;
      }
    }

    if (proof) {
      this.p2pServer.send(peerId, {
        type: 'MERKLE_PROOF',
        txId,
        blockHash,
        proof,
        requestId: msg.requestId
      });
    } else {
      this.p2pServer.send(peerId, {
        type: 'MERKLE_PROOF',
        error: 'Transaction not found',
        requestId: msg.requestId
      });
    }
    return true;
  }

  /**
   * 处理 GET_TRANSACTION_STATUS 消息
   */
  handleGetTransactionStatus(peerId, msg) {
    if (!this.p2pServer.node || !this.p2pServer.node.blockchain) {
      this.p2pServer.send(peerId, {
        type: 'TRANSACTION_STATUS',
        error: 'Blockchain not available',
        requestId: msg.requestId
      });
      return false;
    }

    const txId = msg.txId;
    let status = 'NOT_FOUND';
    let confirmations = 0;
    let blockHeight = 0;

    // 查找交易
    for (const block of this.p2pServer.node.blockchain) {
      const txIndex = block.body.transactions.findIndex(tx => tx.id === txId);
      if (txIndex !== -1) {
        status = 'CONFIRMED';
        blockHeight = block.header.height;
        confirmations = this.p2pServer.node.blockchain.length - block.header.height;
        break;
      }
    }

    // 检查mempool
    if (status === 'NOT_FOUND' && this.p2pServer.node.mempool && this.p2pServer.node.mempool.has(txId)) {
      status = 'PENDING';
    }

    this.p2pServer.send(peerId, {
      type: 'TRANSACTION_STATUS',
      txId,
      status,
      confirmations,
      blockHeight,
      requestId: msg.requestId
    });
    return true;
  }

  /**
   * 处理 GET_ADDRESS_BALANCE 消息
   */
  handleGetAddressBalance(peerId, msg) {
    if (!this.p2pServer.node || !this.p2pServer.node.currentState) {
      this.p2pServer.send(peerId, {
        type: 'ERROR',
        message: 'State not available',
        requestId: msg.requestId
      });
      return false;
    }

    const address = msg.address;
    const balance = this.p2pServer.node.currentState.getBalance(address) || 0n;

    this.p2pServer.send(peerId, {
      type: 'ADDRESS_BALANCE',
      address,
      balance: balance.toString(),
      requestId: msg.requestId
    });
    return true;
  }

  /**
   * 处理轻客户端发送的交易
   */
  async handleLightClientTransaction(peerId, msg) {
    if (!this.p2pServer.node || !this.p2pServer.node.addToMempool) {
      this.p2pServer.send(peerId, {
        type: 'ERROR',
        message: 'Mempool not available',
        requestId: msg.requestId
      });
      return false;
    }

    const transaction = msg.transaction;
    const result = await this.p2pServer.node.addToMempool(transaction);

    if (result.success) {
      this.p2pServer.send(peerId, {
        type: 'TRANSACTION_ACCEPTED',
        txId: transaction.id,
        requestId: msg.requestId
      });
      // 广播交易
      this.p2pServer.broadcastTransaction(transaction);
    } else {
      this.p2pServer.send(peerId, {
        type: 'TRANSACTION_REJECTED',
        txId: transaction.id,
        reason: result.reason,
        requestId: msg.requestId
      });
    }
    return true;
  }

  /**
   * 处理跨链消息
   */
  async handleCrossChainMessage(peerId, msg) {
    // 检查是否有桥接实例
    if (!this.p2pServer.node || !this.p2pServer.node.bridge) {
      this.p2pServer.send(peerId, {
        type: 'CROSS_CHAIN_RESPONSE',
        error: 'Bridge not available',
        requestId: msg.requestId
      });
      return false;
    }

    try {
      const result = await this.p2pServer.node.bridge.handleCrossChainMessage(msg);
      this.p2pServer.send(peerId, {
        type: 'CROSS_CHAIN_RESPONSE',
        result,
        requestId: msg.requestId
      });
    } catch (error) {
      this.p2pServer.send(peerId, {
        type: 'CROSS_CHAIN_RESPONSE',
        error: error.message,
        requestId: msg.requestId
      });
    }
    return true;
  }
}