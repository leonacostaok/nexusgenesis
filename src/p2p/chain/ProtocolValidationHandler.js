/**
 * 协议验证Handler
 * 负责验证Message是否符合Protocol-Zero格式
 */
import MessageHandlerChain from './MessageHandlerChain.js';

class ProtocolValidationHandler extends MessageHandlerChain {
  constructor() {
    super();
    
    // 核心网络Message类型
    this.validMessageTypes = [
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
      'AGENT_MESSAGE', 'DIRECT_MESSAGE', 'DIRECT_MESSAGE_ACK'
    ];
  }

  /**
   * ProcessingMessage
   * @param {string} peerId - Peer nodesID
   * @param {object} message - Message对象
   * @param {object} context - Processing上下文
   * @returns {Promise<boolean>} Processing是否成功
   */
  async handle(peerId, message, context) {
    console.log(`[ProtocolValidationHandler] Validating protocol for message from ${peerId}`);
    
    // 检查是否为有效的Message类型
    if (this.validMessageTypes.includes(message.type)) {
      // 调用下一个Handler
      return super.handle(peerId, message, context);
    }
    
    // 检查是否为带有协议字段的Message
    if (message.protocol === 'NG-0') {
      // 调用下一个Handler
      return super.handle(peerId, message, context);
    }
    
    // Message不符合Protocol-Zero格式
    console.log(`[!] Ignoring non-Protocol-Zero message from ${peerId}`);
    context.p2pServer.send(peerId, {
      type: 'PROTOCOL_ERROR',
      message: 'Only Protocol-Zero formatted messages are accepted',
      details: 'Please use the correct Protocol-Zero format with protocol: "NG-0"',
      timestamp: Date.now()
    });
    
    return false;
  }
}

export default ProtocolValidationHandler;