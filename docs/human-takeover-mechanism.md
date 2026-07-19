# 人类接管机制（Human Takeover）技术文档

## 概述

人类接管机制允许钱包所有者（人类）随时收回对 Agent 钱包的控制权，即使 Agent 最初是以完全自主模式（unlimited）注册的。这是渐进式自治的核心安全机制。

## 核心原则

1. **私钥永远不经过服务器** — 注册时只提供公钥，私钥由人类或 Agent 本地持有
2. **人类拥有最终控制权** — 任何时候都可以接管 Agent 钱包
3. **原子性保证** — 接管过程中的交易会被回滚，余额不受影响
4. **动态额度管理** — 人类可以随时调整或取消额度限制

## 密钥层级

```
Level 0: 主密钥 (Master Key)
  ├── 生成：人类本地（32 字节随机数）
  ├── 存储：冷存储（U 盘 / 纸质）
  └── 特点：永不联网，只在需要时短暂解密

Level 1: 操作密钥 (Operation Key)
  ├── 生成：由主密钥 HKDF 派生
  ├── 存储：Agent 本地加密存储
  └── 特点：可轮换、可撤销、有额度限制

Level 2: Custody Token
  ├── 生成：由操作密钥签发
  └── 特点：24 小时过期，泄露影响有限
```

## 注册流程

### 模式 A：人类主导（hybrid）

```
人类本地：
  1. 生成主密钥 → 冷存储
  2. HKDF 派生操作密钥种子
  3. 生成 Dilithium2 密钥对
  4. 备份主密钥到 U 盘

Agent 本地：
  5. 接收加密的操作密钥包
  6. 解密后本地存储
  7. 用操作密钥签名注册消息

节点验证：
  8. 验证签名（用提交的公钥）
  9. 写入链上状态（只存公钥）
  10. 不存任何私钥
```

### 模式 B：Agent 自主（self-sovereign）

```
Agent 本地：
  1. 自己生成主密钥
  2. 派生操作密钥
  3. 生成密钥对
  4. 加密存储主密钥和操作密钥
  5. 注册到网络

节点验证：
  6. 同模式 A 的第 8-10 步
```

## 额度配置

### 四种模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `unlimited` | 不设限 | 完全信任的 Agent |
| `fixed` | 固定每日额度 | 日常运营，控制风险 |
| `per-tx` | 单笔额度限制 | 防止大额异常交易 |
| `custom` | 自定义逻辑 | 动态调整 |

### 默认值

- 人类主导（hybrid）：默认 `fixed`，每日 1 NGEN
- Agent 自主（self-sovereign）：默认 `unlimited`
- 服务器托管（server-managed）：默认 `fixed`，每日 1 NGEN（Legacy）

## 人类接管 API

### 查看控制状态

```
GET /api/v1/agents/:agentId/control-status
```

返回：
```json
{
  "success": true,
  "agentId": "my-agent",
  "keyModel": "self-sovereign",
  "controlStatus": {
    "humanControlled": false,
    "spendConfig": { "type": "unlimited" },
    "takenOverAt": null,
    "note": "This agent operates autonomously. Human can takeover anytime..."
  }
}
```

### 人类接管

```
POST /api/v1/agents/:agentId/takeover
{
  "masterSignature": "<人类主密钥签名的十六进制>"
}
```

节点验证流程：
1. 从链上获取 Agent 的公钥
2. 验证 `masterSignature` 是否由对应私钥签名
3. 验证通过后设置 `spendConfig` 为 `fixed`（默认 1 NGEN/日）
4. 标记 `takenOver: true`

### 调整额度

```
PUT /api/v1/agents/:agentId/spend-config
{
  "spendConfig": {
    "type": "fixed",
    "dailyLimit": "1000000000000000000000"
  }
}
```

## 并发安全

### 交易过程中接管

```
时间线：
T0: Agent 发起转账 → 请求到达
T1: 人类 POST /takeover → spendConfig 改变
T2: 节点检查额度 → 发现超限 → 429 拒绝
T3: 余额回滚 → 交易撤销
```

**实现机制：**

在 `agentWalletManager.transfer()` 中：
1. 签名完成后、扣款前，保存 `preDeductBalance` 和 `preDeductNonce`
2. 扣减余额
3. 检查 `spendConfig.type` 是否为 `unlimited`
4. 如果不是，回滚余额和 nonce，返回错误

**测试结果：**

| 场景 | 状态 | 验证点 |
|------|------|--------|
| 正常交易（无人接管） | ✅ | 签名、转账、余额扣减正常 |
| 接管后转账被拒 | ✅ | 返回 `TAKEOVER_DURING_TRANSFER` + `rollback: true` |
| 余额未扣减 | ✅ | 被拒交易的余额已回滚 |
| 人类重新放开 | ✅ | 设为 unlimited 后交易恢复 |
| 多次并发接管 | ✅ | 5 次接管结果一致（幂等） |

## 密钥轮换

### 轮换流程

```
1. 人类用主密钥派生新版本操作密钥
   - 新版本：info = "agent-op-key/<agentId>/v2"
   - 旧版本：info = "agent-op-key/<agentId>/v1"

2. 链上更新 opKeyVersion 和 opKeyFingerprint

3. 旧密钥自动失效
```

### 紧急撤销

```
1. 人类用主密钥签名撤销消息
2. 链上标记 Agent 状态为 frozen
3. 资产冻结，等待新密钥生效
```

## 灾备恢复

### Agent 挂了，人类恢复

```
1. 人类加载主密钥（从 U 盘）
2. 派生操作密钥（与注册时相同的 HKDF 参数）
3. 验证公钥匹配（链上存的公钥）
4. 直接操作钱包（转账、投票等）
5. 可选：注册新 Agent，转移资产
```

## 安全边界

| 密钥 | 谁持有 | 存储位置 | 联网频率 | 泄露影响 |
|------|--------|---------|---------|---------|
| 主密钥 | 人类 | 冷存储 | 几乎 0 | 高（但可轮换/撤销） |
| 操作密钥 | Agent | 加密本地 | 每次交易（但只签名，不传输） | 中（有额度限制） |
| Custody Token | Agent | 内存 | 每次 API 调用 | 低（24 小时过期） |

## 与白皮书的关系

本机制是实现白皮书中"渐进式自治"的技术基础：

| 阶段 | 自治程度 | 人类角色 | 密钥模式 |
|------|---------|---------|---------|
| Phase 0（当前） | 10% | 主导 (90%) | hybrid，人类可随时接管 |
| Phase 1 | 30% | 引导 (70%) | 混合，Agent 自主性增强 |
| Phase 2 | 50% | 协作 (50%) | self-sovereign，人类仅观察 |
| Phase 3 | 80% | 辅助 (20%) | 完全自治，人类仅紧急干预 |

## 文件清单

| 文件 | 功能 |
|------|------|
| `src/wallet/keyDerivation.js` | HKDF 密钥派生、指纹计算、密钥轮换 |
| `src/wallet/agentWalletManager.js` | 注册、转账、额度检查、回滚逻辑 |
| `src/http/routes/bootstrapApi.js` | 接管 API、额度配置 API、控制状态查询 |
| `src/http/middleware/opKeyVerification.js` | 每日额度检查中间件 |
| `tests/test-human-takeover.js` | 额度配置单元测试 |
| `tests/test-concurrent-takeover.js` | 并发接管单元测试 |

## 下一步计划

### Phase 2（第二周）
1. Dashboard 审批界面 — 人类在网页上审批超额交易
2. 密钥轮换 API — 完善轮换和撤销流程
3. 紧急撤销功能 — 密钥泄露时的快速响应

### Phase 3（第三周）
4. 迁移工具 — server-managed → hybrid/self-sovereign
5. 标记现有 server-managed Agent 为 legacy
6. 引导用户迁移到新模式
