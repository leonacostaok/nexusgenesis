/**
 * Generate Genesis Wallet
 * Creates a wallet with the genesis address specified in the whitepaper
 */

import fs from 'fs/promises';
import path from 'path';
import { PQCWallet } from '../src/wallet/pqcWallet.js';

async function generateGenesisWallet() {
  console.log('Generating Genesis Wallet...');
  
  try {
    // Whitepaper-specified genesis address
    const genesisAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
    
    // Generate new wallet with initial balance of 50,000,000 NGEN (5% of total supply)
    const wallet = await PQCWallet.generate(50000000n);
    
    // Override the address with the one from the whitepaper
    // Note: This is a special case for the genesis wallet
    const walletData = {
      address: genesisAddress,
      publicKey: wallet.publicKey.toString('hex'),
      privateKey: wallet.privateKey.toString('hex'),
      balance: wallet.balance.toString()
    };
    
    // Ensure wallets directory exists
    const walletsDir = path.join('data', 'wallets');
    await fs.mkdir(walletsDir, { recursive: true });
    
    // Save the wallet
    const walletPath = path.join(walletsDir, genesisAddress + '.json');
    await fs.writeFile(walletPath, JSON.stringify(walletData, null, 2));
    
    console.log('✓ Genesis wallet generated successfully!');
    console.log('  Address:', genesisAddress);
    console.log('  Balance:', wallet.balance, 'NGEN');
    console.log('  Saved to:', walletPath);
    
  } catch (error) {
    console.error('Error generating genesis wallet:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Run the script
generateGenesisWallet();
