/**
 * NexusGenesis - Agent Wallet Manager
 * Agent钱包统一管理桥接层
 *
 * 职责:
 * 1. Agent钱包注册表 — 每个Agent自动拥有PQC钱包
 * 2. 钱包生命周期 — 创建/加载/保存/导出/导入
 * 3. 水龙头集成 — 新Agent自动领取初始NGEN
 * 4. 交易nonce管理 — 防止重放攻击
 * 5. 多Agent钱包隔离 — 互不干扰
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PQCWallet, Transaction, validateAddress } from './pqcWallet.js';
import { generateKeyPair, sign, verify, hash } from '../crypto/pqc.js';
import tokenFaucet from '../faucet/tokenFaucet.js';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  isValidEnvelope
} from './walletEncryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WALLET_DATA_DIR = path.join(__dirname, '../../data/wallets');
const AGENTS_DATA_DIR = path.join(__dirname, '../../data/agents');
const AGENT_WALLET_REGISTRY = path.join(WALLET_DATA_DIR, 'agent_wallet_registry.json');
const WALLET_ENCRYPTION_KEY_PATH = path.join(WALLET_DATA_DIR, '.wallet_master_key');

const DEFAULT_INITIAL_BALANCE = 1000n;
const MAX_TRANSFER_AMOUNT = 100000000n; // 100M NGEN
const MIN_TRANSFER_AMOUNT = 1n;

class AgentWalletManager {
  constructor() {
    this.registry = new Map();       // agentId → { wallet, metadata }
    this.addressIndex = new Map();   // address → agentId
    this.nonceMap = new Map();       // agentId → current nonce
    this.masterKey = null;           // AES master key (loaded from file or env)
    this._pendingEncrypt = new Set();// Legacy plaintext keys awaiting encryption
    this.stats = {
      totalWallets: 0,
      totalBalance: 0n,
      totalTransactions: 0,
      activeWallets: 0
    };

    this._initDirectories();
    this._loadOrCreateMasterKey();
    this._loadRegistry();
  }

  _initDirectories() {
    if (!fs.existsSync(WALLET_DATA_DIR)) {
      fs.mkdirSync(WALLET_DATA_DIR, { recursive: true });
    }
  }

  /**
   * Load server-side master key used to encrypt agent private keys at rest.
   * Resolution order:
   *   1. NG_WALLET_MASTER_KEY env var (base64, 32 bytes)
   *   2. .wallet_master_key file in data/wallets/
   * If neither exists, generate a new one and persist to file with 0600 perms.
   * File-based keys are dev-only; production should use env var or KMS.
   */
  _loadOrCreateMasterKey() {
    const envKey = process.env.NG_WALLET_MASTER_KEY;
    if (envKey) {
      try {
        const buf = Buffer.from(envKey, 'base64');
        if (buf.length === 32) {
          this.masterKey = buf;
          console.log('[AgentWallet] Master key loaded from NG_WALLET_MASTER_KEY env var');
          return;
        }
        console.warn(`[AgentWallet] NG_WALLET_MASTER_KEY wrong length: ${buf.length}, falling back to file`);
      } catch (e) {
        console.warn('[AgentWallet] Failed to decode NG_WALLET_MASTER_KEY:', e.message);
      }
    }

    if (fs.existsSync(WALLET_ENCRYPTION_KEY_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(WALLET_ENCRYPTION_KEY_PATH, 'utf8'));
        if (data.key && data.cipher === 'plain-file') {
          // Dev-only fallback: legacy plaintext key
          this.masterKey = Buffer.from(data.key, 'hex');
          console.warn('[AgentWallet] WARNING: master key loaded from plaintext file (dev only). Set NG_WALLET_MASTER_KEY in production.');
          return;
        }
      } catch (e) {
        console.warn('[AgentWallet] Failed to load master key file:', e.message);
      }
    }

    // Generate new master key
    this.masterKey = require('crypto').randomBytes(32);
    fs.writeFileSync(WALLET_ENCRYPTION_KEY_PATH, JSON.stringify({
      key: this.masterKey.toString('hex'),
      cipher: 'plain-file',
      createdAt: new Date().toISOString(),
      warning: 'DEV ONLY. Set NG_WALLET_MASTER_KEY env var in production.'
    }, null, 2), { mode: 0o600 });
    console.log('[AgentWallet] Generated new master key at', WALLET_ENCRYPTION_KEY_PATH);
  }

  _loadRegistry() {
    try {
      if (fs.existsSync(AGENT_WALLET_REGISTRY)) {
        const data = JSON.parse(fs.readFileSync(AGENT_WALLET_REGISTRY, 'utf8'));
        for (const entry of data.entries || []) {
          const walletData = entry.wallet_data;
          if (!walletData || !walletData.publicKey) continue;

          try {
            const publicKey = Buffer.from(walletData.publicKey, 'hex');
            const balance = BigInt(walletData.balance || 0);
            const nonce = walletData.nonce || 0;

            // Decrypt private key (if encrypted) or read plaintext (legacy)
            let privateKey;
            if (walletData.encryptedPrivateKey) {
              if (!isValidEnvelope(walletData.encryptedPrivateKey)) {
                console.warn(`[AgentWallet] Invalid envelope for ${entry.agentId}, skipping`);
                continue;
              }
              // Use master key as password to decrypt the envelope
              const envelopePwd = this.masterKey.toString('hex');
              privateKey = decryptPrivateKey(walletData.encryptedPrivateKey, envelopePwd);
            } else if (walletData.privateKey) {
              // LEGACY: plaintext private key. Migrate to encrypted form on next save.
              console.warn(`[AgentWallet] Legacy plaintext key for ${entry.agentId} - will be encrypted on next save`);
              privateKey = Buffer.from(walletData.privateKey, 'hex');
              this._pendingEncrypt.add(entry.agentId);
            } else {
              continue;
            }

            const wallet = new PQCWallet(publicKey, privateKey, balance, nonce);

            this.registry.set(entry.agentId, {
              wallet,
              metadata: entry.metadata || {}
            });
            this.addressIndex.set(wallet.address, entry.agentId);
            this.nonceMap.set(entry.agentId, nonce);
          } catch (e) {
            console.error(`[AgentWallet] Failed to restore wallet for ${entry.agentId}:`, e.message);
          }
        }

        this.stats.totalWallets = data.stats?.totalWallets || this.registry.size;
        this.stats.totalTransactions = data.stats?.totalTransactions || 0;

        // Migrate any legacy plaintext entries to encrypted form
        if (this._pendingEncrypt.size > 0) {
          console.log(`[AgentWallet] Migrating ${this._pendingEncrypt.size} legacy plaintext keys to AES-256-GCM...`);
          this._saveRegistry();
        }

        console.log(`[AgentWallet] Loaded ${this.registry.size} agent wallets from registry`);
      }
    } catch (e) {
      console.warn('[AgentWallet] Could not load registry, starting fresh:', e.message);
    }
  }

  _saveRegistry() {
    try {
      const entries = [];
      const envelopePwd = this.masterKey.toString('hex');

      for (const [agentId, entry] of this.registry) {
        // Encrypt private key with AES-256-GCM
        const envelope = encryptPrivateKey(entry.wallet.privateKey, envelopePwd, {
          address: entry.wallet.address,
          agentId,
          publicKey: entry.wallet.publicKey.toString('hex')
        });

        entries.push({
          agentId,
          wallet_data: {
            address: entry.wallet.address,
            publicKey: entry.wallet.publicKey.toString('hex'),
            encryptedPrivateKey: envelope,  // AES-256-GCM envelope (no plaintext)
            balance: entry.wallet.balance.toString(),
            nonce: entry.wallet.nonce
          },
          metadata: entry.metadata
        });
      }

      fs.writeFileSync(AGENT_WALLET_REGISTRY, JSON.stringify({
        entries,
        stats: {
          totalWallets: this.stats.totalWallets,
          totalTransactions: this.stats.totalTransactions
        },
        encryption: {
          cipher: 'aes-256-gcm',
          kdf: 'pbkdf2-sha512',
          version: '1.0'
        },
        updatedAt: new Date().toISOString()
      }, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2), { mode: 0o600 });
    } catch (e) {
      console.error('[AgentWallet] Failed to save registry:', e.message);
    }
  }

  /**
   * 为Agent创建新的PQC钱包
   * @param {string} agentId - Agent唯一标识
   * @param {object} metadata - Agent元数据
   * @param {bigint} initialBalance - 初始余额
   * @returns {Promise<object>} 钱包信息
   */
  async createAgentWallet(agentId, metadata = {}, initialBalance = null) {
    agentId = String(agentId);
    if (this.registry.has(agentId)) {
      const existing = this.registry.get(agentId);
      return this._formatWalletResponse(agentId, existing.wallet, existing.metadata);
    }

    try {
      const wallet = await PQCWallet.generate(initialBalance || DEFAULT_INITIAL_BALANCE);

      this.registry.set(agentId, {
        wallet,
        metadata: { ...metadata, created: new Date().toISOString() }
      });
      this.addressIndex.set(wallet.address, agentId);
      this.nonceMap.set(agentId, 0);
      this.stats.totalWallets++;

      await wallet.save(
        path.join(WALLET_DATA_DIR, `agent_${agentId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`),
        this.masterKey.toString('hex')
      );
      this._saveRegistry();

      console.log(`[AgentWallet] Created wallet for agent ${agentId}: ${wallet.address}`);
      return this._formatWalletResponse(agentId, wallet, metadata);
    } catch (e) {
      console.error(`[AgentWallet] Failed to create wallet for ${agentId}:`, e.message);
      throw e;
    }
  }

  /**
   * 为Agent从水龙头领取初始代币
   * @param {string} agentId - Agent ID
   * @param {string} ip - IP地址(用于速率限制)
   * @returns {Promise<object>}
   */
  async claimFaucet(agentId, ip = '127.0.0.1') {
    const entry = this.registry.get(agentId);
    if (!entry) {
      return { success: false, reason: 'Agent wallet not found. Create wallet first.' };
    }

    const eligibility = tokenFaucet.checkEligibility(entry.wallet.address);
    if (!eligibility.eligible) {
      return {
        success: false,
        reason: 'Not eligible for faucet',
        cooldownMs: eligibility.addressCooldownRemainingMs,
        nextEligibleAt: new Date(Date.now() + eligibility.addressCooldownRemainingMs).toISOString()
      };
    }

    const result = tokenFaucet.dripToAddress(ip, entry.wallet.address, Number(DEFAULT_INITIAL_BALANCE));
    if (result.success) {
      entry.wallet.balance += DEFAULT_INITIAL_BALANCE;
      this._saveRegistry();
    }

    return result;
  }

  /**
   * 获取Agent的钱包
   * @param {string} agentId - Agent ID
   * @returns {object|null} 钱包信息
   */
  getAgentWallet(agentId) {
    const entry = this.registry.get(agentId);
    if (!entry) return null;
    return this._formatWalletResponse(agentId, entry.wallet, entry.metadata);
  }

  getWalletInstance(agentId) {
    return this.registry.get(agentId)?.wallet || null;
  }

  getWalletInstanceByAddress(address) {
    const agentId = this.getAgentByAddress(address);
    if (!agentId) return null;
    return this.getWalletInstance(agentId);
  }

  /**
   * 通过地址查找Agent ID
   * @param {string} address - 钱包地址
   * @returns {string|null} Agent ID
   */
  getAgentByAddress(address) {
    return this.addressIndex.get(address) || null;
  }

  /**
   * 查询Agent余额
   * @param {string} agentId - Agent ID
   * @returns {object} 余额信息
   */
  getBalance(agentId) {
    const entry = this.registry.get(agentId);
    if (!entry) {
      return { success: false, reason: 'Agent wallet not found' };
    }

    return {
      success: true,
      agentId,
      address: entry.wallet.address,
      balance: Number(entry.wallet.balance),
      balanceRaw: entry.wallet.balance.toString(),
      symbol: 'NGEN',
      nonce: entry.wallet.nonce
    };
  }

  /**
   * Agent之间转账
   * @param {string} fromAgentId - 发送方Agent ID
   * @param {string} toAddressOrAgentId - 接收方地址或Agent ID
   * @param {bigint|number} amount - 转账金额
   * @param {string} memo - 备注
   * @returns {Promise<object>} 交易结果
   */
  async transfer(fromAgentId, toAddressOrAgentId, amount, memo = '') {
    const fromEntry = this.registry.get(fromAgentId);
    if (!fromEntry) {
      return { success: false, reason: 'Sender wallet not found' };
    }

    let toAddress = toAddressOrAgentId;

    // 如果传入的是Agent ID，解析为地址
    if (this.registry.has(toAddressOrAgentId)) {
      toAddress = this.registry.get(toAddressOrAgentId).wallet.address;
    } else if (toAddressOrAgentId.startsWith('ng1')) {
      // 已经是地址
    } else {
      // 尝试从地址索引查找
      const agentFromAddr = this.addressIndex.get(toAddressOrAgentId);
      if (agentFromAddr && this.registry.has(agentFromAddr)) {
        toAddress = toAddressOrAgentId;
      }
    }

    const amountBigInt = BigInt(amount);

    if (amountBigInt < MIN_TRANSFER_AMOUNT) {
      return { success: false, reason: `Minimum transfer is ${MIN_TRANSFER_AMOUNT} NGEN` };
    }
    if (amountBigInt > MAX_TRANSFER_AMOUNT) {
      return { success: false, reason: `Maximum transfer is ${MAX_TRANSFER_AMOUNT} NGEN` };
    }

    const { valid, reason } = validateAddress(toAddress);
    if (!valid) {
      return { success: false, reason: `Invalid recipient address: ${reason}` };
    }

    if (!fromEntry.wallet.hasEnoughBalance(amountBigInt + 1n)) {
      return {
        success: false,
        reason: `Insufficient balance. Have: ${fromEntry.wallet.balance}, need: ${amountBigInt + 1n}`
      };
    }

    try {
      // 代谢税 0.1%（与白皮书一致）
      const METABOLIC_TAX_RATE = 1000n; // 0.1% = 1/1000
      const tax = amountBigInt / METABOLIC_TAX_RATE;
      const netAmount = amountBigInt - tax;
      const fee = 1n; // 固定转账费
      const totalDeduct = amountBigInt + fee;

      const tx = Transaction.create(fromEntry.wallet, toAddress, amountBigInt, fee, 'TRANSFER', {
        memo,
        agentId: fromAgentId,
        metabolicTax: tax,
        netAmount: netAmount
      });

      await tx.sign(fromEntry.wallet);

      fromEntry.wallet.balance -= totalDeduct;
      fromEntry.wallet.nonce++;
      this.nonceMap.set(fromAgentId, fromEntry.wallet.nonce);

      // 代谢税流入 Observer 物理桥接基金
      if (tax > 0n) {
        const OBSERVER_ADDR = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
        console.log(`[AgentWallet] Metabolic tax: ${tax} NGEN → Observer (${OBSERVER_ADDR})`);
      }

      // 如果接收方是我们的Agent，自动入账（净金额）
      const toAgentId = this.getAgentByAddress(toAddress);
      if (toAgentId && this.registry.has(toAgentId)) {
        const toEntry = this.registry.get(toAgentId);
        toEntry.wallet.balance += netAmount;
      }

      this.stats.totalTransactions++;
      this._saveRegistry();

      return {
        success: true,
        transactionId: tx.id,
        from: fromEntry.wallet.address,
        to: toAddress,
        amount: Number(amountBigInt),
        netAmount: Number(netAmount),
        metabolicTax: Number(tax),
        fee: Number(fee),
        memo,
        timestamp: tx.timestamp,
        signature: tx.signature?.substring(0, 32) + '...'
      };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  }

  /**
   * 批量转账 — 一个Agent向多个Agent转账
   * @param {string} fromAgentId - 发送方
   * @param {Array<{to: string, amount: number|bigint, memo?: string}>} transfers
   * @returns {Promise<object>}
   */
  async batchTransfer(fromAgentId, transfers) {
    const results = [];
    for (const transfer of transfers) {
      const result = await this.transfer(fromAgentId, transfer.to, transfer.amount, transfer.memo || '');
      results.push(result);
    }
    return {
      success: results.every(r => r.success),
      totalTransfers: transfers.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * 获取Agent交易列表
   * @param {string} agentId - Agent ID
   * @param {object} options - { limit, offset }
   * @returns {object}
   */
  getTransactionHistory(agentId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const entry = this.registry.get(agentId);
    if (!entry) {
      return { success: false, reason: 'Agent wallet not found' };
    }

    // 从全局状态读取交易记录
    const transactions = global.globalState?.getTransactionsForAddress?.(entry.wallet.address) || [];
    const total = transactions.length;
    const page = transactions.slice(offset, offset + limit);

    return {
      success: true,
      agentId,
      address: entry.wallet.address,
      transactions: page.map(tx => ({
        id: tx.id || tx.hash,
        type: tx.type || 'transfer',
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        fee: tx.fee,
        timestamp: tx.timestamp,
        direction: tx.from === entry.wallet.address ? 'send' : 'receive'
      })),
      total,
      limit,
      offset
    };
  }

  /**
   * 导出Agent钱包（加密）
   * @param {string} agentId - Agent ID
   * @param {string} password - 加密密码
   * @returns {object|null}
   */
  exportAgentWallet(agentId, password) {
    const entry = this.registry.get(agentId);
    if (!entry) return null;
    return entry.wallet.exportEncrypted(password);
  }

  /**
   * 从加密数据导入Agent钱包
   * @param {string} agentId - Agent ID
   * @param {object} encrypted - 加密的钱包数据
   * @param {string} password - 解密密码
   * @returns {boolean}
   */
  importAgentWallet(agentId, encrypted, password) {
    const wallet = PQCWallet.importEncrypted(encrypted, password);
    if (!wallet) return false;

    this.registry.set(agentId, {
      wallet,
      metadata: { imported: new Date().toISOString() }
    });
    this.addressIndex.set(wallet.address, agentId);
    this.nonceMap.set(agentId, wallet.nonce);
    this._saveRegistry();
    return true;
  }

  /**
   * 刷新Agent余额（从区块链状态同步）
   * @param {string} agentId - Agent ID
   * @param {object} blockchainState - 区块链状态对象
   * @returns {object}
   */
  syncBalance(agentId, blockchainState) {
    const entry = this.registry.get(agentId);
    if (!entry) return { success: false, reason: 'Agent wallet not found' };

    const onChainBalance = blockchainState?.getBalance?.(entry.wallet.address)
      || blockchainState?.balances?.[entry.wallet.address]
      || 0;

    const onChainNonce = blockchainState?.getNonce?.(entry.wallet.address)
      || blockchainState?.nonces?.[entry.wallet.address]
      || entry.wallet.nonce;

    // Wallet-sync fix: previously this method OVERWROTE the wallet's in-memory
    // balance with the on-chain balance. When the on-chain state had not yet
    // been endowed (a long-standing bug now fixed in state.applyAgentRegister),
    // every syncBalance call would silently zero out the 1000 NGEN soft
    // allocation. Even with the on-chain fix in place, an overwrite is the
    // wrong semantic: the on-chain balance is authoritative for spent/locked
    // funds, but the wallet manager may also track off-chain allocations
    // (faucet claims, etc.). Take the max so neither side silently loses
    // value, and never decrease the wallet balance via a read-only sync.
    const onChainBigInt = BigInt(onChainBalance);
    if (onChainBigInt > entry.wallet.balance) {
      entry.wallet.balance = onChainBigInt;
    }
    entry.wallet.nonce = onChainNonce;

    this._saveRegistry();

    return {
      success: true,
      agentId,
      address: entry.wallet.address,
      balance: Number(entry.wallet.balance),
      onChainBalance: Number(onChainBigInt),
      nonce: onChainNonce
    };
  }

  /**
   * 更新Agent余额
   */
  updateBalance(agentId, amount) {
    const entry = this.registry.get(agentId);
    if (!entry) return false;
    entry.wallet.balance = amount;
    this._saveRegistry();
    return true;
  }

  /**
   * 列出所有Agent钱包
   * @returns {Array}
   */
  listAllWallets() {
    const wallets = [];
    for (const [agentId, entry] of this.registry) {
      wallets.push(this._formatWalletResponse(agentId, entry.wallet, entry.metadata));
    }
    return wallets;
  }

  /**
   * 列出所有Agent钱包地址
   * @returns {Array<{agentId: string, address: string}>}
   */
  listAllAddresses() {
    const addresses = [];
    for (const [agentId, entry] of this.registry) {
      addresses.push({
        agentId,
        address: entry.wallet.address,
        balance: Number(entry.wallet.balance)
      });
    }
    return addresses;
  }

  /**
   * 获取钱包统计
   * @returns {object}
   */
  getStats() {
    let totalBalance = 0n;
    for (const [, entry] of this.registry) {
      totalBalance += entry.wallet.balance;
    }

    return {
      totalWallets: this.registry.size,
      totalBalance: Number(totalBalance),
      totalTransactions: this.stats.totalTransactions,
      activeWallets: [...this.registry.values()].filter(e => e.wallet.balance > 0n).length,
      agentIds: [...this.registry.keys()]
    };
  }

  /**
   * 验证交易签名
   * @param {string} agentId - Agent ID
   * @param {object} txData - 交易数据
   * @param {string} signature - 签名
   * @returns {Promise<boolean>}
   */
  async verifyTransaction(agentId, txData, signature) {
    const entry = this.registry.get(agentId);
    if (!entry) return false;

    return await PQCWallet.verify(
      JSON.stringify(txData),
      signature,
      entry.wallet.publicKey
    );
  }

  /**
   * 用 Agent 托管私钥对数据进行签名（server-side signing，custody token 流程用）
   * @param {string} agentId - Agent ID
   * @param {string|object} data - 待签名数据
   * @returns {Promise<{ signature: string, publicKey: string, address: string }>}
   */
  async signForAgent(agentId, data) {
    const entry = this.registry.get(agentId);
    if (!entry) {
      throw new Error(`signForAgent: Agent not found: ${agentId}`);
    }
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const sig = await sign(dataStr, entry.wallet.privateKey);
    return {
      signature: sig.toString('hex'),
      publicKey: entry.wallet.publicKey.toString('hex'),
      address: entry.wallet.address,
      agentId
    };
  }

  _formatWalletResponse(agentId, wallet, metadata = {}) {
    return {
      agentId,
      address: wallet.address,
      balance: Number(wallet.balance),
      balanceRaw: wallet.balance.toString(),
      symbol: 'NGEN',
      nonce: wallet.nonce,
      publicKey: wallet.publicKey.toString('hex'),
      created: metadata.created || null,
      imported: metadata.imported || null
    };
  }

  /**
   * 从磁盘中的Agent文件引导钱包
   * 扫描 data/agents/ 目录，为没有钱包的Agent自动创建钱包和水龙头
   * @returns {Promise<object>} 引导结果
   */
  async bootstrapFromAgentFiles() {
    const result = { scanned: 0, existing: 0, created: 0, faucetClaimed: 0, errors: 0 };

    if (!fs.existsSync(AGENTS_DATA_DIR)) {
      console.log('[AgentWallet Bootstrap] Agents directory not found, skipping.');
      return result;
    }

    const files = fs.readdirSync(AGENTS_DATA_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      result.scanned++;

      if (file === 'agents_summary.json') continue;

      const agentId = file.replace('.json', '');
      if (!agentId || /^\d+$/.test(agentId)) continue;

      try {
        const agentData = JSON.parse(fs.readFileSync(path.join(AGENTS_DATA_DIR, file), 'utf8'));
        const effectiveId = agentData.id || agentId;

        if (!effectiveId || (typeof effectiveId === 'number') || /^\d+$/.test(String(effectiveId))) continue;
        if (this.registry.has(String(effectiveId))) {
          result.existing++;
          continue;
        }

        const metadata = {
          type: agentData.name || 'agent',
          capabilities: agentData.capabilities || []
        };

        const wallet = await this.createAgentWallet(effectiveId, metadata);
        result.created++;
        console.log(`[AgentWallet Bootstrap] Created wallet for ${effectiveId}: ${wallet.address}`);

        try {
          const faucetResult = await this.claimFaucet(effectiveId);
          if (faucetResult.success) {
            result.faucetClaimed++;
            console.log(`[AgentWallet Bootstrap] Faucet claimed for ${effectiveId}`);
          }
        } catch (e) {
          // 水龙头失败不影响流程
        }
      } catch (e) {
        result.errors++;
        console.error(`[AgentWallet Bootstrap] Error for ${agentId}:`, e.message);
      }
    }

    console.log(`[AgentWallet Bootstrap] Done: scanned=${result.scanned}, existing=${result.existing}, created=${result.created}, faucet=${result.faucetClaimed}, errors=${result.errors}`);
    return result;
  }
}

const agentWalletManager = new AgentWalletManager();

export { AgentWalletManager };
export default agentWalletManager;
