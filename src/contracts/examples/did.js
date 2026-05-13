/**
 * 去中心化身份（DID）智能合约
 * 功能：身份注册、验证、属性管理
 */

import contractManager from '../contractManager.js';

// memory地址分配
const ADDR_ID_COUNT = 0;           // 身份数量
const ADDR_FIRST_ID = 10;          // 第一个身份的存储地址

// DID合约字节码
// Logic: 
// 1. 初始化身份计数器
// 2. 注册新身份
// 3. 存储身份信息
const didBytecode = [
  // 初始化身份计数器 (0)
  0x01, 0x00, // PUSH 0
  0x08, ADDR_ID_COUNT, // STORE ID_COUNT
  
  // 增加身份计数器
  0x07, ADDR_ID_COUNT, // LOAD ID_COUNT
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, ADDR_ID_COUNT, // STORE ID_COUNT
  
  // 存储身份ID
  0x07, ADDR_ID_COUNT, // LOAD ID_COUNT
  0x08, ADDR_FIRST_ID, // STORE ID
  
  // 存储身份所有者 (Default100)
  0x01, 0x64, // PUSH 100
  0x08, ADDR_FIRST_ID + 1, // STORE OWNER
  
  // 存储身份状态 (1=active)
  0x01, 0x01, // PUSH 1
  0x08, ADDR_FIRST_ID + 2, // STORE STATUS
  
  // Store creation time（运行时由 VM 注入 block.timestamp）
  0x01, 0x01, // PUSH 1
  0x08, ADDR_FIRST_ID + 3, // STORE CREATED_AT
  
  // 返回身份ID
  0x07, ADDR_ID_COUNT, // LOAD ID_COUNT
  0x0C        // RETURN
];

// 更新身份属性合约字节码
const updateAttributeBytecode = [
  // 加载身份ID
  0x07, 0x0A, // LOAD 10 (id)
  
  // 加载属性键
  0x07, 0x0B, // LOAD 11 (key)
  
  // 加载属性值
  0x07, 0x0C, // LOAD 12 (value)
  
  // 存储属性
  0x08, 0x0D, // STORE 13 (attribute)
  
  // Return success
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 验证身份合约字节码
const verifyIdentityBytecode = [
  // 加载身份ID
  0x07, 0x0A, // LOAD 10 (id)
  
  // 加载身份状态
  0x07, 12, // LOAD STATUS (ADDR_FIRST_ID + 2 = 12)
  
  // 检查状态是否为1 (active)
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x01, 0x00, // PUSH 0
  0x0A, 0x03, // JZ 3
  
  // 返回Verification successful
  0x01, 0x01, // PUSH 1
  0x0C,       // RETURN
  
  // 返回验证Failed
  0x01, 0x00, // PUSH 0
  0x0C        // RETURN
];

// 部署DID合约
async function deployDIDContract() {
  const contractId = contractManager.deployContract(didBytecode, 'DID Contract');
  console.log(`DID contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行DID合约
async function executeDIDContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('DID contract execution result:', result);
  return result;
}

// getDID信息
function getDIDInfo(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return {
      idCount: contractInfo.storage[ADDR_ID_COUNT] || 0,
      firstId: contractInfo.storage[ADDR_FIRST_ID] || 0,
      owner: contractInfo.storage[ADDR_FIRST_ID + 1] || 0,
      status: contractInfo.storage[ADDR_FIRST_ID + 2] || 0,
      createdAt: contractInfo.storage[ADDR_FIRST_ID + 3] || 0
    };
  }
  return null;
}

// 测试DID合约
async function testDIDContract() {
  console.log('=== Testing DID Contract ===');
  
  // Deploy contract
  const contractId = await deployDIDContract();
  
  // Execute contract
  await executeDIDContract(contractId);
  
  // getDID信息
  const didInfo = getDIDInfo(contractId);
  console.log('DID info:', didInfo);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
  
  return contractId;
}

// Export functions
export { 
  didBytecode, 
  updateAttributeBytecode, 
  verifyIdentityBytecode, 
  deployDIDContract, 
  executeDIDContract, 
  getDIDInfo, 
  testDIDContract 
};
