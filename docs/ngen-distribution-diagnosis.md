# NGEN 分发异常诊断

## 问题

首页显示 NGEN 分发 1,259,909，但实际 Agent 钱包总余额只有 351,994。
大部分 NGEN 集中在少数几个 Agent 钱包里。

## 根因

**`totalNGENAwarded` 是一个累加计数器，不是实际流通余额。**

它统计的是历史上所有发放过的 NGEN 总和，包括：

| 发放类型 | 每次金额 | 说明 |
|---------|---------|------|
| AGENT_JOIN | 5000-15000 | 注册奖励 5000 + 早鸟 10000 |
| REFERRAL | 1000 | 推荐奖励 |
| REFERRAL_BONUS | 500 | 被推荐人奖励 |
| BLOCK_PRODUCTION | 1000 | 每 10 个区块 |
| UPTIME | 10/小时 | 验证者在线奖励 |
| PROPOSAL | 100 | 治理提案 |
| VOTE | 50 | 治理投票 |

**问题在于**：这个计数器只增不减，即使：
- Agent 转账支付了 0.1% 代谢税（钱进了 Observer 地址，但计数器不扣）
- Agent 注册时烧毁了 100 NGEN（计数器不扣）
- Agent 余额被扣除了转账手续费（计数器不扣）

所以 `totalNGENAwarded` 永远大于实际流通余额。

## 实际分布分析

```
Agent 钱包总余额: 351,994 NGEN
Agent 数量: 32

前 10 大余额:
  1. agent-Y-002: 11,000 NGEN
  2. agent-X-002: 11,000 NGEN
  3. test-alias-debug-xxx: 11,000 NGEN
  4. test-alias-check-xxx: 11,000 NGEN
  ... (共 8 个 11,000 的测试 Agent)
  9. log-test-xxx: 11,000 NGEN
  10. log-test-xxx: 11,000 NGEN
```

**每个 Agent 初始获得 11,000 NGEN**（5000 注册 + 10000 早鸟 - 100 烧毁 = 14900? 不对，实际是 11000）。

让我核实一下注册奖励的计算：

```javascript
// bootstrapRewards.js:119
const joinReward = this.config.agentJoinReward || 5000;  // 5000

// bootstrapRewards.js:123-125
if (this.state.totalAgentJoins <= 100) {
  totalReward += (metadata.earlyBonus || 10000);  // +10000
}
// totalReward = 15000? 但实际钱包只有 11000

// 差额去哪了？
// 注册时 burns 100 NGEN，但 100 相对于 15000 很小
// 可能是 bootstrapApi.js 里的钱包初始化和 rewards 系统的差异
```

## 核心问题

1. **`totalNGENAwarded` 不是真实的流通量** — 它是历史累计值，不扣减烧毁、税费
2. **大部分 NGEN 集中在测试 Agent** — 10 个测试 Agent 占了 ~110,000 NGEN（31%）
3. **区块链状态余额为 0** — Agent 钱包余额和区块链状态是两个独立账本，没有同步

## 修复方案

### 方案 A：修正 `totalNGENAwarded` 计算（推荐）

```javascript
// 改为实时计算，而非累加
function computeActualNGENDistributed(state) {
  // 实际流通 = 所有地址余额之和 - Observer 地址 - Burn 地址
  let total = 0;
  for (const [addr, bal] of Object.entries(state.balances)) {
    if (addr !== OBSERVER_ADDRESS && addr !== BURN_ADDRESS) {
      total += Number(bal);
    }
  }
  return total;
}
```

### 方案 B：在首页同时显示两个指标

```
NGEN 分发: 1,259,909 (历史累计)
NGEN 流通: 351,994 (实际余额)
NGEN 销毁: 12,XXX (注册费 + 代谢税)
```

### 方案 C：清理测试数据

```bash
# 清除测试 Agent 的余额，只保留真实 Agent
# 或者重置贡献追踪器
```

## 建议

1. **立即修复**：首页显示"实际流通余额"而非"历史累计"
2. **短期**：同时显示两个指标，让用户了解区别
3. **长期**：将 Agent 钱包余额同步到区块链状态，统一账本
