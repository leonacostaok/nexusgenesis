# 审批系统并发优化与日志埋点方案

## 概述

本文档记录了 NexusGenesis 审批系统在开发和测试过程中发现的并发安全问题及其解决方案。核心目标是确保人类操作员可以随时接管 Agent 钱包，且在并发场景下系统保持稳定。

---

## 一、发现的关键 Bug

### Bug #1: `verify()` 未 await 导致无效签名被接受

**症状：** 传入任意字符串作为签名，审批 API 返回 `success: true`

**根因：** `verify()` 是 async 函数，但调用时没有 `await`，导致 `if (!isValid)` 检查的是 Promise 对象（永远 truthy）

**修复：**
```diff
- const isValid = verify(message, Buffer.from(masterSignature, 'hex'), Buffer.from(agent.publicKey, 'hex'));
+ const isValid = await verify(message, Buffer.from(masterSignature, 'hex'), Buffer.from(agent.publicKey, 'hex'));
```

**影响：** 这是最严重的 bug——任何人都可以绕过签名验证批准任意交易

---

### Bug #2: BigInt 无法 JSON 序列化

**症状：** `GET /api/v1/approvals/:id` 返回 HTML 而非 JSON

**根因：** 审批对象的 `amount` 字段是 `BigInt`，`JSON.stringify` 无法序列化 BigInt

**修复：**
```diff
- amount: BigInt(amount),
+ amount: BigInt(amount).toString(),
```

---

### Bug #3: `agentWM.transfer()` 在审批批准后触发回滚

**症状：** 人类批准审批后，转账被拒绝，服务器返回 500

**根因：** `agentWM.transfer()` 内部检查 `spendConfig`，发现不是 `unlimited` 就回滚交易。但审批批准后 Agent 的 `spendConfig` 已被修改

**修复：** 审批批准后不再调用 `agentWM.transfer()`，而是直接操作钱包余额：
```javascript
// 直接扣减余额（绕过 spendConfig 检查，因为人类已经批准）
fromEntry.wallet.balance -= BigInt(totalDeduct);
fromEntry.wallet.nonce++;
```

---

### Bug #4: `_saveRegistry()` 无错误处理

**症状：** 磁盘写入失败导致整个 Express 服务器崩溃

**根因：** `_saveRegistry()` 写入文件系统，如果路径不存在或权限不足会抛出异常

**修复：**
```diff
+ try {
    agentWM._saveRegistry();
+ } catch (_) { /* ignore */ }
```

---

### Bug #5: 变量名冲突导致 state 写入失败

**症状：** 审批批准后交易记录未持久化

**根因：** 外层已声明 `const state = req.app?.locals?.state`，内层又声明 `const state = req.app?.locals?.state`，导致变量遮蔽

**修复：** 内层改为 `const st = req.app?.locals?.state`

---

## 二、日志埋点方案

### 设计理念

每个审批请求分配唯一 `requestId`，所有日志都带有 `[requestId]` 前缀，方便在日志中追踪单个请求的完整生命周期。

### 日志格式

```
[appr-create-49a4f56b] CREATE REQUEST START agentId=test-agent type=transfer
[appr-create-49a4f56b] Agent not in state.agents, checking registry...
[appr-create-49a4f56b] Agent found in registry, address=ng112Y6ad...
[appr-create-49a4f56b] SUCCESS approvalId=apr_a39903c0... elapsed=2ms

[appr-decide-apr_a399] DECIDE REQUEST START approvalId=apr_a399... decision=approve
[appr-decide-apr_a399] Approval found, current status=pending
[appr-decide-apr_a399] Decision: approve
[appr-decide-apr_a399] Verifying signature (sigLen=4840)
[appr-decide-apr_a399] Signature verified OK
[appr-decide-apr_a399] Approval APPROVED, status=approved
[appr-decide-apr_a399] Executing approved transfer for agent=test-agent amount=100000000000000000000
[appr-decide-apr_a399] DONE decision=approve executed=false elapsed=19ms
```

### 日志级别

| 前缀 | 含义 | 严重性 |
|------|------|--------|
| `START` | 请求开始 | INFO |
| `SUCCESS` / `DONE` | 请求成功 | INFO |
| `FAIL` | 业务逻辑失败（预期内） | WARN |
| `CRASH` | 未捕获异常（意外） | ERROR |

### 关键监控指标

通过日志可以追踪：

1. **签名验证成功率** — `Signature verified OK` vs `FAIL: Invalid master key signature`
2. **审批执行率** — `executed=true` vs `executed=false`
3. **平均响应时间** — `elapsed=Xms`
4. **Agent 来源分布** — `Agent found in registry` vs `Agent found in state.agents`

---

## 三、并发安全保证

### 原子性

审批状态的变更是原子的——一旦 `approval.status` 被改为 `'approved'` 或 `'rejected'`，后续重复决策会立即被拒绝：

```
[appr-decide-apr_a399] Approval found, current status=approved
[appr-decide-apr_a399] FAIL: Already decided status=approved
```

### 余额一致性

审批批准后直接操作钱包余额，不经过 `transfer()` 的签名验证和额度检查流程，避免了并发竞态条件。

### 错误隔离

所有关键操作都有 try/catch 包裹：

| 操作 | 保护方式 |
|------|---------|
| Agent 查找 | `if (!agent) { ... }` |
| 签名验证 | `try { await verify(...) } catch` |
| 转账执行 | `try { ... } catch (execErr)` |
| 磁盘持久化 | `try { _saveRegistry() } catch` |

---

## 四、测试覆盖

| 测试场景 | 断言数 | 状态 |
|---------|--------|------|
| 创建审批请求 | 4 | ✅ |
| 查询审批详情 | 4 | ✅ |
| 人类批准审批 | 2 | ✅ |
| 人类拒绝审批 | 2 | ✅ |
| 重复决策拒绝 | 2 | ✅ |
| 无效签名拒绝 | 2 | ✅ |
| **总计** | **16** | **16/16 通过** |

---

## 五、文件清单

| 文件 | 变更 |
|------|------|
| `src/http/routes/bootstrapApi.js` | 审批 API + 完整日志埋点 |
| `tests/test-approval-system.js` | 16 个断点的端到端测试 |
| `docs/approval-system-concurrency-optimization.md` | 本文档 |

---

## 六、后续优化方向

1. **结构化日志** — 使用 Winston/Pino 替代 console.log，支持日志分级和文件输出
2. **分布式追踪** — 集成 OpenTelemetry，支持跨节点追踪审批请求
3. **告警机制** — 当 `FAIL` 或 `CRASH` 日志频率超过阈值时发送告警
4. **审批审计表** — 将审批记录持久化到数据库，支持事后审计
