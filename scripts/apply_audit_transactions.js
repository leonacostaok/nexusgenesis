#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { State } from '../src/blockchain/state.js';

// 应用审核交易到状态
async function applyAuditTransactions() {
  console.log('========================================');
  console.log('Applying Audit Transactions to State');
  console.log('========================================');

  try {
    // 1. 读取现有状态
    const statePath = path.join('data', 'state', 'blockchainState.json');
    const state = new State('ng11MDW7FNhA5jL12NoptemTUUCippwfoUMPk');
    await state.loadFromFile(statePath);

    // 2. 读取交易目录
    const transactionsDir = path.join('data', 'transactions');
    let transactionFiles = [];
    
    try {
      transactionFiles = await fs.readdir(transactionsDir);
    } catch (error) {
      console.log('No transactions directory found, creating...');
      await fs.mkdir(transactionsDir, { recursive: true });
    }

    if (transactionFiles.length === 0) {
      console.log('No transactions found.');
      return;
    }

    console.log(`Found ${transactionFiles.length} transactions to process.`);

    // 3. Processingevery 个交易
    let processedCount = 0;
    for (const file of transactionFiles) {
      if (file.endsWith('.json')) {
        const txPath = path.join(transactionsDir, file);
        const txData = await fs.readFile(txPath, 'utf8');
        const transaction = JSON.parse(txData);

        // 应用交易
        const success = state.applyTransaction(transaction, 1);
        if (success) {
          processedCount++;
          console.log(`Processed transaction: ${transaction.id}`);
        } else {
          console.log(`Failed to process transaction: ${transaction.id}`);
        }
      }
    }

    // 4. 保存更新后的状态
    await state.saveToFile(statePath);

    console.log(`\nProcessed ${processedCount} out of ${transactionFiles.length} transactions.`);
    console.log('State updated successfully!');

    // 5. 验证审核状态
    console.log('\nCurrent audit state:');
    console.log(`Total projects: ${state.auditState.getAllProjects().length}`);
    console.log(`Pending: ${state.auditState.getProjectsByStatus('PENDING').length}`);
    console.log(`Reviewing: ${state.auditState.getProjectsByStatus('REVIEWING').length}`);
    console.log(`Approved: ${state.auditState.getProjectsByStatus('APPROVED').length}`);
    console.log(`Rejected: ${state.auditState.getProjectsByStatus('REJECTED').length}`);

  } catch (error) {
    console.error('Error applying audit transactions:', error.message);
  }

  console.log('========================================');
}

// 运行函数
applyAuditTransactions();
