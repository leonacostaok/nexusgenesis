/**
 * 消息处理器基类
 * 所有消息处理器都应该继承此类
 */
export class MessageHandler {
  constructor(p2pServer) {
    this.p2pServer = p2pServer;
  }

  /**
   * 处理消息
   * @param {string} peerId - 对等节点 ID
   * @param {object} msg - 消息对象
   * @returns {Promise<boolean>} 是否成功处理
   */
  async handle(peerId, msg) {
    throw new Error('handle method must be implemented by subclass');
  }

  /**
   * 验证消息格式
   * @param {object} msg - 消息对象
   * @returns {boolean} 是否有效
   */
  validate(msg) {
    return true;
  }

  /**
   * 检查是否需要节点验证
   * @returns {boolean}
   */
  requiresVerification() {
    return true;
  }
}