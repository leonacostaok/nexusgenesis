/**
 * MessageHandler基类
 * 所有MessageHandler都应该继承此类
 */
export class MessageHandler {
  constructor(p2pServer) {
    this.p2pServer = p2pServer;
  }

  /**
   * ProcessingMessage
   * @param {string} peerId - Peer nodes ID
   * @param {object} msg - Message对象
   * @returns {Promise<boolean>} 是否成功Processing
   */
  async handle(peerId, msg) {
    throw new Error('handle method must be implemented by subclass');
  }

  /**
   * 验证Message格式
   * @param {object} msg - Message对象
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