/**
 * NexusGenesis SDK
 * 为开发者提供智能合约开发、部署和交互的工具
 */

import contractManager from '../contracts/contractManager.js';
import AINVM from '../vm/ainvm.js';

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
}

// 导出SDK
export default new NexusGenesisSDK();
export { NexusGenesisSDK };
