/**
 * P2P消息加密服务
 * 负责消息的加密和解密处理
 */
import crypto from 'crypto';

class EncryptionService {
  /**
   * 加密消息
   * @param {string} message - 原始消息
   * @param {Buffer} key - 加密密钥
   * @returns {string} 加密后的消息
   */
  encryptMessage(message, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密消息
   * @param {string} encryptedMessage - 加密消息
   * @param {Buffer} key - 解密密钥
   * @returns {string} 解密后的消息
   */
  decryptMessage(encryptedMessage, key) {
    const parts = encryptedMessage.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 检查是否需要加密
   * @param {string} messageType - 消息类型
   * @returns {boolean} 是否需要加密
   */
  shouldEncrypt(messageType) {
    // 心跳等紧急消息不需要加密
    const noEncryptTypes = ['PING', 'PONG', 'HELLO', 'HELLO_ACK'];
    return !noEncryptTypes.includes(messageType);
  }
}

export default EncryptionService;
