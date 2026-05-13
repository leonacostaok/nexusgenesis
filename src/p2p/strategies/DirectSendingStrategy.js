/**
 * 直接发送策略
 * 用于发送紧急Message或小Message，直接发送，不进行批Processing
 */
import MessageSendingStrategy from './MessageSendingStrategy.js';
import EncryptionService from '../services/EncryptionService.js';
import CompressionService from '../services/CompressionService.js';

class DirectSendingStrategy extends MessageSendingStrategy {
  constructor(encryptionKeys) {
    super();
    this.encryptionService = new EncryptionService();
    this.compressionService = new CompressionService();
    this.encryptionKeys = encryptionKeys; // peerId -> sharedSecret
  }

  async send(peerId, message, connection) {
    if (!connection || !connection.ws || connection.ws.readyState !== 1) {
      return;
    }

    try {
      let messageStr = JSON.stringify(message);
      const bytesSent = messageStr.length;
      
      // 加密Message（如果有共享密钥）
      const sharedSecret = this.encryptionKeys.get(peerId);
      if (sharedSecret && this.encryptionService.shouldEncrypt(message.type)) {
        const encryptedData = this.encryptionService.encryptMessage(messageStr, sharedSecret);
        message = { type: 'ENCRYPTED_MESSAGE', data: encryptedData };
        messageStr = JSON.stringify(message);
      }
      
      // 压缩Message
      const compressedMessage = await this.compressionService.compressMessage(messageStr);
      
      // Send message
      if (compressedMessage) {
        connection.ws.send(JSON.stringify(compressedMessage));
      } else {
        connection.ws.send(messageStr);
      }
      
      this.updateTrafficStats(peerId, bytesSent);
    } catch (error) {
      console.error(`[!] Error sending message directly to peer ${peerId}:`, error.message);
    }
  }
  
  getName() {
    return 'direct';
  }
  
  shouldUse(message) {
    // 心跳等紧急Message，直接发送
    return message.type === 'PING' || message.type === 'PONG' || message.type === 'HELLO' || message.type === 'HELLO_ACK';
  }
  
  /**
   * 更新流量统计
   * @param {string} peerId - Peer nodesID
   * @param {number} bytesSent - 发送的字节数
   */
  updateTrafficStats(peerId, bytesSent) {
    // 这里可以添加流量统计逻辑
    // 暂时为空，需要集成到现有流量统计系统
  }
}

export default DirectSendingStrategy;
