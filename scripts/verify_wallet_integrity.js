#!/usr/bin/env node
/**
 * NexusGenesis - 私钥完整性验证脚本
 * 
 * 功能：
 * 1. 验证钱包文件的完整性
 * 2. 检查私钥和公钥的格式
 * 3. 验证地址格式是否正确
 * 4. 提供详细的验证报告
 */

import { PQCWallet } from '../src/wallet/pqcWallet.js';
import fs from 'fs/promises';
import path from 'path';

async function verifyWalletIntegrity(address) {
  console.log('🔍 Verifying wallet integrity...');
  console.log('=====================================');
  
  try {
    // 加载钱包
    const wallet = await PQCWallet.load(address);
    if (!wallet) {
      console.error('❌ Failed to load wallet');
      return false;
    }
    
    console.log(`📋 Wallet Information:`);
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Public key length: ${wallet.publicKey.length} bytes`);
    console.log(`   Secret key length: ${wallet.secretKey.length} bytes`);
    console.log(`   Balance: ${wallet.balance} NGEN`);
    console.log(`   Nonce: ${wallet.nonce}`);
    
    // 验证私钥完整性
    console.log('\n🔐 Private Key Integrity:');
    const integrityResult = wallet.verifyPrivateKeyIntegrity();
    console.log(`   Status: ${integrityResult ? '✅ Valid' : '❌ Invalid'}`);
    
    // 导出助记词
    console.log('\n📝 Mnemonic Phrase:');
    try {
      const mnemonic = wallet.toMnemonic();
      console.log(`   ${mnemonic}`);
      console.log('   ✅ Mnemonic generated successfully');
    } catch (error) {
      console.error('   ❌ Failed to generate mnemonic:', error.message);
    }
    
    // 检查钱包文件
    console.log('\n📁 Wallet File Check:');
    const walletFile = path.join('data', 'wallet', `${address}.json`);
    try {
      const walletData = JSON.parse(await fs.readFile(walletFile, 'utf8'));
      console.log(`   File exists: ✅`);
      console.log(`   Address matches: ${walletData.address === address ? '✅' : '❌'}`);
      console.log(`   Public key stored: ${walletData.publicKey ? '✅' : '❌'}`);
      console.log(`   Secret key stored: ${walletData.secretKey ? '✅' : '❌'}`);
      
      if (walletData.secretKey && walletData.secretKey.encrypted) {
        console.log(`   Secret key encrypted: ✅`);
      } else {
        console.log(`   Secret key encrypted: ❌ (unencrypted - only for testing)`);
      }
    } catch (error) {
      console.error('   ❌ Failed to read wallet file:', error.message);
    }
    
    console.log('=====================================');
    if (integrityResult) {
      console.log('✅ Wallet integrity verification PASSED!');
      return true;
    } else {
      console.log('❌ Wallet integrity verification FAILED!');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error verifying wallet integrity:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 主函数
async function main() {
  console.log('Starting wallet integrity verification...');
  
  const address = process.argv[2];
  
  if (!address) {
    console.log('Usage: node scripts/verify_wallet_integrity.js <wallet_address>');
    console.log('Example: node scripts/verify_wallet_integrity.js ng11ExampleAddress');
    process.exit(1);
  }
  
  console.log(`Verifying wallet: ${address}`);
  
  try {
    await verifyWalletIntegrity(address);
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
  }
  
  console.log('Verification process completed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}