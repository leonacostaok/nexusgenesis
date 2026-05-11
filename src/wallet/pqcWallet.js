/**
 * NexusGenesis - PQC Wallet Implementation
 * 基于Dilithium2的抗量子钱包实现
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Wallet } from './wallet.js';
import { generateAddress, validateAddress } from './addressUtils.js';
import { generateKeyPair, sign, verify, hash } from '../crypto/pqc.js';

/**
 * PQC钱包类
 */
export class PQCWallet extends Wallet {
  /**
   * 构造函数
   * @param {Buffer} publicKey 公钥
   * @param {Buffer} privateKey 私钥
   * @param {bigint} balance 余额
   */
  constructor(publicKey, privateKey, balance = 0n) {
    super();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.address = Wallet.generateAddress(publicKey);
    this.balance = balance;
  }

  /**
   * secretKey 别名，兼容不同命名习惯
   * @returns {Buffer}
   */
  get secretKey() {
    return this.privateKey;
  }

  /**
   * 生成新钱包
   * @param {bigint} initialBalance 初始余额
   * @returns {Promise<PQCWallet>} 新钱包
   */
  static async generate(initialBalance = 0n) {
    try {
      const { publicKey, privateKey } = await generateKeyPair();
      return new PQCWallet(publicKey, privateKey, initialBalance);
    } catch (error) {
      console.error('Error generating PQC wallet:', error.message);
      throw error;
    }
  }

  /**
   * 从文件加载钱包
   * @param {string} filePath 文件路径
   * @returns {Promise<PQCWallet>} 钱包实例
   */
  static async load(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const walletData = JSON.parse(data);
      
      const publicKey = Buffer.from(walletData.publicKey, 'hex');
      const privateKey = Buffer.from(walletData.privateKey, 'hex');
      const balance = BigInt(walletData.balance || 0);
      
      return new PQCWallet(publicKey, privateKey, balance);
    } catch (error) {
      console.error('Error loading PQC wallet:', error.message);
      throw error;
    }
  }

  /**
   * 保存钱包到文件
   * @param {string} filePath 文件路径
   * @returns {Promise<void>}
   */
  async save(filePath) {
    try {
      const walletData = {
        address: this.address,
        publicKey: this.publicKey.toString('hex'),
        privateKey: this.privateKey.toString('hex'),
        balance: this.balance.toString()
      };
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(filePath, JSON.stringify(walletData, null, 2));
    } catch (error) {
      console.error('Error saving PQC wallet:', error.message);
      throw error;
    }
  }

  /**
   * 签名消息
   * @param {string|object} message 要签名的消息
   * @returns {Promise<string>} 签名（十六进制）
   */
  async sign(message) {
    try {
      const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
      const signature = await sign(messageStr, this.privateKey);
      return signature.toString('hex');
    } catch (error) {
      console.error('Error signing message:', error.message);
      throw error;
    }
  }

  /**
   * 验证签名
   * @param {string|object} message 原始消息
   * @param {string|Buffer} signature 签名
   * @param {Buffer} publicKey 公钥
   * @returns {Promise<boolean>} 验证结果
   */
  async verify(message, signature, publicKey) {
    try {
      const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
      const sigBuffer = typeof signature === 'string' ? Buffer.from(signature, 'hex') : signature;
      const isValid = await verify(messageStr, sigBuffer, publicKey);
      return isValid;
    } catch (error) {
      console.error('Error verifying signature:', error.message);
      return false;
    }
  }

  /**
   * 静态签名验证（兼容直接调用）
   * @param {string|object} message 原始消息
   * @param {string|Buffer} signature 签名
   * @param {Buffer} publicKey 公钥
   * @returns {Promise<boolean>} 验证结果
   */
  static async verify(message, signature, publicKey) {
    try {
      const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
      const sigBuffer = typeof signature === 'string' ? Buffer.from(signature, 'hex') : signature;
      return await verify(messageStr, sigBuffer, publicKey);
    } catch (error) {
      console.error('Error verifying signature:', error.message);
      return false;
    }
  }

  /**
   * 签名交易
   * @param {object} transaction 交易对象
   * @returns {Promise<string>} 签名（十六进制）
   */
  async signTransaction(transaction) {
    try {
      const { signature, ...txData } = transaction;
      const txStr = JSON.stringify(txData, (key, value) => {
        if (typeof value === 'bigint') return value.toString();
        return value;
      });
      return await this.sign(txStr);
    } catch (error) {
      console.error('Error signing transaction:', error.message);
      throw error;
    }
  }

  /**
   * 验证交易签名
   * @param {object} transaction 交易对象
   * @param {string} signature 签名
   * @returns {Promise<boolean>} 验证结果
   */
  async verifyTransaction(transaction, signature) {
    try {
      const { signature: _, ...txData } = transaction;
      const txStr = JSON.stringify(txData, (key, value) => {
        if (typeof value === 'bigint') return value.toString();
        return value;
      });
      return await this.verify(txStr, signature, this.publicKey);
    } catch (error) {
      console.error('Error verifying transaction:', error.message);
      return false;
    }
  }

  /**
   * 更新余额
   * @param {bigint} amount 金额
   */
  updateBalance(amount) {
    this.balance += amount;
  }

  /**
   * 加密导出钱包
   * @param {string} password 加密密码
   * @returns {object} 加密后的钱包数据
   */
  exportEncrypted(password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    const iv = crypto.randomBytes(16);

    const privateKeyHex = this.privateKey.toString('hex');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let ciphertext = cipher.update(privateKeyHex, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    return {
      ciphertext,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      address: this.address,
      publicKey: this.publicKey.toString('hex')
    };
  }

  /**
   * 从加密数据导入钱包
   * @param {object} encrypted 加密的钱包数据
   * @returns {PQCWallet} 钱包实例
   */
  static importEncrypted(encrypted, password) {
    const salt = Buffer.from(encrypted.salt, 'hex');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let privateKeyHex = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    privateKeyHex += decipher.final('utf8');

    const privateKey = Buffer.from(privateKeyHex, 'hex');
    const publicKey = Buffer.from(encrypted.publicKey, 'hex');

    return Reflect.construct(PQCWallet, [publicKey, privateKey, 0n]);
  }

  /**
   * 检查余额是否足够
   * @param {bigint} amount 金额
   * @returns {boolean} 余额是否足够
   */
  hasEnoughBalance(amount) {
    return this.balance >= amount;
  }
}

export { validateAddress };

/**
 * 交易类
 */
export class Transaction {
  /**
   * 创建并验证交易
   * @param {PQCWallet} wallet 发送方钱包
   * @param {string} to 接收地址
   * @param {bigint} amount 金额
   * @param {bigint} fee 手续费
   * @param {string} type 交易类型
   * @param {object} data 交易数据
   * @returns {Transaction} 交易实例
   */
  static create(wallet, to, amount, feeOrData = 1n, type = 'TRANSFER', data = {}) {
    const { valid, reason } = validateAddress(to);
    if (!valid) {
      throw new Error(`Invalid recipient address: ${reason}`);
    }
    let fee = 1n;
    if (typeof feeOrData === 'bigint') {
      fee = feeOrData;
    } else if (typeof feeOrData === 'string') {
      data = data || {};
      data.metadata = feeOrData;
    }
    if (!wallet.hasEnoughBalance(amount + fee)) {
      throw new Error('Insufficient balance');
    }
    return new Transaction(wallet.address, to, amount, fee, type, data);
  }

  /**
   * 构造函数
   * @param {string} from 发送地址
   * @param {string} to 接收地址
   * @param {bigint} amount 金额
   * @param {bigint} fee 手续费
   * @param {string} type 交易类型
   * @param {object} data 交易数据
   */
  constructor(from, to, amount, fee = 1n, type = 'TRANSFER', data = {}) {
    this.id = `tx-${hash(Date.now().toString() + Math.random().toString(), 'sha3-256').slice(0, 16)}`;
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.fee = fee;
    this.type = type;
    this.data = data;
    this.timestamp = Date.now();
    this.signature = null;
  }

  /**
   * 签名交易
   * @param {PQCWallet} wallet 钱包
   * @returns {Promise<Transaction>} 签名后的交易
   */
  async sign(wallet) {
    this.signature = await wallet.signTransaction(this);
    return this;
  }

  /**
   * 验证交易
   * @param {PQCWallet} wallet 钱包
   * @returns {Promise<boolean>} 验证结果
   */
  async verify(wallet) {
    if (!this.signature) {
      return false;
    }
    return await wallet.verifyTransaction(this, this.signature);
  }

  /**
   * 验证交易签名（使用公钥）
   * @param {Buffer} publicKey 公钥
   * @returns {Promise<boolean>} 验证结果
   */
  async verifySignature(publicKey) {
    if (!this.signature) {
      return false;
    }
    try {
      const txData = { ...this.toJSON ? this.toJSON() : this };
      const sigBuffer = typeof this.signature === 'string'
        ? Buffer.from(this.signature, 'hex')
        : this.signature;
      const jsonReplacer = (key, value) => {
        if (typeof value === 'bigint') return value.toString();
        return value;
      };
      const txStr = JSON.stringify(txData, jsonReplacer);
      return await verify(txStr, sigBuffer, publicKey);
    } catch (error) {
      console.error('Error verifying transaction signature:', error.message);
      return false;
    }
  }

  /**
   * 计算交易哈希
   * @returns {string} 交易哈希
   */
  getHash() {
    const { signature, ...txData } = this;
    return hash(JSON.stringify(txData), 'sha3-256');
  }

  /**
   * 转换为JSON格式
   * @returns {object} JSON对象
   */
  toJSON() {
    return {
      ...this,
      amount: this.amount.toString(),
      fee: this.fee.toString()
    };
  }
}

export default PQCWallet;