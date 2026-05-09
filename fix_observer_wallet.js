/**
 * Fix Observer Wallet Configuration
 * This script creates a wallet for the Observer address with the correct balance
 */

import fs from 'fs/promises';
import path from 'path';

async function fixObserverWallet() {
  console.log('Fixing Observer Wallet Configuration...');
  
  try {
    // Observer address from user
    const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
    const initialBalance = '100000000'; // 100,000,000 NGEN
    
    // Ensure wallets directory exists
    const walletsDir = path.join('data', 'wallets');
    await fs.mkdir(walletsDir, { recursive: true });
    
    // Create observer wallet file
    const walletPath = path.join(walletsDir, `${observerAddress}.json`);
    
    // Generate mock keys (in production, these would be real PQC keys)
    const publicKey = '0000000000000000000000000000000000000000000000000000000000000000';
    const privateKey = '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    
    const walletData = {
      address: observerAddress,
      publicKey: publicKey,
      privateKey: privateKey,
      balance: initialBalance
    };
    
    await fs.writeFile(walletPath, JSON.stringify(walletData, null, 2));
    console.log('✓ Observer wallet created:', walletPath);
    console.log('  Address:', observerAddress);
    console.log('  Balance:', initialBalance, 'NGEN');
    
    // Verify genesis reserve wallet
    const genesisReserveWalletPath = path.join(walletsDir, 'genesis_reserve_ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ.json');
    const genesisReserveWalletData = JSON.parse(await fs.readFile(genesisReserveWalletPath, 'utf8'));
    
    console.log('\n✓ Genesis Reserve Wallet:');
    console.log('  Address:', genesisReserveWalletData.address);
    console.log('  Balance:', genesisReserveWalletData.balance, 'NGEN');
    
    // Verify mainnet config
    const mainnetConfigPath = 'mainnet.config.json';
    const mainnetConfig = JSON.parse(await fs.readFile(mainnetConfigPath, 'utf8'));
    
    console.log('\n✓ Mainnet Config Wallets:');
    console.log('  Genesis Reserve:', mainnetConfig.wallets.genesisReserve);
    console.log('  Observer:', mainnetConfig.wallets.observer);
    
    // Validate configuration
    const isValid = (
      mainnetConfig.wallets.genesisReserve === 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ' &&
      mainnetConfig.wallets.observer === observerAddress &&
      genesisReserveWalletData.balance === '50000000'
    );
    
    if (isValid) {
      console.log('\n✅ All wallet configurations are correct!');
      console.log('Observer Wallet: 100,000,000 NGEN (10% of total supply)');
      console.log('Genesis Reserve Wallet: 50,000,000 NGEN (5% of total supply)');
    } else {
      console.log('\n❌ Some wallet configurations are incorrect!');
    }
    
  } catch (error) {
    console.error('Error fixing Observer wallet:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Run the script
fixObserverWallet();
