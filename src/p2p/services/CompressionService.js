/**
 * P2PMessage压缩服务
 * 负责Message的压缩和解压缩Processing
 */
import zlib from 'zlib';

const COMPRESSION_THRESHOLD = 1024; // 压缩阈值（字节）

class CompressionService {
  /**
   * 压缩Message
   * @param {string|Buffer} message - 原始Message
   * @returns {Promise<object>} 压缩后的Message对象
   */
  compressMessage(message) {
    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    
    // 对于小Message，不进行压缩
    if (messageBuffer.length < COMPRESSION_THRESHOLD) {
      return Promise.resolve(null); // 返回null表示不需要压缩
    }
    
    return new Promise((resolve, reject) => {
      zlib.gzip(messageBuffer, (err, compressed) => {
        if (err) {
          reject(err);
          return;
        }
        
        resolve({
          type: 'COMPRESSED_MESSAGE',
          data: compressed.toString('base64'),
          originalSize: messageBuffer.length,
          compressedSize: compressed.length
        });
      });
    });
  }

  /**
   * 解压缩Message
   * @param {object} compressedMessage - 压缩Message对象
   * @returns {Promise<string>} 解压缩后的Message
   */
  decompressMessage(compressedMessage) {
    return new Promise((resolve, reject) => {
      const compressedData = Buffer.from(compressedMessage.data, 'base64');
      zlib.gunzip(compressedData, (err, decompressed) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(decompressed.toString());
      });
    });
  }

  /**
   * 检查是否需要压缩
   * @param {string|Buffer} message - 原始Message
   * @returns {boolean} 是否需要压缩
   */
  shouldCompress(message) {
    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    return messageBuffer.length >= COMPRESSION_THRESHOLD;
  }
}

export default CompressionService;
