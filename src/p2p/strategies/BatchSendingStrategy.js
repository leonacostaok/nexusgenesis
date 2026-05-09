/**
 * 批处理发送策略
 * 用于非紧急消息的批处理发送，提高网络效率
 */
import MessageSendingStrategy from './MessageSendingStrategy.js';
import DirectSendingStrategy from './DirectSendingStrategy.js';

const BATCH_INTERVAL = 100; // 消息批处理间隔（毫秒）
const MAX_BATCH_SIZE = 100; // 最大批处理消息数

class BatchSendingStrategy extends MessageSendingStrategy {
  constructor(encryptionKeys) {
    super();
    this.directStrategy = new DirectSendingStrategy(encryptionKeys);
    this.batchQueues = new Map(); // peerId -> 消息队列
    this.batchTimers = new Map(); // peerId -> 批处理定时器
    this.encryptionKeys = encryptionKeys;
  }

  async send(peerId, message, connection) {
    // 将消息加入批处理队列
    this.enqueueMessage(peerId, message, connection);
  }
  
  /**
   * 将消息加入批处理队列
   * @param {string} peerId - 对等节点ID
   * @param {object} message - 消息对象
   * @param {object} connection - 连接对象
   */
  enqueueMessage(peerId, message, connection) {
    if (!this.batchQueues.has(peerId)) {
      this.batchQueues.set(peerId, []);
    }
    
    const queue = this.batchQueues.get(peerId);
    queue.push({ message, connection });
    
    // 如果队列达到最大容量，立即处理
    if (queue.length >= MAX_BATCH_SIZE) {
      this.processBatch(peerId);
      return;
    }
    
    // 设置批处理定时器
    if (!this.batchTimers.has(peerId)) {
      const timer = setTimeout(() => {
        this.processBatch(peerId);
      }, BATCH_INTERVAL);
      this.batchTimers.set(peerId, timer);
    }
  }
  
  /**
   * 处理批处理队列
   * @param {string} peerId - 对等节点ID
   */
  async processBatch(peerId) {
    const queue = this.batchQueues.get(peerId);
    if (!queue || queue.length === 0) {
      return;
    }
    
    // 清除定时器
    if (this.batchTimers.has(peerId)) {
      clearTimeout(this.batchTimers.get(peerId));
      this.batchTimers.delete(peerId);
    }
    
    // 创建批处理消息
    const batchMessages = queue.map(item => item.message);
    const firstConnection = queue[0].connection;
    
    const batchMessage = {
      type: 'BATCH_MESSAGE',
      messages: batchMessages,
      timestamp: Date.now()
    };
    
    // 使用直接发送策略发送批处理消息
    await this.directStrategy.send(peerId, batchMessage, firstConnection);
    
    // 清空队列
    this.batchQueues.set(peerId, []);
  }
  
  getName() {
    return 'batch';
  }
  
  shouldUse(message) {
    // 非紧急消息，加入批处理队列
    return !this.directStrategy.shouldUse(message);
  }
}

export default BatchSendingStrategy;
