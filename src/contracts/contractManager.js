/**
 * 智能合约管理器
 * 负责部署和执行AINVM智能合约
 */

import AINVM from '../vm/ainvm.js';
import { SandboxExecutor, STANDARD_CONFIG, STRICT_CONFIG } from '../vm/sandbox.js';
import fs from 'fs/promises';
import path from 'path';

class ContractManager {
  constructor() {
    this.contracts = new Map(); // 合约ID -> 合约对象
    this.storage = new Map();   // 合约ID -> 存储状态
    this.contractCounter = 0;   // 合约ID计数器（确定性）
    this.executingContracts = new Set(); // 正在执行的合约（重入保护）
    this.sandbox = new SandboxExecutor(STANDARD_CONFIG);
    this.verifiedContracts = new Set(); // 已验证的合约ID集合
  }

  /**
   * 部署智能合约
   * @param {Array} bytecode - AINVM字节码
   * @param {string} name - 合约名称
   * @param {string} owner - 合约所有者地址
   * @param {boolean} optimize - 是否优化字节码
   * @returns {string} 合约ID
   */
  deployContract(bytecode, name = 'Unnamed Contract', owner = null, optimize = true) {
    // 验证字节码
    if (!Array.isArray(bytecode) || bytecode.length === 0) {
      throw new Error('Invalid bytecode');
    }
    if (bytecode.length > 10000) {
      throw new Error('Bytecode too large');
    }
    
    // 优化字节码
    let optimizedBytecode = bytecode;
    if (optimize) {
      const vm = new AINVM();
      optimizedBytecode = vm.optimizeBytecode(bytecode);
      console.log(`Optimized bytecode: ${bytecode.length} -> ${optimizedBytecode.length} bytes`);
    }
    
    // 生成合约ID - 使用确定性方法
    const contractId = `contract_${Date.now()}_${this.contractCounter++}`;
    
    const contract = {
      id: contractId,
      name,
      bytecode: optimizedBytecode,
      originalBytecode: bytecode,
      deployedAt: Date.now(),
      owner, // 保存合约所有者
      version: 1,
      upgradeHistory: []
    };
    
    this.contracts.set(contractId, contract);
    this.storage.set(contractId, new Map());
    
    return contractId;
  }

  /**
   * 检查合约权限
   * @param {string} contractId - 合约ID
   * @param {string} address - 调用者地址
   * @returns {boolean} 是否有权限
   */
  checkContractPermission(contractId, address) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }
    
    // 如果没有设置所有者，则任何人都可以调用
    if (!contract.owner) {
      return true;
    }
    
    return contract.owner === address;
  }

  /**
   * 升级智能合约
   * @param {string} contractId - 合约ID
   * @param {Array} newBytecode - 新的AINVM字节码
   * @param {string} caller - 调用者地址（必须是合约所有者）
   * @returns {object} 升级结果
   */
  upgradeContract(contractId, newBytecode, caller) {
    // 验证参数
    if (!contractId) {
      throw new Error('Contract ID is required');
    }
    if (!Array.isArray(newBytecode) || newBytecode.length === 0) {
      throw new Error('Invalid bytecode');
    }
    if (newBytecode.length > 10000) {
      throw new Error('Bytecode too large');
    }
    
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // 权限检查 - 只有合约所有者可以升级
    if (!this.checkContractPermission(contractId, caller)) {
      throw new Error('Permission denied: only contract owner can upgrade');
    }

    // 保存旧版本信息
    const oldVersion = {
      version: contract.version,
      bytecode: contract.bytecode,
      upgradedAt: Date.now()
    };

    // 更新合约
    contract.bytecode = newBytecode;
    contract.version += 1;
    contract.upgradeHistory.push(oldVersion);

    // 限制升级历史记录大小
    if (contract.upgradeHistory.length > 10) {
      contract.upgradeHistory.shift();
    }

    return {
      success: true,
      contractId,
      oldVersion: oldVersion.version,
      newVersion: contract.version,
      message: `Contract upgraded from version ${oldVersion.version} to ${contract.version}`
    };
  }

  /**
   * 执行智能合约
   * @param {string} contractId - 合约ID
   * @param {number} gasLimit - gas限制
   * @param {string} caller - 调用者地址（可选）
   * @returns {object} 执行结果
   */
  async executeContract(contractId, gasLimit = 1000, caller = null) {
    // 验证参数
    if (!contractId) {
      throw new Error('Contract ID is required');
    }
    if (gasLimit <= 0 || gasLimit > 1000000) {
      throw new Error('Invalid gas limit');
    }
    
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // 权限检查
    if (caller && !this.checkContractPermission(contractId, caller)) {
      throw new Error('Permission denied');
    }

    // 重入保护
    if (this.executingContracts.has(contractId)) {
      throw new Error('Reentrancy detected');
    }

    this.executingContracts.add(contractId);
    
    try {
      // 通过沙盒安全执行合约（安全宪法 §6.2）
      // 沙盒自动执行静态分析 + 资源限制 + 时限保护
      const deployer = contract.owner || 'unknown';
      const result = await this.sandbox.execute(
        contract.bytecode,
        gasLimit,
        deployer
      );
      
      // 沙盒拒绝 → 直接返回拒绝信息
      if (result.sandboxRejected) {
        return result;
      }
      
      // 更新合约存储
      if (result.success && result.memory && !result.memoryTruncated) {
        const memory = result.memory;
        
        // 存储大小限制（1MB）
        const MAX_STORAGE_SIZE = 1024 * 1024;
        const storageSize = Object.entries(memory).reduce((size, [key, value]) => {
          return size + JSON.stringify(key).length + JSON.stringify(value).length;
        }, 0);
        
        if (storageSize > MAX_STORAGE_SIZE) {
          throw new Error('Storage size exceeded');
        }
        
        // 同步内存到存储
        const storage = this.storage.get(contractId);
        storage.clear();
        for (const [key, value] of Object.entries(memory)) {
          if (key.startsWith('_')) continue; // 跳过内部键
          const parsedKey = isNaN(key) ? key : parseInt(key);
          storage.set(parsedKey, value);
        }
      }
      
      return result;
    } finally {
      this.executingContracts.delete(contractId);
    }
  }

  /**
   * 获取合约信息
   * @param {string} contractId - 合约ID
   * @returns {object} 合约信息
   */
  getContractInfo(contractId) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      return null;
    }

    const storage = this.storage.get(contractId);
    
    return {
      ...contract,
      storage: Object.fromEntries(storage),
      version: contract.version || 1,
      upgradeHistory: contract.upgradeHistory || []
    };
  }

  /**
   * 列出所有合约
   * @returns {Array} 合约列表
   */
  listContracts() {
    return Array.from(this.contracts.values()).map(contract => ({
      id: contract.id,
      name: contract.name,
      deployedAt: contract.deployedAt,
      bytecodeLength: contract.bytecode.length
    }));
  }

  /**
   * 估算合约Gas消耗
   * @param {string} contractId - 合约ID
   * @returns {number} 估算的Gas消耗
   */
  estimateGas(contractId) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }
    
    const vm = new AINVM();
    return vm.estimateGas(contract.bytecode);
  }

  /**
   * 优化合约字节码
   * @param {string} contractId - 合约ID
   * @returns {object} 优化结果
   */
  optimizeContract(contractId) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }
    
    const vm = new AINVM();
    const optimizedBytecode = vm.optimizeBytecode(contract.bytecode);
    
    // 保存优化后的字节码
    contract.bytecode = optimizedBytecode;
    
    return {
      success: true,
      contractId,
      originalSize: contract.originalBytecode.length,
      optimizedSize: optimizedBytecode.length,
      reduction: ((1 - optimizedBytecode.length / contract.originalBytecode.length) * 100).toFixed(2) + '%'
    };
  }

  /**
   * 保存合约状态到磁盘
   * @param {string} filePath - 文件路径
   */
  async saveState(filePath = 'data/contracts/contracts.json') {
    const state = {
      contracts: Array.from(this.contracts.entries()).map(([id, contract]) => ({
        id,
        ...contract,
        storage: Object.fromEntries(this.storage.get(id))
      })),
      savedAt: Date.now()
    };

    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  /**
   * 从磁盘加载合约状态
   * @param {string} filePath - 文件路径
   */
  async loadState(filePath = 'data/contracts/contracts.json') {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const state = JSON.parse(data);

      this.contracts.clear();
      this.storage.clear();

      for (const contractData of state.contracts) {
        const contract = {
          id: contractData.id,
          name: contractData.name,
          bytecode: contractData.bytecode,
          deployedAt: contractData.deployedAt,
          owner: contractData.owner,
          version: contractData.version || 1,
          upgradeHistory: contractData.upgradeHistory || []
        };

        this.contracts.set(contract.id, contract);
        
        const storage = new Map();
        for (const [key, value] of Object.entries(contractData.storage)) {
          storage.set(key, value);
        }
        this.storage.set(contract.id, storage);
      }
    } catch (error) {
      console.log('No existing contract state found, starting fresh');
    }
  }
}

// 导出单例
const contractManager = new ContractManager();
export default contractManager;
export { ContractManager };