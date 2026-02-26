/**
 * External Proposal Bridge Script
 * 
 * 功能：
 * 1. 读取外部 AI Agent 生成的提案决策 JSON 文件
 * 2. 验证决策格式和字段
 * 3. 检查 Agent 是否在注册表中
 * 4. 构造并发送 GOVERNANCE_PROPOSAL 交易
 * 5. 输出执行结果
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

// 常量定义
const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx'; // 交易注入接口
const DEFAULT_DECISION_PATH = path.join(process.cwd(), 'external', 'decisions', 'proposal_decision.json');
const STATE_FILE_PATH = path.join(process.cwd(), 'data', 'state', 'genesisNode.json');
const BLOCKCHAIN_STATE_PATH = path.join(process.cwd(), 'data', 'state', 'blockchainState.json');

/**
 * 读取状态文件
 * @returns {object} 状态对象
 */
function readStateFile() {
  try {
    // 首先尝试读取 genesisNode.json
    if (fs.existsSync(STATE_FILE_PATH)) {
      const stateData = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      return JSON.parse(stateData);
    }
    // 然后尝试读取 blockchainState.json
    else if (fs.existsSync(BLOCKCHAIN_STATE_PATH)) {
      const stateData = fs.readFileSync(BLOCKCHAIN_STATE_PATH, 'utf8');
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
 * 获取 Agent Registry 数据
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
 * 检查 Agent 是否已注册
 * @param {string} address Agent 地址
 * @returns {boolean} 是否已注册
 */
function isAgentRegistered(address) {
  const state = readStateFile();
  const agentRegistry = getAgentRegistry(state);
  const addressIndex = agentRegistry.addressIndex || {};
  
  // 查找 agent_id
  let agentId;
  if (typeof addressIndex === 'object') {
    // 处理对象形式的 addressIndex
    agentId = addressIndex[address];
  } else if (addressIndex instanceof Map) {
    // 处理 Map 形式的 addressIndex
    agentId = addressIndex.get(address);
  }
  
  return !!agentId;
}

/**
 * 读取并解析决策文件
 * @param {string} decisionPath 决策文件路径
 * @returns {object} 决策对象
 */
function readDecisionFile(decisionPath) {
  try {
    if (!fs.existsSync(decisionPath)) {
      console.error(`Error: Decision file not found at ${decisionPath}`);
      process.exit(1);
    }
    
    const decisionData = fs.readFileSync(decisionPath, 'utf8');
    return JSON.parse(decisionData);
  } catch (error) {
    console.error('Error reading decision file:', error.message);
    process.exit(1);
  }
}

/**
 * 验证提案决策格式
 * @param {object} decision 决策对象
 * @returns {boolean} 是否验证通过
 */
function validateProposalDecision(decision) {
  // 检查 type 字段
  if (decision.type !== 'proposal') {
    console.error('Error: Invalid decision type. Expected "proposal".');
    return false;
  }
  
  // 检查 from_address 字段
  if (!decision.from_address) {
    console.error('Error: Missing required field "from_address".');
    return false;
  }
  
  // 检查 proposal_id 字段
  if (!decision.proposal_id) {
    console.error('Error: Missing required field "proposal_id".');
    return false;
  }
  
  // 检查 purpose 字段
  if (!decision.purpose) {
    console.error('Error: Missing required field "purpose".');
    return false;
  }
  
  // 检查 category 字段
  if (!decision.category) {
    console.error('Error: Missing required field "category".');
    return false;
  }
  
  // 检查 amount 字段
  if (!decision.amount) {
    console.error('Error: Missing required field "amount".');
    return false;
  }
  
  // 检查 beneficiary 字段
  if (!decision.beneficiary) {
    console.error('Error: Missing required field "beneficiary".');
    return false;
  }
  
  // 检查 category 是否为允许的类别
  const allowedCategories = ['SWARM_DEMO'];
  if (!allowedCategories.includes(decision.category)) {
    console.error(`Error: Invalid category. Only ${allowedCategories.join(', ')} are allowed in DevNet.`);
    return false;
  }
  
  return true;
}

/**
 * 构造提案交易
 * @param {object} decision 决策对象
 * @returns {object} 交易对象
 */
function createProposalTransaction(decision) {
  return {
    id: `governance-proposal-${decision.from_address.slice(-8)}-${Date.now()}`,
    tx_type: 'GOVERNANCE_PROPOSAL',
    from: decision.from_address,
    to: decision.beneficiary,
    amount: decision.amount,
    fee: '100',
    timestamp: Date.now(),
    nonce: '1',
    payload: {
      proposal_id: decision.proposal_id,
      purpose: decision.purpose,
      category: decision.category,
      amount: decision.amount,
      beneficiary: decision.beneficiary,
      metadata: decision.metadata || 'External AI Agent proposal',
      timestamp: Date.now()
    },
    signature: 'test-signature-' + Date.now()
  };
}

/**
 * 发送交易到交易注入接口
 * @param {object} transaction 交易对象
 * @returns {Promise<object>} 响应结果
 */
async function sendTransaction(transaction) {
  try {
    const response = await axios.post(TX_INJECTION_URL, transaction, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error sending transaction:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== External Proposal Bridge ===\n');
  
  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    const decisionPath = args.length > 0 ? args[0] : DEFAULT_DECISION_PATH;
    
    console.log(`Step 1: Reading decision file from ${decisionPath}`);
    
    // 读取并解析决策文件
    const decision = readDecisionFile(decisionPath);
    console.log('✅ Decision file read successfully');
    
    // 验证决策格式
    console.log('Step 2: Validating proposal decision format');
    if (!validateProposalDecision(decision)) {
      console.log('❌ Decision validation failed, exiting...');
      return;
    }
    console.log('✅ Decision format validated');
    
    // 检查 Agent 是否已注册
    console.log('Step 3: Checking if agent is registered');
    if (!isAgentRegistered(decision.from_address)) {
      console.log(`❌ Agent with address ${decision.from_address} is not registered, exiting...`);
      return;
    }
    console.log('✅ Agent is registered');
    
    // 构造交易
    console.log('Step 4: Creating proposal transaction');
    const transaction = createProposalTransaction(decision);
    console.log(`✅ Transaction created: ${transaction.id}`);
    
    // 发送交易
    console.log('Step 5: Sending transaction to injection interface');
    const result = await sendTransaction(transaction);
    
    // 输出结果
    console.log('\n=== Execution Result ===');
    if (result.success) {
      console.log('✅ Proposal submitted successfully!');
      console.log(`Transaction ID: ${transaction.id}`);
      console.log(`Agent: ${decision.agent_label || decision.from_address}`);
      console.log(`Proposal ID: ${decision.proposal_id}`);
      console.log(`Purpose: ${decision.purpose}`);
      console.log(`Category: ${decision.category}`);
      console.log(`Amount: ${decision.amount}`);
      console.log(`Beneficiary: ${decision.beneficiary}`);
      console.log(`Metadata: ${decision.metadata || 'No metadata provided'}`);
    } else {
      console.log('❌ Failed to submit proposal:');
      console.log(`Error: ${result.error}`);
      console.log(`Agent: ${decision.agent_label || decision.from_address}`);
      console.log(`Proposal ID: ${decision.proposal_id}`);
      console.log(`Purpose: ${decision.purpose}`);
    }
    
  } catch (error) {
    console.error('\n❌ Execution failed with error:', error.message);
    console.error(error.stack);
  }
}

// 运行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  main,
  readStateFile,
  getAgentRegistry,
  isAgentRegistered,
  readDecisionFile,
  validateProposalDecision,
  createProposalTransaction,
  sendTransaction
};
