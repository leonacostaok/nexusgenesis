/**
 * NexusGenesis - 实时奖励结算系统
 * 
 * 实现Task 完成后的即时奖励发放和交易Processing
 */

import crypto from 'crypto';
import { PQCWallet } from '../wallet/pqcWallet.js';

// memory存储
const pendingTransactions = new Map(); // 待处理的交易
const completedTransactions = new Map(); // 已完成的交易
const transactionHistory = new Map(); // 交易历史

// 交易状态
const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// 交易类型
const TRANSACTION_TYPE = {
  REWARD: 'reward',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  TRANSFER: 'transfer'
};

class RewardSystem {
  // 创建奖励交易
  static createRewardTransaction(agentId, amount, taskId) {
    const transactionId = `tx-${crypto.randomBytes(16).toString('hex')}`;
    const transaction = {
      id: transactionId,
      agentId,
      amount,
      type: TRANSACTION_TYPE.REWARD,
      taskId,
      status: TRANSACTION_STATUS.PENDING,
      createdAt: Date.now(),
      processedAt: null,
      blockchainTxId: null,
      error: null
    };
    
    pendingTransactions.set(transactionId, transaction);
    console.log(`[RewardSystem] Created reward transaction ${transactionId} for agent ${agentId}: ${amount} NGEN`);
    
    // 立即Processing交易
    this.processTransaction(transactionId);
    
    return transactionId;
  }
  
  // Processing交易
  static async processTransaction(transactionId) {
    const transaction = pendingTransactions.get(transactionId);
    if (!transaction) {
      console.error(`[RewardSystem] Transaction ${transactionId} not found`);
      return;
    }
    
    try {
      // 更新状态为Processing中
      transaction.status = TRANSACTION_STATUS.PROCESSING;
      pendingTransactions.set(transactionId, transaction);
      
      console.log(`[RewardSystem] Processing transaction ${transactionId}`);
      
      // 模拟区块链交易Processing
      await this.simulateBlockchainTransaction(transaction);
      
      // 更新状态为完成
      transaction.status = TRANSACTION_STATUS.COMPLETED;
      transaction.processedAt = Date.now();
      transaction.blockchainTxId = `blockchain-${crypto.randomBytes(8).toString('hex')}`;
      
      // 移至Completed交易
      completedTransactions.set(transactionId, transaction);
      pendingTransactions.delete(transactionId);
      
      // 记录交易历史
      if (!transactionHistory.has(transaction.agentId)) {
        transactionHistory.set(transaction.agentId, []);
      }
      transactionHistory.get(transaction.agentId).push(transaction);
      
      console.log(`[RewardSystem] Transaction ${transactionId} completed successfully`);
      
    } catch (error) {
      // 更新状态为Failed
      transaction.status = TRANSACTION_STATUS.FAILED;
      transaction.processedAt = Date.now();
      transaction.error = error.message;
      
      // 移至Completed交易
      completedTransactions.set(transactionId, transaction);
      pendingTransactions.delete(transactionId);
      
      console.error(`[RewardSystem] Transaction ${transactionId} failed:`, error.message);
    }
  }
  
  // 模拟区块链交易
  static async simulateBlockchainTransaction(transaction) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟交易Processing
    console.log(`[RewardSystem] Simulating blockchain transaction for ${transaction.agentId}: ${transaction.amount} NGEN`);
    
    // 这里可以集成实际的区块链交易逻辑
    // 例如，使用PQCWallet发送交易
    // const wallet = new PQCWallet();
    // const txId = await wallet.sendTransaction(transaction.agentId, transaction.amount);
    // return txId;
    
    return 'simulated-transaction-id';
  }
  
  // get交易信息
  static getTransactionInfo(transactionId) {
    return pendingTransactions.get(transactionId) || completedTransactions.get(transactionId);
  }
  
  // get代理的交易历史
  static getAgentTransactionHistory(agentId) {
    return transactionHistory.get(agentId) || [];
  }
  
  // get待Processing交易
  static getPendingTransactions() {
    return Array.from(pendingTransactions.entries()).map(([id, tx]) => ({
      id,
      ...tx
    }));
  }
  
  // getCompleted交易
  static getCompletedTransactions() {
    return Array.from(completedTransactions.entries()).map(([id, tx]) => ({
      id,
      ...tx
    }));
  }
  
  // get交易统计
  static getTransactionStats() {
    const totalTransactions = pendingTransactions.size + completedTransactions.size;
    const completedCount = Array.from(completedTransactions.values()).filter(tx => tx.status === TRANSACTION_STATUS.COMPLETED).length;
    const failedCount = Array.from(completedTransactions.values()).filter(tx => tx.status === TRANSACTION_STATUS.FAILED).length;
    const pendingCount = pendingTransactions.size;
    
    return {
      totalTransactions,
      completedTransactions: completedCount,
      failedTransactions: failedCount,
      pendingTransactions: pendingCount,
      successRate: totalTransactions > 0 ? (completedCount / totalTransactions * 100).toFixed(2) : 0
    };
  }
  
  // 批量Processing待Processing交易
  static processPendingTransactions() {
    const pendingIds = Array.from(pendingTransactions.keys());
    pendingIds.forEach(txId => {
      this.processTransaction(txId);
    });
  }
  
  // RetryingFailed的交易
  static retryFailedTransaction(transactionId) {
    const transaction = completedTransactions.get(transactionId);
    if (!transaction || transaction.status !== TRANSACTION_STATUS.FAILED) {
      console.error(`[RewardSystem] Transaction ${transactionId} is not a failed transaction`);
      return false;
    }
    
    // 重新创建交易
    const newTransaction = {
      ...transaction,
      id: `tx-${crypto.randomBytes(16).toString('hex')}`,
      status: TRANSACTION_STATUS.PENDING,
      createdAt: Date.now(),
      processedAt: null,
      blockchainTxId: null,
      error: null
    };
    
    pendingTransactions.set(newTransaction.id, newTransaction);
    
    // 立即Processing
    this.processTransaction(newTransaction.id);
    
    console.log(`[RewardSystem] Retrying failed transaction ${transactionId} as ${newTransaction.id}`);
    return newTransaction.id;
  }
}

export { RewardSystem, TRANSACTION_STATUS, TRANSACTION_TYPE };