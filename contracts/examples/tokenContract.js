/**
 * Token Contract - 代币合约示例
 * 
 * 功能：
 * 1. 查询余额 (balanceOf)
 * 2. 转账 (transfer)
 * 3. 查询总供应量 (totalSupply)
 * 
 * 存储布局：
 * 0: totalSupply
 * 1: owner balance
 * 2: recipient balance
 */

// Token 合约字节码
// 逻辑：实现简单的代币转账
// 存储 0 = totalSupply, 存储 1 = owner, 存储 2 = recipient
export const tokenBytecode = '0x070001010308000b';

/**
 * 生成代币合约字节码
 * @param {number} totalSupply - 总供应量
 * @param {number} ownerBalance - 所有者余额
 * @returns {string} 合约字节码
 */
export function generateTokenBytecode(totalSupply = 1000000, ownerBalance = 1000000) {
  // 简化的代币合约：
  // PUSH totalSupply, STORE 0 (totalSupply)
  // PUSH ownerBalance, STORE 1 (owner)
  // HALT
  const bytecode = [
    0x01, totalSupply & 0xFF,        // PUSH totalSupply
    0x08, 0x00,                       // STORE 0 (totalSupply)
    0x01, ownerBalance & 0xFF,        // PUSH ownerBalance
    0x08, 0x01,                       // STORE 1 (owner balance)
    0x0B                              // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 代币合约配置
 */
export const tokenConfig = {
  name: 'NexusGenesis Token',
  symbol: 'NGEN',
  decimals: 8,
  totalSupply: 1000000000, // 10亿
  contractId: 'nexus-token-v1'
};

export default {
  tokenBytecode,
  generateTokenBytecode,
  tokenConfig
};
