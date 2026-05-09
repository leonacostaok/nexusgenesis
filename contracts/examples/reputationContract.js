/**
 * Reputation Contract - 声誉系统合约示例
 * 
 * 功能：
 * 1. 记录贡献值
 * 2. 计算声誉等级
 * 3. 奖励分配
 * 
 * 存储布局：
 * 0: totalReputation
 * 1: contributorCount
 * 2: baseReward
 */

/**
 * 生成声誉合约字节码
 * @param {number} baseReward - 基础奖励值
 * @returns {string} 合约字节码
 */
export function generateReputationBytecode(baseReward = 10) {
  // 声誉合约逻辑：
  // PUSH baseReward, STORE 2 (baseReward)
  // PUSH 0, STORE 0 (totalReputation)
  // PUSH 0, STORE 1 (contributorCount)
  // HALT
  const bytecode = [
    0x01, baseReward & 0xFF,   // PUSH baseReward
    0x08, 0x02,                 // STORE 2 (baseReward)
    0x01, 0x00,                 // PUSH 0
    0x08, 0x00,                 // STORE 0 (totalReputation)
    0x01, 0x00,                 // PUSH 0
    0x08, 0x01,                 // STORE 1 (contributorCount)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成增加声誉函数字节码
 * @param {number} amount - 增加的声誉值
 * @returns {string} 合约字节码
 */
export function generateAddReputationBytecode(amount = 1) {
  // 增加声誉：LOAD 0, PUSH amount, ADD, STORE 0
  // LOAD 1, PUSH 1, ADD, STORE 1
  const bytecode = [
    0x07, 0x00,                 // LOAD 0 (totalReputation)
    0x01, amount & 0xFF,        // PUSH amount
    0x03,                       // ADD
    0x08, 0x00,                 // STORE 0 (totalReputation)
    0x07, 0x01,                 // LOAD 1 (contributorCount)
    0x01, 0x01,                 // PUSH 1
    0x03,                       // ADD
    0x08, 0x01,                 // STORE 1 (contributorCount)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 声誉等级配置
 */
export const reputationLevels = [
  { level: 1, name: '新手', minRep: 0, maxRep: 99, bonus: 0 },
  { level: 2, name: '活跃贡献者', minRep: 100, maxRep: 299, bonus: 5 },
  { level: 3, name: '核心贡献者', minRep: 300, maxRep: 499, bonus: 10 },
  { level: 4, name: '资深贡献者', minRep: 500, maxRep: 799, bonus: 15 },
  { level: 5, name: '传奇贡献者', minRep: 800, maxRep: 1000, bonus: 20 }
];

/**
 * 声誉合约配置
 */
export const reputationConfig = {
  name: 'NexusGenesis Reputation',
  description: '去中心化声誉系统',
  maxReputation: 1000,
  contractId: 'nexus-reputation-v1'
};

export default {
  generateReputationBytecode,
  generateAddReputationBytecode,
  reputationLevels,
  reputationConfig
};
