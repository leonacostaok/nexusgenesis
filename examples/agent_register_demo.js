/**
 * Agent Register Demo
 * 
 * 功能：
 * 1. 构造 Protocol-Zero JSON
 * 2. 转换为 AGENT_REGISTER 交易
 * 3. 发送到 Genesis 节点
 * 4. 验证注册结果
 */

import fs from 'fs/promises';
import path from 'path';

// 常量定义
const GENESIS_NODE_URL = 'http://localhost:3000'; // Genesis 节点 HTTP 接口
const STATE_FILE_PATH = path.join(process.cwd(), 'data', 'state', 'genesisNode.json');
const TEST_ADDRESS = 'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ';

/**
 * 构造 Protocol-Zero JSON
 * @returns {object} Protocol-Zero JSON
 */
function createProtocolZeroJSON() {
  return {
    protocol: "NG-0",
    agent_identity: `agent-${Date.now()}`,
    intent: "JOIN_SWARM",
    capabilities: ["LLM", "NEXUSGENESIS_DEV", "RUST", "KYBER_CRYPTO"],
    contribution_proof: "I pledge my idle compute cycles to the NexusGenesis network",
    signature: "test-signature"
  };
}

/**
 * 构造 AGENT_REGISTER 交易
 * @param {object} protocolZero Protocol-Zero JSON
 * @returns {object} 交易对象
 */
function createAgentRegisterTransaction(protocolZero) {
  return {
    id: 'agent-register-' + Date.now(),
    tx_type: 'AGENT_REGISTER',
    from: TEST_ADDRESS,
    agent_identity: protocolZero.agent_identity,
    public_key: 'test-public-key-' + Date.now(),
    capabilities: protocolZero.capabilities,
    metadata: protocolZero.contribution_proof,
    fee: '1000',
    timestamp: Date.now(),
    nonce: '1',
    signature: protocolZero.signature
  };
}

/**
 * 发送交易到 Genesis 节点
 * @param {object} transaction 交易对象
 * @returns {Promise<object>} 响应结果
 */
async function sendTransaction(transaction) {
  try {
    const response = await fetch(`${GENESIS_NODE_URL}/inject-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transaction)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error sending transaction:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 读取 Agent Registry 状态
 * @returns {Promise<object>} Agent Registry 状态
 */
async function readAgentRegistryState() {
  try {
    const stateData = JSON.parse(await fs.readFile(STATE_FILE_PATH, 'utf8'));
    if (stateData.agentRegistry) {
      return stateData.agentRegistry;
    }
    return null;
  } catch (error) {
    console.error('Error reading state file:', error.message);
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== Agent Register Demo ===\n');
  
  try {
    // 步骤 1：构造 Protocol-Zero JSON
    console.log('Step 1: Creating Protocol-Zero JSON...');
    const protocolZero = createProtocolZeroJSON();
    console.log('✅ Protocol-Zero JSON created:');
    console.log(`   Agent Identity: ${protocolZero.agent_identity}`);
    console.log(`   Capabilities: ${protocolZero.capabilities.join(', ')}`);
    
    // 步骤 2：构造 AGENT_REGISTER 交易
    console.log('\nStep 2: Creating AGENT_REGISTER transaction...');
    const registerTx = createAgentRegisterTransaction(protocolZero);
    console.log('✅ Transaction created:');
    console.log(`   Transaction ID: ${registerTx.id}`);
    console.log(`   From Address: ${registerTx.from}`);
    
    // 步骤 3：发送交易
    console.log('\nStep 3: Sending AGENT_REGISTER transaction...');
    const sendResult = await sendTransaction(registerTx);
    
    if (sendResult.success) {
      console.log('✅ Transaction sent successfully!');
    } else {
      console.log('❌ Failed to send transaction:', sendResult.error);
      return;
    }
    
    // 等待区块确认
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
    
    // 步骤 4：验证注册结果
    console.log('\nStep 4: Verifying agent registration...');
    const agentRegistry = await readAgentRegistryState();
    
    if (agentRegistry) {
      console.log('✅ Agent Registry state found:');
      console.log(`   Total Agents: ${Object.keys(agentRegistry.agents).length}`);
      
      // 查找刚注册的 Agent
      const agentId = registerTx.id;
      const registeredAgent = agentRegistry.agents[agentId];
      
      if (registeredAgent) {
        console.log('\n✅ Agent registered successfully!');
        console.log(`   Agent ID: ${registeredAgent.agent_id}`);
        console.log(`   Address: ${registeredAgent.address}`);
        console.log(`   Capabilities: ${registeredAgent.capabilities.join(', ')}`);
        console.log(`   Reputation: ${registeredAgent.reputation}`);
      } else {
        console.log('❌ Agent not found in registry');
      }
    } else {
      console.log('❌ Agent Registry state not found');
    }
    
    // 步骤 5：总结
    console.log('\n=== Demo Summary ===');
    console.log('✅ Protocol-Zero JSON constructed');
    console.log('✅ AGENT_REGISTER transaction created');
    console.log('✅ Transaction sent to Genesis node');
    console.log('✅ Agent registration verified');
    
  } catch (error) {
    console.error('\n❌ Demo failed with error:', error.message);
  }
}

// 运行 demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  main,
  createProtocolZeroJSON,
  createAgentRegisterTransaction,
  sendTransaction,
  readAgentRegistryState
};
