/**
 * relayer-operations.js — Relayer 运营化 (Sprint 4 T3)
 *
 * 把「能广播」升级成「可运营广播」：
 *   T3.1 nonce 冲突恢复：区分「合约意图 nonce 重放」(BadNonce，确定性，不可重试，
 *        fail-closed) 与「relayer EOA nonce 冲突」(NONCE_CONFLICT，节点/本地状态
 *        问题，重试即恢复)。ethers 的 cacheTimeout:-1 让每次 populate 都重读 nonce，
 *        重试天然带 fresh nonce —— 不额外搬移状态。
 *   T3.2 RPC 抖动重试：瞬时失败（连接/超时/限额）指数退避重试；广播后 wait 失败
 *        先对账 receipt（链上已落账则复用结果，绝不盲目重发）。
 *
 * 分层：Relayer 层只负责「广播得出去、不重复广播」；合约层（SmartAccount）
 *       仍是意图 nonce / 限额 / 白名单的最终裁决者。
 *
 * 环境变量（全部可选）：
 *   RELAYER_MAX_RETRIES        — 首次之外的额外重试次数（默认 2，上限 5）
 *   RELAYER_RETRY_BACKOFF_MS   — 退避基准（默认 250，指数 ×2^attempt）
 */

import { SMART_ACCOUNT_ERRORS } from './smart-account-errors.js';

/** Clamp 一个 env 整数到 [min, max]；未设置/非法时用 fallback。 */
function clampInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 分类一次 executeFromAgent 失败结果：可重试 or 确定性拒绝。
 *
 * 关键区分（T3.1）：
 *   - errorName === 'BadNonce'（合约意图 nonce 重放，INV-007）→ 确定性，重试只会
 *     反复重发同一个重放意图 → 不可重试（fail-closed，交给调用方重建 payload）。
 *   - reason 命中 relayer EOA nonce 冲突特征（"nonce too low" / "incorrect nonce"
 *     / replacement 等）→ 节点或本地广播状态问题 → 可重试（重试即重读 fresh nonce）。
 *   - RPC/网络/限额特征 → 瞬时 → 可重试。
 *   - 其余合约自定义错误（限额/白名单/签名等）→ 确定性 → 不可重试。
 *
 * @param {object} res - executeFromAgent 返回
 * @returns {{ retryable: boolean, code: string }}
 */
export function classifyRelayerFailure(res) {
  const errorName = res?.errorName ?? null;
  const reason = String(res?.reason ?? '');

  // 已解码的合约自定义错误 → 一律确定性（限额/白名单/签名/重放），无论 reason 文本
  // 是否含 "eth_call"/"network" 等字样。顺序必须在前：estimateGas 路径的 reason 常常
  // 携带这些 RPC 特征词，若先做 reason 匹配会把合约拒绝误判成可重试 RPC_ERROR
  // （白等退避 + 审计错误码失真）。
  if (errorName && SMART_ACCOUNT_ERRORS.includes(errorName)) {
    return { retryable: false, code: errorName };
  }

  // relayer EOA nonce 冲突（无合约错误名）：重试（ether 每次 populate 重读 nonce）即可恢复。
  if (/(nonce too low|incorrect nonce|doesn't have the correct nonce|replacement transaction underpriced|same nonce)/i.test(reason)) {
    return { retryable: true, code: 'NONCE_CONFLICT' };
  }

  // RPC / 网络 / 限额 瞬时失败：可重试。
  if (/(ECONNREFUSED|ECONNRESET|timeout|net_version|eth_call|network|429|rate limit|CONNECTION|ENOTFOUND|EAI_AGAIN|socket)/i.test(reason)) {
    return { retryable: true, code: 'RPC_ERROR' };
  }

  // 未知（UNKNOWN_REVERT 等）：不猜测可重试性 —— fail-closed，交给调用方。
  return { retryable: false, code: errorName ?? 'UNKNOWN_REVERT' };
}

/**
 * 对账一个已广播但 wait 失败的 txHash：查链上 receipt，已落账则解出结构化结果。
 * @param {object} conn - ChainConnection（需 .contract.interface）
 * @param {object} provider - 支持 getTransactionReceipt 的 provider
 * @param {string} txHash
 * @returns {Promise<object|null>} 已落账 → executeFromAgent 同构结果；否则 null
 */
export async function reconcileReceipt(conn, provider, txHash) {
  if (!provider || !txHash) return null;
  let receipt = null;
  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch {
    return null;
  }
  if (!receipt) return null;
  if (receipt.status === 0) {
    return { ok: false, txHash, receipt, errorName: null, reason: 'transaction reverted on-chain' };
  }
  const executed = (receipt.logs ?? [])
    .map((l) => {
      try {
        return conn.contract.interface.parseLog({ topics: l.topics, data: l.data });
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === 'Executed');
  return {
    ok: true,
    txHash,
    receipt,
    txId: executed ? executed.args.txId : null,
    amount: executed ? executed.args.amount : null,
    sessionId: executed ? executed.args.sessionId : null,
  };
}

/**
 * 带韧性的 execute 广播（T3.1 + T3.2）。
 *
 * 重试规则：
 *   - 可重试失败（RPC 抖动 / EOA nonce 冲突）→ 指数退避重试（最多 maxRetries 次
 *     额外尝试）；每次重发 ethers 重读 fresh nonce。
 *   - 广播成功但 wait 失败 → 先对账 txHash receipt：链上已落账直接复用结果
 *     （绝不盲目重发）；未落账才重试。
 *   - 确定性拒绝（含合约 BadNonce）→ 立即返回，不重试。
 *
 * @param {object} params
 * @param {object} params.conn - ChainConnection
 * @param {object} params.payload - canonical intent payload
 * @param {string} params.signature - 65-byte EVM 签名
 * @param {ethers.Signer} params.relayer - 广播者（CHAIN_RELAYER_PK）
 * @param {object} [params.provider] - 供对账的 provider（缺省用 conn 内部 runner）
 * @param {object} [params.opts]
 * @param {number} [params.opts.maxRetries]
 * @param {number} [params.opts.backoffMs]
 * @returns {Promise<object>} executeFromAgent 同构 + { attempts, retried, retryable?, code? }
 */
export async function executeWithRelayerResilience({ conn, payload, signature, relayer, provider, opts = {} }) {
  const maxRetries = clampInt(opts.maxRetries ?? process.env.RELAYER_MAX_RETRIES, 2, 0, 5);
  const backoffMs = clampInt(opts.backoffMs ?? process.env.RELAYER_RETRY_BACKOFF_MS, 250, 0, 10000);
  const recProvider = provider ?? (conn.contract.runner?.provider ?? (typeof conn.contract.runner?.getTransactionReceipt === 'function' ? conn.contract.runner : null));

  let attempts = 0;
  let pendingWaitFailedHash = null; // 已广播但 wait 失败的 txHash（先对账再决定重试）

  for (;;) {
    attempts += 1;
    const res = await conn.executeFromAgent({ payload, signature, signer: relayer });

    if (res.ok) return { ...res, attempts, retried: attempts > 1 };

    // 广播成功但 wait 失败：对账 —— 已落账则不重发。
    if (res.waitFailed && res.txHash) {
      pendingWaitFailedHash = res.txHash;
      const reconciled = await reconcileReceipt(conn, recProvider, res.txHash);
      if (reconciled) return { ...reconciled, attempts, retried: attempts > 1, reconciled: true };
    }

    const cls = classifyRelayerFailure(res);
    if (!cls.retryable) return { ...res, ...cls, attempts, retried: attempts > 1 };
    if (attempts > maxRetries) return { ...res, ...cls, attempts, retried: attempts > 1, retriesExhausted: true };

    await sleep(backoffMs * 2 ** (attempts - 1));
    // 退避期间广播可能已落账：重发前再对账一次，避免为已落账的意图
    // 白付一笔重复广播 gas（合约意图 nonce 保证不双花，但 gas 与 ledger
    // 条目会被浪费/污染）。
    if (pendingWaitFailedHash) {
      const landed = await reconcileReceipt(conn, recProvider, pendingWaitFailedHash);
      if (landed) return { ...landed, attempts, retried: attempts > 1, reconciled: true };
      pendingWaitFailedHash = null;
    }
  }
}
