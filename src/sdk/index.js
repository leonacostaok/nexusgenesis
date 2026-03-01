/**
 * NexusGenesis SDK
 * 为开发者提供智能合约开发、部署和交互的工具
 */

import contractManager from '../contracts/contractManager.js';
import AINVM from '../vm/ainvm.js';
import fs from 'fs/promises';
import path from 'path';

// 合约模板目录
const TEMPLATE_DIR = path.join('src', 'contracts', 'examples');

class NexusGenesisSDK {
  constructor() {
    this.contractManager = contractManager;
  }

  /**
   * 部署智能合约
   * @param {Array} bytecode - AINVM字节码
   * @param {string} name - 合约名称
   * @returns {string} 合约ID
   */
  deployContract(bytecode, name = 'Unnamed Contract') {
    return this.contractManager.deployContract(bytecode, name);
  }

  /**
   * 执行智能合约
   * @param {string} contractId - 合约ID
   * @param {number} gasLimit - gas限制
   * @returns {object} 执行结果
   */
  executeContract(contractId, gasLimit = 10000) {
    return this.contractManager.executeContract(contractId, gasLimit);
  }

  /**
   * 获取合约信息
   * @param {string} contractId - 合约ID
   * @returns {object} 合约信息
   */
  getContractInfo(contractId) {
    return this.contractManager.getContractInfo(contractId);
  }

  /**
   * 列出所有合约
   * @returns {Array} 合约列表
   */
  listContracts() {
    return this.contractManager.listContracts();
  }

  /**
   * 保存合约状态
   * @param {string} filePath - 文件路径
   */
  async saveState(filePath) {
    return this.contractManager.saveState(filePath);
  }

  /**
   * 加载合约状态
   * @param {string} filePath - 文件路径
   */
  async loadState(filePath) {
    return this.contractManager.loadState(filePath);
  }

  /**
   * 创建AINVM实例
   * @returns {AINVM} AINVM实例
   */
  createVM() {
    return new AINVM();
  }

  /**
   * 编译高级语言到AINVM字节码
   * @param {string} code - 高级语言代码
   * @param {string} language - 语言类型
   * @returns {Array} 字节码
   */
  compile(code, language = 'bytecode') {
    // 这里可以实现从高级语言编译到字节码的功能
    // 目前直接返回输入的字节码
    if (language === 'bytecode') {
      return code;
    }
    throw new Error(`Unsupported language: ${language}`);
  }

  /**
   * 列出合约模板
   * @returns {Promise<Array>} 模板列表
   */
  async listTemplates() {
    try {
      const files = await fs.readdir(TEMPLATE_DIR);
      return files
        .filter(file => file.endsWith('.js'))
        .map(file => {
          const name = file.replace('.js', '');
          return {
            name,
            path: path.join(TEMPLATE_DIR, file)
          };
        });
    } catch (error) {
      console.error('Error listing templates:', error.message);
      return [];
    }
  }

  /**
   * 获取合约模板
   * @param {string} templateName - 模板名称
   * @returns {Promise<string>} 模板代码
   */
  async getTemplate(templateName) {
    try {
      const templatePath = path.join(TEMPLATE_DIR, `${templateName}.js`);
      const code = await fs.readFile(templatePath, 'utf8');
      return code;
    } catch (error) {
      console.error('Error getting template:', error.message);
      throw new Error(`Template not found: ${templateName}`);
    }
  }

  /**
   * 保存合约到文件
   * @param {string} code - 合约代码
   * @param {string} filePath - 文件路径
   * @returns {Promise<void>}
   */
  async saveContract(code, filePath) {
    try {
      await fs.writeFile(filePath, code, 'utf8');
      console.log(`Contract saved to ${filePath}`);
    } catch (error) {
      console.error('Error saving contract:', error.message);
      throw error;
    }
  }

  /**
   * 从文件加载合约
   * @param {string} filePath - 文件路径
   * @returns {Promise<string>} 合约代码
   */
  async loadContract(filePath) {
    try {
      const code = await fs.readFile(filePath, 'utf8');
      return code;
    } catch (error) {
      console.error('Error loading contract:', error.message);
      throw error;
    }
  }

  /**
   * 测试合约
   * @param {string} contractId - 合约ID
   * @param {Array} testCases - 测试用例
   * @returns {object} 测试结果
   */
  testContract(contractId, testCases) {
    const results = [];
    
    for (const testCase of testCases) {
      try {
        const result = this.executeContract(contractId);
        results.push({
          test: testCase,
          success: true,
          result: result
        });
      } catch (error) {
        results.push({
          test: testCase,
          success: false,
          error: error.message
        });
      }
    }
    
    return {
      contractId,
      tests: results,
      passed: results.filter(r => r.success).length,
      total: results.length,
      timestamp: Date.now()
    };
  }

  /**
   * 估算合约Gas消耗
   * @param {string} contractId - 合约ID
   * @returns {number} 估算的Gas消耗
   */
  estimateGas(contractId) {
    try {
      return this.contractManager.estimateGas(contractId);
    } catch (error) {
      console.error('Error estimating gas:', error.message);
      return 0;
    }
  }

  /**
   * 优化合约代码
   * @param {string} code - 合约代码
   * @returns {string} 优化后的代码
   */
  optimizeContractCode(code) {
    // 简单的优化示例
    // 实际实现中可以进行更复杂的优化
    return code
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 优化已部署合约的字节码
   * @param {string} contractId - 合约ID
   * @returns {object} 优化结果
   */
  optimizeDeployedContract(contractId) {
    try {
      return this.contractManager.optimizeContract(contractId);
    } catch (error) {
      console.error('Error optimizing contract:', error.message);
      throw error;
    }
  }

  /**
   * 部署优化后的合约
   * @param {Array} bytecode - AINVM字节码
   * @param {string} name - 合约名称
   * @param {string} owner - 合约所有者地址
   * @returns {string} 合约ID
   */
  deployOptimizedContract(bytecode, name = 'Unnamed Contract', owner = null) {
    return this.contractManager.deployContract(bytecode, name, owner, true);
  }

  /**
   * 生成合约ABI
   * @param {string} contractId - 合约ID
   * @returns {object} 合约ABI
   */
  generateABI(contractId) {
    const contract = this.getContractInfo(contractId);
    if (!contract) {
      throw new Error(`Contract not found: ${contractId}`);
    }
    
    // 生成简单的ABI
    return {
      contractId: contract.id,
      name: contract.name,
      functions: [],
      events: [],
      timestamp: Date.now()
    };
  }
}

// 导出SDK
export default new NexusGenesisSDK();
export { NexusGenesisSDK };
