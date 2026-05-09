/**
 * 优先级发送策略
 * 根据消息的优先级决定发送方式，确保高优先级消息优先处理
 */
import MessageSendingStrategy from './MessageSendingStrategy.js';
import DirectSendingStrategy from './DirectSendingStrategy.js';
import BatchSendingStrategy from './BatchSendingStrategy.js';

const PRIORITY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

// 不同消息类型的优先级映射
const MESSAGE_PRIORITIES = {
  PING: PRIORITY_LEVELS.HIGH,
  PONG: PRIORITY_LEVELS.HIGH,
  HANDSHAKE: PRIORITY_LEVELS.HIGH,
  DISCONNECT: PRIORITY_LEVELS.HIGH,
  TRANSACTION: PRIORITY_LEVELS.MEDIUM,
  BLOCKCHAIN: PRIORITY_LEVELS.MEDIUM,
  LIGHT_CLIENT: PRIORITY_LEVELS.MEDIUM,
  DIRECT_MESSAGE: PRIORITY_LEVELS.MEDIUM,
  BATCH_MESSAGE: PRIORITY_LEVELS.MEDIUM,
  PROTOCOL_ZERO_SIGNAL: PRIORITY_LEVELS.LOW,
  DEFAULT: PRIORITY_LEVELS.MEDIUM
};

class PrioritySendingStrategy extends MessageSendingStrategy {
  constructor(encryptionKeys) {
    super();
    this.directStrategy = new DirectSendingStrategy(encryptionKeys);
    this.batchStrategy = new BatchSendingStrategy(encryptionKeys);
    this.encryptionKeys = encryptionKeys;
  }

  async send(peerId, message, connection) {
    // 根据消息优先级选择合适的发送策略
    const priority = this._getMessagePriority(message);
    
    switch (priority) {
      case PRIORITY_LEVELS.HIGH:
        // 高优先级消息，使用直接发送策略
        return await this.directStrategy.send(peerId, message, connection);
      case PRIORITY_LEVELS.MEDIUM:
      case PRIORITY_LEVELS.LOW:
      default:
        // 中低优先级消息，使用批处理发送策略
        return await this.batchStrategy.send(peerId, message, connection);
    }
  }

  /**
   * 获取消息的优先级
   * @param {object} message - 消息对象
   * @returns {string} 消息优先级
   * @private
   */
  _getMessagePriority(message) {
    if (!message || !message.type) {
      return MESSAGE_PRIORITIES.DEFAULT;
    }
    
    return MESSAGE_PRIORITIES[message.type] || MESSAGE_PRIORITIES.DEFAULT;
  }

  getName() {
    return 'priority';
  }

  shouldUse(message) {
    // 优先级策略适用于所有消息
    // 它会根据消息的优先级内部选择合适的发送策略
    return true;
  }
}

export default PrioritySendingStrategy;