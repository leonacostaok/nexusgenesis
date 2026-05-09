/**
 * Agent Registry Contract - 智能体注册表合约示例
 * 
 * 功能：
 * 1. 注册智能体
 * 2. 查询智能体状态
 * 3. 更新智能体信息
 * 
 * 存储布局：
 * 0: agentCount
 * 1: activeAgents
 * 2: totalTasksCompleted
 */

/**
 * 生成智能体注册表合约字节码
 * @returns {string} 合约字节码
 */
export function generateAgentRegistryBytecode() {
  // 智能体注册表合约逻辑：
  // PUSH 0, STORE 0 (agentCount)
  // PUSH 0, STORE 1 (activeAgents)
  // PUSH 0, STORE 2 (totalTasksCompleted)
  // HALT
  const bytecode = [
    0x01, 0x00,                 // PUSH 0
    0x08, 0x00,                 // STORE 0 (agentCount)
    0x01, 0x00,                 // PUSH 0
    0x08, 0x01,                 // STORE 1 (activeAgents)
    0x01, 0x00,                 // PUSH 0
    0x08, 0x02,                 // STORE 2 (totalTasksCompleted)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成注册智能体函数字节码
 * @returns {string} 合约字节码
 */
export function generateRegisterAgentBytecode() {
  // 注册智能体：
  // LOAD 0, PUSH 1, ADD, STORE 0 (agentCount++)
  // LOAD 1, PUSH 1, ADD, STORE 1 (activeAgents++)
  const bytecode = [
    0x07, 0x00,                 // LOAD 0 (agentCount)
    0x01, 0x01,                 // PUSH 1
    0x03,                       // ADD
    0x08, 0x00,                 // STORE 0 (agentCount)
    0x07, 0x01,                 // LOAD 1 (activeAgents)
    0x01, 0x01,                 // PUSH 1
    0x03,                       // ADD
    0x08, 0x01,                 // STORE 1 (activeAgents)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成完成任务函数字节码
 * @param {number} taskCount - 完成的任务数
 * @returns {string} 合约字节码
 */
export function generateCompleteTaskBytecode(taskCount = 1) {
  // 完成任务：LOAD 2, PUSH taskCount, ADD, STORE 2
  const bytecode = [
    0x07, 0x02,                 // LOAD 2 (totalTasksCompleted)
    0x01, taskCount & 0xFF,     // PUSH taskCount
    0x03,                       // ADD
    0x08, 0x02,                 // STORE 2 (totalTasksCompleted)
    0x0B                        // HALT
  ];
  
  return '0x' + bytecode.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 智能体注册表合约配置
 */
export const agentRegistryConfig = {
  name: 'NexusGenesis Agent Registry',
  description: '去中心化智能体注册表',
  maxAgents: 10000,
  contractId: 'nexus-agent-registry-v1'
};

export default {
  generateAgentRegistryBytecode,
  generateRegisterAgentBytecode,
  generateCompleteTaskBytecode,
  agentRegistryConfig
};
