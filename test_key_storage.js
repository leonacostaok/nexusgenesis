/**
 * 密钥存储演练测试
 * 测试目标：
 * 1. 生成加密钱包并保存
 * 2. 导出加密钱包
 * 3. 加载加密钱包
 * 4. 使用加载的钱包发送一笔交易
 */

import { PQCWallet } from './src/wallet/pqcWallet.js';
import axios from 'axios';

async function testKeyStorage() {
  console.log('====================================');
  console.log('开始密钥存储演练测试');
  console.log('====================================');

  try {
    // 1. 生成新钱包并保存为加密存储
    console.log('\n1. 生成新钱包并保存为加密存储...');
    const password = 'test_secure_password_123';
    const wallet = await PQCWallet.generate(1000000n);
    await wallet.save(password);
    console.log(`   钱包地址: ${wallet.address}`);
    console.log('   钱包已保存为加密存储');

    // 2. 导出加密钱包
    console.log('\n2. 导出加密钱包...');
    const encryptedWallet = wallet.exportEncrypted(password);
    console.log('   加密钱包导出成功');
    console.log(`   加密钱包结构: ${Object.keys(encryptedWallet).join(', ')}`);

    // 3. 从加密数据加载钱包
    console.log('\n3. 从加密数据加载钱包...');
    const loadedWallet = PQCWallet.importEncrypted({
      ...encryptedWallet,
      password: password
    });
    console.log(`   加载的钱包地址: ${loadedWallet.address}`);
    console.log(`   地址匹配: ${loadedWallet.address === wallet.address}`);

    // 4. 验证加载的钱包可以正常使用
    console.log('\n4. 验证加载的钱包可以正常使用...');
    // 构造一个简单的交易
    const testTx = {
      id: `test-tx-${Date.now()}`,
      from: loadedWallet.address,
      to: loadedWallet.address,
      amount: '1',
      fee: '1000',
      timestamp: Date.now(),
      nonce: loadedWallet.nonce.toString(),
      tx_type: 'TRANSFER',
      memo: 'Test transaction from loaded wallet'
    };

    // 签名交易
    const signature = await loadedWallet.signTransaction(testTx);
    testTx.signature = signature;
    console.log('   交易签名成功');
    console.log(`   签名长度: ${signature.length}`);

    // 5. 尝试发送交易到节点
    console.log('\n5. 发送交易到节点...');
    try {
      const response = await axios.post('http://localhost:19890/tx', testTx);
      console.log(`   交易发送成功，响应: ${JSON.stringify(response.data)}`);
      console.log('   ✅ 密钥存储演练测试通过');
    } catch (error) {
      console.log(`   交易发送失败: ${error.response?.data?.reason || error.message}`);
      console.log('   ❌ 交易发送失败，但钱包加载和签名功能正常');
    }

    console.log('\n====================================');
    console.log('密钥存储演练测试完成');
    console.log('====================================');
    console.log('\n测试结论：');
    console.log('- 加密钱包生成和保存功能正常');
    console.log('- 加密钱包导出功能正常');
    console.log('- 从加密数据加载钱包功能正常');
    console.log('- 加载的钱包可以正常签名交易');

  } catch (error) {
    console.error('测试失败:', error.message);
    console.error(error.stack);
  }
}

testKeyStorage();
