/**
 * NexusGenesis - 数据完整性校验模块
 * 为持久化数据提供哈希验证和完整性保护
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DataIntegrityChecker {
  constructor() {
    this.hashAlgorithm = 'sha256';
    this.integrityFile = path.join(__dirname, '../../data/integrity.json');
    this.checksums = new Map(); // 文件路径 -> 校验和
  }

  /**
   * 计算数据的哈希值
   * @param {string|object} data - 数据（字符串或对象）
   * @returns {string} 哈希值
   */
  computeHash(data) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash(this.hashAlgorithm).update(dataStr).digest('hex');
  }

  /**
   * 保存数据并记录校验和
   * @param {string} filePath - 文件路径
   * @param {object|string} data - 要保存的数据
   * @returns {boolean} 是否成功
   */
  saveWithIntegrity(filePath, data) {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 计算原始数据的哈希
      const hash = this.computeHash(data);
      
      // 保存数据
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, dataStr);
      
      // 记录校验和
      this.checksums.set(filePath, {
        hash,
        timestamp: Date.now(),
        size: Buffer.byteLength(dataStr)
      });
      
      // 保存校验和到文件
      this.saveChecksums();
      
      console.log(`[DataIntegrity] Saved ${path.basename(filePath)} with integrity hash`);
      return true;
    } catch (error) {
      console.error(`[DataIntegrity] Error saving with integrity:`, error.message);
      return false;
    }
  }

  /**
   * 加载数据并验证完整性
   * @param {string} filePath - 文件路径
   * @returns {object|null} 数据对象或null（如果验证Failed）
   */
  loadWithIntegrity(filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`[DataIntegrity] File not found: ${filePath}`);
      return null;
    }
    
    try {
      // 加载数据
      const dataStr = fs.readFileSync(filePath, 'utf8');
      const hash = this.computeHash(dataStr);
      
      // getSaved的校验和
      const savedChecksum = this.checksums.get(filePath);
      
      if (savedChecksum && savedChecksum.hash !== hash) {
        console.error(`[DataIntegrity] Integrity check FAILED for ${path.basename(filePath)}`);
        console.error(`  Expected: ${savedChecksum.hash}`);
        console.error(`  Actual:   ${hash}`);
        
        // 可以选择抛出异常或返回null
        throw new Error('Data integrity check failed - possible tampering detected');
      }
      
      // 解析JSON数据
      let parsedData;
      try {
        parsedData = JSON.parse(dataStr);
      } catch (parseError) {
        // 如果不是有效的JSON，返回原始字符串
        parsedData = dataStr;
      }
      
      console.log(`[DataIntegrity] Loaded and verified ${path.basename(filePath)} successfully`);
      return parsedData;
    } catch (error) {
      console.error(`[DataIntegrity] Error loading with integrity:`, error.message);
      throw error;
    }
  }

  /**
   * 保存校验和到文件
   */
  saveChecksums() {
    try {
      const checksumsObj = {};
      this.checksums.forEach((value, key) => {
        checksumsObj[key] = value;
      });
      
      const dir = path.dirname(this.integrityFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.integrityFile, JSON.stringify(checksumsObj, null, 2));
    } catch (error) {
      console.error('[DataIntegrity] Error saving checksums:', error.message);
    }
  }

  /**
   * 从文件加载校验和
   */
  loadChecksums() {
    try {
      if (fs.existsSync(this.integrityFile)) {
        const data = JSON.parse(fs.readFileSync(this.integrityFile, 'utf8'));
        this.checksums = new Map(Object.entries(data));
        console.log(`[DataIntegrity] Loaded ${this.checksums.size} checksums`);
      }
    } catch (error) {
      console.error('[DataIntegrity] Error loading checksums:', error.message);
      this.checksums = new Map();
    }
  }

  /**
   * 验证特定文件的完整性
   * @param {string} filePath - 文件路径
   * @returns {object} 验证结果
   */
  verifyFileIntegrity(filePath) {
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        error: 'File not found'
      };
    }
    
    try {
      const dataStr = fs.readFileSync(filePath, 'utf8');
      const currentHash = this.computeHash(dataStr);
      const savedChecksum = this.checksums.get(filePath);
      
      if (!savedChecksum) {
        return {
          valid: false,
          error: 'No saved checksum found',
          currentHash
        };
      }
      
      return {
        valid: savedChecksum.hash === currentHash,
        expectedHash: savedChecksum.hash,
        actualHash: currentHash,
        lastVerified: savedChecksum.timestamp
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 验证所有已知文件的完整性
   * @returns {Array<object>} 所有文件的验证结果
   */
  verifyAllFiles() {
    const results = [];
    
    this.checksums.forEach((checksum, filePath) => {
      results.push({
        filePath,
        ...this.verifyFileIntegrity(filePath)
      });
    });
    
    return results;
  }

  /**
   * 更新文件的校验和（在文件被外部修改后调用）
   * @param {string} filePath - 文件路径
   */
  updateChecksum(filePath) {
    if (fs.existsSync(filePath)) {
      const dataStr = fs.readFileSync(filePath, 'utf8');
      const hash = this.computeHash(dataStr);
      
      this.checksums.set(filePath, {
        hash,
        timestamp: Date.now(),
        size: Buffer.byteLength(dataStr)
      });
      
      this.saveChecksums();
      console.log(`[DataIntegrity] Updated checksum for ${path.basename(filePath)}`);
    }
  }

  /**
   * get文件统计信息
   * @returns {object} 统计信息
   */
  getStats() {
    return {
      totalTrackedFiles: this.checksums.size,
      hashAlgorithm: this.hashAlgorithm,
      integrityFile: this.integrityFile
    };
  }

  /**
   * 初始化：加载已有的校验和
   */
  init() {
    this.loadChecksums();
    console.log('[DataIntegrity] Initialized');
  }
}

// 单例实例
const dataIntegrityInstance = new DataIntegrityInstance();

function DataIntegrityInstance() {
  this.checker = new DataIntegrityChecker();
  
  this.init = function() {
    this.checker.init();
  };
  
  this.saveWithIntegrity = function(filePath, data) {
    return this.checker.saveWithIntegrity(filePath, data);
  };
  
  this.loadWithIntegrity = function(filePath) {
    return this.checker.loadWithIntegrity(filePath);
  };
  
  this.verifyFileIntegrity = function(filePath) {
    return this.checker.verifyFileIntegrity(filePath);
  };
  
  this.verifyAllFiles = function() {
    return this.checker.verifyAllFiles();
  };
  
  this.updateChecksum = function(filePath) {
    return this.checker.updateChecksum(filePath);
  };
  
  this.getStats = function() {
    return this.checker.getStats();
  };
}

export default dataIntegrityInstance;
