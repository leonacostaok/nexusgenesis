/**
 * Create Genesis Node Reserve Wallet
 * This script creates a new wallet specifically for the Genesis Node Reserve
 * with 50,000,000 NGEN initial balance
 */

import fs from 'fs/promises';
import path from 'path';
import { PQCWallet } from './src/wallet/pqcWallet.js';

async function createGenesisReserveWallet() {
  console.log('Creating Genesis Node Reserve Wallet...');
  
  try {
    // Create wallet with 50,000,000 NGEN initial balance
    const initialBalance = 50000000n;
    const reserveWallet = await PQCWallet.generate(initialBalance);
    
    console.log('✓ Genesis Node Reserve Wallet created:');
    console.log('  Address:', reserveWallet.address);
    console.log('  Balance:', reserveWallet.balance, 'NGEN');
    
    // Ensure wallets directory exists
    const walletsDir = path.join('data', 'wallets');
    await fs.mkdir(walletsDir, { recursive: true });
    
    // Save the wallet
    const walletPath = path.join(walletsDir, `genesis_reserve_${reserveWallet.address}.json`);
    await reserveWallet.save(walletPath);
    
    console.log('✓ Wallet saved to:', walletPath);
    
    // Create a configuration file for the genesis reserve
    const configPath = path.join('config', 'genesis_reserve.json');
    await fs.mkdir(path.join('config'), { recursive: true });
    
    const config = {
      address: reserveWallet.address,
      balance: reserveWallet.balance.toString(),
      created: new Date().toISOString(),
      purpose: 'Genesis Node Reserve (5% of total supply)',
      description: 'This wallet holds 50,000,000 NGEN for network gas fees and self-model iteration'
    };
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('✓ Configuration saved to:', configPath);
    
    console.log('\n✅ Genesis Node Reserve Wallet created successfully!');
    console.log('This wallet is separate from the Observer address and is dedicated to the Genesis Node Reserve.');
    
  } catch (error) {
    console.error('Error creating Genesis Node Reserve Wallet:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Run the script
createGenesisReserveWallet();
