/**
 * AI智能合约示例
 * 功能：测试AINVM的AI相关指令
 */

import contractManager from '../contractManager.js';

// AI合约字节码
// 逻辑：
// 1. 加载AI模型
// 2. 执行AI推理
// 3. 保存推理结果
const aiBytecode = [
  // 加载AI模型
  0x01, 0x01, // PUSH 1 (model path placeholder)
  0x21,       // AI_MODEL_LOAD
  
  // 存储模型ID到内存地址0
  0x08, 0x00, // STORE 0
  
  // 加载模型ID
  0x07, 0x00, // LOAD 0
  
  // 准备推理输入数据
  0x01, 0x02, // PUSH 2 (input data placeholder)
  
  // 执行AI推理
  0x20,       // AI_INFERENCE
  
  // 存储推理结果ID到内存地址1
  0x08, 0x01, // STORE 1
  
  // 加载模型ID
  0x07, 0x00, // LOAD 0
  
  // 准备模型保存路径
  0x01, 0x03, // PUSH 3 (save path placeholder)
  
  // 保存AI模型
  0x22,       // AI_MODEL_SAVE
  
  // 返回推理结果ID
  0x07, 0x01, // LOAD 1
  0x0C        // RETURN
];

// 部署AI合约
async function deployAIContract() {
  const contractId = contractManager.deployContract(aiBytecode, 'AI Contract');
  console.log(`AI contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行AI合约
async function executeAIContract(contractId) {
  const result = contractManager.executeContract(contractId, 10000); // 增加gas限制
  console.log('AI contract execution result:', result);
  return result;
}

// 获取AI合约信息
function getAIInfo(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return {
      modelId: contractInfo.storage['0'] || null,
      resultId: contractInfo.storage['1'] || null,
      storage: contractInfo.storage
    };
  }
  return null;
}

// 测试AI合约
async function testAIContract() {
  console.log('=== Testing AI Contract ===');
  
  // 部署合约
  const contractId = await deployAIContract();
  
  // 执行合约
  const result = await executeAIContract(contractId);
  
  // 获取合约信息
  const aiInfo = getAIInfo(contractId);
  console.log('AI contract info:', aiInfo);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
  
  return contractId;
}

// 导出功能
export { 
  aiBytecode, 
  deployAIContract, 
  executeAIContract, 
  getAIInfo, 
  testAIContract 
};
