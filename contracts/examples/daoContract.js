/**
 * DAO Contract - 去中心化自治组织合约示例
 * 
 * 功能：
 * 1. 创建提案
 * 2. 投票计数
 * 3. 执行决策
 * 
 * 存储布局：
 * 0: proposalCount
 * 1: yesVotes
 * 2: noVotes
 * 3: status (0=pending, 1=approved, 2=rejected)
 */

/**
 * 生成 DAO 合约字节码
 * @returns {string} 合约字节码
 */
export function generateDAOBytecode() {
  // DAO 合约逻辑：
  // 初始化提案计数器
  // PUSH 0, STORE 0 (proposalCount)
  // PUSH 0, STORE 1 (yesVotes)
  // PUSH 0, STORE 2 (noVotes)
  // PUSH 0, STORE 3 (status)
  // HALT
  const bytecode = [
    0x01, 0x00,        // PUSH 0
    0x08, 0x00,        // STORE 0 (proposalCount)
    0x01, 0x00,        // PUSH 0
    0x08, 0x01,        // STORE 1 (yesVotes)
    0x01, 0x00,        // PUSH 0
    0x08, 0x02,        // STORE 2 (noVotes)
    0x01, 0x00,        // PUSH 0
    0x08, 0x03,        // STORE 3 (status)
    0x0B               // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成投票函数字节码
 * @param {boolean} isYes - 是否赞成
 * @returns {string} 合约字节码
 */
export function generateVoteBytecode(isYes = true) {
  if (isYes) {
    // 赞成票：LOAD 1, PUSH 1, ADD, STORE 1
    const bytecode = [
      0x07, 0x01,        // LOAD 1 (yesVotes)
      0x01, 0x01,        // PUSH 1
      0x03,              // ADD
      0x08, 0x01,        // STORE 1 (yesVotes)
      0x0B               // HALT
    ];
    return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // 反对票：LOAD 2, PUSH 1, ADD, STORE 2
    const bytecode = [
      0x07, 0x02,        // LOAD 2 (noVotes)
      0x01, 0x01,        // PUSH 1
      0x03,              // ADD
      0x08, 0x02,        // STORE 2 (noVotes)
      0x0B               // HALT
    ];
    return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * DAO 合约配置
 */
export const daoConfig = {
  name: 'NexusGenesis DAO',
  description: '去中心化治理合约',
  minVotes: 10,
  quorum: 0.51, // 51% 多数决
  contractId: 'nexus-dao-v1'
};

export default {
  generateDAOBytecode,
  generateVoteBytecode,
  daoConfig
};
