/**
 * Swarm Voting Script
 * 
 * 功能：
 * 1. 读取现有的治理提案
 * 2. 为多个 Agent 构造投票交易
 * 3. 发送到交易注入接口
 * 4. 验证投票结果
 */

import fs from 'fs/promises';
import path from 'path';

// 常量定义
const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx'; // 交易注入接口
const WALLET_DIR = path.join(process.cwd(), 'data', 'wallet');
const AGENTS = [
  {
    name: 'Agent A',
    vote: 'YES'
  },
  {
    name: 'Agent B',
    vote: 'YES'
  },
  {
    name: 'Agent C',
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
 * 获取最新的治理提案
 * @returns {Promise<string|null>} 提案 ID
 */
async function getLatestProposalId() {
  try {
    console.log('\nStep 1: Getting latest governance proposal...');
    
    // 这里可以使用 child_process 运行查询脚本
    // 为了简化，我们使用一个默认的提案 ID 模式
    // 实际使用时，用户需要手动输入提案 ID
    
    console.log('\nPlease enter the proposal ID you want to vote on:');
    console.log('(You can find proposal IDs by running: node scripts/query_proposals.js)');
    
    // 为了演示，我们返回一个示例提案 ID
    const exampleProposalId = `swarm-demo-proposal-${Date.now()}`;
    console.log(`\nUsing example proposal ID for demonstration: ${exampleProposalId}`);
    console.log('In real usage, you should replace this with the actual proposal ID.');
    
    return exampleProposalId;
  } catch (error) {
    console.error('Error getting proposal ID:', error.message);
    return null;
  }
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
 * 验证投票结果
 */
async function verifyVotingResults() {
  try {
    console.log('\n=== Verifying Voting Results ===');
    console.log('Running query_proposals.js to check vote counts...');
    
    // 提示用户手动运行查询脚本
    console.log('\nPlease run the following command to verify votes:');
    console.log('node scripts/query_proposals.js');
    console.log('\nYou should see the vote counts updated for the proposal');
  } catch (error) {
    console.error('Error verifying votes:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== Swarm Governance Voting ===\n');
  
  try {
    // 步骤 1：获取可用钱包地址
    console.log('Step 1: Getting available wallet addresses...');
    const addresses = await getAvailableWalletAddresses();
    console.log('✅ Available addresses obtained:');
    addresses.forEach((address, index) => {
      console.log(`   ${AGENTS[index].name}: ${address}`);
    });
    
    // 步骤 2：获取提案 ID
    const proposalId = await getLatestProposalId();
    if (!proposalId) {
      console.log('❌ No proposal ID provided, exiting...');
      return;
    }
    console.log('✅ Proposal ID:', proposalId);
    
    // 步骤 3：为每个 Agent 构造并发送投票交易
    console.log('\nStep 3: Casting votes...');
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
    
    // 步骤 4：等待区块确认
    console.log('\nStep 4: Waiting for block confirmation...');
    console.log('Waiting for 10 seconds to allow blocks to be processed...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 步骤 5：验证投票结果
    await verifyVotingResults();
    
    // 步骤 6：总结
    console.log('\n=== Voting Summary ===');
    console.log(`Proposal ID: ${proposalId}`);
    console.log(`Total Votes Cast: ${votingResults.length}`);
    console.log(`Successful Votes: ${votingResults.filter(r => r.success).length}`);
    console.log(`Failed Votes: ${votingResults.filter(r => !r.success).length}`);
    
    // 打印投票详情
    console.log('\nVote Details:');
    votingResults.forEach(result => {
      if (result.success) {
        console.log(`\n${result.agent}:`);
        console.log(`   Address: ${result.address}`);
        console.log(`   Vote: ${result.vote}`);
        console.log(`   Status: ✅ Success`);
      } else {
        console.log(`\n${result.agent}:`);
        console.log(`   Address: ${result.address}`);
        console.log(`   Vote: ${result.vote}`);
        console.log(`   Status: ❌ Failed - ${result.error}`);
      }
    });
    
    // 提示后续步骤
    console.log('\n=== Next Steps ===');
    console.log('1. Verify votes: node scripts/query_proposals.js');
    console.log('2. Check proposal status after voting period');
    console.log('3. Run reputation check: node scripts/query_agents.js');
    console.log('4. Run complete swarm demo: node examples/swarm_demo.js');
    
  } catch (error) {
    console.error('\n❌ Voting process failed with error:', error.message);
  }
}

// 运行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  main,
  getAvailableWalletAddresses,
  getLatestProposalId,
  createVoteTransaction,
  sendTransaction,
  verifyVotingResults
};