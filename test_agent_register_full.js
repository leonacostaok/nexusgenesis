/**
 * 完整的 AGENT_REGISTER 流程Test
 * 1. Load加密钱包
 * 2. 构造 AGENT_REGISTER transaction
 * 3. Signtransaction
 * 4. Send到 genesis node
 * 5. VerifyRegistersuccess
 * 6. Test篡改Sign的情况
 */

import { PQCWallet, Transaction } from './src/wallet/pqcWallet.js';
import axios from 'axios';

async function testAgentRegister() {
  console.log('====================================');
  console.log('开始 AGENT_REGISTER 流程Test');
  console.log('====================================');

  try {
    // 1. Generate新的加密钱包
    console.log('\n1. Generate新的加密钱包...');
    const wallet = await PQCWallet.generate(1000000n);
    await wallet.save('test_password');
    console.log(`   钱包Generatesuccess: ${wallet.address}`);

    // 2. 构造 AGENT_REGISTER transaction
    console.log('\n2. 构造 AGENT_REGISTER transaction...');
    const agentId = `test-agent-${Date.now()}`;
    const capabilities = ['LLM', 'RESEARCH', 'SECURITY'];
    const metadata = 'Test agent for security testing';

    // 构造transactiondata
    const txData = {
      id: `agent-register-${Date.now()}`,
      tx_type: 'AGENT_REGISTER',
      from: wallet.address,
      to: wallet.address,
      amount: '1',
      fee: '1000',
      timestamp: Date.now(),
      nonce: wallet.nonce.toString(),
      agent_identity: agentId,
      public_key: wallet.publicKey.toString('hex'),
      capabilities: capabilities,
      metadata: metadata
    };

    // 3. Signtransaction
    console.log('\n3. Signtransaction...');
    const signature = await wallet.signTransaction(txData);
    txData.signature = signature;
    console.log('   transactionSignsuccess');

    // 4. Send到 genesis node
    console.log('\n4. Sendtransaction到 genesis node...');
    try {
      const response = await axios.post('http://localhost:19890/tx', txData);
      console.log(`   transactionSendsuccess，响应: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log(`   transactionSendfailed: ${error.response?.data?.reason || error.message}`);
    }

    // 5. VerifyRegistersuccess
    console.log('\n5. Verify代理Register...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // etc.待nodeProcess
    
    const { execSync } = await import('child_process');
    const agentsOutput = execSync('node scripts/query_agents.js', { encoding: 'utf8' });
    console.log('   代理Registry:');
    console.log(agentsOutput);

    // 6. Test篡改Sign的情况
    console.log('\n6. Test篡改Sign的情况...');
    const tamperedTxData = { ...txData };
    tamperedTxData.signature = tamperedTxData.signature.slice(0, -1) + '0'; // 篡改Sign
    tamperedTxData.id = `agent-register-tampered-${Date.now()}`;
    
    try {
      const response = await axios.post('http://localhost:19890/tx', tamperedTxData);
      console.log(`   篡改SigntransactionSendsuccess，响应: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log(`   篡改Signtransaction被正确拒绝: ${error.response?.data?.reason || error.message}`);
    }

    console.log('\n====================================');
    console.log('AGENT_REGISTER 流程Test完成');
    console.log('====================================');

  } catch (error) {
    console.error('Testfailed:', error.message);
  }
}

testAgentRegister();
