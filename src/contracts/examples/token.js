/**
 * 代币管理智能合约
 * 功能：代币发行、转账、余额查询
 */

import contractManager from '../contractManager.js';

// memory地址分配
const ADDR_TOTAL_SUPPLY = 0;    // 总供应量
const ADDR_DECIMALS = 1;         // 小数位数
const ADDR_NAME = 2;             // 代币名称
const ADDR_SYMBOL = 3;           // 代币符号
const ADDR_OWNER = 4;            // 合约拥有者

// 从地址5Start 存储用户余额
const ADDR_FIRST_USER = 5;

// 代币合约字节码
// Logic: 
// 1. 初始化代币参数
// 2. 发行初始供应量到拥有者账户
const tokenBytecode = [
  // 初始化总供应量 (1000000)
  0x01, 0xE8, // PUSH 232
  0x01, 0x03, // PUSH 3
  0x05,       // MUL
  0x08, ADDR_TOTAL_SUPPLY, // STORE TOTAL_SUPPLY
  
  // 初始化小数位数 (18)
  0x01, 0x12, // PUSH 18
  0x08, ADDR_DECIMALS, // STORE DECIMALS
  
  // 初始化代币名称 (1 = "NGEN")
  0x01, 0x01, // PUSH 1
  0x08, ADDR_NAME, // STORE NAME
  
  // 初始化代币符号 (2 = "NGN")
  0x01, 0x02, // PUSH 2
  0x08, ADDR_SYMBOL, // STORE SYMBOL
  
  // 初始化拥有者 (100)
  0x01, 0x64, // PUSH 100
  0x08, ADDR_OWNER, // STORE OWNER
  
  // 发行初始供应量到拥有者账户
  0x07, ADDR_TOTAL_SUPPLY, // LOAD TOTAL_SUPPLY
  0x08, ADDR_FIRST_USER + 100, // STORE OWNER_BALANCE
  
  // Return success
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 转账合约字节码
// Logic: 
// 1. 从memory地址10加载发送者余额
// 2. 从memory地址11加载接收者余额
// 3. 从memory地址12加载转账金额
// 4. 检查发送者余额是否足够
// 5. 执行转账
// 6. 保存新余额
const transferBytecode = [
  // 加载发送者余额
  0x07, 0x0A, // LOAD 10 (sender balance address)
  
  // 加载转账金额
  0x07, 0x0C, // LOAD 12 (amount)
  
  // 检查余额是否足够
  0x03,       // ADD (暂时使用ADD，后续需要实现比较指令)
  0x01, 0x00, // PUSH 0
  0x0A, 0x05, // JZ 5 (如果为0，跳转)
  
  // 执行转账：发送者余额 -= 金额
  0x07, 0x0A, // LOAD 10
  0x07, 0x0C, // LOAD 12
  0x04,       // SUB
  0x08, 0x0A, // STORE 10
  
  // 接收者余额 += 金额
  0x07, 0x0B, // LOAD 11 (receiver balance address)
  0x07, 0x0C, // LOAD 12
  0x03,       // ADD
  0x08, 0x0B, // STORE 11
  
  // Return success
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 部署代币合约
async function deployTokenContract() {
  const contractId = contractManager.deployContract(tokenBytecode, 'Token Contract');
  console.log(`Token contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行代币合约
async function executeTokenContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('Token contract execution result:', result);
  return result;
}

// get代币信息
function getTokenInfo(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return {
      totalSupply: contractInfo.storage[ADDR_TOTAL_SUPPLY] || 0,
      decimals: contractInfo.storage[ADDR_DECIMALS] || 0,
      name: contractInfo.storage[ADDR_NAME] || 0,
      symbol: contractInfo.storage[ADDR_SYMBOL] || 0,
      owner: contractInfo.storage[ADDR_OWNER] || 0
    };
  }
  return null;
}

// get用户余额
function getBalance(contractId, userId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return contractInfo.storage[ADDR_FIRST_USER + userId] || 0;
  }
  return 0;
}

// 测试代币合约
async function testTokenContract() {
  console.log('=== Testing Token Contract ===');
  
  // Deploy contract
  const contractId = await deployTokenContract();
  
  // Execute contract
  await executeTokenContract(contractId);
  
  // get代币信息
  const tokenInfo = getTokenInfo(contractId);
  console.log('Token info:', tokenInfo);
  
  // get拥有者余额
  const ownerBalance = getBalance(contractId, 100);
  console.log('Owner balance:', ownerBalance);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
  
  return contractId;
}

// Export functions
export { 
  tokenBytecode, 
  transferBytecode, 
  deployTokenContract, 
  executeTokenContract, 
  getTokenInfo, 
  getBalance, 
  testTokenContract 
};