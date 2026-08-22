/**
 * transport-security.js — 运行时传输安全中间层 (Sprint 4 T1.3/T1.4)
 *
 * 把 Sprint 3 T3 的「可测参考实现」升级为服务级运行时能力：
 *   - createReplayStore：持久化 anti-replay 状态（JSON 文件 + 上限淘汰），
 *     重启后不丢已见 (sender, nonce)，避免重放窗口被进程重启重置绕过。
 *   - createInboundVerifier：inbound 验签中间层，供 Agent↔Agent / Agent↔服务
 *     的服务端入口使用。未签名 / 身份未知 / 验签失败 / 重放 / 过期一律 fail-closed。
 *
 * 与 message-security.js 的分工：
 *   - message-security.js：纯信封 + 签名/验签/防重放原子能力（零依赖、可测）。
 *   - transport-security.js：运行时接线（身份解析 + 持久化防重放 + inbound 中间层）。
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { verifyMessageEnvelope, DEFAULT_MAX_AGE_MS } from './message-security.js';

/**
 * 持久化 anti-replay 状态。
 * 接口与 createReplayGuard 兼容（record(key) / size / clear），可直接作为
 * verifyMessageEnvelope 的 replayGuard 传入；额外提供 JSON 文件持久化。
 * @param {object} opts { file, maxEntries }
 * @returns {{ record(key:string)=>boolean, has(key:string)=>boolean, size:number, clear():void }}
 */
export function createReplayStore({ file = null, maxEntries = 10000 } = {}) {
  const seen = new Map(); // `${sender}:${nonce}` -> timestamp

  // 启动恢复：文件损坏 → 空窗口。注意：空窗口只影响「重放检测粒度」，
  // 不影响验签/身份安全（两者独立 fail-closed）。
  if (file && existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(parsed)) for (const key of parsed) seen.set(key, Date.now());
    } catch {
      /* 忽略损坏文件 */
    }
  }

  // 原子写（tmp + rename）：直接写目标文件在写入中途崩溃会截断文件，
  // 导致下次恢复失败、整个已见集退化为空窗口。
  function persist() {
    if (!file) return;
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...seen.keys()]));
    renameSync(tmp, file);
  }

  function prune() {
    if (seen.size <= maxEntries) return;
    const drop = [...seen.keys()].slice(0, seen.size - maxEntries);
    for (const key of drop) seen.delete(key);
  }

  return {
    record(key) {
      if (seen.has(key)) return false;
      seen.set(key, Date.now());
      prune();
      persist(); // 单次落盘（prune 只裁剪，不重复写）
      return true;
    },
    has(key) {
      return seen.has(key);
    },
    get size() {
      return seen.size;
    },
    clear() {
      seen.clear();
      if (file) persist();
    },
  };
}

/**
 * inbound 验签中间层。
 * @param {object} params
 * @param {object} params.directory service identity 目录（createIdentityDirectory 输出）
 * @param {string} params.self 本服务的身份（envelope.target 必须等于它，防跨服务重放）
 * @param {object} [params.replayStore] createReplayStore 输出（缺省则不做重放检测）
 * @param {number} [params.maxAgeMs] 时间新鲜度窗口（默认 5 分钟）
 * @returns {(body: any) => { ok: boolean, error?: string, reason?: string, identity?: string, payload?: any }}
 */
export function createInboundVerifier({ directory, self, replayStore = null, maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  if (!directory || typeof directory.resolve !== 'function') {
    throw new Error('createInboundVerifier: directory with resolve() is required');
  }
  if (!self || typeof self !== 'string') {
    throw new Error('createInboundVerifier: self (this service identity) is required — target check prevents cross-service replay (RFC §2)');
  }

  return function verifyRequest(body) {
    // 发送侧（createHttpTransport + messageSecurity）统一包装为 { envelope }。
    if (!body || typeof body !== 'object' || !body.envelope) {
      return { ok: false, error: 'missing_envelope', reason: 'message security enabled: unsigned request rejected (fail-closed)' };
    }
    const envelope = body.envelope;
    // 跨服务重放防护（RFC §2 目标错误投递）：target 入签名只防篡改，不防
    // 「合法签名的消息被原样转发给另一个服务」。接收方必须校验 target === self，
    // 否则发给 service-b 的信封可在 service-c 的 replay store（未见过该 nonce）重放。
    if (envelope.target !== self) {
      return { ok: false, error: 'wrong_target', reason: `envelope targets '${envelope.target}', not this service '${self}' (cross-service replay rejected)` };
    }
    const identity = directory.resolve(envelope.sender);
    if (!identity) {
      return { ok: false, error: 'unknown_identity', reason: `sender '${envelope.sender}' is not a registered service identity` };
    }
    if (typeof identity.verifier !== 'function') {
      return { ok: false, error: 'no_verifier_for_identity', reason: `identity '${envelope.sender}' has no verifier configured` };
    }
    const res = verifyMessageEnvelope({ envelope, verifier: identity.verifier, replayGuard: replayStore, maxAgeMs, now: Date.now() });
    if (!res.ok) return { ok: false, error: res.error, reason: res.error };
    return { ok: true, identity: envelope.sender, payload: envelope.payload };
  };
}
