/**
 * NexusGenesis - Base Wallet Class
 * 钱包基class实现
 */

import crypto from 'crypto';
import { hash, randomBytes } from '../crypto/pqc.js';
import { generateAddress } from './addressUtils.js';

/**
 * 钱包基class
 */
export class Wallet {
  constructor() {
    this.address = null;
    this.publicKey = null;
    this.privateKey = null;
    this.balance = 0n;
  }

  /**
   * Generate钱包address (委托 addressUtils.js)
   * @param {Buffer} publicKey public key
   * @returns {string} 钱包address
   */
  static generateAddress(publicKey) {
    return generateAddress(publicKey);
  }

  /**
   * Base58编码
   * @param {Buffer} buffer 要编码的缓冲区
   * @returns {string} Base58编码的字符串
   */
  static base58Encode(buffer) {
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    let num = BigInt('0x' + buffer.toString('hex'));
    
    while (num > 0n) {
      const idx = Number(num % 58n);
      result = base58Chars[idx] + result;
      num = num / 58n;
    }
    
    // Processing前导零
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] !== 0) break;
      result = base58Chars[0] + result;
    }
    
    return result;
  }

  /**
   * Base58解码
   * @param {string} str Base58编码的字符串
   * @returns {Buffer} 解码后的缓冲区
   */
  static base58Decode(str) {
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    
    for (let i = 0; i < str.length; i++) {
      const idx = base58Chars.indexOf(str[i]);
      if (idx === -1) {
        throw new Error('Invalid Base58 character');
      }
      num = num * 58n + BigInt(idx);
    }
    
    let hex = num.toString(16);
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    
    const buffer = Buffer.from(hex, 'hex');
    
    // Processing前导零
    for (let i = 0; i < str.length && str[i] === base58Chars[0]; i++) {
      buffer.unshift(0);
    }
    
    return buffer;
  }

  /**
   * Verifyaddress格式
   * @param {string} address 钱包address
   * @returns {object} verification result
   */
  static validateAddress(address) {
    try {
      // Check前缀
      if (!address.startsWith('ng1')) {
        return { valid: false, reason: 'Invalid address prefix' };
      }
      
      // 解码address
      const decoded = this.base58Decode(address.substring(3));
      
      // Checklength: 1 版本 + 20 public keyhash + 4 校验和 = 25
      if (decoded.length !== 25) {
        return { valid: false, reason: `Invalid address length: expected 25, got ${decoded.length}` };
      }
      
      // Check版本
      if (decoded[0] !== 0x00) {
        return { valid: false, reason: 'Invalid address version' };
      }
      
      // 分离主体和校验和
      const versionedPayload = decoded.slice(0, 21);
      const checksum = decoded.slice(21);
      
      // Verify校验和
      const expectedChecksum = Buffer.from(hash(versionedPayload, 'sha3-256'), 'hex').slice(0, 4);
      if (!checksum.equals(expectedChecksum)) {
        return { valid: false, reason: 'Invalid address checksum' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Signtransaction
   * @param {object} transaction transaction对象
   * @returns {Promise<Buffer>} Sign
   */
  async signTransaction(transaction) {
    throw new Error('signTransaction must be implemented by subclass');
  }

  /**
   * VerifytransactionSign
   * @param {object} transaction transaction对象
   * @param {Buffer} signature Sign
   * @returns {Promise<boolean>} verification result
   */
  async verifyTransaction(transaction, signature) {
    throw new Error('verifyTransaction must be implemented by subclass');
  }

  /**
   * get钱包info
   * @returns {object} 钱包info
   */
  getInfo() {
    return {
      address: this.address,
      balance: this.balance.toString(),
      publicKey: this.publicKey ? this.publicKey.toString('hex') : null
    };
  }

  /**
   * Save钱包到文件
   * @param {string} filePath 文件路径
   * @returns {Promise<void>}
   */
  async save(filePath) {
    throw new Error('save must be implemented by subclass');
  }

  /**
   * 从文件Load钱包
   * @param {string} filePath 文件路径
   * @returns {Promise<Wallet>}
   */
  static async load(filePath) {
    throw new Error('load must be implemented by subclass');
  }
}

export default Wallet;