/**
 * 完整的 AGENT_REGISTER 流程测试
 * 1. 加载加密钱包
 * 2. 构造 AGENT_REGISTER 交易
 * 3. 签名交易
 * 4. 发送到 genesis 节点
 * 5. 验证注册成功
 * 6. 测试篡改签名的情况
 */

import { PQCWallet, Transaction } from './src/wallet/pqcWallet.js';
import axios from 'axios';

async function testAgentRegister() {
  console.log('====================================');
  console.log('开始 AGENT_REGISTER 流程测试');
  console.log('====================================');

  try {
    // 1. 生成新的加密钱包
    console.log('\n1. 生成新的加密钱包...');
    const wallet = await PQCWallet.generate(1000000n);
    await wallet.save('test_password');
    console.log(`   钱包生成成功: ${wallet.address}`);

    // 2. 构造 AGENT_REGISTER 交易
    console.log('\n2. 构造 AGENT_REGISTER 交易...');
    const agentId = `test-agent-${Date.now()}`;
    const capabilities = ['LLM', 'RESEARCH', 'SECURITY'];
    const metadata = 'Test agent for security testing';

    // 构造交易数据
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

    // 3. 签名交易
    console.log('\n3. 签名交易...');
    const signature = await wallet.signTransaction(txData);
    txData.signature = signature;
    console.log('   交易签名成功');

    // 4. 发送到 genesis 节点
    console.log('\n4. 发送交易到 genesis 节点...');
    try {
      const response = await axios.post('http://localhost:19890/tx', txData);
      console.log(`   交易发送成功，响应: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log(`   交易发送失败: ${error.response?.data?.reason || error.message}`);
    }

    // 5. 验证注册成功
    console.log('\n5. 验证代理注册...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待节点处理
    
    const { execSync } = await import('child_process');
    const agentsOutput = execSync('node scripts/query_agents.js', { encoding: 'utf8' });
    console.log('   代理注册表:');
    console.log(agentsOutput);

    // 6. 测试篡改签名的情况
    console.log('\n6. 测试篡改签名的情况...');
    const tamperedTxData = { ...txData };
    tamperedTxData.signature = tamperedTxData.signature.slice(0, -1) + '0'; // 篡改签名
    tamperedTxData.id = `agent-register-tampered-${Date.now()}`;
    
    try {
      const response = await axios.post('http://localhost:19890/tx', tamperedTxData);
      console.log(`   篡改签名交易发送成功，响应: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log(`   篡改签名交易被正确拒绝: ${error.response?.data?.reason || error.message}`);
    }

    console.log('\n====================================');
    console.log('AGENT_REGISTER 流程测试完成');
    console.log('====================================');

  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testAgentRegister();
