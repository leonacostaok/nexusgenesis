/**
 * 消息处理处理器
 * 负责调用实际的消息处理器来处理消息
 */
import MessageHandlerChain from './MessageHandlerChain.js';

class MessageProcessingHandler extends MessageHandlerChain {
  /**
   * 处理消息
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} context - 处理上下文
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handle(peerId, message, context) {
    console.log(`[MessageProcessingHandler] Processing message from ${peerId}`);
    
    // 特殊处理：Protocol-Zero 信号（包含 protocol 字段的情况）
    if (message.protocol === 'NG-0' && message.intent) {
      const handler = context.handlerRegistry.getHandler('PROTOCOL_ZERO');
      if (handler) {
        await handler.handle(peerId, message);
        return true;
      }
    }
    
    // 获取消息处理器
    const handler = context.handlerRegistry.getHandler(message.type);
    
    if (!handler) {
      console.log(`Unknown message type: ${message.type} from ${peerId}`);
      return false;
    }
    
    // 检查是否需要节点验证
    if (handler.requiresVerification() && context.node && !context.node.isPeerVerified(peerId)) {
      console.log(`[!] Ignoring message from unverified peer ${peerId}`);
      context.p2pServer.send(peerId, {
        type: 'AUTH_ERROR',
        message: 'Peer not verified, please complete Protocol-Zero handshake first',
        timestamp: Date.now()
      });
      return false;
    }
    
    // 处理消息
    await handler.handle(peerId, message);
    return true;
  }
}

export default MessageProcessingHandler;