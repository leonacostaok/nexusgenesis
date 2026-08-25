/**
 * audit-log.js — Smart Account 审计日志 (Sprint 2.7 T1)
 *
 * 记录每次 setup / preview / execute / estimate_loss 的操作事实，供长期运维审计。
 *
 * 关键字段（对调用方稳定）：
 *   tool / accountId / sessionId / payloadDigest / txHash / errorName /
 *   broadcaster / timestamp
 *
 * 双写：
 *   - stderr JSON line（stdio 安全：stdout 留给 MCP 协议，绝不写 stdout）
 *   - 可选落盘 AUDIT_LOG_FILE（JSON lines，原子追加）
 * 内存环形缓冲（上限 1000 条）供 smart_account_audit 查询。
 */
import { appendFileSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_MEMORY_ENTRIES = 1000;

let memoryRing = [];

// Sprint 4 T2.3 — stable-field schema for audit records.
// These fields must stay machine-readable across every tool and every release:
// operators (and downstream tooling) depend on their exact shape. `tool` is
// required; the identifiers are string-or-null. Any other type is a schema
// violation (warned on stderr, never silently dropped).
export const AUDIT_SCHEMA = {
  tool: { required: true, type: 'string' },
  accountId: { type: 'string|null' },
  sessionId: { type: 'string|null' },
  payloadDigest: { type: 'string|null' },
  txHash: { type: 'string|null' },
  errorName: { type: 'string|null' },
};

/**
 * Validate an audit entry against the stable-field schema.
 * @param {object} entry
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAuditEntry(entry) {
  const errors = [];
  for (const [key, spec] of Object.entries(AUDIT_SCHEMA)) {
    const v = entry[key];
    const nullable = spec.type.endsWith('|null');
    if (spec.required) {
      if (typeof v !== spec.type) errors.push(`${key}: expected ${spec.type}, got ${v === null ? 'null' : typeof v}`);
    } else if (v !== undefined && v !== null && (!nullable || typeof v !== 'string')) {
      errors.push(`${key}: expected ${spec.type}, got ${typeof v}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 审计文件路径（env 驱动；未设置 → 仅 stderr + 内存）。 */
export function getAuditFile() {
  return process.env.AUDIT_LOG_FILE || null;
}

/**
 * 写一条审计记录。
 * @param {object} entry - 见文件头字段列表；timestamp 由本函数注入。
 * @returns {object} 规范化后的记录
 */
export function recordAudit(entry) {
  // T2.3: schema check — a violation is loud on stderr but never blocks the
  // audit write (the fact is still recorded; the warning makes it observable).
  const check = validateAuditEntry(entry);
  if (!check.ok) {
    console.error(`[audit] SCHEMA VIOLATION: ${check.errors.join('; ')}`);
  }
  const rec = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  memoryRing.push(rec);
  if (memoryRing.length > MAX_MEMORY_ENTRIES) {
    memoryRing = memoryRing.slice(-MAX_MEMORY_ENTRIES);
  }
  const line = JSON.stringify(rec);
  // stderr：MCP stdio 协议只占 stdout，日志必须走 stderr。
  console.error(`[audit] ${line}`);
  const file = getAuditFile();
  if (file) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      // Sprint 7 T1.3 — 日志体积上限 + 轮转：AUDIT_LOG_MAX_BYTES（可选）。落盘前
      // 检查当前文件大小，超限 → 重命名为 `.1` 滚动（保留上一卷），再写新卷。
      maybeRotate(file);
      appendFileSync(file, `${line}\n`, 'utf8');
    } catch {
      /* 落盘失败非致命：审计已入内存 + stderr */
    }
  }
  return rec;
}

/** Sprint 7 T1.3 — 超限滚动：当前文件 ≥ AUDIT_LOG_MAX_BYTES → 重命名 `.1`。 */
function maybeRotate(file) {
  const maxRaw = process.env.AUDIT_LOG_MAX_BYTES;
  if (!maxRaw || !/^\d+$/.test(String(maxRaw))) return;
  const maxBytes = Number(maxRaw);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return;
  let size = 0;
  try { size = statSync(file).size; } catch {
    return; // 文件尚不存在 → 无需轮转
  }
  if (size < maxBytes) return;
  try {
    // 复核修复 D：Windows 的 renameSync 到已存在目标会抛 EPERM（非 POSIX 原子
    // 替换）—— 若不先删旧卷，第二次轮转会被下方 catch 吞掉，之后轮转「永久
    // 静默失效」、日志无界增长。先 rmSync 旧卷再滚动（删除失败则交给 rename
    // 自行失败，走同一容错路径）。
    try { rmSync(`${file}.1`, { force: true }); } catch { /* 旧卷删除失败 → rename 会再失败一次 */ }
    renameSync(file, `${file}.1`);
  } catch {
    /* 重命名失败（被占用/权限）→ 放弃轮转，直接继续追加（写入容错优先） */
  }
}

/**
 * 查询最近审计记录（内存环形缓冲，按写入顺序返回最末 limit 条）。
 * @param {object} [opts]
 * @param {string} [opts.accountId] 仅返回该 account 的记录
 * @param {number} [opts.limit=50] 最多返回条数
 * @returns {object[]}
 */
export function listAudit({ accountId, limit = 50 } = {}) {
  let rows = memoryRing;
  if (accountId) rows = rows.filter((r) => r.accountId === accountId);
  return rows.slice(-limit);
}

/** 测试隔离：清空内存环形缓冲。 */
export function __resetAuditForTest() {
  memoryRing = [];
}
