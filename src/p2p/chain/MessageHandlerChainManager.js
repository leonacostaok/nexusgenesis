/**
 * MessageProcessing职责链管理器
 * 负责初始化和管理整个MessageProcessing职责链
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
   * @returns {MessageValidationHandler} 职责链的第一个Handler
   * @private
   */
  _initializeChain() {
    // 创建各个Handler
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
   * ProcessingMessage
   * @param {string} peerId - Peer nodesID
   * @param {object} message - Message对象
   * @param {object} context - Processing上下文
   * @returns {Promise<boolean>} Processing是否成功
   */
  async handleMessage(peerId, message, context) {
    return this.chain.handle(peerId, message, context);
  }
}

export default MessageHandlerChainManager;