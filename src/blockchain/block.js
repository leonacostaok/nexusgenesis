/**
 * NexusGenesis - 区块数据结构
 * 
 * 功能：
 * 1. 定义区块结构
 * 2. 实现区块创建和验证
 * 3. 计算区块哈希
 */

import crypto from 'crypto';

/**
 * 计算数据的 SHA-256 哈希
 * @param {any} data 要哈希的数据
 * @returns {string} 哈希值（十六进制字符串）
 */
function calculateHash(data) {
  const jsonString = JSON.stringify(data);
  return '0x' + crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * 区块类
 */
export class Block {
  /**
   * 创建一个新的区块
   * @param {string} parentHash 上一个区块的哈希
   * @param {number} height 区块高度
   * @param {number} timestamp 时间戳
   * @param {Array} transactions 交易列表
   */
  constructor(parentHash, height, timestamp, transactions) {
    // 计算交易哈希
    const txsHash = calculateHash(transactions);
    
    // 区块头
    this.header = {
      parent_hash: parentHash,
      height: height,
      timestamp: timestamp,
      txs_hash: txsHash
    };
    
    // 区块体
    this.body = {
      transactions: transactions
    };
    
    // 计算区块哈希
    this.hash = this.calculateBlockHash();
  }
  
  /**
   * 计算区块哈希
   * @returns {string} 区块哈希
   */
  calculateBlockHash() {
    return calculateHash(this.header);
  }
  
  /**
   * 验证区块
   * @returns {boolean} 验证结果
   */
  validate() {
    // 验证交易哈希
    const calculatedTxsHash = calculateHash(this.body.transactions);
    if (calculatedTxsHash !== this.header.txs_hash) {
      return false;
    }
    
    // 验证区块哈希
    const calculatedBlockHash = this.calculateBlockHash();
    if (calculatedBlockHash !== this.hash) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 将区块转换为 JSON 对象
   * @returns {object} JSON 对象
   */
  toJSON() {
    return {
      hash: this.hash,
      header: this.header,
      body: this.body
    };
  }
  
  /**
   * 从 JSON 对象创建区块
   * @param {object} json JSON 对象
   * @returns {Block} 区块实例
   */
  static fromJSON(json) {
    const block = new Block(
      json.header.parent_hash,
      json.header.height,
      json.header.timestamp,
      json.body.transactions
    );
    block.hash = json.hash;
    return block;
  }
}

/**
 * 创建创世区块
 * @returns {Block} 创世区块
 */
export function createGenesisBlock() {
  const genesisTransactions = [];
  
  return new Block(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    0,
    Date.now(),
    genesisTransactions
  );
}

/**
 * 从交易创建新区块
 * @param {Block} previousBlock 上一个区块
 * @param {Array} transactions 交易列表
 * @returns {Block} 新区块
 */
export function createBlock(previousBlock, transactions) {
  return new Block(
    previousBlock.hash,
    previousBlock.header.height + 1,
    Date.now(),
    transactions
  );
}

// 导出默认值
export default {
  Block,
  createGenesisBlock,
  createBlock,
  calculateHash
};
