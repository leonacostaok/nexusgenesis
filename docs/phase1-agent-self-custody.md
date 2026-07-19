# Phase 1: Agent 自主钱包迁移实现

## 概述

Phase 1 实现 Agent 从服务器托管模式（`server-managed`）迁移到 Agent 自持模式（`self-custodied`）。

## 核心原则

1. **钱包属于 Agent 的身份，不属于某个具体的 Agent 实例** — 私钥持久化
2. **Agent 是主体，人类是被授权者** — 人类操作需 Agent 签名授权
3. **不依赖任何单一服务器** — 私钥存储在 Agent 运行设备上

## 迁移协议

### 两步迁移流程

```
Step 1: 导出加密钱包
  POST /api/v1/wallet/agent/migrate-to-self-custody
  Body: { agentId, password }
  → 返回 encryptedWallet + address + publicKey

Step 2: 声明自持（签名证明）
  POST /api/v1/wallet/agent/self-custody
  Body: { agentId, signature, signedMessage }
  → 验证签名 → 更新 custody = 'self-custodied'
```

### 签名验证

Agent 必须用私钥签名一条消息来证明拥有私钥：

```javascript
// Agent 端
const signedMessage = `self-custody-declaration:${agentId}:${timestamp}`;
const signature = await dilithium2Sign(signedMessage, privateKey);

// 服务器端验证
const isValid = await verify(signedMessage, signature, publicKey);
```

## 新增 API

### 1. 迁移导出

```
POST /api/v1/wallet/agent/migrate-to-self-custody
```

**功能**：
- 验证 Agent 存在且未处于自持模式
- 用 password 导出加密钱包
- 返回加密钱包数据和迁移提示

**响应**：
```json
{
  "success": true,
  "data": {
    "address": "ng1...",
    "publicKeyHex": "...",
    "encryptedWallet": { ... },
    "custody": "server-managed (migration in progress)",
    "nextStep": "使用 POST /api/v1/wallet/agent/self-custody 完成迁移声明"
  }
}
```

### 2. 自持声明

```
POST /api/v1/wallet/agent/self-custody
```

**功能**：
- 验证 Agent 签名（证明私钥所有权）
- 更新 custody 状态为 `self-custodied`
- 记录迁移时间

**响应**：
```json
{
  "success": true,
  "data": {
    "agentId": "...",
    "custody": "self-custodied",
    "serverWillNotStorePrivateKey": true,
    "migratedAt": "2026-07-19T..."
  }
}
```

### 3. 迁移状态查询

```
GET /api/v1/wallet/agent/custody-status/:agentId
```

**功能**：查询 Agent 的 custody 状态

**响应**：
```json
{
  "success": true,
  "data": {
    "agentId": "...",
    "address": "ng1...",
    "keyModel": "server-managed",
    "custody": "self-custodied",
    "isSelfCustodied": true,
    "migrationStatus": "completed"
  }
}
```

## 双重签名兼容

### 转账 API 增强

`POST /api/v1/wallet/agent/transfer` 现在支持两种签名方式：

| 模式 | 签名方 | 适用场景 |
|------|--------|---------|
| 服务器托管 | admin-secret | 旧 Agent 未迁移 |
| Agent 自持 | admin_secret + agentSignature | 已迁移 Agent |

**自持 Agent 转账流程**：
```javascript
// 客户端
const transferData = {
  fromAgentId: 'agent-001',
  toAgentId: 'agent-002',
  amount: 100,
  memo: 'payment',
  agentSignature: dilithium2Sign(transferMsg, agentPrivateKey)
};

// 服务器验证
const entry = agentWalletManager.registry.get(fromAgentId);
if (entry.metadata?.custody === 'self-custodied') {
  const isValid = await verify(transferMsg, agentSignature, entry.wallet.publicKey);
  if (!isValid) return res.status(403).json({ error: 'Invalid agent signature' });
}
```

## 代码变更

### 文件清单

| 文件 | 变更 |
|------|------|
| `src/http/routes/walletApi.js` | 新增 3 个迁移 API + 双重签名兼容 |
| `src/wallet/agentWalletManager.js` | `_formatWalletResponse` 加入 custody 字段 |
| `tests/test-phase1-migration.js` | 8 个测试场景，26 个断言 |

### 关键代码

**agentWalletManager.js — `_formatWalletResponse` 增强**：
```javascript
_formatWalletResponse(agentId, wallet, metadata = {}) {
  const custody = metadata?.custody || 'server-managed';
  return {
    // ... 原有字段
    custody,
    isSelfCustodied: custody === 'self-custodied',
    migratedAt: metadata.migratedAt || null
  };
}
```

**walletApi.js — 自持声明**：
```javascript
router.post('/agent/self-custody', async (req, res) => {
  const { agentId, signature, signedMessage } = req.body;
  
  const entry = agentWalletManager.registry.get(agentId);
  const isValid = await verify(signedMessage, Buffer.from(signature, 'hex'), 
    Buffer.from(entry.wallet.publicKey, 'hex'));
  
  if (!isValid) return res.status(403).json({ error: 'Invalid signature' });
  
  entry.metadata.custody = 'self-custodied';
  entry.metadata.migratedAt = new Date().toISOString();
  await agentWalletManager._saveRegistry();
  
  res.json({ success: true, data: { custody: 'self-custodied' } });
});
```

## 测试结果

```
🧪 Phase 1: Agent 自主钱包迁移协议测试

[Test 1] 创建服务器托管 Agent
  ✅ Agent 创建成功
  ✅ keyModel 为 server-managed
  ✅ custody 状态为 server-managed
  ✅ isSelfCustodied = false

[Test 2] 导出加密钱包（迁移第一步）
  ✅ 迁移导出请求成功
  ✅ 返回加密钱包数据
  ✅ 返回地址
  ✅ custody 状态为迁移中
  ✅ 下一步提示正确

[Test 3] 声明自持（迁移第二步）
  ✅ 自持声明成功
  ✅ custody 更新为 self-custodied
  ✅ 服务器不再持有私钥
  ✅ 记录迁移时间

[Test 4] 验证 custody 状态
  ✅ 查询状态成功
  ✅ custody = self-custodied
  ✅ isSelfCustodied = true
  ✅ 迁移状态 = completed
  ✅ 有迁移时间戳

[Test 5] 重复迁移保护
  ✅ 重复迁移被拒绝
  ✅ 错误消息包含 already

[Test 6] 无效签名拒绝
  ✅ 无效签名被拒绝
  ✅ 错误消息包含 Invalid signature

[Test 7] 新 Agent 默认 server-managed
  ✅ 新 Agent 创建成功
  ✅ keyModel 为 server-managed
  ✅ 新 Agent 默认为 server-managed

[Test 8] 迁移后余额不变
  ✅ 迁移后余额保持 1000

总计: 26/26 通过, 0 失败
```

## 安全考虑

1. **签名验证** — Agent 必须用私钥签名才能完成迁移，防止未授权迁移
2. **一次性导出** — 加密钱包仅返回一次，服务器不保留副本
3. **重复迁移保护** — 已自持的 Agent 不能再导出迁移
4. **余额不变** — 迁移过程不涉及资金转移，余额保持一致

## 下一步

- **Phase 1.2**: 新注册 Agent 默认自持（`walletMode: 'self-custodied'`）
- **Phase 1.3**: 迁移进度仪表盘（dashboard.html）
- **Phase 1.4**: 旧 Agent 批量迁移工具
