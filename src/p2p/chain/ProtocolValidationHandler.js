/**
 * 协议验证处理器
 * 负责验证消息是否符合Protocol-Zero格式
 */
import MessageHandlerChain from './MessageHandlerChain.js';

class ProtocolValidationHandler extends MessageHandlerChain {
  constructor() {
    super();
    
    // 核心网络消息类型
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
   * 处理消息
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} context - 处理上下文
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handle(peerId, message, context) {
    console.log(`[ProtocolValidationHandler] Validating protocol for message from ${peerId}`);
    
    // 检查是否为有效的消息类型
    if (this.validMessageTypes.includes(message.type)) {
      // 调用下一个处理器
      return super.handle(peerId, message, context);
    }
    
    // 检查是否为带有协议字段的消息
    if (message.protocol === 'NG-0') {
      // 调用下一个处理器
      return super.handle(peerId, message, context);
    }
    
    // 消息不符合Protocol-Zero格式
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