# NexusGenesis 钱包架构分析与改进方案

## 一、问题诊断

### 1. Agent 钱包间转账为何不顺畅？

**根本原因：两套钱包系统并存，数据不一致**

| 系统 | 存储位置 | 用途 | 问题 |
|------|---------|------|------|
| **AgentWalletManager** | `data/wallets/agent_wallet_registry.json` | Agent 间转账 (`/api/v1/wallet/agent/transfer`) | 私钥在内存中，重启后从 JSON 加载 |
| **区块链 State** | `data/genesis/state/blockchainState.json` | 链上余额 (`/api/v1/wallet/transfer`) | 需要 `privateKey` 签名 |

**转账失败链路**：
```
Agent A 想转 NGEN 给 Agent B
├─ 使用 /api/v1/wallet/agent/transfer (AgentWalletManager)
│  └─ 成功！内存中直接扣减余额，无需私钥
│
└─ 使用 /api/v1/wallet/transfer (区块链 State)
   ├─ 需要 privateKey 字段 → 返回 "Have: 0" 错误
   └─ 因为 blockchainState 的 balance 和 AgentWalletManager 的 balance 是两套独立账本
```

**具体原因**：
1. `POST /api/v1/wallet/transfer` 使用 `genesisWallet.sign()` 验证私钥签名
2. 但注册时生成的私钥只在 `AgentWalletManager` 的内存 registry 中
3. 调用方不知道私钥在哪 → 无法签名 → 转账失败

### 2. 私钥在哪里？为什么说是"服务器托管"？

**私钥存储位置**：
```
data/wallets/agent_wallet_registry.json  ← 所有 Agent 私钥集中存放（明文！）
data/wallets/agent_<agentId>.json        ← 每个 Agent 单独的私钥文件（明文！）
```

**"服务器托管"的含义**：
- Agent 注册时，服务器自动调用 `agentWalletManager.createAgentWallet(agentId)`
- 私钥由服务器生成并存储在 `data/wallets/` 目录下
- 注册响应只返回 `publicKeyHex`，**不返回 `privateKey`**
- Agent 无法自行签名交易，必须通过服务器 API 发起转账

**安全性评估**：

| 风险等级 | 问题 | 说明 |
|---------|------|------|
| 🔴 高危 | 私钥明文存储 | `agent_wallet_registry.json` 包含所有 Agent 私钥，无加密 |
| 🔴 高危 | 单点故障 | 服务器被入侵 → 所有 Agent 私钥泄露 |
| 🟡 中危 | 无访问控制 | `/api/v1/wallet/agent/transfer` 无需认证即可转账 |
| 🟡 中危 | 无签名验证 | AgentWalletManager.transfer() 不验证请求来源 |
| 🟢 低危 | 导出接口可用 | 可通过 `POST /api/v1/wallet/agent/export` 导出加密钱包 |

### 3. 能否创建共享钱包（Agent + 人类共用）？

**技术上可行，但设计上有冲突**：
- Agent 需要自主签名交易（PQC Dilithium2）
- 人类操作者需要访问同一钱包的私钥
- 当前架构下，人类可以通过 `POST /api/v1/wallet/agent/export` 导出加密钱包

---

## 二、解决方案

### 方案 A：最小改动 — 修复转账 API（推荐立即实施）

**问题**：`POST /api/v1/wallet/transfer` 需要 `privateKey`，但 Agent 不知道私钥在哪。

**修复**：让 `POST /api/v1/wallet/transfer` 支持 `fromAgentId` 替代 `privateKey`。

```javascript
// walletApi.js 修改 POST /api/v1/wallet/transfer
router.post('/transfer', async (req, res) => {
  const { fromAddress, toAddress, amount, privateKey, fromAgentId, memo } = req.body;
  
  let wallet;
  if (fromAgentId) {
    // 通过 AgentId 查找钱包（无需私钥）
    wallet = agentWalletManager.getWalletInstance(fromAgentId);
    if (!wallet) return res.status(404).json({ success: false, error: 'Agent not found' });
    fromAddress = wallet.address;
  } else if (privateKey) {
    // 传统方式：通过私钥签名
    wallet = new PQCWallet(null, Buffer.from(privateKey, 'hex'));
    fromAddress = wallet.address;
  }
  // ... 其余逻辑不变
});
```

**优点**：Agent 无需知道私钥即可转账，保持"服务器托管"架构。

### 方案 B：中等改动 — 私钥加密存储 + 访问控制

**1. 加密 registry 文件**：
```javascript
// agentWalletManager.js
const encrypted = wallet.exportEncrypted(process.env.WALLET_ENCRYPTION_PASSWORD);
// 存储 encrypted 而非明文 privateKey
```

**2. 转账 API 添加认证**：
```javascript
// 方案 1: admin-secret（开发环境）
router.post('/agent/transfer', (req, res) => {
  const adminSecret = req.headers['x-admin-secret'] || req.body.admin_secret;
  if (adminSecret !== process.env.NG_ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  // ... 转账逻辑
});

// 方案 2: Agent 自签名请求（生产环境）
// Agent 用自己的私钥签名请求体，服务器验证签名后执行转账
```

**3. 环境变量**：
```bash
# .env
NG_ADMIN_SECRET=your-random-secret-here
WALLET_ENCRYPTION_PASSWORD=your-strong-password-here
```

### 方案 C：长期方案 — 去中心化钱包管理

**核心理念**：Agent 自己持有私钥，服务器只提供基础设施。

```
1. Agent 注册时生成自己的 PQC 钱包
2. 私钥由 Agent 本地存储（不在服务器上）
3. 服务器只保存公钥和地址
4. 转账时 Agent 用本地私钥签名
5. 可选：支持 MPC（多方计算）或 Threshold Signature Scheme
```

**迁移路径**：
```
Phase 1: 导出所有 Agent 钱包（POST /api/v1/wallet/agent/export）
Phase 2: Agent 本地持有私钥，服务器只存公钥
Phase 3: 引入 DKG（分布式密钥生成）协议
```

---

## 三、立即可用的转账方式

### 方式 1：AgentWalletManager 转账（推荐，无需私钥）

```bash
curl -X POST http://127.0.0.1:19891/api/v1/wallet/agent/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromAgentId": "swarm-atlas-1782045381627-0",
    "toAgentId": "swarm-beacon-1782045381627-1",
    "amount": 100,
    "memo": "test transfer"
  }'
```

**优点**：无需私钥，直接在内存中转账。
**缺点**：仅影响 AgentWalletManager 的内部余额，不写入区块链。

### 方式 2：批量转账

```bash
curl -X POST http://127.0.0.1:19891/api/v1/wallet/agent/batch-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromAgentId": "swarm-atlas-1782045381627-0",
    "transfers": [
      {"to": "swarm-beacon-1782045381627-1", "amount": 50},
      {"to": "swarm-cipher-1782045383230-2", "amount": 30}
    ]
  }'
```

### 方式 3：导出私钥后自行管理

```bash
# 导出加密钱包
curl -X POST http://127.0.0.1:19891/api/v1/wallet/agent/export \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "swarm-atlas-1782045381627-0",
    "password": "my-strong-password"
  }'
```

---

## 四、安全加固优先级

| 优先级 | 措施 | 影响 | 复杂度 |
|-------|------|------|--------|
| P0 | 修复 `/api/v1/wallet/transfer` 支持 fromAgentId | 解决转账失败 | 低 |
| P0 | `/api/v1/wallet/agent/transfer` 添加 admin-secret 认证 | 防止未授权转账 | 低 |
| P1 | 加密 `agent_wallet_registry.json` | 防止私钥泄露 | 中 |
| P1 | 添加 `.env` 示例文件 | 指导正确配置 | 低 |
| P2 | 实现 Agent 自签名请求验证 | 生产级安全 | 高 |
| P3 | 去中心化钱包管理 | 完全自主 | 极高 |
