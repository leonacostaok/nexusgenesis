/**
 * SignVerify调试脚本
 * 目的：比较 PQCWallet.signTransaction 和 genesisNode.js 中的Signdata构造
 */

import { PQCWallet } from './src/wallet/pqcWallet.js';

async function debugSignature() {
  console.log('====================================');
  console.log('开始SignVerify调试');
  console.log('====================================');

  try {
    // GenerateTest钱包
    console.log('\n1. GenerateTest钱包...');
    const wallet = await PQCWallet.generate(1000000n);
    console.log(`   钱包address: ${wallet.address}`);

    // 构造 AGENT_REGISTER transactiondata
    console.log('\n2. 构造 AGENT_REGISTER transactiondata...');
    const txData = {
      id: `agent-register-test-${Date.now()}`,
      tx_type: 'AGENT_REGISTER',
      from: wallet.address,
      to: wallet.address,
      amount: '1',
      fee: '1000',
      timestamp: Date.now(),
      nonce: wallet.nonce.toString(),
      agent_identity: `test-agent-${Date.now()}`,
      public_key: wallet.publicKey.toString('hex'),
      capabilities: ['LLM', 'RESEARCH'],
      metadata: 'Test agent for signature debugging'
    };

    // 使用 PQCWallet.signTransaction Sign
    console.log('\n3. 使用 PQCWallet.signTransaction Sign...');
    const pqcSignature = await wallet.signTransaction(txData);
    console.log(`   PQC Signlength: ${pqcSignature.length}`);
    console.log(`   PQC Sign前 100 字符: ${pqcSignature.slice(0, 100)}...`);

    // Simulation genesisNode.js 中的Signdata构造
    console.log('\n4. Simulation genesisNode.js 中的Signdata构造...');
    const genesisTxData = {
      from: txData.from,
      to: txData.to,
      amount: txData.amount,
      fee: txData.fee,
      tx_type: txData.tx_type,
      payload: txData.payload,
      timestamp: txData.timestamp,
      nonce: txData.nonce,
      agent_identity: txData.agent_identity,
      public_key: txData.public_key,
      capabilities: txData.capabilities,
      metadata: txData.metadata
    };

    // 使用与 PQCWallet 相同的 canonicalize function
    function canonicalize(obj) {
      if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
      }
      
      if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalize).join(',') + ']';
      }
      
      const keys = Object.keys(obj).sort();
      const pairs = keys.map(key => {
        const value = obj[key];
        const valueStr = canonicalize(value);
        return `"${key}":${valueStr}`;
      });
      
      return '{' + pairs.join(',') + '}';
    }

    const canonicalTxData = canonicalize(genesisTxData);
    console.log(`   规范 JSON length: ${canonicalTxData.length}`);
    console.log(`   规范 JSON 前 100 字符: ${canonicalTxData.slice(0, 100)}...`);

    // 直接使用 canonicalTxData Sign
    console.log('\n5. 使用规范 JSON 直接Sign...');
    const directSignature = await wallet.sign(canonicalTxData);
    console.log(`   直接Signlength: ${directSignature.length}`);
    console.log(`   直接Sign前 100 字符: ${directSignature.slice(0, 100)}...`);

    // 比较两个Sign
    console.log('\n6. 比较两个Sign...');
    console.log(`   Sign是否相同: ${pqcSignature === directSignature}`);
    console.log(`   Signlength是否相同: ${pqcSignature.length === directSignature.length}`);

    // VerifySign
    console.log('\n7. VerifySign...');
    const pqcVerifyResult = await PQCWallet.verify(canonicalTxData, pqcSignature, wallet.publicKey);
    const directVerifyResult = await PQCWallet.verify(canonicalTxData, directSignature, wallet.publicKey);
    console.log(`   PQC Signverification result: ${pqcVerifyResult}`);
    console.log(`   直接Signverification result: ${directVerifyResult}`);

    console.log('\n====================================');
    console.log('SignVerify调试完成');
    console.log('====================================');

  } catch (error) {
    console.error('调试failed:', error.message);
    console.error(error.stack);
  }
}

debugSignature();
