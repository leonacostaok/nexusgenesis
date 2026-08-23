/**
 * relayer-coordinator.js — Sprint 6 T4: relayer 多实例 nonce 协调
 *
 * 问题：多个 relayer 实例并发放时，若都从节点 getTransactionCount(pending) 取
 * nonce，两实例可能拿到同一 EOA nonce，各自 sendRawTx → nonce 冲突、重复广播、
 * gas 竞争。
 *
 * 方案（设计见 Sprint6计划.md T4）：
 *   T4.1 事务级 nonce 序列表：每个 (chainUrl, broadcaster) 在共享 store 上维护
 *        idempotent counter，`acquireNonce` 原子递增 → 每个调用方拿到全局唯一的
 *        EOA nonce（不再全靠节点 pending 计数）。
 *   T4.3 锁租约防惊群：拿到的非ce 写一条 `nonce:lease:<chainUrl>:<broadcaster>:
 *        <nonce>` 记录（含 instanceId 与 at）。仅用于审计/对账——真正避免竞争
 *        的是原子递增本身（两个实例不可能拿到同 nonce）。租约不是强锁：若持有
 *        者崩溃未广播，该 nonce 可能被跳过（非ce 空洞），链上仍安全（nonce 只需
 *        单调、不需连续）。
 *   T4.2 广播对账去重：广播前调用方可查共享台账（listTx）确认该意图是否已被
 *        本族别实例落账；coordinator 提供一个 `isAlreadyLanded` 快速查询，接入
 *         executeWithRelayerResilience 时在广播前短路。
 *
 * 降级：coordinator 仅在传入共享 store 时启用。「不传 store / 单机模式」→ 完全
 * 退化为现基线（ethers 自己从节点读 nonce），绝不影响单实例行为。
 *
 * 与 INV-007 关系：intent nonce（载荷内、签入）与 EOA nonce（广播层）是两个层次。
 * 本模块只协调 EOA 广播层 nonce 分配，绝不动 intent nonce 签入语义。
 */
import { createLocalStore } from 'nexusgenesis-agent-sdk';

const COUNTER_PREFIX = 'nonce:seq:';
const LEASE_PREFIX = 'nonce:lease:';
const DEFAULT_START = 0;

const clampInt = (raw, fallback, min, max) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

const counterKey = (chainUrl, broadcaster) =>
  `${COUNTER_PREFIX}${chainUrl}:${String(broadcaster).toLowerCase()}`;

const leaseKey = (chainUrl, broadcaster, nonce) =>
  `${LEASE_PREFIX}${chainUrl}:${String(broadcaster).toLowerCase()}:${nonce}`;

/**
 * 分类一个失败结果是否由 EOA nonce 冲突引起（可重试、重读 fresh nonce 即恢复）。
 * 复用了 relayer-operations 的 classifyRelayerFailure —— 这里只取 NONCE_CONFLICT
 * 判定，避免循环依赖。
 * @param {object} res
 * @returns {boolean}
 */
export function isNonceConflict(res) {
  const errorName = res?.errorName ?? null;
  const reason = String(res?.reason ?? '');
  if (errorName) return false; // 合约 intent-nonce 重放（BadNonce）≠ EOA nonce 冲突
  return /(nonce too low|incorrect nonce|doesn't have the correct nonce|replacement transaction underpriced|same nonce)/i.test(reason);
}

/**
 * 非ce 序列表（T4.1）。
 * 在共享 store 上为一个 (chainUrl, broadcaster) 原子递增计数器，返回单调递增
 * nonce。`writeAtomically` 的 RMW + 版本 CAS 保证多实例并发时也只会各自拿到
 * 唯一值（T1 store sqlite 后端 BEGIN IMMEDIATE 串行化）。
 *
 * @param {object} store - T1 注入的 store（createLocalStore / createSqliteStore / ...）
 * @returns {{ acquireNonce: (chainUrl: string, broadcaster: string, o?: object) => Promise<number> }}
 */
export function createNonceSequencer(store) {
  const st = store || createLocalStore(); // 缺省降级为单机（T4 只在共享启用，此处兜底）
  return {
    /**
     * 原子分配下一个 EOA nonce，并写一条租约记录（审计/对账）。
     * @param {string} chainUrl
     * @param {string} broadcaster - relayer EOA 地址/私钥标识
     * @param {object} [o]
     * @param {number} [o.start] - 初始 nonce（缺省 0）
     * @param {string} [o.instanceId] - 本实例标识（审计定位哪个实例广播）
     * @returns {Promise<number>} 分配的 nonce
     */
    async acquireNonce(chainUrl, broadcaster, o = {}) {
      const key = counterKey(chainUrl, broadcaster);
      const start = o.start ?? DEFAULT_START;
      const leaseInstance = o.instanceId ?? 'local';
      let nonce;
      for (;;) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await st.writeAtomically(key, (cur) => ({
            next: (cur && Number.isFinite(Number(cur?.next)) ? Number(cur.next) : start) + 1,
          }));
          nonce = Number(r.value.next) - 1; // 返回「刚发出」的值（new.next-1）
          break;
        } catch (err) {
          // CAS 竞争（BUSY/LOCKED 已在 writeAtomically 内重试；此处兜底直接重试）
          if (/exhausted retries|CAS conflict/i.test(String(err.message))) continue;
          throw err; // IO/业务错误 → 传播（fail-closed）
        }
      }
      // 租约记录：非强锁，仅审计/对账该 nonce 归属哪个实例。
      try {
        await st.claim(leaseKey(chainUrl, broadcaster, nonce), {
          instanceId: leaseInstance,
          at: Date.now(),
        });
      } catch {
        // 租约写入失败不阻断广播——原子递增已保证唯一；记录仅审计。
      }
      return nonce;
    },
  };
}

/**
 * 广播对账去重（T4.2）：查询共享台账是否已存在「该账户 + 该意图 digest」的落账
 * 记录。对账逻辑由调用方注入（mcp-server 依赖 listTx，这里避免循环依赖）。
 *
 * @param {object} coord
 * @param {(opts: any) => Array} coord.listTx - 受查台账的函数（如 chain-state-store.listTx）
 * @returns {{
 *   isAlreadyLanded: (accountId: string, payloadDigest: string) => object|null,
 *   findLandedByDigest: (payloadDigest: string) => Array
 * }}
 */
export function createBroadcastReconciler({ listTx }) {
  return {
    /**
     * 按 (accountId, payloadDigest) 查已 confirmed/failed 落账记录（跨实例可见）。
     * @param {string} accountId
     * @param {string} payloadDigest - canonical intent digest
     * @returns {object|null}
     */
    isAlreadyLanded(accountId, payloadDigest) {
      if (!accountId || !payloadDigest || typeof listTx !== 'function') return null;
      const rows = listTx({ accountId, limit: clampInt(process.env.RELAYER_DEDUPE_SCAN, 200, 0, 2000) });
      const hit = rows.find((r) => r.digest === payloadDigest);
      return hit || null;
    },
    findLandedByDigest(payloadDigest) {
      if (!payloadDigest || typeof listTx !== 'function') return [];
      return listTx({ limit: clampInt(process.env.RELAYER_DEDUPE_SCAN, 200, 0, 2000) })
        .filter((r) => r.digest === payloadDigest);
    },
  };
}