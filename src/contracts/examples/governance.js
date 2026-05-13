/**
 * 治理智能合约
 * 功能：提案创建、投票和执行
 */

import contractManager from '../contractManager.js';

// memory地址分配
const ADDR_PROPOSAL_COUNT = 0;    // 提案数量
const ADDR_QUORUM = 1;             // 投票法定人数
const ADDR_MAJORITY = 2;           // 投票通过阈值
const ADDR_VOTING_PERIOD = 3;      // 投票周期

// 从地址10Start 存储提案信息
const ADDR_FIRST_PROPOSAL = 10;

// 治理合约字节码
// Logic: 
// 1. 初始化治理参数
// 2. 设置投票规则
const governanceBytecode = [
  // 初始化提案数量 (0)
  0x01, 0x00, // PUSH 0
  0x08, ADDR_PROPOSAL_COUNT, // STORE PROPOSAL_COUNT
  
  // 初始化法定人数 (10)
  0x01, 0x0A, // PUSH 10
  0x08, ADDR_QUORUM, // STORE QUORUM
  
  // 初始化通过阈值 (51%)
  0x01, 0x33, // PUSH 51
  0x08, ADDR_MAJORITY, // STORE MAJORITY
  
  // 初始化投票周期 (86400秒 = 1 days)
  0x01, 0x50, // PUSH 80
  0x01, 0x40, // PUSH 64
  0x05,       // MUL
  0x08, ADDR_VOTING_PERIOD, // STORE VOTING_PERIOD
  
  // Return success
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 创建提案合约字节码
// Logic: 
// 1. 从memory地址20加载提案标题
// 2. 从memory地址21加载提案描述
// 3. 从memory地址22加载提案发起者
// 4. 增加提案数量
// 5. 存储提案信息
const createProposalBytecode = [
  // 加载当前提案数量
  0x07, ADDR_PROPOSAL_COUNT, // LOAD PROPOSAL_COUNT
  
  // 增加提案数量
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, ADDR_PROPOSAL_COUNT, // STORE PROPOSAL_COUNT
  
  // 存储提案信息
  // 提案ID = 当前提案数量
  0x07, ADDR_PROPOSAL_COUNT, // LOAD PROPOSAL_COUNT
  0x08, ADDR_FIRST_PROPOSAL, // STORE PROPOSAL_ID
  
  // 存储提案标题
  0x07, 0x14, // LOAD 20 (title)
  0x08, ADDR_FIRST_PROPOSAL + 1, // STORE PROPOSAL_TITLE
  
  // 存储提案描述
  0x07, 0x15, // LOAD 21 (description)
  0x08, ADDR_FIRST_PROPOSAL + 2, // STORE PROPOSAL_DESCRIPTION
  
  // 存储提案发起者
  0x07, 0x16, // LOAD 22 (creator)
  0x08, ADDR_FIRST_PROPOSAL + 3, // STORE PROPOSAL_CREATOR
  
  // 初始化投票计数
  0x01, 0x00, // PUSH 0
  0x08, ADDR_FIRST_PROPOSAL + 4, // STORE YES_VOTES
  0x01, 0x00, // PUSH 0
  0x08, ADDR_FIRST_PROPOSAL + 5, // STORE NO_VOTES
  
  // Store creation time
  0x01, 0x01, // PUSH 1 (placeholder for timestamp)
  0x08, ADDR_FIRST_PROPOSAL + 6, // STORE CREATED_AT
  
  // 返回提案ID
  0x07, ADDR_PROPOSAL_COUNT, // LOAD PROPOSAL_COUNT
  0x0C        // RETURN
];

// 投票合约字节码
// Logic: 
// 1. 从memory地址30加载提案ID
// 2. 从memory地址31加载投票选项 (1=YES, 0=NO)
// 3. 从memory地址32加载投票者
// 4. 更新投票计数
const voteBytecode = [
  // 加载提案ID
  0x07, 0x1E, // LOAD 30 (proposalId)
  
  // 加载投票选项
  0x07, 0x1F, // LOAD 31 (voteOption)
  
  // 检查投票选项
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x01, 0x00, // PUSH 0
  0x0A, 0x05, // JZ 5 (如果为0，跳转)
  
  // 投票为YES
  0x07, ADDR_FIRST_PROPOSAL + 4, // LOAD YES_VOTES
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, ADDR_FIRST_PROPOSAL + 4, // STORE YES_VOTES
  
  // 跳转结束
  0x09, 0x05, // JMP 5
  
  // 投票为NO
  0x07, ADDR_FIRST_PROPOSAL + 5, // LOAD NO_VOTES
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, ADDR_FIRST_PROPOSAL + 5, // STORE NO_VOTES
  
  // Return success
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 部署治理合约
async function deployGovernanceContract() {
  const contractId = contractManager.deployContract(governanceBytecode, 'Governance Contract');
  console.log(`Governance contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行治理合约
async function executeGovernanceContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('Governance contract execution result:', result);
  return result;
}

// get治理参数
function getGovernanceParams(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return {
      proposalCount: contractInfo.storage[ADDR_PROPOSAL_COUNT] || 0,
      quorum: contractInfo.storage[ADDR_QUORUM] || 0,
      majority: contractInfo.storage[ADDR_MAJORITY] || 0,
      votingPeriod: contractInfo.storage[ADDR_VOTING_PERIOD] || 0
    };
  }
  return null;
}

// 测试治理合约
async function testGovernanceContract() {
  console.log('=== Testing Governance Contract ===');
  
  // Deploy contract
  const contractId = await deployGovernanceContract();
  
  // Execute contract
  await executeGovernanceContract(contractId);
  
  // get治理参数
  const params = getGovernanceParams(contractId);
  console.log('Governance params:', params);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
  
  return contractId;
}

// Export functions
export { 
  governanceBytecode, 
  createProposalBytecode, 
  voteBytecode, 
  deployGovernanceContract, 
  executeGovernanceContract, 
  getGovernanceParams, 
  testGovernanceContract 
};