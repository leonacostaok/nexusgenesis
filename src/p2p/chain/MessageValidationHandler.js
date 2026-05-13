/**
 * Message验证Handler
 * 负责验证Message的格式和有效性
 */
import MessageHandlerChain from './MessageHandlerChain.js';
import crypto from 'crypto';

class MessageValidationHandler extends MessageHandlerChain {
  /**
   * ProcessingMessage
   * @param {string} peerId - Peer nodesID
   * @param {object} message - Message对象
   * @param {object} context - Processing上下文
   * @returns {Promise<boolean>} Processing是否成功
   */
  async handle(peerId, message, context) {
    console.log(`[MessageValidationHandler] Validating message from ${peerId}`);
    
    // 检查Message格式
    if (!message || typeof message !== 'object') {
      console.log(`[!] Invalid message format from ${peerId}`);
      context.p2pServer.send(peerId, {
        type: 'PROTOCOL_ERROR',
        message: 'Invalid message format, must be a JSON object',
        timestamp: Date.now()
      });
      return false;
    }
    
    // 检查Message类型
    if (!message.type || typeof message.type !== 'string') {
      console.log(`[!] Missing or invalid message type from ${peerId}`);
      context.p2pServer.send(peerId, {
        type: 'PROTOCOL_ERROR',
        message: 'Missing or invalid message type',
        timestamp: Date.now()
      });
      return false;
    }
    
    // 调用下一个Handler
    return super.handle(peerId, message, context);
  }
}

export default MessageValidationHandler;