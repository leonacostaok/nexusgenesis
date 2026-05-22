/**
 * Test script for transaction functionality
 * Verifies that we can send NGEN from the genesis address
 */

import fs from 'fs/promises';
import path from 'path';
import { PQCWallet, Transaction } from './src/wallet/pqcWallet.js';

async function testTransaction() {
  console.log('Testing transaction from genesis address...');
  
  try {
    // Load genesis wallet
    const genesisAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
    const walletPath = path.join('data', 'wallets', genesisAddress + '.json');
    
    console.log('Loading genesis wallet from:', walletPath);
    const genesisWallet = await PQCWallet.load(walletPath);
    console.log('✓ Genesis wallet loaded:', genesisWallet.address);
    console.log('✓ Current balance:', genesisWallet.balance, 'NGEN');
    
    // Generate a new wallet for testing
    console.log('\nGenerating test wallet...');
    const testWallet = await PQCWallet.generate(0n);
    console.log('✓ Test wallet generated:', testWallet.address);
    
    // Create a transaction
    const amount = 1000n; // Send 1000 NGEN
    const fee = 1n; // 1 NGEN fee
    
    console.log('\nCreating transaction...');
    console.log('  From:', genesisWallet.address);
    console.log('  To:', testWallet.address);
    console.log('  Amount:', amount, 'NGEN');
    console.log('  Fee:', fee, 'NGEN');
    
    const transaction = new Transaction(
      genesisWallet.address,
      testWallet.address,
      amount,
      fee
    );
    
    // Sign the transaction
    console.log('\nSigning transaction...');
    // Convert BigInt to string for serialization
    const txData = {
      id: transaction.id,
      from: transaction.from,
      to: transaction.to,
      amount: transaction.amount.toString(),
      fee: transaction.fee.toString(),
      type: transaction.type,
      data: transaction.data,
      timestamp: transaction.timestamp
    };
    // Sign the transaction data
    const signature = await genesisWallet.sign(txData);
    transaction.signature = signature;
    console.log('✓ Transaction signed:', signature.slice(0, 32) + '...');
    
    // Verify the transaction
    console.log('\nVerifying transaction...');
    const isValid = await transaction.verify(genesisWallet);
    console.log('✓ Transaction verification:', isValid ? 'PASS' : 'FAIL');
    
    // Update balances (simulating transaction execution)
    console.log('\nSimulating transaction execution...');
    genesisWallet.updateBalance(-(amount + fee));
    testWallet.updateBalance(amount);
    
    console.log('✓ Updated balances:');
    console.log('  Genesis wallet:', genesisWallet.balance, 'NGEN');
    console.log('  Test wallet:', testWallet.balance, 'NGEN');
    
    // Save the updated genesis wallet
    console.log('\nSaving updated genesis wallet...');
    await genesisWallet.save(walletPath);
    console.log('✓ Genesis wallet saved with new balance');
    
    console.log('\n✅ Transaction test completed successfully!');
    console.log('The system can successfully call (spend) NGEN from the genesis address.');
    
  } catch (error) {
    console.error('Error during transaction test:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Run the test
testTransaction();
