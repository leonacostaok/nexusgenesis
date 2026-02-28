/**
 * 智能合约管理器
 * 负责部署和执行AINVM智能合约
 */

import AINVM from '../vm/ainvm.js';
import fs from 'fs/promises';
import path from 'path';

class ContractManager {
  constructor() {
    this.contracts = new Map(); // 合约ID -> 合约对象
    this.storage = new Map();   // 合约ID -> 存储状态
    this.contractCounter = 0;   // 合约ID计数器（确定性）
    this.executingContracts = new Set(); // 正在执行的合约（重入保护）
  }

  /**
   * 部署智能合约
   * @param {Array} bytecode - AINVM字节码
   * @param {string} name - 合约名称
   * @returns {string} 合约ID
   */
  deployContract(bytecode, name = 'Unnamed Contract') {
    // 验证字节码
    if (!Array.isArray(bytecode) || bytecode.length === 0) {
      throw new Error('Invalid bytecode');
    }
    if (bytecode.length > 10000) {
      throw new Error('Bytecode too large');
    }
    
    // 生成合约ID - 使用确定性方法
    const contractId = `contract_${Date.now()}_${this.contractCounter++}`;
    
    const contract = {
      id: contractId,
      name,
      bytecode,
      deployedAt: Date.now()
    };
    
    this.contracts.set(contractId, contract);
    this.storage.set(contractId, new Map());
    
    return contractId;
  }

  /**
   * 执行智能合约
   * @param {string} contractId - 合约ID
   * @param {number} gasLimit - gas限制
   * @returns {object} 执行结果
   */
  executeContract(contractId, gasLimit = 1000) {
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

    // 重入保护
    if (this.executingContracts.has(contractId)) {
      throw new Error('Reentrancy detected');
    }

    this.executingContracts.add(contractId);
    
    try {
      // 创建VM实例
      const vm = new AINVM();
      
      // 加载字节码
      vm.loadProgram(contract.bytecode);
      
      // 加载存储的值到VM内存
      const storage = this.storage.get(contractId);
      // 复制存储内容到VM内存，确保键类型一致
      for (const [key, value] of storage.entries()) {
        // 尝试将键转换为数字（如果是数字字符串）
        const parsedKey = isNaN(key) ? key : parseInt(key);
        vm.memory.set(parsedKey, value);
      }
      
      // 执行合约
      const result = vm.execute(gasLimit);
      
      // 更新合约存储
      if (result.success) {
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
        storage.clear();
        for (const [key, value] of Object.entries(memory)) {
          // 尝试将键转换为数字（如果是数字字符串）
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
      storage: Object.fromEntries(storage)
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
          deployedAt: contractData.deployedAt
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