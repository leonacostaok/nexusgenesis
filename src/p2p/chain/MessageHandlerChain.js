/**
 * 消息处理职责链基类
 * 定义了职责链的基本接口和实现
 */
class MessageHandlerChain {
  constructor() {
    this.nextHandler = null;
  }

  /**
   * 设置下一个处理器
   * @param {MessageHandlerChain} nextHandler - 下一个处理器
   * @returns {MessageHandlerChain} 下一个处理器，支持链式调用
   */
  setNext(nextHandler) {
    this.nextHandler = nextHandler;
    return nextHandler;
  }

  /**
   * 处理消息
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} context - 处理上下文
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handle(peerId, message, context) {
    // 子类实现具体的处理逻辑
    if (this.nextHandler) {
      return await this.nextHandler.handle(peerId, message, context);
    }
    return true;
  }
}

export default MessageHandlerChain;