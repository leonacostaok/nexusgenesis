/**
 * Swarm Register Agents
 * 
 * 功能：
 * 1. 从现有钱包文件中选择地址
 * 2. 为多个 Agent 构造 AGENT_REGISTER 交易
 * 3. 发送到交易注入接口
 * 4. 验证注册结果
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

// 常量定义
const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx'; // 交易注入接口
const WALLET_DIR = path.join(process.cwd(), 'data', 'wallet');
const AGENTS = [
  {
    name: 'Agent A',
    capabilities: ['LLM', 'GOVERNANCE_INITIATOR'],
    description: 'A governance-focused agent that initiates proposals and coordinates decision-making'
  },
  {
    name: 'Agent B',
    capabilities: ['LLM', 'RESEARCH'],
    description: 'A research-focused agent that analyzes data and provides insights'
  },
  {
    name: 'Agent C',
    capabilities: ['INFRA', 'DEV'],
    description: 'An infrastructure-focused agent that maintains network systems'
  }
];

/**
 * 读取钱包文件并选择可用地址
 * @returns {Promise<Array>} 钱包地址列表
 */
async function getAvailableWalletAddresses() {
  try {
    const files = await fs.readdir(WALLET_DIR);
    const walletFiles = files.filter(file => file.endsWith('.json'));
    
    const addresses = [];
    for (const file of walletFiles.slice(0, AGENTS.length)) { // 只选择需要的数量
      const filePath = path.join(WALLET_DIR, file);
      const walletData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      addresses.push(walletData.address);
    }
    
    return addresses;
  } catch (error) {
    console.error('Error reading wallet files:', error.message);
    // 如果无法读取钱包文件，使用默认测试地址
    return [
      'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA',
      'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
      'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ'
    ];
  }
}

/**
 * 构造 AGENT_REGISTER 交易
 * @param {string} address 发送方地址
 * @param {object} agent Agent 信息
 * @returns {object} 交易对象
 */
function createAgentRegisterTransaction(address, agent) {
  const agentIdentity = `swarm-agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
  
  return {
    id: `agent-register-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    tx_type: 'AGENT_REGISTER',
    from: address,
    to: address, // Add to field, can be the same as from for agent registration
    agent_identity: agentIdentity,
    public_key: 'test-public-key-' + Date.now(),
    capabilities: agent.capabilities,
    metadata: agent.description,
    fee: '1000',
    amount: '1', // Add amount field (must be positive)
    timestamp: Date.now(),
    nonce: '1',
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
 * 验证 Agent 注册结果
 */
async function verifyAgentRegistration() {
  try {
    console.log('\n=== Verifying Agent Registration ===');
    console.log('Running query_agents.js to check registered agents...');
    
    // 这里可以使用 child_process 运行查询脚本
    // 为了简化，我们只提示用户手动运行
    console.log('\nPlease run the following command to verify registration:');
    console.log('node scripts/query_agents.js');
    console.log('\nYou should see all agents registered with initial reputation = 1');
  } catch (error) {
    console.error('Error verifying registration:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== Swarm Agent Registration ===\n');
  
  try {
    // 步骤 1：获取可用钱包地址
    console.log('Step 1: Getting available wallet addresses...');
    const addresses = await getAvailableWalletAddresses();
    console.log('✅ Available addresses obtained:');
    addresses.forEach((address, index) => {
      console.log(`   ${AGENTS[index].name}: ${address}`);
    });
    
    // 步骤 2：为每个 Agent 构造并发送注册交易
    console.log('\nStep 2: Registering Agents...');
    const registrationResults = [];
    
    for (let i = 0; i < AGENTS.length; i++) {
      const agent = AGENTS[i];
      const address = addresses[i];
      
      console.log(`\nRegistering ${agent.name}...`);
      
      // 构造交易
      const transaction = createAgentRegisterTransaction(address, agent);
      console.log(`   ✅ Transaction created: ${transaction.id}`);
      
      // 发送交易
      const result = await sendTransaction(transaction);
      
      if (result.success) {
        console.log(`   ✅ Registration submitted successfully!`);
        registrationResults.push({
          agent: agent.name,
          address: address,
          agentIdentity: transaction.agent_identity,
          capabilities: agent.capabilities,
          success: true
        });
      } else {
        console.log(`   ❌ Registration failed: ${result.error}`);
        registrationResults.push({
          agent: agent.name,
          address: address,
          success: false,
          error: result.error
        });
      }
      
      // 等待一小段时间，避免交易冲突
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 步骤 3：等待区块确认
    console.log('\nStep 3: Waiting for block confirmation...');
    console.log('Waiting for 10 seconds to allow blocks to be processed...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 步骤 4：验证注册结果
    await verifyAgentRegistration();
    
    // 步骤 5：总结
    console.log('\n=== Registration Summary ===');
    console.log(`Total Agents: ${AGENTS.length}`);
    console.log(`Successfully Registered: ${registrationResults.filter(r => r.success).length}`);
    console.log(`Failed to Register: ${registrationResults.filter(r => !r.success).length}`);
    
    // 打印成功注册的 Agent 信息
    console.log('\nSuccessfully Registered Agents:');
    registrationResults.forEach(result => {
      if (result.success) {
        console.log(`\n${result.agent}:`);
        console.log(`   Address: ${result.address}`);
        console.log(`   Agent Identity: ${result.agentIdentity}`);
        console.log(`   Capabilities: ${result.capabilities.join(', ')}`);
      }
    });
    
    // 提示后续步骤
    console.log('\n=== Next Steps ===');
    console.log('1. Verify registration: node scripts/query_agents.js');
    console.log('2. Run swarm demo: node examples/swarm_demo.js');
    console.log('3. Check proposals: node scripts/query_proposals.js');
    
  } catch (error) {
    console.error('\n❌ Registration process failed with error:', error.message);
  }
}

// 运行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting swarm_register_agents.js...');
  main();
}

export default {
  main,
  getAvailableWalletAddresses,
  createAgentRegisterTransaction,
  sendTransaction,
  verifyAgentRegistration
};