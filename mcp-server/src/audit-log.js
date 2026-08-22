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
import { appendFileSync, mkdirSync } from 'node:fs';
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
      appendFileSync(file, `${line}\n`, 'utf8');
    } catch {
      /* 落盘失败非致命：审计已入内存 + stderr */
    }
  }
  return rec;
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
