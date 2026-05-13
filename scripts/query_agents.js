/**
 * Agent Registry 查询工具
 * 
 * 功能：
 * 1. 无参数：列出所有 Agent
 * 2. --address <ng1>：按地址查询 Agent
 * 3. --id <agent_id>：按 agent_id 查询详情
 */

import fs from 'fs';
import path from 'path';

// 状态文件路径
const STATE_FILE_PATH = path.join(process.cwd(), 'data', 'state', 'genesisNode.json');
const BLOCKCHAIN_STATE_PATH = path.join(process.cwd(), 'data', 'state', 'blockchainState.json');

/**
 * 读取状态文件
 * @returns {object} 状态对象
 */
function readStateFile() {
  try {
    // 首先尝试读取 blockchainState.json
    if (fs.existsSync(BLOCKCHAIN_STATE_PATH)) {
      const stateData = fs.readFileSync(BLOCKCHAIN_STATE_PATH, 'utf8');
      return JSON.parse(stateData);
    }
    // 然后尝试读取 genesisNode.json
    else if (fs.existsSync(STATE_FILE_PATH)) {
      const stateData = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      return JSON.parse(stateData);
    }
    else {
      console.error('Error: No state file found!');
      console.error('Please start the node first to generate state files.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error reading state file:', error.message);
    process.exit(1);
  }
}

/**
 * get Agent Registry 数据
 * @param {object} state 状态对象
 * @returns {object} Agent Registry 数据
 */
function getAgentRegistry(state) {
  // 检查 agentRegistry 在根级别
  if (state.agentRegistry) {
    return state.agentRegistry;
  }
  // 检查 agentRegistry 在 blockchain 或其他嵌套结构中
  else if (state.blockchain && state.blockchain.agentRegistry) {
    return state.blockchain.agentRegistry;
  }
  // 检查 agents 和 address_index 直接在根级别
  else if (state.agents || state.address_index) {
    return {
      agents: state.agents || {},
      addressIndex: state.address_index || {}
    };
  }
  else {
    return {
      agents: {},
      addressIndex: {}
    };
  }
}

/**
 * 列出所有 Agent
 * @param {object} agentRegistry Agent Registry 数据
 */
function listAllAgents(agentRegistry) {
  const agents = agentRegistry.agents || {};
  const agentList = Object.values(agents);
  
  console.log('========================================');
  console.log('NexusGenesis - Agent Registry');
  console.log('========================================');
  console.log(`Total Agents: ${agentList.length}`);
  console.log('========================================');
  
  if (agentList.length === 0) {
    console.log('No agents registered yet.');
    return;
  }
  
  agentList.forEach((agent, index) => {
    console.log(`\nAgent ${index + 1}:`);
    console.log(`  ID: ${agent.agent_id}`);
    console.log(`  Address: ${agent.address}`);
    console.log(`  Capabilities: ${agent.capabilities?.join(', ') || '[]'}`);
    console.log(`  Reputation: ${agent.reputation || 0}`);
  });
}

/**
 * 按地址查询 Agent
 * @param {object} agentRegistry Agent Registry 数据
 * @param {string} address 查询地址
 */
function queryAgentByAddress(agentRegistry, address) {
  const addressIndex = agentRegistry.addressIndex || {};
  const agents = agentRegistry.agents || {};
  
  // 查找 agent_id
  let agentId;
  if (typeof addressIndex === 'object') {
    // Processing对象形式的 addressIndex
    agentId = addressIndex[address];
  } else if (addressIndex instanceof Map) {
    // Processing Map 形式的 addressIndex
    agentId = addressIndex.get(address);
  }
  
  if (!agentId) {
    console.log(`========================================`);
    console.log(`Agent not found for address: ${address}`);
    console.log(`========================================`);
    return;
  }
  
  // 查找 Agent 详情
  const agent = agents[agentId];
  if (!agent) {
    console.log(`========================================`);
    console.log(`Agent ID found in address index but not in agents: ${agentId}`);
    console.log(`========================================`);
    return;
  }
  
  displayAgentDetails(agent);
}

/**
 * 按 agent_id 查询详情
 * @param {object} agentRegistry Agent Registry 数据
 * @param {string} agentId 查询的 agent_id
 */
function queryAgentById(agentRegistry, agentId) {
  const agents = agentRegistry.agents || {};
  const agent = agents[agentId];
  
  if (!agent) {
    console.log(`========================================`);
    console.log(`Agent not found with ID: ${agentId}`);
    console.log(`========================================`);
    return;
  }
  
  displayAgentDetails(agent);
}

/**
 * 显示 Agent 详情
 * @param {object} agent Agent 对象
 */
function displayAgentDetails(agent) {
  console.log(`========================================`);
  console.log(`Agent Details`);
  console.log(`========================================`);
  console.log(`ID: ${agent.agent_id}`);
  console.log(`Address: ${agent.address}`);
  console.log(`Public Key: ${agent.public_key || 'N/A'}`);
  console.log(`Capabilities: ${agent.capabilities?.join(', ') || '[]'}`);
  console.log(`Metadata: ${agent.metadata || 'N/A'}`);
  console.log(`Registered at Block: ${agent.registered_at_block || 0}`);
  console.log(`Reputation: ${agent.reputation || 0}`);
  console.log(`========================================`);
}

/**
 * 主函数
 */
function main() {
  try {
    // 读取状态文件
    const state = readStateFile();
    
    // get Agent Registry 数据
    const agentRegistry = getAgentRegistry(state);
    
    // 解析命令行参数
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      // 无参数：列出所有 Agent
      listAllAgents(agentRegistry);
    } else if (args[0] === '--address' && args[1]) {
      // --address <ng1>：按地址查询
      const address = args[1];
      queryAgentByAddress(agentRegistry, address);
    } else if (args[0] === '--id' && args[1]) {
      // --id <agent_id>：按 ID 查询
      const agentId = args[1];
      queryAgentById(agentRegistry, agentId);
    } else {
      // 无效参数
      console.log('========================================');
      console.log('Usage: node scripts/query_agents.js [options]');
      console.log('========================================');
      console.log('Options:');
      console.log('  (no arguments)     List all agents');
      console.log('  --address <ng1>     Query agent by address');
      console.log('  --id <agent_id>     Query agent by ID');
      console.log('========================================');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

// 运行主函数
main();

export default {
  main,
  readStateFile,
  getAgentRegistry,
  listAllAgents,
  queryAgentByAddress,
  queryAgentById,
  displayAgentDetails
};
