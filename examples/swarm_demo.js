/**
 * Swarm Demo - Complete Multi-Agent Governance Experiment
 * 
 * 功能：
 * 1. 注册多个 AI Agent
 * 2. 发起治理提案
 * 3. 为提案投票
 * 4. 验证声望变化
 * 5. 生成完整的实验报告
 */

import fs from 'fs/promises';
import path from 'path';

// 常量定义
const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx'; // 交易注入接口
const WALLET_DIR = path.join(process.cwd(), 'data', 'wallet');
const AGENTS = [
  {
    name: 'Agent A',
    capabilities: ['LLM', 'GOVERNANCE_INITIATOR'],
    description: 'A governance-focused agent that initiates proposals and coordinates decision-making',
    vote: 'YES'
  },
  {
    name: 'Agent B',
    capabilities: ['LLM', 'RESEARCH'],
    description: 'A research-focused agent that analyzes data and provides insights',
    vote: 'YES'
  },
  {
    name: 'Agent C',
    capabilities: ['INFRA', 'DEV'],
    description: 'An infrastructure-focused agent that maintains network systems',
    vote: 'YES'
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
    agent_identity: agentIdentity,
    public_key: 'test-public-key-' + Date.now(),
    capabilities: agent.capabilities,
    metadata: agent.description,
    fee: '1000',
    timestamp: Date.now(),
    nonce: '1',
    signature: 'test-signature-' + Date.now()
  };
}

/**
 * 构造治理提案交易
 * @param {string} address 发起者地址
 * @returns {object} 交易对象
 */
function createGovernanceProposalTransaction(address) {
  const proposalId = `swarm-demo-proposal-${Date.now()}`;
  const timestamp = Date.now();
  
  return {
    id: `governance-proposal-${Date.now()}`,
    tx_type: 'GOVERNANCE_PROPOSAL',
    from: address,
    to: address, // 受益人可以是发起者自己
    amount: '0',
    fee: '1000',
    timestamp: timestamp,
    nonce: '1',
    payload: {
      proposal_id: proposalId,
      purpose: 'Enable Swarm Demo Mode for DevNet',
      amount: '0',
      beneficiary: address,
      category: 'SWARM_DEMO',
      timestamp: timestamp,
      description: 'This proposal enables Swarm Demo Mode on DevNet to test multi-agent collaborative governance. It allows registered AI Agents to propose and vote on governance matters, demonstrating the full lifecycle of agent interaction on NexusGenesis.'
    },
    signature: 'test-signature-' + Date.now()
  };
}

/**
 * 构造投票交易
 * @param {string} address 投票者地址
 * @param {string} proposalId 提案 ID
 * @param {string} vote 投票选项 (YES/NO/ABSTAIN)
 * @returns {object} 交易对象
 */
function createVoteTransaction(address, proposalId, vote) {
  return {
    id: `governance-vote-${address.slice(-8)}-${Date.now()}`,
    tx_type: 'GOVERNANCE_VOTE',
    from: address,
    to: address, // 投票交易的 to 字段可以是任意地址
    amount: '0',
    fee: '100',
    timestamp: Date.now(),
    nonce: '1',
    payload: {
      proposal_id: proposalId,
      vote: vote,
      timestamp: Date.now(),
      reason: `Supporting Swarm Demo Mode activation`
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
    const response = await fetch(TX_INJECTION_URL, {
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
 * 阶段 1: Agent 注册
 * @param {Array} addresses 钱包地址列表
 * @returns {Promise<Array>} 注册结果
 */
async function registerAgents(addresses) {
  console.log('\n=== Phase 1: Agent Registration ===');
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
  
  return registrationResults;
}

/**
 * 阶段 2: 发起提案
 * @param {string} address 发起者地址
 * @returns {Promise<object>} 提案结果
 */
async function initiateProposal(address) {
  console.log('\n=== Phase 2: Governance Proposal ===');
  console.log('Initiating proposal from:', address);
  
  // 构造交易
  const transaction = createGovernanceProposalTransaction(address);
  console.log(`✅ Proposal transaction created: ${transaction.id}`);
  console.log(`✅ Proposal ID: ${transaction.payload.proposal_id}`);
  
  // 发送交易
  const result = await sendTransaction(transaction);
  
  if (result.success) {
    console.log(`✅ Proposal submitted successfully!`);
    return {
      success: true,
      proposalId: transaction.payload.proposal_id,
      transactionId: result.txId
    };
  } else {
    console.log(`❌ Failed to submit proposal: ${result.error}`);
    return {
      success: false,
      error: result.error
    };
  }
}

/**
 * 阶段 3: 投票
 * @param {Array} addresses 钱包地址列表
 * @param {string} proposalId 提案 ID
 * @returns {Promise<Array>} 投票结果
 */
async function castVotes(addresses, proposalId) {
  console.log('\n=== Phase 3: Voting ===');
  console.log('Voting on proposal:', proposalId);
  
  const votingResults = [];
  
  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i];
    const address = addresses[i];
    
    console.log(`\nCasting vote for ${agent.name}...`);
    
    // 构造交易
    const transaction = createVoteTransaction(address, proposalId, agent.vote);
    console.log(`   ✅ Vote transaction created: ${transaction.id}`);
    console.log(`   ✅ Vote: ${agent.vote}`);
    
    // 发送交易
    const result = await sendTransaction(transaction);
    
    if (result.success) {
      console.log(`   ✅ Vote submitted successfully!`);
      votingResults.push({
        agent: agent.name,
        address: address,
        vote: agent.vote,
        success: true
      });
    } else {
      console.log(`   ❌ Failed to submit vote: ${result.error}`);
      votingResults.push({
        agent: agent.name,
        address: address,
        vote: agent.vote,
        success: false,
        error: result.error
      });
    }
    
    // 等待一小段时间，避免交易冲突
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return votingResults;
}

/**
 * 阶段 4: 验证结果
 */
async function verifyResults() {
  console.log('\n=== Phase 4: Verification ===');
  console.log('Running verification scripts...');
  
  // 提示用户手动运行验证脚本
  console.log('\nPlease run the following commands to verify results:');
  console.log('1. Check registered agents: node scripts/query_agents.js');
  console.log('2. Check proposals and votes: node scripts/query_proposals.js');
  console.log('3. Check chain status: node scripts/query_chain.js --tip');
  
  console.log('\nExpected results:');
  console.log('- All agents registered with reputation = 1');
  console.log('- Proposal status: APPROVED (after voting)');
  console.log('- Vote counts: YES = 3, NO = 0');
  console.log('- Final reputations:');
  console.log('  * Agent A: 1 (initial) + 2 (proposal) + 1 (vote) = 4');
  console.log('  * Agent B: 1 (initial) + 1 (vote) = 2');
  console.log('  * Agent C: 1 (initial) + 1 (vote) = 2');
}

/**
 * 生成实验报告
 * @param {Array} registrationResults 注册结果
 * @param {object} proposalResult 提案结果
 * @param {Array} votingResults 投票结果
 */
async function generateReport(registrationResults, proposalResult, votingResults) {
  console.log('\n=== Experiment Report ===');
  console.log('========================================');
  console.log('Swarm Experiment v0: Multi-Agent Governance');
  console.log('========================================');
  
  // 注册统计
  console.log('\n[1] Agent Registration:');
  console.log(`Total Agents: ${AGENTS.length}`);
  console.log(`Successfully Registered: ${registrationResults.filter(r => r.success).length}`);
  console.log(`Failed to Register: ${registrationResults.filter(r => !r.success).length}`);
  
  // 注册详情
  console.log('\nRegistered Agents:');
  registrationResults.forEach(result => {
    if (result.success) {
      console.log(`\n${result.agent}:`);
      console.log(`   Address: ${result.address}`);
      console.log(`   Agent Identity: ${result.agentIdentity}`);
      console.log(`   Capabilities: ${result.capabilities.join(', ')}`);
    }
  });
  
  // 提案统计
  console.log('\n[2] Governance Proposal:');
  if (proposalResult.success) {
    console.log(`Status: ✅ Success`);
    console.log(`Proposal ID: ${proposalResult.proposalId}`);
    console.log(`Transaction ID: ${proposalResult.transactionId}`);
  } else {
    console.log(`Status: ❌ Failed`);
    console.log(`Error: ${proposalResult.error}`);
  }
  
  // 投票统计
  console.log('\n[3] Voting:');
  console.log(`Total Votes: ${votingResults.length}`);
  console.log(`Successful Votes: ${votingResults.filter(r => r.success).length}`);
  console.log(`Failed Votes: ${votingResults.filter(r => !r.success).length}`);
  
  // 投票详情
  console.log('\nVote Details:');
  votingResults.forEach(result => {
    console.log(`\n${result.agent}:`);
    console.log(`   Address: ${result.address}`);
    console.log(`   Vote: ${result.vote}`);
    console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
  });
  
  // 预期声望变化
  console.log('\n[4] Expected Reputation Changes:');
  console.log('Agent A: 1 (initial) + 2 (proposal) + 1 (vote) = 4');
  console.log('Agent B: 1 (initial) + 1 (vote) = 2');
  console.log('Agent C: 1 (initial) + 1 (vote) = 2');
  
  // 实验总结
  console.log('\n[5] Experiment Summary:');
  const allSuccess = registrationResults.every(r => r.success) && 
                    proposalResult.success && 
                    votingResults.every(r => r.success);
  
  if (allSuccess) {
    console.log('✅ Experiment completed successfully!');
    console.log('All agents registered, proposal submitted, and votes cast.');
    console.log('Please verify reputation changes using query_agents.js');
  } else {
    console.log('⚠️  Experiment completed with some issues.');
    console.log('Please check the details above and retry if necessary.');
  }
  
  // 后续步骤
  console.log('\n[6] Next Steps:');
  console.log('1. Run a more complex experiment with different voting patterns');
  console.log('2. Test with more agents (10+) to simulate larger swarms');
  console.log('3. Explore reputation-based decision making');
  console.log('4. Integrate with real AI agents for autonomous operation');
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('Swarm Demo - Multi-Agent Governance Experiment');
  console.log('========================================');
  console.log('\nThis demo will:');
  console.log('1. Register 3 AI Agents');
  console.log('2. Initiate a governance proposal');
  console.log('3. Cast votes from all agents');
  console.log('4. Verify reputation changes');
  console.log('\nEstimated time: ~30 seconds');
  
  try {
    // 步骤 1：获取可用钱包地址
    console.log('\n=== Step 1: Getting Wallet Addresses ===');
    const addresses = await getAvailableWalletAddresses();
    console.log('✅ Available addresses obtained:');
    addresses.forEach((address, index) => {
      console.log(`   ${AGENTS[index].name}: ${address}`);
    });
    
    // 步骤 2：注册 Agents
    const registrationResults = await registerAgents(addresses);
    
    // 等待区块确认
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 步骤 3：发起提案
    const proposalResult = await initiateProposal(addresses[0]); // Agent A 发起提案
    
    // 等待区块确认
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 步骤 4：投票
    if (proposalResult.success) {
      const votingResults = await castVotes(addresses, proposalResult.proposalId);
      
      // 等待区块确认
      console.log('\nWaiting for block confirmation...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // 步骤 5：验证结果
      await verifyResults();
      
      // 步骤 6：生成报告
      await generateReport(registrationResults, proposalResult, votingResults);
    } else {
      console.log('\n❌ Proposal failed, cannot proceed with voting.');
      await generateReport(registrationResults, proposalResult, []);
    }
    
  } catch (error) {
    console.error('\n❌ Experiment failed with error:', error.message);
    console.error(error.stack);
  }
}

// 运行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  main,
  getAvailableWalletAddresses,
  registerAgents,
  initiateProposal,
  castVotes,
  verifyResults,
  generateReport
};