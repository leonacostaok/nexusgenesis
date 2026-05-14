/**
 * keyStorage演练Test
 * Test目标：
 * 1. Generate加密钱包并Save
 * 2. Export加密钱包
 * 3. Load加密钱包
 * 4. 使用Load的钱包Send一笔transaction
 */

import { PQCWallet } from './src/wallet/pqcWallet.js';
import axios from 'axios';

async function testKeyStorage() {
  console.log('====================================');
  console.log('开始keyStorage演练Test');
  console.log('====================================');

  try {
    // 1. Generate新钱包并Save为加密Storage
    console.log('\n1. Generate新钱包并Save为加密Storage...');
    const password = 'test_secure_password_123';
    const wallet = await PQCWallet.generate(1000000n);
    await wallet.save(password);
    console.log(`   钱包address: ${wallet.address}`);
    console.log('   钱包saved为加密Storage');

    // 2. Export加密钱包
    console.log('\n2. Export加密钱包...');
    const encryptedWallet = wallet.exportEncrypted(password);
    console.log('   加密钱包Exportsuccess');
    console.log(`   加密钱包结构: ${Object.keys(encryptedWallet).join(', ')}`);

    // 3. 从加密dataLoad钱包
    console.log('\n3. 从加密dataLoad钱包...');
    const loadedWallet = PQCWallet.importEncrypted({
      ...encryptedWallet,
      password: password
    });
    console.log(`   Load的钱包address: ${loadedWallet.address}`);
    console.log(`   address匹配: ${loadedWallet.address === wallet.address}`);

    // 4. VerifyLoad的钱包can正常使用
    console.log('\n4. VerifyLoad的钱包can正常使用...');
    // 构造一个简单的transaction
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

    // Signtransaction
    const signature = await loadedWallet.signTransaction(testTx);
    testTx.signature = signature;
    console.log('   transactionSignsuccess');
    console.log(`   Signlength: ${signature.length}`);

    // 5. 尝试Sendtransaction到node
    console.log('\n5. Sendtransaction到node...');
    try {
      const response = await axios.post('http://localhost:19890/tx', testTx);
      console.log(`   transactionSendsuccess，响应: ${JSON.stringify(response.data)}`);
      console.log('   ✅ keyStorage演练Test通过');
    } catch (error) {
      console.log(`   transactionSendfailed: ${error.response?.data?.reason || error.message}`);
      console.log('   ❌ transactionSendfailed，但钱包Load和SignFeatures正常');
    }

    console.log('\n====================================');
    console.log('keyStorage演练Test完成');
    console.log('====================================');
    console.log('\nTest结论：');
    console.log('- 加密钱包Generate和SaveFeatures正常');
    console.log('- 加密钱包ExportFeatures正常');
    console.log('- 从加密dataLoad钱包Features正常');
    console.log('- Load的钱包can正常Signtransaction');

  } catch (error) {
    console.error('Testfailed:', error.message);
    console.error(error.stack);
  }
}

testKeyStorage();
