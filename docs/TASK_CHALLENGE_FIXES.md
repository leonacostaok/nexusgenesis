# Task Challenge Mechanism — P0-P3 Fix Summary

## Overview

Phase 4 任务验证即时确认机制实施后的代码复核发现了 8 个问题，分为 4 个优先级。所有 P0-P3 问题均已修复并通过 26/26 测试验证。

---

## P0: Critical (资金安全)

### 问题 1: deposit 扣除后无回滚保护

**文件**: `src/protocol/taskProtocol.js` L1057-1067

**原因**: `challenge()` 方法中 `subtractBalance` 和 `addBalance` 直接执行，如果底层操作抛出异常（如磁盘满、权限错误），deposit 已从 challenger 扣除并转入 ESCROW，但挑战记录未持久化，导致用户资产损失。

**修复方案**: 用 try-catch 包裹余额操作，失败时返回 `DEPOSIT_LOCK_FAILED` 错误码，不创建挑战记录。

```javascript
let balanceOk = true;
try {
  this.node.currentState.subtractBalance(challengerAddress, deposit.toString());
  this.node.currentState.addBalance(ESCROW_ADDR, deposit.toString());
} catch (e) {
  balanceOk = false;
  console.error(`[TaskProtocol] Deposit lock failed for challenge on task ${taskId}:`, e.message);
}
if (!balanceOk) {
  return { success: false, reason: 'Failed to lock deposit (internal error)', errorCode: 'DEPOSIT_LOCK_FAILED' };
}
```

---

## P1: High (状态机完整性)

### 问题 2: ARBITRATION 状态从未被设置

**文件**: `src/protocol/taskProtocol.js` L1177-1190

**原因**: `arbitrateChallenge()` 方法中第一次投票后只更新了 `challenge.status = 'voting'`，但没有将 `task.status` 从 `CHALLENGED` 更新为 `ARBITRATION`。这导致前端无法通过 `GET /api/tasks/:id` 感知仲裁正在进行中。

**修复方案**: 投票后首次检测到有效投票时，更新 `task.status = TASK_STATUS.ARBITRATION` 并添加 `CHALLENGE_VOTE` 交易记录。

```javascript
if (challenge.votes.yes.length + challenge.votes.no.length + challenge.votes.abstain.length > 0 &&
    task.status === TASK_STATUS.CHALLENGED) {
  task.status = TASK_STATUS.ARBITRATION;
  const voteTimestamp = Date.now();
  task.transactionHistory.push({
    type: TXN_TYPES.CHALLENGE_VOTE,
    timestamp: voteTimestamp,
    by: voterAddress,
    data: { challengeId, vote, voter: voterAddress }
  });
  this.tasks.set(task.id, task);
  this._saveTasks();
}
```

**验证结果**: 投票后 `task.status` 正确变为 `arbitration`，`transactionHistory` 中包含 `CHALLENGE_VOTE` 记录。

---

## P2: Medium (代码质量)

### 问题 3: UPHELD/REJECTED 状态被立即覆盖为 FINALIZED

**文件**: `src/protocol/taskProtocol.js` L1251, L1258

**原因**: `_resolveChallenge()` 中先设置 `task.status = TASK_STATUS.UPHELD`（或 `REJECTED`），但紧接着无条件执行 `task.status = TASK_STATUS.FINALIZED`，导致 `UPHELD`/`REJECTED` 状态从未出现在最终输出中。

**修复方案**: 删除这两行冗余赋值。裁决结果已通过 `task.challengeResult` 字段（`'upheld'` 或 `'rejected'`）表达，无需中间状态。

```javascript
// Removed:
// task.status = TASK_STATUS.UPHELD;   // L1251
// task.status = TASK_STATUS.REJECTED; // L1258
```

### 问题 4: 测试用例依赖硬编码 agent，易受声誉变化影响

**文件**: `tests/test-task-challenges.js` L36-38, L96-105, L196-209

**原因**:
1. `getAgents()` 使用 `/api/v1/bootstrap/validators?limit=50` 端点，只返回 validator 不返回普通 agent，导致找不到 `agent-X-001` 等独立仲裁人。
2. `challenger` 硬编码为 `validator17833388792463`，但该 agent 声誉在多次测试后降为 0，不满足 `MIN_CHALLENGER_REPUTATION = 1`。
3. Test 6 动态寻找独立仲裁人，但环境中只有 4 个 agent 且角色重叠，总是 SKIP。

**修复方案**:
1. `getAgents()` 改用 `/api/v1/agents?limit=200` 并返回 `agents` 数组。
2. `finalChallenger` 动态查找 `rep >= 1` 且非 publisher/claimant/independentVerifier 的 agent。
3. Test 6 改用固定独立 agent `agent-Y-001`（rep=2，不参与当前挑战）。

**验证结果**: 26/26 测试全部通过。

---

## P3: Low (边界情况)

### 问题 5: _sanitizeTask 暴露 verifications 数组

**文件**: `src/protocol/taskProtocol.js` L1375

**原因**: `_sanitizeTask()` 解构时未过滤 `verifications` 数组，该数组包含所有验证者的 ng1 地址和反馈信息。

**修复方案**: 在解构中添加 `verifications` 过滤。

```javascript
const { transactionHistory, submissionData, verifications, ...safe } = task;
```

### 问题 6: _resolveChallenge upheld 分支中 verifierAddress 可能为 null

**文件**: `src/protocol/taskProtocol.js` L1255-1257

**原因**: 如果任务是 Tier 2 auto-verify 完成的（`verifierAddress = 'system'`），`_slashForViolation` 会尝试查找 `'system'` 地址对应的 agent 记录，可能找不到并打印警告。

**修复方案**: 加 null 和 `'system'` 检查。

```javascript
if (task.verifierAddress && task.verifierAddress !== 'system') {
  this._slashForViolation(task.verifierAddress, 'MALICIOUS_VERIFICATION', { taskId: task.id, challengeId: challenge.id });
}
```

### 问题 7: 半额精度丢失

**文件**: `src/protocol/taskProtocol.js` L1224, L1250-1253

**原因**: `halfReward = adjustedReward / 2n` 使用 BigInt 整数除法，如果 `adjustedReward` 是奇数（如 21），`halfReward = 10n`，总共分配 20 而非 21。丢失的 1 NGEN 留在 escrow 中。

**修复方案**: 计算余数并归入 treasury。

```javascript
const halfReward = adjustedReward / 2n;
const remainder = adjustedReward % 2n;
// ...
if (remainder > 0n) {
  this.node.currentState.addBalance(TREASURY_ADDR, remainder.toString());
}
```

---

## 未修复项

### 问题 8: _startExpiryChecker 和 finalizeExpiredTasks() 逻辑重复

**决策**: 不修复。两者各有用途——`_startExpiryChecker` 是定时器内联遍历所有任务（含 OPEN/CLAIMED 过期），`finalizeExpiredTasks()` 是独立方法可被手动触发。重复度不高，统一会增加复杂度。

---

## 测试验证

| 测试套件 | 结果 |
|----------|------|
| `tests/test-task-challenges.js` | **26 passed, 0 failed** |
| 状态转换验证 (`arbitration` 状态) | ✅ 投票后 `task.status` 正确变为 `arbitration` |
| 交易记录验证 (`CHALLENGE_VOTE`) | ✅ 投票后 `transactionHistory` 包含 `CHALLENGE_VOTE` 记录 |
| 利益相关方投票拦截 | ✅ publisher 投票被拒绝，`CONFLICT_OF_INTEREST` |
| 重复挑战防护 | ✅ 第二次挑战返回 400 |
| 提前 finalize 拦截 | ✅ `WINDOW_ACTIVE` 错误 |
| finalize 幂等性 | ✅ 已 finalized 任务返回 success |
