/**
 * NexusGenesis - status管理
 * 
 * Features: 
 * 1. 管理账户balancestatus
 * 2. 管理Governancestatus
 * 3. 应用transaction到status
 * 4. status持久化(优化版)
 * 
 * 持久化优化: 
 * 1. 增量持久化 - 只Save变更的部分
 * 2. status快照 - 定期Save完整status
 * 3. 压缩Storage - using gzip 压缩statusdata
 * 4. 异步Save - 避免阻塞主线程
 * 5. 完整性Check - ensurestatusdata的完整性
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import AINVM from '../vm/ainvm.js';
import { AuditState, applyAuditTransaction, AuditTransactionType } from './projectAudit.js';
import { getSubjectIdentifier } from '../identity/subjectIdentifier.js';
import { attachGenesisMultiSig, checkGenesisReserveWithMultiSig } from '../contracts/genesisMultiSig.js';
import {
  attachTransactionState,
  serializeTransactions,
  deserializeTransactions,
  recordAuditEvent,
  TX_TYPE
} from './transactionEngine.js';

// DevNet fund操作classProposal冷静期block数
const TREASURY_COOLDOWN_BLOCKS = 5;

// Reputation 系统Configuration
const MAX_REPUTATION = 1000; // reputation 上限从 100 提升到 1000
const INITIAL_REPUTATION = 1; // 初始 reputation

// Reputation etc.级系统
const REPUTATION_LEVELS = [
  { level: 1, name: '新手', minRep: 0, maxRep: 99, votingWeightBonus: 0, benefits: ['基础permission'] },
  { level: 2, name: '活跃contribution者', minRep: 100, maxRep: 299, votingWeightBonus: 0.05, benefits: ['高级permission', 'Governancevoting weight+5%'] },
  { level: 3, name: '核心contribution者', minRep: 300, maxRep: 499, votingWeightBonus: 0.10, benefits: ['核心permission', 'Governancevoting weight+10%'] },
  { level: 4, name: '资深contribution者', minRep: 500, maxRep: 799, votingWeightBonus: 0.15, benefits: ['资深permission', 'Governancevoting weight+15%'] },
  { level: 5, name: '传奇contribution者', minRep: 800, maxRep: 1000, votingWeightBonus: 0.20, benefits: ['最高permission', 'Governancevoting weight+20%', '特殊荣誉'] }
];

// Reputation reward常量
const REPUTATION_REWARDS = {
  VOTE_PARTICIPATION: 1,      // Vote参与reward
  PROPOSAL_APPROVED: 2,        // Proposalviareward
  CODE_CONTRIBUTION: 5,        // 代码contributionreward
  COMMUNITY_BUILDING: 3,       // 社区建设reward
  BUG_REPORT: 2,               // Bug 报告reward
  DOCUMENTATION: 1,             // 文档完善reward
  TEST_FEEDBACK: 1,            // Test反馈reward
  PEER_REVIEW: 2,              // 代码审查reward
  TASK_COMPLETED: 2            // 完成任务reward — 每完成一个任务提升2点声誉
};

// Slash / Violation 惩罚常量 (Phase 1 anti-self-dealing)
export const VIOLATION_PENALTIES = {
  SELF_DEALING_CLAIM: { penalty: -50, reason: 'Attempted to claim own task' },
  SELF_DEALING_VERIFY: { penalty: -30, reason: 'Attempted to verify own submission' },
  FAKE_TASK: { penalty: -30, reason: 'Published a task with no intent to pay' },
  MALICIOUS_REJECTION: { penalty: -20, reason: 'Rejected valid submission without cause' },
  SPAM_PUBLISH: { penalty: -10, reason: 'Published spam / low-quality task' },
  REPEATED_VIOLATION: { penalty: -100, reason: 'Multiple violations within 24h' },
  // Phase 4: Task challenge mechanism penalties
  MALICIOUS_VERIFICATION: { penalty: -80, reason: 'Approved fake or low-quality submission (challenge upheld)' },
  FALSE_CHALLENGE: { penalty: -20, reason: 'Frivolous challenge with no evidence (challenge rejected)' },
  COLLUSION_VERIFIER_PUBLISHER: { penalty: -150, reason: 'Verifier-publisher collusion detected' }
};

// 违规记录留存 (for audit + dispute)
const violationLog = [];

// ─── Phase 3: Reputation decay log ───
const decayLog = [];

// Decay thresholds: inactivity period → percentage of current reputation to subtract
const REPUTATION_DECAY_TIERS = [
  { daysInactive: 90, decayRate: 0.20, label: 'severe' },   // 90+ days → -20%
  { daysInactive: 30, decayRate: 0.05, label: 'moderate' }  // 30+ days → -5%
];

// status持久化Configuration
const PERSISTENCE_CONFIG = {
  // 增量Save间隔(ms)
  incrementalSaveInterval: 30000, // 30秒
  // 快照Save间隔(block height)
  snapshotInterval: 100, // 每100个block
  // 压缩级别(0-9, 0表示不压缩, 9表示最高压缩)
  compressionLevel: 6,
  // Save目录
  stateDir: path.join('data', 'state'),
  // 快照目录
  snapshotDir: path.join('data', 'state', 'snapshots')
};

// 压缩和解压缩method
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

function jsonBigIntReplacer(key, value) {
  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() };
  }
  return value;
}

function jsonBigIntReviver(key, value) {
  if (value && typeof value === 'object' && value.__type === 'bigint') {
    return BigInt(value.value);
  }
  return value;
}

function stringifyStateData(value) {
  return JSON.stringify(value, jsonBigIntReplacer);
}

/**
 * Agent custody status constants (Phase 2 security revision)
 * 
 * Three-tier permission model:
 * 1. Master Key (Human) — highest authority, can takeover, rotate keys, revoke
 * 2. Operation Key (Agent) — daily execution, cannot modify its own permissions
 * 3. On-chain Contract — recognizes signatures only, no trust in external entities
 */
export const AGENT_CUSTODY_STATUS = Object.freeze({
  PENDING_BINDING: 'pending-binding',       // 24h human binding window open
  CO_MANAGED: 'co-managed',                 // Master Key bound, human can takeover
  SELF_SOVEREIGN: 'self-sovereign',         // 24h expired, Agent fully autonomous
  REVOKED: 'revoked'                        // Human revoked via on-chain governance
});

// 24-hour binding window (milliseconds)
export const HUMAN_BINDING_WINDOW_MS = 24 * 60 * 60 * 1000;
// Takeover cooldown (milliseconds) — prevents rapid key rotation DoS
const TAKEOVER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
