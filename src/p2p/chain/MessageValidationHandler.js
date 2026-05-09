/**
 * 消息验证处理器
 * 负责验证消息的格式和有效性
 */
import MessageHandlerChain from './MessageHandlerChain.js';
import crypto from 'crypto';

class MessageValidationHandler extends MessageHandlerChain {
  /**
   * 处理消息
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} context - 处理上下文
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handle(peerId, message, context) {
    console.log(`[MessageValidationHandler] Validating message from ${peerId}`);
    
    // 检查消息格式
    if (!message || typeof message !== 'object') {
      console.log(`[!] Invalid message format from ${peerId}`);
      context.p2pServer.send(peerId, {
        type: 'PROTOCOL_ERROR',
        message: 'Invalid message format, must be a JSON object',
        timestamp: Date.now()
      });
      return false;
    }
    
    // 检查消息类型
    if (!message.type || typeof message.type !== 'string') {
      console.log(`[!] Missing or invalid message type from ${peerId}`);
      context.p2pServer.send(peerId, {
        type: 'PROTOCOL_ERROR',
        message: 'Missing or invalid message type',
        timestamp: Date.now()
      });
      return false;
    }
    
    // 调用下一个处理器
    return super.handle(peerId, message, context);
  }
}

export default MessageValidationHandler;