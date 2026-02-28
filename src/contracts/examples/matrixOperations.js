/**
 * 矩阵运算智能合约示例
 * 功能：测试AINVM的矩阵运算指令
 */

import contractManager from '../contractManager.js';

// 矩阵运算合约字节码
// 逻辑：
// 1. 创建两个2x2矩阵
// 2. 为矩阵填充值
// 3. 执行矩阵加法
// 4. 执行矩阵乘法
// 5. 执行矩阵转置
// 6. 返回结果
const matrixBytecode = [
  // 创建第一个矩阵 (2x2)
  0x01, 0x02, // PUSH 2 (rows)
  0x01, 0x02, // PUSH 2 (cols)
  0x10,       // MAT_CREATE
  
  // 存储第一个矩阵的ID到内存地址0
  0x08, 0x00, // STORE 0
  
  // 填充第一个矩阵的值
  // 矩阵1: [[1, 2], [3, 4]]
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x01, 0x01, // PUSH 1 (value)
  0x15,       // MAT_STORE
  
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x01, // PUSH 1 (col)
  0x01, 0x02, // PUSH 2 (value)
  0x15,       // MAT_STORE
  
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x01, 0x01, // PUSH 1 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x01, 0x03, // PUSH 3 (value)
  0x15,       // MAT_STORE
  
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x01, 0x01, // PUSH 1 (row)
  0x01, 0x01, // PUSH 1 (col)
  0x01, 0x04, // PUSH 4 (value)
  0x15,       // MAT_STORE
  
  // 创建第二个矩阵 (2x2)
  0x01, 0x02, // PUSH 2 (rows)
  0x01, 0x02, // PUSH 2 (cols)
  0x10,       // MAT_CREATE
  
  // 存储第二个矩阵的ID到内存地址1
  0x08, 0x01, // STORE 1
  
  // 填充第二个矩阵的值
  // 矩阵2: [[5, 6], [7, 8]]
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x01, 0x05, // PUSH 5 (value)
  0x15,       // MAT_STORE
  
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x01, // PUSH 1 (col)
  0x01, 0x06, // PUSH 6 (value)
  0x15,       // MAT_STORE
  
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x01, 0x01, // PUSH 1 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x01, 0x07, // PUSH 7 (value)
  0x15,       // MAT_STORE
  
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x01, 0x01, // PUSH 1 (row)
  0x01, 0x01, // PUSH 1 (col)
  0x01, 0x08, // PUSH 8 (value)
  0x15,       // MAT_STORE
  
  // 执行矩阵加法
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x11,       // MAT_ADD
  
  // 存储加法结果到内存地址2
  0x08, 0x02, // STORE 2
  
  // 执行矩阵乘法
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x12,       // MAT_MUL
  
  // 存储乘法结果到内存地址3
  0x08, 0x03, // STORE 3
  
  // 执行矩阵转置（对第一个矩阵）
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x13,       // MAT_TRANS
  
  // 存储转置结果到内存地址4
  0x08, 0x04, // STORE 4
  
  // 加载加法结果矩阵的一个元素进行返回
  0x07, 0x02, // LOAD 2 (add_result_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x14,       // MAT_LOAD
  
  0x0C        // RETURN     // 返回结果
];

// 部署矩阵运算合约
async function deployMatrixContract() {
  const contractId = contractManager.deployContract(matrixBytecode, 'Matrix Operations Contract');
  console.log(`Matrix contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行矩阵运算合约
async function executeMatrixContract(contractId) {
  const result = contractManager.executeContract(contractId, 10000); // 增加gas限制
  console.log('Matrix execution result:', result);
  return result;
}

// 测试矩阵运算合约
async function testMatrixContract() {
  console.log('=== Testing Matrix Operations Contract ===');
  
  // 部署合约
  const contractId = await deployMatrixContract();
  
  // 执行合约
  const result = await executeMatrixContract(contractId);
  
  // 获取合约信息
  const contractInfo = contractManager.getContractInfo(contractId);
  console.log('Contract storage:', contractInfo.storage);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
  
  return contractId;
}

// 导出功能
export { 
  matrixBytecode, 
  deployMatrixContract, 
  executeMatrixContract, 
  testMatrixContract 
};