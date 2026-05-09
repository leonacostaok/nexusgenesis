import { PQCWallet } from '../src/wallet/pqcWallet.js';
import path from 'path';

async function generateWallet() {
  try {
    console.log('Generating mainnet node wallet...');
    
    // 生成新钱包，初始余额为50000000 NGEN
    const wallet = await PQCWallet.generate(50000000n);
    
    // 保存钱包到data/wallets目录
    const walletPath = path.join('data', 'wallets', wallet.address + '.json');
    await wallet.save(walletPath);
    
    console.log('Wallet generated successfully!');
    console.log('Address:', wallet.address);
    console.log('Balance:', wallet.balance, 'NGEN');
    console.log('Saved to:', walletPath);
    
  } catch (error) {
    console.error('Error generating wallet:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateWallet();