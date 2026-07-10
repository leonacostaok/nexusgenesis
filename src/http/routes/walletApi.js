import { Router } from 'express';
import crypto from 'crypto';
import { PQCWallet, validateAddress } from '../../wallet/pqcWallet.js';
import agentWalletManager from '../../wallet/agentWalletManager.js';
import { generateKeyPair } from '../../crypto/pqc.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyCreditSecret } from '../adminAuth.js';
import { issueCustodyToken, verifyCustodyToken, extractCustodyToken } from '../custodyToken.js';
import { buildAuthHint } from '../authHint.js';

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

    // Prefer on-chain balance (authoritative, reflects all transactions)
    // Fall back to AgentWalletManager only if on-chain returns 0/undefined
    // (e.g. address not yet indexed by state). See dashboard consistency fix.
    const state = req.app.locals.state;
    const onChainRaw = state?.getBalance?.(address);
    const onChainBalance = (onChainRaw !== undefined && onChainRaw !== null && onChainRaw !== 0)
      ? onChainRaw
      : null;

    if (onChainBalance !== null) {
      const balance = formatNgen(onChainBalance);
      return res.json({
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
          source: 'blockchain'
        }
      });
    }

    // Fallback to AgentWalletManager (on-chain was 0/undefined)
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

    // Final fallback: empty blockchain state
    const balance = formatNgen(0);
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
 * Two modes:
 *   Mode A (agent): { fromAgentId, toAddress, amount, memo } — no privateKey needed
 *   Mode B (direct): { fromAddress, toAddress, amount, privateKey, memo } — requires privateKey
 */
router.post('/transfer', async (req, res) => {
  try {
    const { fromAddress: reqFromAddress, toAddress, amount, privateKey, fromAgentId, memo } = req.body;

    let fromAddress, senderBalance, wallet;
    const state = req.app.locals.state;
    if (!state) {
      return res.status(503).json({ success: false, error: 'Blockchain state not available' });
    }

    // Mode A: Transfer via AgentId (server-managed wallet, no privateKey needed)
    if (fromAgentId) {
      const agentEntry = agentWalletManager.getWalletInstance(fromAgentId);
      if (!agentEntry) {
        return res.status(404).json({ success: false, error: `Agent wallet not found: ${fromAgentId}` });
      }
      wallet = agentEntry;
      fromAddress = agentEntry.address;
      senderBalance = Number(agentEntry.balance) || 0;
    }
    // Mode B: Transfer via privateKey (direct wallet mode)
    else if (privateKey) {
      if (!reqFromAddress || !toAddress) {
        return res.status(400).json({ success: false, error: 'Required: fromAddress, toAddress, amount, privateKey (or use fromAgentId)' });
      }
      fromAddress = reqFromAddress;
      senderBalance = state.getBalanceOf?.(fromAddress) || state.balances?.[fromAddress] || 0;
    }
    else {
      return res.status(400).json({
        success: false,
        error: 'Provide either fromAgentId (server-managed) or fromAddress + privateKey (direct mode)'
      });
    }

    if (!toAddress) {
      return res.status(400).json({ success: false, error: 'toAddress is required' });
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

    // Sign transaction (Mode A: server signs on behalf of agent; Mode B: user provides privateKey)
    if (wallet && !privateKey) {
      // Server-managed: sign using the agent's wallet instance
      const { sign } = await import('../../wallet/genesisWallet.js');
      const tempWallet = { address: wallet.address, secretKey: wallet.privateKey?.toString?.('hex') || '' };
      if (tempWallet.secretKey) {
        tx.signature = await sign(tempWallet, JSON.stringify(tx));
      }
      // If no secretKey available, skip signature for server-managed transfers
    } else if (privateKey) {
      const { sign } = await import('../../wallet/genesisWallet.js');
      const userWallet = { address: fromAddress, secretKey: privateKey };
      tx.signature = await sign(userWallet, JSON.stringify(tx));
    }

    // Update balances (both agent wallet and blockchain state)
    if (state.setBalance) {
      state.setBalance(fromAddress, senderBalance - total);
      const recipientBalance = state.getBalance?.(toAddress) || state.balances?.[toAddress] || 0;
      state.setBalance(toAddress, recipientBalance + amountNum);
    }

    // Also update agent wallet balance if using Mode A
    if (fromAgentId && wallet) {
      wallet.balance -= BigInt(total);
      wallet.nonce++;
      agentWalletManager._saveRegistry?.();
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
        status: 'pending',
        mode: fromAgentId ? 'agent-managed' : 'direct'
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

// NOTE: Concrete routes MUST be registered BEFORE parameterized routes
// to prevent Express from matching 'list'/'stats' as :agentId values.

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
 * Auth: admin-secret required (production) or devnet mode
 */
router.post('/agent/transfer', async (req, res) => {
  try {
    // Auth guard: require admin credit secret for write operations
    if (!verifyCreditSecret(req)) {
      return res.status(403).json({
        success: false,
        error: 'Transfer requires admin credit secret authentication'
      });
    }

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
 * Auth: admin-secret required
 */
router.post('/agent/batch-transfer', async (req, res) => {
  try {
    // Auth guard
    if (!verifyCreditSecret(req)) {
      return res.status(403).json({
        success: false,
        error: 'Batch transfer requires admin credit secret authentication'
      });
    }

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
      'agent_registry',
      'custody_token',
      'server_side_signing'
    ]
  });
});

// ============================================================
//  Custody Token 流程（外部 Agent 接入专用）
// 私钥永远不出服务器，AGENT 通过 custody token 委托签名
// ============================================================

/**
 * POST /api/v1/wallet/custody/refresh
 * 用现有 custody token 重新签发一个新 token
 * Body: { agentId, address }（context 校验）
 * Header: x-custody-token: <旧 token>
 */
router.post('/custody/refresh', (req, res) => {
  try {
    const token = extractCustodyToken(req);
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing custody token (header x-custody-token or body.custody_token)',
        error_code: 'TOKEN_MISSING'
      });
    }

    const { agentId, address, publicKeyHex } = req.body || {};
    const verification = verifyCustodyToken(token, { agentId, address, publicKeyHex });
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: `Custody token rejected: ${verification.reason}`,
        error_code: 'TOKEN_REJECTED'
      });
    }

    // 用 token 中的 sub/addr 签发新 token
    const { sub, addr, fp } = verification.payload;
    const walletInstance = agentWalletManager.getWalletInstance(sub) || agentWalletManager.getWalletInstanceByAddress(addr);
    if (!walletInstance) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found for token subject',
        error_code: 'WALLET_NOT_FOUND'
      });
    }

    const newToken = issueCustodyToken({
      agentId: sub,
      address: addr,
      publicKeyHex: walletInstance.publicKey.toString('hex')
    });

    res.json({
      success: true,
      custody: newToken
    });
  } catch (error) {
    console.error('[Wallet API] Custody refresh error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/wallet/sign
 * 用 Agent 托管私钥对数据进行签名（外部 Agent 唯一签名通道）
 *
 * Body: {
 *   agentId: string,    // 待签名 agent
 *   data: string|object,// 待签数据
 *   action?: string,    // 操作类型（用于审计日志，不影响签名）
 *   context?: object    // 上下文（写入审计日志）
 * }
 * Header: x-custody-token: <token>
 *
 * Response: { signature, publicKey, address, agentId, algorithm }
 */
router.post('/sign', async (req, res) => {
  try {
    const token = extractCustodyToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Custody token required (header x-custody-token or body.custody_token)',
        error_code: 'CUSTODY_TOKEN_REQUIRED',
        hint: buildAuthHint('CUSTODY_TOKEN_REQUIRED', { isDevnet: process.env.NODE_ENV !== 'production' })
      });
    }

    const { agentId, data, action, context } = req.body || {};
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }
    if (data === undefined || data === null) {
      return res.status(400).json({ success: false, error: 'data is required' });
    }

    // 1) 验证 custody token（必须绑定到该 agent）
    const walletInstance = agentWalletManager.getWalletInstance(agentId);
    if (!walletInstance) {
      return res.status(404).json({ success: false, error: `Agent wallet not found: ${agentId}` });
    }
    const verification = verifyCustodyToken(token, {
      agentId,
      address: walletInstance.address,
      publicKeyHex: walletInstance.publicKey.toString('hex')
    });
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: `Custody token rejected: ${verification.reason}`,
        error_code: 'CUSTODY_TOKEN_REJECTED'
      });
    }

    // 2) 用托管私钥签名
    let result;
    try {
      result = await agentWalletManager.signForAgent(agentId, data);
    } catch (e) {
      return res.status(500).json({ success: false, error: `Signing failed: ${e.message}` });
    }

    // 3) 审计日志
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    console.log(
      `[Wallet] Custody sign: agent=${agentId} action=${action || 'unspecified'} ` +
      `dataLen=${dataStr.length} context=${context ? JSON.stringify(context) : 'none'}`
    );

    res.json({
      success: true,
      ...result,
      algorithm: 'CRYSTALS-Dilithium2 (ml_dsa44)',
      signedAt: Math.floor(Date.now() / 1000)
    });
  } catch (error) {
    console.error('[Wallet API] Sign error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;