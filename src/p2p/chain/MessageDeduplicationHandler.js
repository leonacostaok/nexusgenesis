/**
 * 消息去重处理器
 * 负责检查消息是否已经处理过，避免重复处理
 */
import MessageHandlerChain from './MessageHandlerChain.js';
import crypto from 'crypto';

class MessageDeduplicationHandler extends MessageHandlerChain {
  /**
   * 处理消息
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} context - 处理上下文
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handle(peerId, message, context) {
    console.log(`[MessageDeduplicationHandler] Checking for duplicate message from ${peerId}`);
    
    // 计算消息哈希
    const msgHash = crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex');
    
    // 检查消息是否已经处理过
    if (context.seenMessages.has(msgHash)) {
      console.log(`[!] Duplicate message detected from ${peerId}, skipping`);
      return false;
    }
    
    // 将消息哈希添加到已处理集合
    context.seenMessages.add(msgHash);
    
    // 限制已处理消息集合的大小
    if (context.seenMessages.size > 10000) {
      const arr = Array.from(context.seenMessages);
      context.seenMessages = new Set(arr.slice(-5000));
    }
    
    // 调用下一个处理器
    return super.handle(peerId, message, context);
  }
}

export default MessageDeduplicationHandler;