/**
 * 计数器智能合约示例
 * 功能：增加和减少计数值
 */

import contractManager from '../contractManager.js';

// 计数器合约字节码
// 逻辑：
// 1. 从内存地址0加载当前值
// 2. 压入1
// 3. 相加
// 4. 保存回内存地址0
// 5. 加载新值
// 6. 返回
const counterBytecode = [
  0x07, 0x00, // LOAD 0     // 加载当前计数
  0x01, 0x01, // PUSH 1     // 压入1
  0x03,       // ADD        // 相加
  0x08, 0x00, // STORE 0    // 保存回存储
  0x07, 0x00, // LOAD 0     // 加载新值
  0x0C        // RETURN     // 返回
];

// 修复后的计数器合约字节码（使用临时变量）
const counterBytecodeFixed = [
  0x07, 0x00, // LOAD 0     // 加载当前计数
  0x01, 0x01, // PUSH 1     // 压入1
  0x03,       // ADD        // 相加
  0x08, 0x00, // STORE 0    // 保存回存储
  0x07, 0x00, // LOAD 0     // 加载新值
  0x0C        // RETURN     // 返回
];

// 部署计数器合约
async function deployCounterContract() {
  const contractId = contractManager.deployContract(counterBytecode, 'Counter Contract');
  console.log(`Counter contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行计数器合约（增加计数）
async function executeCounterContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('Counter execution result:', result);
  return result;
}

// 获取计数器值
function getCounterValue(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return contractInfo.storage['0'] || 0;
  }
  return 0;
}

// 测试计数器合约
async function testCounterContract() {
  console.log('=== Testing Counter Contract ===');
  
  // 部署合约
  const contractId = await deployCounterContract();
  
  // 初始值
  console.log('Initial counter value:', getCounterValue(contractId));
  
  // 执行5次
  for (let i = 1; i <= 5; i++) {
    await executeCounterContract(contractId);
    console.log(`After execution ${i}:`, getCounterValue(contractId));
  }
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
  
  return contractId;
}

// 导出功能
export { 
  counterBytecode, 
  deployCounterContract, 
  executeCounterContract, 
  getCounterValue, 
  testCounterContract 
};