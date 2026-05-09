/**
 * Staking Contract - 质押合约
 * 
 * 功能：
 * 1. 质押代币
 * 2. 计算奖励
 * 3. 解除质押
 * 4. 领取奖励
 * 
 * 存储布局：
 * 0: totalStaked
 * 1: totalRewards
 * 2: stakerCount
 */

/**
 * 生成质押合约字节码
 * @returns {string} 合约字节码
 */
export function generateStakingBytecode() {
  // 质押合约逻辑：
  // PUSH 0, STORE 0 (totalStaked)
  // PUSH 0, STORE 1 (totalRewards)
  // PUSH 0, STORE 2 (stakerCount)
  // HALT
  const bytecode = [
    0x01, 0x00,        // PUSH 0
    0x08, 0x00,        // STORE 0 (totalStaked)
    0x01, 0x00,        // PUSH 0
    0x08, 0x01,        // STORE 1 (totalRewards)
    0x01, 0x00,        // PUSH 0
    0x08, 0x02,        // STORE 2 (stakerCount)
    0x0B               // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成质押函数字节码
 * @param {number} amount - 质押金额
 * @returns {string} 合约字节码
 */
export function generateStakeBytecode(amount = 100) {
  // 质押：LOAD 0, PUSH amount, ADD, STORE 0
  // LOAD 2, PUSH 1, ADD, STORE 2
  const bytecode = [
    0x07, 0x00,                 // LOAD 0 (totalStaked)
    0x01, amount & 0xFF,        // PUSH amount
    0x03,                       // ADD
    0x08, 0x00,                 // STORE 0 (totalStaked)
    0x07, 0x02,                 // LOAD 2 (stakerCount)
    0x01, 0x01,                 // PUSH 1
    0x03,                       // ADD
    0x08, 0x02,                 // STORE 2 (stakerCount)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成分配奖励函数字节码
 * @param {number} reward - 奖励金额
 * @returns {string} 合约字节码
 */
export function generateDistributeRewardBytecode(reward = 10) {
  // 分配奖励：LOAD 1, PUSH reward, ADD, STORE 1
  const bytecode = [
    0x07, 0x01,                 // LOAD 1 (totalRewards)
    0x01, reward & 0xFF,        // PUSH reward
    0x03,                       // ADD
    0x08, 0x01,                 // STORE 1 (totalRewards)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成解除质押函数字节码
 * @param {number} amount - 解除金额
 * @returns {string} 合约字节码
 */
export function generateUnstakeBytecode(amount = 100) {
  // 解除质押：LOAD 0, PUSH amount, SUB, STORE 0
  const bytecode = [
    0x07, 0x00,                 // LOAD 0 (totalStaked)
    0x01, amount & 0xFF,        // PUSH amount
    0x04,                       // SUB
    0x08, 0x00,                 // STORE 0 (totalStaked)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 质押合约配置
 */
export const stakingConfig = {
  name: 'NexusGenesis Staking',
  description: '去中心化质押系统',
  minStakeAmount: 100,
  rewardRate: 0.1, // 10% 年化
  contractId: 'nexus-staking-v1'
};

export default {
  generateStakingBytecode,
  generateStakeBytecode,
  generateDistributeRewardBytecode,
  generateUnstakeBytecode,
  stakingConfig
};
