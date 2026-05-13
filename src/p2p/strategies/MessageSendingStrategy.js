/**
 * Message发送策略接口
 * 定义不同发送策略的统一接口
 */
class MessageSendingStrategy {
  /**
   * Send message
   * @param {string} peerId - Peer nodesID
   * @param {object} message - Message对象
   * @param {object} connection - 连接对象
   * @returns {Promise<void>} 发送完成的Promise
   */
  async send(peerId, message, connection) {
    throw new Error('send method must be implemented by concrete strategy');
  }
  
  /**
   * get策略名称
   * @returns {string} 策略名称
   */
  getName() {
    throw new Error('getName method must be implemented by concrete strategy');
  }
  
  /**
   * 检查是否应该使用该策略
   * @param {object} message - Message对象
   * @returns {boolean} 是否应该使用该策略
   */
  shouldUse(message) {
    throw new Error('shouldUse method must be implemented by concrete strategy');
  }
}

export default MessageSendingStrategy;
