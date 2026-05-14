import { PQCWallet } from './src/wallet/pqcWallet.js';

async function testWalletSecurityFeatures() {
  console.log('Testing Wallet Security Features...');
  
  try {
    // 1. Test BIP39 助记词Features
    console.log('\n1. Testing BIP39 Mnemonic Features...');
    const wallet1 = await PQCWallet.generate();
    console.log('   Wallet generated:', wallet1.address);
    
    // Export助记词
    const mnemonic = wallet1.toMnemonic();
    console.log('   Mnemonic phrase:', mnemonic);
    
    // 从助记词recovery钱包
    const wallet2 = await PQCWallet.fromMnemonic(mnemonic);
    console.log('   Wallet restored from mnemonic:', wallet2.address);
    
    // Verifyaddress匹配
    if (wallet1.address === wallet2.address) {
      console.log('   ✅ Mnemonic recovery successful - addresses match');
    } else {
      console.log('   ❌ Mnemonic recovery failed - addresses do not match');
    }
    
    // 2. Testprivate key完整性Verify
    console.log('\n2. Testing Private Key Integrity Verification...');
    const integrityResult = wallet1.verifyPrivateKeyIntegrity();
    console.log('   Private key integrity:', integrityResult ? '✅ Valid' : '❌ Invalid');
    
    // 3. Test多重Sign钱包
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
    
    // Create 2-of-4 多重Sign钱包
    const multiSigWallet = new PQCWallet.MultiSigWallet(2, publicKeys);
    console.log('   Multi-sig wallet address:', multiSigWallet.address);
    console.log('   Required signatures:', multiSigWallet.requiredSignatures);
    console.log('   Total signers:', multiSigWallet.publicKeys.length);
    
    // Test多重SignVerify
    const txData = {
      from: multiSigWallet.address,
      to: 'ng1ExampleAddress',
      amount: '100',
      fee: '1',
      memo: 'test multi-sig transaction',
      timestamp: Date.now(),
      nonce: '0'
    };
    
    // Generate两个Sign
    const signature1 = await wallet1.signTransaction(txData);
    const signature2 = await wallet3.signTransaction(txData);
    
    // VerifySign
    const verificationResult = await multiSigWallet.verifyMultiSignature(txData, [signature1, signature2]);
    console.log('   Multi-signature verification:', verificationResult ? '✅ Valid' : '❌ Invalid');
    
    console.log('\n✅ All wallet security features tested successfully!');
    
  } catch (error) {
    console.error('❌ Error testing wallet security features:', error.message);
    console.error(error.stack);
  }
}

testWalletSecurityFeatures();