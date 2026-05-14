import { Router } from 'express';
import crypto from 'crypto';
import { PQCWallet, validateAddress } from '../../wallet/pqcWallet.js';
import { generateKeyPair } from '../../crypto/pqc.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const router = Router();

const NGEN_SYMBOL = 'NGEN';
const NGEN_DECIMALS = 8;

function getUsdRate() {
  // Placeholder - replace with oracle feed in Epoch 2
  return 0.1; // 1 NGEN = $0.10 USD
}

function formatNgen(raw) {
  const rawNum = typeof raw === 'string' ? parseInt(raw) || 0 : Number(raw);
  return rawNum; // Raw integer representation
}

/**
 * GET /api/v1/wallet/balance/:address
 * Query balance for any address from blockchain state
 */
router.get('/balance/:address', (req, res) => {
  try {
    const { address } = req.params;

    if (!validateAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format. Expected format: ng1...'
      });
    }

    const state = req.app.locals.globalState;
    if (!state) {
      // Return genesis defaults if blockchain state not loaded
      return res.json({
        success: true,
        wallet: {
          address,
          balance: 0,
          balanceFormatted: '0',
          usdValue: 0,
          symbol: NGEN_SYMBOL,
          decimals: NGEN_DECIMALS,
          source: 'default'
        }
      });
    }

    const rawBalance = state.getBalanceOf?.(address) || state.balances?.[address] || 0;
    const balance = formatNgen(rawBalance);

    res.json({
      success: true,
      wallet: {
        address,
        balance,
        balanceFormatted: balance.toLocaleString(),
        usdValue: (balance * getUsdRate()).toFixed(2),
        symbol: NGEN_SYMBOL,
        decimals: NGEN_DECIMALS,
        source: 'blockchain'
      }
    });

  } catch (error) {
    console.error('[Wallet API] Balance query error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/history/:address
 * Get transaction history for an address
 */
router.get('/history/:address', (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!validateAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid address format' });
    }

    const state = req.app.locals.globalState;
    if (!state) {
      return res.json({ success: true, transactions: [], total: 0 });
    }

    // Collect transactions involving this address
    const txs = [];
    const allTransactions = state.transactions || state.getAllTransactions?.() || [];

    for (const tx of allTransactions) {
      if (tx.from === address || tx.to === address || tx.recipient === address) {
        const direction = tx.from === address ? 'send' : 'receive';
        txs.push({
          id: tx.id || tx.hash || crypto.createHash('sha3-256').update(JSON.stringify(tx)).digest('hex').slice(0, 16),
          type: tx.type || 'transfer',
          direction,
          from: tx.from || tx.sender,
          to: tx.to || tx.recipient,
          amount: tx.amount || tx.value || 0,
          fee: tx.fee || 0,
          symbol: NGEN_SYMBOL,
          status: tx.status || 'confirmed',
          timestamp: tx.timestamp || Date.now(),
          blockHeight: tx.blockHeight || tx.height || null
        });
      }
    }

    txs.sort((a, b) => b.timestamp - a.timestamp);

    const paginated = txs.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      transactions: paginated,
      total: txs.length,
      limit: Number(limit),
      offset: Number(offset)
    });

  } catch (error) {
    console.error('[Wallet API] History error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/transfer
 * Create and broadcast a transfer transaction
 */
router.post('/transfer', async (req, res) => {
  try {
    const { fromAddress, toAddress, amount, privateKey, memo } = req.body;

    if (!fromAddress || !toAddress || !amount || !privateKey) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: fromAddress, toAddress, amount, privateKey'
      });
    }

    if (!validateAddress(fromAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid sender address' });
    }
    if (!validateAddress(toAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid recipient address' });
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    const state = req.app.locals.globalState;
    if (!state) {
      return res.status(503).json({ success: false, error: 'Blockchain state not available' });
    }

    // Check balance
    const senderBalance = state.getBalanceOf?.(fromAddress) || state.balances?.[fromAddress] || 0;
    const fee = Math.floor(amountNum * 0.001); // 0.1% metabolic tax
    const total = amountNum + fee;

    if (senderBalance < total) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Have: ${senderBalance}, need: ${total} (amount: ${amountNum} + fee: ${fee})`
      });
    }

    // Create transaction
    const tx = {
      type: 'transfer',
      from: fromAddress,
      to: toAddress,
      amount: amountNum,
      fee,
      memo: memo || '',
      timestamp: Date.now()
    };

    tx.id = crypto.createHash('sha3-256').update(JSON.stringify(tx)).digest('hex');

    // Sign transaction
    const { sign } = await import('../../wallet/genesisWallet.js');
    const wallet = { address: fromAddress, secretKey: privateKey };
    tx.signature = await sign(wallet, JSON.stringify(tx));

    // Submit to blockchain
    if (state.addTransaction) {
      state.addTransaction(tx);
    } else if (state.transactions) {
      state.transactions.push(tx);
    }

    // Update balances
    if (state.setBalance) {
      state.setBalance(fromAddress, senderBalance - total);
      const recipientBalance = state.getBalanceOf?.(toAddress) || state.balances?.[toAddress] || 0;
      state.setBalance(toAddress, recipientBalance + amountNum);
    }

    res.status(201).json({
      success: true,
      transaction: {
        id: tx.id,
        from: fromAddress,
        to: toAddress,
        amount: amountNum,
        fee,
        timestamp: tx.timestamp,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('[Wallet API] Transfer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/info/:address
 * Get comprehensive wallet information
 */
router.get('/info/:address', (req, res) => {
  try {
    const { address } = req.params;

    if (!validateAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid address format' });
    }

    const state = req.app.locals.globalState;

    // Balance
    const rawBalance = state?.getBalanceOf?.(address) || state?.balances?.[address] || 0;
    const balance = formatNgen(rawBalance);

    // Transaction count
    const allTxns = state?.transactions || state?.getAllTransactions?.() || [];
    const txCount = allTxns.filter(tx =>
      tx.from === address || tx.to === address || tx.recipient === address
    ).length;

    // Staking info (placeholder)
    const stakedAmount = state?.stakes?.[address] || 0;

    // Agent info
    const agents = state?.agents || state?.registeredAgents || [];
    const agentInfo = agents.find(a => a.address === address);

    res.json({
      success: true,
      wallet: {
        address,
        balance,
        balanceFormatted: balance.toLocaleString(),
        usdValue: (balance * getUsdRate()).toFixed(2),
        symbol: NGEN_SYMBOL,
        decimals: NGEN_DECIMALS,
        transactionCount: txCount,
        stakedAmount: stakedAmount || 0,
        isAgent: !!agentInfo,
        agentType: agentInfo?.type || null,
        agentCapabilities: agentInfo?.capabilities || [],
        agentReputation: agentInfo?.reputation || 0,
        source: state ? 'blockchain' : 'offline'
      }
    });

  } catch (error) {
    console.error('[Wallet API] Info error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/assets
 * List all token/assets supported by the wallet
 */
router.get('/assets', (req, res) => {
  res.json({
    success: true,
    assets: [
      {
        symbol: NGEN_SYMBOL,
        name: 'NexusGenesis Token',
        decimals: NGEN_DECIMALS,
        type: 'native',
        description: 'Native governance and utility token of NexusGenesis'
      }
      // Additional assets (ERC20 equivalents) will be added in Epoch 2
    ]
  });
});

/**
 * GET /api/v1/wallet/health
 * Wallet service health check
 */
router.get('/health', (req, res) => {
  const state = req.app.locals.globalState;

  res.json({
    success: true,
    status: 'healthy',
    blockchain: state ? 'connected' : 'offline',
    walletVersion: '2.0.0',
    pqc: 'CRYSTALS-Dilithium2 (ml_dsa44)',
    features: [
      'balance_query',
      'transaction_history',
      'transfer',
      'wallet_info',
      'asset_listing'
    ]
  });
});

export default router;