import { PQCWallet } from './src/wallet/pqcWallet.js';

async function testWalletSecurityFeatures() {
  console.log('Testing Wallet Security Features...');
  
  try {
    // 1. 测试 BIP39 助记词功能
    console.log('\n1. Testing BIP39 Mnemonic Features...');
    const wallet1 = await PQCWallet.generate();
    console.log('   Wallet generated:', wallet1.address);
    
    // 导出助记词
    const mnemonic = wallet1.toMnemonic();
    console.log('   Mnemonic phrase:', mnemonic);
    
    // 从助记词恢复钱包
    const wallet2 = await PQCWallet.fromMnemonic(mnemonic);
    console.log('   Wallet restored from mnemonic:', wallet2.address);
    
    // 验证地址匹配
    if (wallet1.address === wallet2.address) {
      console.log('   ✅ Mnemonic recovery successful - addresses match');
    } else {
      console.log('   ❌ Mnemonic recovery failed - addresses do not match');
    }
    
    // 2. 测试私钥完整性验证
    console.log('\n2. Testing Private Key Integrity Verification...');
    const integrityResult = wallet1.verifyPrivateKeyIntegrity();
    console.log('   Private key integrity:', integrityResult ? '✅ Valid' : '❌ Invalid');
    
    // 3. 测试多重签名钱包
    console.log('\n3. Testing Multi-Sig Wallet...');
    const wallet3 = await PQCWallet.generate();
    const wallet4 = await PQCWallet.generate();
    const wallet5 = await PQCWallet.generate();
    
    const publicKeys = [
      wallet1.publicKey.toString('hex'),
      wallet3.publicKey.toString('hex'),
      wallet4.publicKey.toString('hex'),
      wallet5.publicKey.toString('hex')
    ];
    
    // 创建 2-of-4 多重签名钱包
    const multiSigWallet = new PQCWallet.MultiSigWallet(2, publicKeys);
    console.log('   Multi-sig wallet address:', multiSigWallet.address);
    console.log('   Required signatures:', multiSigWallet.requiredSignatures);
    console.log('   Total signers:', multiSigWallet.publicKeys.length);
    
    // 测试多重签名验证
    const txData = {
      from: multiSigWallet.address,
      to: 'ng1ExampleAddress',
      amount: '100',
      fee: '1',
      memo: 'test multi-sig transaction',
      timestamp: Date.now(),
      nonce: '0'
    };
    
    // 生成两个签名
    const signature1 = await wallet1.signTransaction(txData);
    const signature2 = await wallet3.signTransaction(txData);
    
    // 验证签名
    const verificationResult = await multiSigWallet.verifyMultiSignature(txData, [signature1, signature2]);
    console.log('   Multi-signature verification:', verificationResult ? '✅ Valid' : '❌ Invalid');
    
    console.log('\n✅ All wallet security features tested successfully!');
    
  } catch (error) {
    console.error('❌ Error testing wallet security features:', error.message);
    console.error(error.stack);
  }
}

testWalletSecurityFeatures();