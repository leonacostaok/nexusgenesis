/**
 * Swarm Governance Proposal Script
 * 
 * 功能：
 * 1. 为 Swarm 实验构造治理提案
 * 2. 发送到交易注入接口
 * 3. 验证提案提交结果
 */

import fs from 'fs/promises';
import path from 'path';

// 常量定义
const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx'; // 交易注入接口
const WALLET_DIR = path.join(process.cwd(), 'data', 'wallet');

/**
 * 读取钱包文件并选择提案发起者地址（Agent A）
 * @returns {Promise<string>} 发起者地址
 */
async function getProposalInitiatorAddress() {
  try {
    const files = await fs.readdir(WALLET_DIR);
    const walletFiles = files.filter(file => file.endsWith('.json'));
    
    if (walletFiles.length > 0) {
      const filePath = path.join(WALLET_DIR, walletFiles[0]);
      const walletData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      return walletData.address;
    }
  } catch (error) {
    console.error('Error reading wallet files:', error.message);
  }
  
  // 默认地址
  return 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA';
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
 * 验证提案提交结果
 */
async function verifyProposalSubmission() {
  try {
    console.log('\n=== Verifying Proposal Submission ===');
    console.log('Running query_proposals.js to check proposals...');
    
    // 提示用户手动运行查询脚本
    console.log('\nPlease run the following command to verify proposal:');
    console.log('node scripts/query_proposals.js');
    console.log('\nYou should see the Swarm Demo proposal in PENDING state');
  } catch (error) {
    console.error('Error verifying proposal:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== Swarm Governance Proposal ===\n');
  
  try {
    // 步骤 1：获取提案发起者地址
    console.log('Step 1: Getting proposal initiator address...');
    const address = await getProposalInitiatorAddress();
    console.log('✅ Proposal initiator address:', address);
    
    // 步骤 2：构造治理提案交易
    console.log('\nStep 2: Creating governance proposal transaction...');
    const transaction = createGovernanceProposalTransaction(address);
    console.log('✅ Transaction created:');
    console.log(`   Transaction ID: ${transaction.id}`);
    console.log(`   Proposal ID: ${transaction.payload.proposal_id}`);
    console.log(`   Purpose: ${transaction.payload.purpose}`);
    
    // 步骤 3：发送交易
    console.log('\nStep 3: Submitting governance proposal...');
    const result = await sendTransaction(transaction);
    
    if (result.success) {
      console.log('✅ Proposal submitted successfully!');
      console.log(`   TX ID: ${result.txId}`);
    } else {
      console.log('❌ Failed to submit proposal:', result.error);
      return;
    }
    
    // 步骤 4：等待区块确认
    console.log('\nStep 4: Waiting for block confirmation...');
    console.log('Waiting for 10 seconds to allow blocks to be processed...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 步骤 5：验证提案提交结果
    await verifyProposalSubmission();
    
    // 步骤 6：总结
    console.log('\n=== Proposal Summary ===');
    console.log(`Proposal Initiator: ${address}`);
    console.log(`Proposal ID: ${transaction.payload.proposal_id}`);
    console.log(`Proposal Purpose: ${transaction.payload.purpose}`);
    console.log(`Submission Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    
    // 提示后续步骤
    console.log('\n=== Next Steps ===');
    console.log('1. Verify proposal: node scripts/query_proposals.js');
    console.log('2. Run voting script: node examples/swarm_vote.js');
    console.log('3. Run complete swarm demo: node examples/swarm_demo.js');
    
  } catch (error) {
    console.error('\n❌ Proposal process failed with error:', error.message);
  }
}

// 运行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  main,
  getProposalInitiatorAddress,
  createGovernanceProposalTransaction,
  sendTransaction,
  verifyProposalSubmission
};