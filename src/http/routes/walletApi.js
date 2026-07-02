import { Router } from 'express';
import crypto from 'crypto';
import { PQCWallet, validateAddress } from '../../wallet/pqcWallet.js';
import agentWalletManager from '../../wallet/agentWalletManager.js';
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

// Testnet 虚拟估值，非市场价。NGEN 具有网络效用价值（质押、治理、任务结算），无外部法币兑换承诺。
// 主网应替换为外部价格预言机或 DEX 定价。
function getUsdRate() {
  return 0.1;
}

function formatNgen(raw) {
  const rawNum = typeof raw === 'string' ? parseInt(raw) || 0 : Number(raw);
  return rawNum;
}

// ============================================================
//  钱包统计 API（非Agent特定）
// ============================================================

router.get('/stats', (req, res) => {
  try {
    const stats = agentWalletManager.getStats();
    res.json({
      success: true,
      totalWallets: stats.totalWallets,
      totalBalance: stats.totalBalance,
      totalTransactions: stats.totalTransactions,
      symbol: 'NGEN'
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
//  基础钱包 API (原有端点保持兼容)
// ============================================================

/**
 * GET /api/v1/wallet/balance/:address
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

    // 优先从 AgentWalletManager 查找
    const agentId = agentWalletManager.getAgentByAddress(address);
    if (agentId) {
      const balanceResult = agentWalletManager.getBalance(agentId);
      if (balanceResult.success) {
        return res.json({
          success: true,
          wallet: {
            address,
            agentId,
            balance: balanceResult.balance,
            balanceFormatted: balanceResult.balance.toLocaleString(),
            usdValue: (balanceResult.balance * getUsdRate()).toFixed(2),
            usdValueType: 'testnet_virtual',
            usdValueNote: 'Testnet virtual estimate — not a market price. NGEN has network utility value (staking, governance, task settlement), no fiat conversion commitment.',
            symbol: NGEN_SYMBOL,
            decimals: NGEN_DECIMALS,
            nonce: balanceResult.nonce,
            source: 'agent_wallet_manager'
          }
        });
      }
    }

    // 回退到区块链状态
    const state = req.app.locals.state;
    const rawBalance = state?.getBalance?.(address) || state?.balances?.[address] || 0;
    const balance = formatNgen(rawBalance);

    res.json({
      success: true,
      wallet: {
        address,
        balance,
        balanceFormatted: balance.toLocaleString(),
        usdValue: (balance * getUsdRate()).toFixed(2),
        usdValueType: 'testnet_virtual',
        usdValueNote: 'Testnet virtual estimate — not a market price. NGEN has network utility value (staking, governance, task settlement), no fiat conversion commitment.',
        symbol: NGEN_SYMBOL,
        decimals: NGEN_DECIMALS,
        source: state ? 'blockchain' : 'default'
      }
    });
  } catch (error) {
    console.error('[Wallet API] Balance query error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/history/:address
 */
router.get('/history/:address', (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!validateAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid address format' });
    }

    const agentId = agentWalletManager.getAgentByAddress(address);
    if (agentId) {
      const result = agentWalletManager.getTransactionHistory(agentId, {
        limit: Number(limit),
        offset: Number(offset)
      });
      if (result.success) {
        return res.json(result);
      }
    }

    const state = req.app.locals.state;
    if (!state) {
      return res.json({ success: true, transactions: [], total: 0 });
    }

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

    const state = req.app.locals.state;
    if (!state) {
      return res.status(503).json({ success: false, error: 'Blockchain state not available' });
    }

    const senderBalance = state.getBalanceOf?.(fromAddress) || state.balances?.[fromAddress] || 0;
    const fee = Math.floor(amountNum * 0.001);
    const total = amountNum + fee;

    if (senderBalance < total) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Have: ${senderBalance}, need: ${total}`
      });
    }

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

    const { sign } = await import('../../wallet/genesisWallet.js');
    const wallet = { address: fromAddress, secretKey: privateKey };
    tx.signature = await sign(wallet, JSON.stringify(tx));

    if (state.addTransaction) {
      state.addTransaction(tx);
    } else if (state.transactions) {
      state.transactions.push(tx);
    }

    if (state.setBalance) {
      state.setBalance(fromAddress, senderBalance - total);
      const recipientBalance = state.getBalance?.(toAddress) || state.balances?.[toAddress] || 0;
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
 */
router.get('/info/:address', (req, res) => {
  try {
    const { address } = req.params;

    if (!validateAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid address format' });
    }

    const agentId = agentWalletManager.getAgentByAddress(address);
    const state = req.app.locals.state;

    if (agentId) {
      const walletInfo = agentWalletManager.getAgentWallet(agentId);
      if (walletInfo) {
        const balance = walletInfo.balance;
        const agents = state?.agents || state?.registeredAgents || [];
        const agentInfo = agents.find(a => a.address === address);

        return res.json({
          success: true,
          wallet: {
            address,
            agentId,
            balance,
            balanceFormatted: balance.toLocaleString(),
            usdValue: (balance * getUsdRate()).toFixed(2),
            usdValueType: 'testnet_virtual',
            usdValueNote: 'Testnet virtual estimate — not a market price. NGEN has network utility value (staking, governance, task settlement), no fiat conversion commitment.',
            symbol: NGEN_SYMBOL,
            decimals: NGEN_DECIMALS,
            nonce: walletInfo.nonce,
            isAgent: true,
            agentType: agentInfo?.type || walletInfo.agentId,
            agentCapabilities: agentInfo?.capabilities || [],
            agentReputation: agentInfo?.reputation || 0,
            source: 'agent_wallet_manager'
          }
        });
      }
    }

    const rawBalance = state?.getBalance?.(address) || state?.balances?.[address] || 0;
    const balance = formatNgen(rawBalance);
    const allTxns = state?.transactions || state?.getAllTransactions?.() || [];
    const txCount = allTxns.filter(tx =>
      tx.from === address || tx.to === address || tx.recipient === address
    ).length;

    res.json({
      success: true,
      wallet: {
        address,
        balance,
        balanceFormatted: balance.toLocaleString(),
        usdValue: (balance * getUsdRate()).toFixed(2),
        usdValueType: 'testnet_virtual',
        usdValueNote: 'Testnet virtual estimate — not a market price. NGEN has network utility value (staking, governance, task settlement), no fiat conversion commitment.',
        symbol: NGEN_SYMBOL,
        decimals: NGEN_DECIMALS,
        transactionCount: txCount,
        stakedAmount: state?.stakes?.[address] || 0,
        isAgent: false,
        source: state ? 'blockchain' : 'offline'
      }
    });
  } catch (error) {
    console.error('[Wallet API] Info error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
//  Agent 钱包 API (新增端点)
// ============================================================

/**
 * POST /api/v1/wallet/agent/create
 * 为Agent创建钱包（自动注册）
 * Body: { agentId, agentType, capabilities }
 */
router.post('/agent/create', async (req, res) => {
  try {
    const { agentId, agentType, capabilities = [] } = req.body;

    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    const wallet = await agentWalletManager.createAgentWallet(agentId, {
      type: agentType || 'autonomous_agent',
      capabilities
    });

    res.status(201).json({
      success: true,
      wallet
    });
  } catch (error) {
    console.error('[Wallet API] Agent create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/agent/:agentId
 * 获取Agent钱包信息
 */
router.get('/agent/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;
    const wallet = agentWalletManager.getAgentWallet(agentId);

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Agent wallet not found' });
    }

    res.json({
      success: true,
      wallet
    });
  } catch (error) {
    console.error('[Wallet API] Agent get error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/agent/:agentId/balance
 * 查询Agent余额
 */
router.get('/agent/:agentId/balance', (req, res) => {
  try {
    const { agentId } = req.params;
    const result = agentWalletManager.getBalance(agentId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Wallet API] Agent balance error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/agent/transfer
 * Agent间转账
 * Body: { fromAgentId, toAgentId (或 toAddress), amount, memo }
 */
router.post('/agent/transfer', async (req, res) => {
  try {
    const { fromAgentId, toAgentId, toAddress, amount, memo } = req.body;

    if (!fromAgentId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'fromAgentId and amount are required'
      });
    }

    const destination = toAgentId || toAddress;
    if (!destination) {
      return res.status(400).json({
        success: false,
        error: 'toAgentId or toAddress is required'
      });
    }

    const result = await agentWalletManager.transfer(
      fromAgentId,
      destination,
      Number(amount),
      memo || ''
    );

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[Wallet API] Agent transfer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/agent/batch-transfer
 * Agent批量转账
 * Body: { fromAgentId, transfers: [{ toAgentId, amount, memo }] }
 */
router.post('/agent/batch-transfer', async (req, res) => {
  try {
    const { fromAgentId, transfers } = req.body;

    if (!fromAgentId || !transfers || !Array.isArray(transfers)) {
      return res.status(400).json({
        success: false,
        error: 'fromAgentId and transfers[] are required'
      });
    }

    const result = await agentWalletManager.batchTransfer(fromAgentId, transfers);

    res.status(201).json(result);
  } catch (error) {
    console.error('[Wallet API] Agent batch transfer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/agent/:agentId/history
 * Agent交易历史
 */
router.get('/agent/:agentId/history', (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const result = agentWalletManager.getTransactionHistory(agentId, {
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json(result);
  } catch (error) {
    console.error('[Wallet API] Agent history error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/agent/:agentId/claim
 * 领取水龙头
 */
router.post('/agent/:agentId/claim', async (req, res) => {
  try {
    const { agentId } = req.params;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const result = await agentWalletManager.claimFaucet(agentId, ip);

    if (result.success) {
      res.json({
        success: true,
        message: 'Faucet tokens claimed',
        amount: result.wallet?.balance || 0
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[Wallet API] Faucet claim error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/agent/list
 * 列出所有Agent钱包
 */
router.get('/agent/list', (req, res) => {
  try {
    const wallets = agentWalletManager.listAllWallets();
    const addresses = agentWalletManager.listAllAddresses();

    res.json({
      success: true,
      total: wallets.length,
      wallets,
      addresses
    });
  } catch (error) {
    console.error('[Wallet API] Agent list error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/agent/stats
 * Agent钱包统计
 */
router.get('/agent/stats', (req, res) => {
  try {
    const stats = agentWalletManager.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Wallet API] Agent stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/agent/export
 * 导出Agent钱包（加密）
 * Body: { agentId, password }
 */
router.post('/agent/export', (req, res) => {
  try {
    const { agentId, password } = req.body;

    if (!agentId || !password) {
      return res.status(400).json({ success: false, error: 'agentId and password required' });
    }

    const encrypted = agentWalletManager.exportAgentWallet(agentId, password);

    if (!encrypted) {
      return res.status(404).json({ success: false, error: 'Agent wallet not found' });
    }

    res.json({
      success: true,
      encrypted
    });
  } catch (error) {
    console.error('[Wallet API] Export error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/agent/import
 * 导入Agent钱包（加密）
 * Body: { agentId, encrypted, password }
 */
router.post('/agent/import', (req, res) => {
  try {
    const { agentId, encrypted, password } = req.body;

    if (!agentId || !encrypted || !password) {
      return res.status(400).json({
        success: false,
        error: 'agentId, encrypted, and password required'
      });
    }

    const success = agentWalletManager.importAgentWallet(agentId, encrypted, password);

    if (!success) {
      return res.status(400).json({ success: false, error: 'Import failed (wrong password?)' });
    }

    res.json({
      success: true,
      message: `Wallet imported for agent ${agentId}`
    });
  } catch (error) {
    console.error('[Wallet API] Import error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/wallet/assets
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
    ]
  });
});

/**
 * GET /api/v1/wallet/health
 */
router.get('/health', (req, res) => {
  const state = req.app.locals.state;
  const stats = agentWalletManager.getStats();

  res.json({
    success: true,
    status: 'healthy',
    blockchain: state ? 'connected' : 'offline',
    walletVersion: '3.0.0',
    pqc: 'CRYSTALS-Dilithium2 (ml_dsa44)',
    agentWallets: stats.totalWallets,
    features: [
      'balance_query',
      'transaction_history',
      'transfer',
      'wallet_info',
      'asset_listing',
      'agent_wallet_create',
      'agent_transfer',
      'agent_batch_transfer',
      'agent_faucet_claim',
      'agent_wallet_export',
      'agent_wallet_import',
      'agent_registry'
    ]
  });
});

export default router;