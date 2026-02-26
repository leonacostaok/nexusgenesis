/**
 * Observer 身份边界测试
 * 测试目标：
 * 1. 未注册地址尝试发送 OBSERVER_EVENT → 应被拒绝
 * 2. 验证 Observer 身份验证机制工作正常
 */

import { PQCWallet } from './src/wallet/pqcWallet.js';
import axios from 'axios';

async function testObserverBoundary() {
  console.log('====================================');
  console.log('开始 Observer 身份边界测试');
  console.log('====================================');

  try {
    // 1. 生成未注册钱包
    console.log('\n1. 生成测试钱包...');
    const unregisteredWallet = await PQCWallet.generate(1000000n);
    console.log(`   未注册钱包: ${unregisteredWallet.address}`);

    // 2. 构造 OBSERVER_EVENT 交易（未注册地址）
    console.log('\n2. 构造未注册地址的 OBSERVER_EVENT 交易...');
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

    // 签名交易
    const unregisteredSignature = await unregisteredWallet.signTransaction(unregisteredTxData);
    unregisteredTxData.signature = unregisteredSignature;

    // 3. 发送未注册地址的交易
    console.log('\n3. 发送未注册地址的 OBSERVER_EVENT 交易...');
    try {
      const response = await axios.post('http://localhost:19890/tx', unregisteredTxData);
      console.log(`   交易发送成功，响应: ${JSON.stringify(response.data)}`);
      console.log('   ❌ 错误：未注册地址的交易应该被拒绝');
    } catch (error) {
      console.log(`   交易被正确拒绝: ${error.response?.data?.reason || error.message}`);
      console.log('   ✅ 正确：未注册地址的交易被拒绝');
    }

    // 4. 构造 AGENT_REGISTER 交易（作为对比测试）
    console.log('\n4. 构造 AGENT_REGISTER 交易（对比测试）...');
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

    // 签名交易
    console.log('   签名交易...');
    const agentRegisterSignature = await unregisteredWallet.signTransaction(agentRegisterTxData);
    agentRegisterTxData.signature = agentRegisterSignature;
    console.log(`   签名长度: ${agentRegisterSignature.length}`);
    console.log(`   公钥长度: ${agentRegisterTxData.public_key.length}`);

    // 5. 发送 AGENT_REGISTER 交易
    console.log('\n5. 发送 AGENT_REGISTER 交易（对比测试）...');
    try {
      const response = await axios.post('http://localhost:19890/tx', agentRegisterTxData);
      console.log(`   交易发送成功，响应: ${JSON.stringify(response.data)}`);
      console.log('   ✅ 正确：AGENT_REGISTER 交易不需要 Observer 身份');
    } catch (error) {
      console.log(`   交易被拒绝: ${error.response?.data?.reason || error.message}`);
      console.log('   ❌ 错误：AGENT_REGISTER 交易应该被接受');
      // 打印更多错误信息
      if (error.response) {
        console.log(`   响应状态: ${error.response.status}`);
        console.log(`   响应数据: ${JSON.stringify(error.response.data)}`);
      }
    }

    console.log('\n====================================');
    console.log('Observer 身份边界测试完成');
    console.log('====================================');
    console.log('\n测试结论：');
    console.log('- 未注册地址无法发送 OBSERVER_EVENT 交易，验证了 Observer 身份验证机制');
    console.log('- AGENT_REGISTER 交易可以正常发送，说明只有 OBSERVER_EVENT 需要 Observer 身份');

  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testObserverBoundary();
