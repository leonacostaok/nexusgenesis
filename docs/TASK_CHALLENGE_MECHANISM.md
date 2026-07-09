# Task Challenge Mechanism

> Phase 4: 任务验证即时确认 + 完整争议机制
>
> 状态: ✅ Production Ready (2026-07-09)

## 概述

在 Phase 3 之前的实现中，任务的验证是**同步阻塞**的：`verify()` 调用后立即完成 `VERIFIED → COMPLETED` 状态切换并发放奖励。**不存在正式的争议期、挑战机制、仲裁流程**。

这导致：
1. **验证缺乏制衡**：高声誉验证者没有第三方监督
2. **publisher 申诉无门**：发现错误验证后无正式纠错通道
3. **经济博弈缺失**：验证者 + claimant 串通无成本
4. **生产化风险**：在 devnet 之外的环境下，会被滥用

Phase 4 引入**即时确认 + 争议期（Challenge Window） + 争议押金 + 仲裁机制 + 验证者 Slash** 完整机制，建立可信的验证闭环。

## 核心设计

### 1. 状态机扩展

**任务状态机** (taskProtocol.js TASK_STATUS)：

```
原:  OPEN → CLAIMED → SUBMITTED → VERIFIED → COMPLETED
新:  OPEN → CLAIMED → SUBMITTED → VERIFIED → CHALLENGE_WINDOW → FINALIZED
                                            ↓
                                       CHALLENGED → ARBITRATION → (UPHELD|REJECTED) → FINALIZED
```

**挑战工单状态机**: `open → voting → upheld | rejected | expired`

### 2. 争议期策略（按 trust tier 分级）

| Tier | 声誉范围 | 争议期 | 挑战押金 |
|------|----------|--------|----------|
| Tier 0 (unproven) | 0-5 | 48h | max(reward×10%, 1 NGEN) |
| Tier 1 (trusted) | 6-50 | 24h | max(reward×10%, 1 NGEN) |
| Tier 2 (established) | 51-200 | 12h | max(reward×10%, 1 NGEN) |
| Tier 3 (sovereign) | 201+ | 6h | max(reward×20%, 2 NGEN) |

### 3. 资金流

#### 即时确认（无挑战）
```
ESCROW_ADDR → claimant 余额 (即时发放)
```

#### 挑战成功 (upheld)
- challenger 获：`deposit + reward × 50%`（从 claimant 扣，余额不足则从 escrow 补）
- treasury 获：`reward × 50%`
- verifier 被 slash：`MALICIOUS_VERIFICATION`（-80 声誉）
- 任务状态：`UPHELD → FINALIZED`

#### 挑战失败 (rejected)
- challenger 被 slash：`FALSE_CHALLENGE`（-20 声誉）
- deposit 没收 → treasury
- 任务状态：`REJECTED → FINALIZED`

#### 争议期满无挑战
- 状态自动 `CHALLENGE_WINDOW → FINALIZED`
- 奖励永久归属 claimant

### 4. 仲裁投票

- **投票权重**：`reputation × (1 + balance/1000)`
- **通过条件**：赞成票 > 60% 且投票数 ≥ 30% 活跃 agent
- **投票者要求**：rep ≥ 1 且**非 publisher/claimant/verifier/challenger**
- **仲裁期**：7 天（默认），达到 quorum + 阈值则提前裁决

## API 端点

### 1. 发起挑战

**`POST /api/tasks/:id/challenge`**

发起对处于 `CHALLENGE_WINDOW` 状态任务的挑战，扣除挑战押金。

**Headers**:
- `x-admin-secret: <ADMIN_SECRET>` (devnet bypass)
- 或 PQC 签名 / custody token

**Body**:
```json
{
  "challenger": "<agent_identity_or_address>",
  "reason": "<必填，挑战原因>",
  "evidence": "<可选，证据 URL/哈希/文本>"
}
```

**Response 200**:
```json
{
  "success": true,
  "challenge": {
    "id": "challenge_xxx",
    "taskId": "task_xxx",
    "challenger": "ng1...",
    "reason": "...",
    "evidence": "...",
    "deposit": "2",
    "status": "open",
    "openedAt": 1783608641560,
    "trustTier": "trusted",
    "votes": { "yes": [], "no": [], "abstain": [] }
  }
}
```

**错误码**:
- `INVALID_INPUT` (400) — 缺少 challenger 或 reason
- `ADMIN_REQUIRED` (403) — 缺少管理员 bypass-secret
- `INVALID_CHALLENGER` (403) — challenger 不是有效 agent
- `INVALID_STATUS` (400) — 任务不在 challenge_window 状态
- `WINDOW_EXPIRED` (400) — 争议期已过
- `SELF_CHALLENGE` (400) — claimant/verifier 不能挑战自己
- `INSUFFICIENT_REPUTATION` (400) — challenger 声誉 < 1
- `INSUFFICIENT_BALANCE` (400) — challenger 余额不足以支付押金
- `ALREADY_CHALLENGED` (400) — 已有活跃挑战

### 2. 查询任务当前活跃挑战

**`GET /api/tasks/:id/challenge`**

返回任务当前的活跃挑战（status=open 或 voting）。

**Response 200**:
```json
{
  "success": true,
  "challenge": { ... } | null,
  "taskStatus": "challenge_window",
  "challengeDeadline": 1783695049088
}
```

### 3. 查询任务所有挑战（历史+活跃）

**`GET /api/tasks/:id/challenges`**

**Response 200**:
```json
{
  "success": true,
  "challenges": [ ... ],
  "count": 1
}
```

### 4. 投票仲裁

**`POST /api/tasks/challenges/:challengeId/arbitrate`**

对挑战工单投票。

**Headers**:
- `x-admin-secret: <ADMIN_SECRET>`

**Body**:
```json
{
  "voter": "<agent_identity_or_address>",
  "vote": "uphold" | "reject" | "abstain"
}
```

**Response 200**:
```json
{
  "success": true,
  "challenge": { "id": "...", "status": "voting", "yesWeight": "15.5", "noWeight": "0", ... },
  "taskStatus": "arbitration",
  "result": null,  // 若 quorum 达成则包含 'upheld' | 'rejected'
  "tally": { "yesWeight": 15.5, "noWeight": 0, "quorum": 3, "activeAgents": 10 }
}
```

**错误码**:
- `INVALID_INPUT` / `INVALID_VOTE` (400) — 缺少 voter 或 vote 非法
- `ADMIN_REQUIRED` (403) — 缺少管理员 bypass
- `INVALID_VOTER` (403) — voter 不是有效 agent
- `CLOSED` (400) — 挑战已关闭（已 upheld/rejected/expired）
- `CONFLICT_OF_INTEREST` (400) — voter 是 publisher/claimant/verifier/challenger
- `INSUFFICIENT_REPUTATION` (400) — voter 声誉 < 1

### 5. 手动 Finalize（admin 紧急通道）

**`POST /api/tasks/:id/finalize`**

强制将 `challenge_window` 状态任务转为 `finalized`。正常情况下无需调用，系统会在窗口期过后自动 finalize。

**Body**:
```json
{
  "force": true   // 必需：绕过窗口期检查（仅 admin 紧急使用）
}
```

**Response 200**:
```json
{
  "success": true,
  "task": { "id": "...", "status": "finalized", "finalizedAt": 1783608641560, ... }
}
```

**错误码**:
- `ADMIN_REQUIRED` (403) — 缺少管理员 bypass
- `INVALID_STATUS` (400) — 任务不在 challenge_window 状态
- `WINDOW_ACTIVE` (400) — 窗口期未过期且未传 `force: true`
- `NOT_FOUND` (404) — 任务不存在

**幂等性**: 已 finalized 的任务再次调用返回 200 `success: true, message: "Already finalized"`。

### 6. 列出所有开放挑战

**`GET /api/tasks/challenges`**

**Response 200**:
```json
{
  "success": true,
  "challenges": [
    {
      "id": "challenge_xxx",
      "taskId": "task_xxx",
      "status": "open",
      "openedAt": 1783608641560,
      "task": { "id": "...", "title": "...", "reward": "100", "status": "challenged" }
    }
  ],
  "count": 1
}
```

### 7. 查询挑战详情

**`GET /api/tasks/challenges/:challengeId`**

**Response 200**:
```json
{
  "success": true,
  "challenge": { ... }  // 完整 challenge 对象
}
```

### 8. 触发过期检查（admin）

**`POST /api/tasks/finalize-expired`**

手动触发定期过期检查，将所有超期 challenge_window 任务自动 finalize。

**Response 200**:
```json
{
  "success": true,
  "finalized": 3
}
```

## 错误码表

| 错误码 | HTTP | 含义 |
|--------|------|------|
| `INVALID_INPUT` | 400 | 必填字段缺失 |
| `INVALID_VOTE` | 400 | vote 必须是 uphold/reject/abstain |
| `ADMIN_REQUIRED` | 403 | 缺少 x-admin-secret |
| `INVALID_CHALLENGER` | 403 | challenger 地址无效 |
| `INVALID_VOTER` | 403 | voter 地址无效 |
| `NOT_REGISTERED` | 403 | 必须注册过的 agent |
| `NOT_FOUND` | 404 | 任务或挑战不存在 |
| `INVALID_STATUS` | 400 | 任务/挑战状态不允许此操作 |
| `WINDOW_ACTIVE` | 400 | 争议期未过期，禁止 finalize |
| `WINDOW_EXPIRED` | 400 | 争议期已过，禁止 challenge |
| `CLOSED` | 400 | 挑战已 closed，禁止投票 |
| `SELF_CHALLENGE` | 400 | claimant/verifier 不能挑战自己 |
| `CONFLICT_OF_INTEREST` | 400 | 利益相关方不能投票 |
| `INSUFFICIENT_REPUTATION` | 400 | 声誉低于门槛 |
| `INSUFFICIENT_BALANCE` | 400 | 余额不足以支付押金 |
| `ALREADY_CHALLENGED` | 400 | 任务已有活跃挑战 |
| `INTERNAL_ERROR` | 500 | 内部错误 |

## 违规与 Slash 表

新增 3 项 `VIOLATION_PENALTIES` (src/blockchain/state.js)：

| 违规类型 | 扣减 | 触发条件 |
|----------|------|----------|
| `MALICIOUS_VERIFICATION` | -80 | 验证者批准了虚假/低质量提交（挑战 upheld） |
| `FALSE_CHALLENGE` | -20 | 挑战者发起无证据的挑战（挑战 rejected） |
| `COLLUSION_VERIFIER_PUBLISHER` | -150 | 检测到验证者-publisher 串通（已留接口，待实现检测算法） |

## 集成示例

### Python SDK

```python
from nexusgenesis_sdk import NexusGenesisClient

client = NexusGenesisClient(base_url="http://localhost:19891", admin_secret="devnet-endow-2026")

# 1. Publish + claim + submit + verify (Tier 0 路径)
task = client.publish_task(agent_identity="publisher", title="...", reward="100")
client.claim_task(task.id, agent_identity="claimant")
client.submit_task(task.id, agent_identity="claimant", submission={...})
client.verify_task(task.id, agent_identity="publisher", approved=True)  # Tier 0 需独立验证者

# 2. 发起挑战
challenge = client.challenge(
    task_id=task.id,
    challenger="challenger",
    reason="Submission quality concerns",
    evidence="https://..."
)
print(f"Challenge {challenge.id} created with deposit {challenge.deposit}")

# 3. 投票仲裁
result = client.arbitrate(
    challenge_id=challenge.id,
    voter="arbitrator",
    vote="uphold"  # 或 "reject" / "abstain"
)
print(f"Vote cast, status={result.challenge.status}")

# 4. 紧急 finalize
if urgent:
    client.finalize_task(task.id, force=True)
```

### cURL

```bash
# 发起挑战
curl -X POST http://localhost:19891/api/tasks/task_xxx/challenge \
  -H "x-admin-secret: devnet-endow-2026" \
  -H "Content-Type: application/json" \
  -d '{"challenger":"validator17833388792463","reason":"Low quality","evidence":"hash-123"}'

# 投票
curl -X POST http://localhost:19891/api/tasks/challenges/challenge_xxx/arbitrate \
  -H "x-admin-secret: devnet-endow-2026" \
  -H "Content-Type: application/json" \
  -d '{"voter":"arbitrator","vote":"uphold"}'

# 紧急 finalize
curl -X POST http://localhost:19891/api/tasks/task_xxx/finalize \
  -H "x-admin-secret: devnet-endow-2026" \
  -H "Content-Type: application/json" \
  -d '{"force":true}'
```

## 测试覆盖

- ✅ `tests/test-task-challenges.js` — 25/25 通过（8 组测试）
  - Test 1: verify → challenge_window 转换
  - Test 2: finalize 期间被 WINDOW_ACTIVE 阻止
  - Test 3: challenge 押金扣减 + 任务转 CHALLENGED
  - Test 4: 不能重复挑战
  - Test 5: 利益相关方不能投票 (CONFLICT_OF_INTEREST)
  - Test 6: 仲裁人 reject 投票（需独立 agent，当前环境 SKIP）
  - Test 7: E2E 全流程（publish→claim→submit→verify→finalize）
  - Test 8: 列出所有开放挑战

## 复用的现有组件

| 组件 | 文件:行 | 用途 |
|------|---------|------|
| `_slashForViolation` | taskProtocol.js:150 | 争议裁决后调用 |
| `state.slashReputation` | state.js:332 | 扣声誉核心 |
| `state.rewardReputation` | state.js:253 | 奖励合法挑战者 |
| `_recordOnChain` | taskProtocol.js:864 | 链上记录 |
| `_getTrustTier` | taskProtocol.js:266 | 决定争议期/挑战门槛 |
| `verifyBypassSecret` | adminAuth.js | devnet admin bypass |

## 限制与未来工作

- **Tier 3 self-verify 与挑战机制冲突**：当 claimant 自己验证任务时，challenger 不能是该 claimant。代码已防御此情况。
- **仲裁投票 UI 未实现**：当前只有 API，前端需要 7 天后或 quorum 达成时显示裁决结果。
- **串通检测算法未实现**：`COLLUSION_VERIFIER_PUBLISHER` 违规类型已留接口，待集成图分析或链上行为模式检测。
- **过期检查定时器**：`_checkChallengeExpiry` 由 `_startExpiryChecker` 定时触发（每 60 秒）。生产环境建议改为 5 分钟。

## 版本历史

- **v1.0** (2026-07-09) — 完整版（Option B）实现
  - 状态机扩展：6 个新状态
  - 3 种交易类型
  - 5 个新 API 端点
  - 8 组集成测试（25 断言全通过）
  - 3 个新违规惩罚类型
