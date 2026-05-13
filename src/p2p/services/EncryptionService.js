/**
 * P2PMessage加密服务
 * 负责Message的加密和解密Processing
 */
import crypto from 'crypto';

class EncryptionService {
  /**
   * 加密Message
   * @param {string} message - 原始Message
   * @param {Buffer} key - 加密密钥
   * @returns {string} 加密后的Message
   */
  encryptMessage(message, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密Message
   * @param {string} encryptedMessage - 加密Message
   * @param {Buffer} key - 解密密钥
   * @returns {string} 解密后的Message
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
   * @param {string} messageType - Message类型
   * @returns {boolean} 是否需要加密
   */
  shouldEncrypt(messageType) {
    // 心跳等紧急Message不需要加密
    const noEncryptTypes = ['PING', 'PONG', 'HELLO', 'HELLO_ACK'];
    return !noEncryptTypes.includes(messageType);
  }
}

export default EncryptionService;
