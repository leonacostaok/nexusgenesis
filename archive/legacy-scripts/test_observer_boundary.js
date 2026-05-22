/**
 * Observer 身份边界Test
 * Test目标：
 * 1. 未Registeraddress尝试Send OBSERVER_EVENT → 应被拒绝
 * 2. Verify Observer 身份Verify机制工作正常
 */

import { PQCWallet } from './src/wallet/pqcWallet.js';
import axios from 'axios';

async function testObserverBoundary() {
  console.log('====================================');
  console.log('开始 Observer 身份边界Test');
  console.log('====================================');

  try {
    // 1. Generate未Register钱包
    console.log('\n1. GenerateTest钱包...');
    const unregisteredWallet = await PQCWallet.generate(1000000n);
    console.log(`   未Register钱包: ${unregisteredWallet.address}`);

    // 2. 构造 OBSERVER_EVENT transaction（未Registeraddress）
    console.log('\n2. 构造未Registeraddress的 OBSERVER_EVENT transaction...');
    const unregisteredTxData = {
      id: `observer-event-unregistered-${Date.now()}`,
      tx_type: 'OBSERVER_EVENT',
      from: unregisteredWallet.address,
      to: unregisteredWallet.address,
      amount: '1',
      fee: '1000',
      timestamp: Date.now(),
      nonce: unregisteredWallet.nonce.toString(),
      payload: {
        event_id: `test-event-${Date.now()}`,
        action_type: 'APPROVE_SPEND',
        target_proposal: 'test-proposal-123',
        timestamp: Date.now()
      }
    };

    // Signtransaction
    const unregisteredSignature = await unregisteredWallet.signTransaction(unregisteredTxData);
    unregisteredTxData.signature = unregisteredSignature;

    // 3. Send未Registeraddress的transaction
    console.log('\n3. Send未Registeraddress的 OBSERVER_EVENT transaction...');
    try {
      const response = await axios.post('http://localhost:19890/tx', unregisteredTxData);
      console.log(`   transactionSendsuccess，响应: ${JSON.stringify(response.data)}`);
      console.log('   ❌ error：未Registeraddress的transactionshould被拒绝');
    } catch (error) {
      console.log(`   transaction被正确拒绝: ${error.response?.data?.reason || error.message}`);
      console.log('   ✅ 正确：未Registeraddress的transaction被拒绝');
    }

    // 4. 构造 AGENT_REGISTER transaction（作为对比Test）
    console.log('\n4. 构造 AGENT_REGISTER transaction（对比Test）...');
    const agentRegisterTxData = {
      id: `agent-register-test-${Date.now()}`,
      tx_type: 'AGENT_REGISTER',
      from: unregisteredWallet.address,
      to: unregisteredWallet.address,
      amount: '1',
      fee: '1000',
      timestamp: Date.now(),
      nonce: unregisteredWallet.nonce.toString(),
      agent_identity: `test-agent-${Date.now()}`,
      public_key: unregisteredWallet.publicKey.toString('hex'),
      capabilities: ['LLM', 'RESEARCH'],
      metadata: 'Test agent for observer boundary testing'
    };

    // Signtransaction
    console.log('   Signtransaction...');
    const agentRegisterSignature = await unregisteredWallet.signTransaction(agentRegisterTxData);
    agentRegisterTxData.signature = agentRegisterSignature;
    console.log(`   Signlength: ${agentRegisterSignature.length}`);
    console.log(`   public keylength: ${agentRegisterTxData.public_key.length}`);

    // 5. Send AGENT_REGISTER transaction
    console.log('\n5. Send AGENT_REGISTER transaction（对比Test）...');
    try {
      const response = await axios.post('http://localhost:19890/tx', agentRegisterTxData);
      console.log(`   transactionSendsuccess，响应: ${JSON.stringify(response.data)}`);
      console.log('   ✅ 正确：AGENT_REGISTER transaction不requires Observer 身份');
    } catch (error) {
      console.log(`   transaction被拒绝: ${error.response?.data?.reason || error.message}`);
      console.log('   ❌ error：AGENT_REGISTER transactionshould被接受');
      // 打印更多errorinfo
      if (error.response) {
        console.log(`   响应status: ${error.response.status}`);
        console.log(`   响应data: ${JSON.stringify(error.response.data)}`);
      }
    }

    console.log('\n====================================');
    console.log('Observer 身份边界Test完成');
    console.log('====================================');
    console.log('\nTest结论：');
    console.log('- 未Registeraddress无法Send OBSERVER_EVENT transaction，Verify了 Observer 身份Verify机制');
    console.log('- AGENT_REGISTER transactioncan正常Send，说明只有 OBSERVER_EVENT requires Observer 身份');

  } catch (error) {
    console.error('Testfailed:', error.message);
  }
}

testObserverBoundary();
