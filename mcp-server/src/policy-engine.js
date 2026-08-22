/**
 * policy-engine.js — Policy Engine 外置化 (Sprint 3 T2)
 *
 * 把策略从"写死在 Smart Account / JS 里"抽成链下软策略层：
 *
 *   Policy Engine（链下软策略，可热更新）
 *       ↓ 决策
 *   Signer/Relayer（relayer 广播）
 *       ↓ 提交
 *   Smart Account（链上硬策略最终裁决）
 *
 * 语义：
 *   - 软策略默认放行（空规则 = 不拦截），链上硬策略始终兜底 → 默认行为不变。
 *   - 命中规则且不满足（如 over maxPerTx / disabled action）→ 链下直接拒绝
 *     `PolicyRejected`，省 gas、不浪费链上调用。
 *   - 规则表每次调用重读 `SMART_ACCOUNT_POLICY_FILE`（JSON），支持热更新；
 *     未设置该 env 时用内置默认规则。
 *
 * 规则文件格式（JSON）：
 *   {
 *     "rules": [
 *       { "action": "transfer", "enabled": true, "requiresSimulation": true,
 *         "maxPerTx": "100", "maxDaily": "500" },
 *       { "action": "withdraw", "enabled": false }
 *     ]
 *   }
 */
import { readFileSync } from 'node:fs';

/** 内置默认规则：空表 = 软策略全放行（链上硬策略兜底）。 */
const DEFAULT_RULES = [];

/**
 * 读取当前生效规则表。
 * - 设置 SMART_ACCOUNT_POLICY_FILE 时读取该 JSON（每次调用重读 → 热更新）；
 * - 文件缺失/损坏 → 软策略回退为空表（设计决策：软层不拦截，链上硬策略仍兜底，
 *   默认行为不变）。但绝不静默：向 stderr 输出告警，运维必须能观察到
 *   "限额策略已失效"这一事实。
 * @returns {Array<{action:string, enabled?:boolean, requiresSimulation?:boolean, maxPerTx?:string, maxDaily?:string}>}
 */
export function loadPolicy() {
  const file = process.env.SMART_ACCOUNT_POLICY_FILE;
  if (!file) return DEFAULT_RULES;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(parsed.rules)) return parsed.rules;
    process.stderr.write(`[policy] WARNING: SMART_ACCOUNT_POLICY_FILE (${file}) has no 'rules' array — soft policy is permissive, on-chain hard policy still backstops\n`);
    return DEFAULT_RULES;
  } catch (err) {
    process.stderr.write(`[policy] WARNING: failed to load SMART_ACCOUNT_POLICY_FILE (${file}): ${err.message} — soft policy is permissive, on-chain hard policy still backstops\n`);
    return DEFAULT_RULES;
  }
}

/**
 * 金额比较（BigInt 优先）：金额在本系统中是字符串（wei 级可能超出
 * Number.MAX_SAFE_INTEGER），Number() 会丢精度。整数串走 BigInt 精确比较；
 * 非整数走 Number 兜底；任一侧无法解析（malformed）→ 返回 null，
 * 由上层 fail-closed 拒绝（不静默放行）。
 * @returns {boolean|null} true=超限 false=未超限 null=无法解析
 */
function amountExceeds(amount, limit) {
  try {
    return BigInt(amount) > BigInt(limit);
  } catch {
    const a = Number(amount);
    const l = Number(limit);
    if (Number.isNaN(a) || Number.isNaN(l)) return null;
    return a > l;
  }
}

/**
 * 链下软策略评估。
 * @param {object} intent { action, amount, chain, asset, recipient, method }
 * @returns {{ allowed: true }} 或 {{ allowed: false, code: 'PolicyRejected', reason: string }}
 */
export function evaluatePolicy(intent = {}) {
  const { action, amount } = intent;
  const rules = loadPolicy();
  if (!Array.isArray(rules) || rules.length === 0) return { allowed: true };

  const rule = rules.find((r) => r && r.action === action);
  if (!rule) return { allowed: true }; // 未命中规则 → 软策略不拦截，链上兜底

  if (rule.enabled === false) {
    return { allowed: false, code: 'PolicyRejected', reason: `action '${action}' is disabled by policy` };
  }

  if (rule.maxPerTx !== undefined && amount !== undefined && amount !== null) {
    const exceeds = amountExceeds(amount, rule.maxPerTx);
    if (exceeds === null) {
      return {
        allowed: false,
        code: 'PolicyRejected',
        reason: `action '${action}' amount ${JSON.stringify(amount)} or maxPerTx ${JSON.stringify(rule.maxPerTx)} is not numeric (fail-closed)`,
      };
    }
    if (exceeds) {
      return {
        allowed: false,
        code: 'PolicyRejected',
        reason: `action '${action}' amount ${amount} exceeds policy maxPerTx ${rule.maxPerTx}`,
      };
    }
  }

  return { allowed: true };
}

/** 当前生效规则表快照（供 smart_account_policy 查询/审计）。 */
export function policySnapshot() {
  return {
    source: process.env.SMART_ACCOUNT_POLICY_FILE || 'default (empty)',
    rules: loadPolicy(),
  };
}
