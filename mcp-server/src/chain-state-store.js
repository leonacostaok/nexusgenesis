/**
 * chain-state-store.js — Smart Account 链上状态最小持久层 (Sprint 2.6 T2)
 *
 * 持久记录（重启后可恢复，避免内存缓存重启即丢）：
 *   - accountId -> contractAddress
 *   - sessionId -> contractAddress（经 accountId 归属）
 *   - 最近广播 txHash（per account, 环形保留）
 *   - 当前链环境（chainUrl / profile）
 *
 * 只持久化可序列化元数据；`conn`（ethers Contract 运行时对象）不落盘，
 * 恢复时由调用方用 provider + artifact.abi 重建。
 *
 * 启用方式：设置 SMART_ACCOUNT_STATE_FILE=<path>。未设置 → 纯内存（向后兼容）。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_TX_HASHES_PER_ACCOUNT = 20;
const MAX_TX_RECORDS = 200;

// ── 交易台账 (Sprint 2.7 T3) ─────────────────────────────────────────────
// submitted → mined → confirmed → failed 生命周期记录。随状态文件持久化，
// 重启后由 initTxLedger 从落盘状态恢复；纯内存模式（未设状态文件）仅驻留进程内。
let txLedger = [];

/** 读取状态文件路径（env 驱动；未设置返回 null → 纯内存模式）。 */
export function getChainStateFile() {
  return process.env.SMART_ACCOUNT_STATE_FILE || null;
}

/** 序列化一个 entry 的可持久字段（剥离 conn 等运行时对象）。 */
export function serializeEntry(entry) {
  return {
    accountId: entry.accountId,
    contractAddress: entry.contractAddress,
    owner: entry.owner,
    emergencyKey: entry.emergencyKey,
    chainUrl: entry.chainUrl,
    profile: entry.profile || null,
    currentSessionId: entry.currentSessionId || null,
    txHashes: Array.isArray(entry.txHashes) ? entry.txHashes : [],
    sessions: Array.from((entry.sessions || new Map()).values()).map((s) => ({
      sessionId: s.sessionId,
      agentId: s.agentId,
      agentEvmAddress: s.agentEvmAddress,
      issuedAt: s.issuedAt,
      expiresAt: s.expiresAt,
      maxPerTx: String(s.maxPerTx ?? ''),
      maxDaily: String(s.maxDaily ?? ''),
      whitelist: {
        allowedChains: s.whitelist?.allowedChains ?? [],
        allowedAssets: s.whitelist?.allowedAssets ?? [],
        allowedContracts: s.whitelist?.allowedContracts ?? [],
        allowedMethods: s.whitelist?.allowedMethods ?? [],
        allowedRecipients: s.whitelist?.allowedRecipients ?? [],
      },
    })),
  };
}

/**
 * 全量加载持久状态。
 * @returns {{ chainUrl: string|null, profile: string|null, accounts: object[], transactions: object[], simulations: object[] }}
 */
export function loadChainState() {
  const file = getChainStateFile();
  if (!file || !existsSync(file)) {
    return { chainUrl: null, profile: null, accounts: [], transactions: [], simulations: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return {
      chainUrl: raw.chainUrl ?? null,
      profile: raw.profile ?? null,
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      simulations: Array.isArray(raw.simulations) ? raw.simulations : [],
    };
  } catch {
    // 损坏的状态文件不应阻塞启动 —— 视为空状态（fail-open 于启动，fail-closed 于交易）。
    return { chainUrl: null, profile: null, accounts: [], transactions: [], simulations: [] };
  }
}

/** 保存全量状态（原子写：先写临时文件再 rename）。 */
export function saveChainState({ chainUrl, profile, accounts, transactions, simulations }) {
  const file = getChainStateFile();
  if (!file) return; // 纯内存模式：不落盘
  const tmp = `${file}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  const payload = JSON.stringify(
    {
      chainUrl,
      profile,
      accounts,
      transactions: transactions ?? [],
      simulations: simulations ?? [],
      savedAt: new Date().toISOString(),
    },
    null,
    2,
  );
  writeFileSync(tmp, payload, 'utf8');
  // rename 在 Windows 上对已存在目标可能失败 → 退化为直接覆盖写。
  try {
    writeFileSync(file, payload, 'utf8');
    if (existsSync(tmp)) unlinkSync(tmp);
  } catch {
    /* 直接覆盖已成功，清理失败可忽略 */
  }
}

/**
 * 记录一次广播 txHash（per account 环形保留，避免无限增长）。
 * @param {object} entry 内存 entry（会原地更新 txHashes）
 * @param {string} txHash
 */
export function recordBroadcast(entry, txHash) {
  if (!txHash) return;
  if (!Array.isArray(entry.txHashes)) entry.txHashes = [];
  entry.txHashes.push(txHash);
  if (entry.txHashes.length > MAX_TX_HASHES_PER_ACCOUNT) {
    entry.txHashes = entry.txHashes.slice(-MAX_TX_HASHES_PER_ACCOUNT);
  }
}

// ── 交易台账 API (Sprint 2.7 T3) ─────────────────────────────────────────

/** 从落盘状态初始化台账（重启恢复；纯内存模式传入空态）。 */
export function initTxLedger(state) {
  txLedger = Array.isArray(state?.transactions) ? state.transactions : [];
}

/**
 * 记录一笔交易生命周期事实。
 * @param {object} rec { txHash, accountId, sessionId, status, errorName?, blockNumber?, gasUsed?, submittedAt, ... }
 */
export function recordTx(rec) {
  if (!rec || !rec.txHash) return null;
  txLedger.push(rec);
  if (txLedger.length > MAX_TX_RECORDS) {
    txLedger = txLedger.slice(-MAX_TX_RECORDS);
  }
  return rec;
}

/** 当前台账全量（供持久化写入状态文件）。 */
export function getTxLedger() {
  return txLedger;
}

/**
 * 查询交易台账。
 * @param {object} [opts]
 * @param {string} [opts.txHash] 精确匹配一笔交易
 * @param {string} [opts.accountId] 按账户过滤
 * @param {number} [opts.limit=50] 最多返回条数
 */
export function listTx({ txHash, accountId, limit = 50 } = {}) {
  let rows = txLedger;
  if (txHash) rows = rows.filter((r) => r.txHash === txHash);
  if (accountId) rows = rows.filter((r) => r.accountId === accountId);
  return rows.slice(-limit);
}

/** 测试隔离：清空台账。 */
export function __resetTxLedgerForTest() {
  txLedger = [];
}
