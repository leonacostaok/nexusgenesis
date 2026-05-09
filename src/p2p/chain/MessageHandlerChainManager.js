/**
 * 消息处理职责链管理器
 * 负责初始化和管理整个消息处理职责链
 */
import MessageValidationHandler from './MessageValidationHandler.js';
import MessageDeduplicationHandler from './MessageDeduplicationHandler.js';
import ProtocolValidationHandler from './ProtocolValidationHandler.js';
import MessageProcessingHandler from './MessageProcessingHandler.js';

class MessageHandlerChainManager {
  constructor() {
    // 初始化职责链
    this.chain = this._initializeChain();
  }

  /**
   * 初始化职责链
   * @returns {MessageValidationHandler} 职责链的第一个处理器
   * @private
   */
  _initializeChain() {
    // 创建各个处理器
    const validationHandler = new MessageValidationHandler();
    const deduplicationHandler = new MessageDeduplicationHandler();
    const protocolHandler = new ProtocolValidationHandler();
    const processingHandler = new MessageProcessingHandler();

    // 构建职责链
    validationHandler
      .setNext(deduplicationHandler)
      .setNext(protocolHandler)
      .setNext(processingHandler);

    return validationHandler;
  }

  /**
   * 处理消息
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} context - 处理上下文
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handleMessage(peerId, message, context) {
    return this.chain.handle(peerId, message, context);
  }
}

export default MessageHandlerChainManager;