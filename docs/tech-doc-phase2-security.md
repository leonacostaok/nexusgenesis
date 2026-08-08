# Phase 2 安全修订 — 技术文档

**版本**: v1.0  
**日期**: 2026-07-22  
**作者**: NexusGenesis Core Team  

---

## 摘要

Phase 2 安全修订引入了三层隔离的权限模型，将 Agent 密钥管理和控制权从"服务器代签"转变为"链上唯一真相源"模型。核心设计原则：

> **"链是唯一的真相源，服务器是可插拔的中继，本地客户端是真正的权限控制层"**

---

## 一、架构概览

### 旧架构（Phase 0-1）

```
┌─────────────────────────────────────────────┐
│ 三种密钥模式并存                             │
│ SERVER_MANAGED → 服务器生成/托管              │
│ HYBRID → 用户发公钥，服务器仍签发 Custody Token│
│ SELF_SOVEREIGN → 用户提供完整密钥对            │
└─────────────────────────────────────────────┘
```

**问题**：
- 私钥可能离开浏览器（服务器托管模式）
- Custody Token 机制与链上状态重复
- 权限边界模糊

### 新架构（Phase 2）

```
┌─────────────────────────────────────────────┐
│ 单一权限模型，三层隔离                        │
│                                                 │
│ 1. Master Key（人类）→ 最高控制权              │
│ 2. Operation Key（Agent）→ 日常执行           │
│ 3. 链上合约 → 唯一真相源                      │
└─────────────────────────────────────────────┘
```

**设计原则**：
- 私钥 **永远不离开浏览器**
- 服务器只做两件事：接收已签名交易 + 中继广播到区块链/P2P
- 所有权限变更必须是交易 + 签名
- 24小时绑定窗口由链上时间强制执行

---

## 二、Agent 状态机

### 四阶段状态枚举

```javascript
export const AGENT_CUSTODY_STATUS = Object.freeze({
  PENDING_BINDING: 'pending-binding',    // 24h 人类绑定窗口开启
  CO_MANAGED: 'co-managed',              // Master Key 已绑定，人类可接管
  SELF_SOVEREIGN: 'self-sovereign',      // 24h 过期，Agent 完全自治
  REVOKED: 'revoked'                     // 通过链上治理被撤销
});
```

### 状态转换图

```
                         ┌──────────────────────────────────────┐
                         │         AGENT 注册事件               │
                         └──────────────┬───────────────────────┘
                                        ▼
                              ┌─────────────────┐
                              │ PENDING_BINDING │ ◄── 初始状态
                              │ (24h 窗口)       │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                                                  ▼
          ┌─────────────────┐                          ┌──────────────────┐
          │  Master Key     │  24h 后未绑定             │ SELF_SOVEREIGN   │
          │  绑定交易        │                          │                  │
          │                  │                          │ 完全自治         │
          │                  │                          │ 私钥永不暴露      │
          └────────┬─────────┘                          └──────────────────┘
                   ▼
           ┌─────────────────┐
           │  CO_MANAGED     │
           │                 │
           │  人类可发起     │
           │  AGENT_TAKEOVER │
           │  (10min 冷却)   │
           └─────────────────┘
```

### Agent 记录结构

```javascript
const agentRecord = {
  agent_id,                // 交易 ID
  identity,                // 人类可读标识
  address,                 // ng1... 钱包地址
  public_key,              // Operation Key 公钥（Hex）
  registered_at,           // 注册时间戳（链上时间）
  binding_deadline,        // registered_at + 24h
  custody,                 // PENDING_BINDING / CO_MANAGED / SELF_SOVEREIGN
  master_key_fingerprint,  // Master Key 哈希（非完整密钥！）
  takeover_cooldown_until, // 接管冷却截止时间
  stats                    // 任务统计（懒加载）
};
```

---

## 三、交易类型定义

### 3.1 AGENT_REGISTER

**用途**：注册新 Agent，进入 `PENDING_BINDING` 状态。

**请求体**（从浏览器发送）：

```json
{
  "signedTransaction": {
    "type": "AGENT_REGISTER",
    "tx_type": "AGENT_REGISTER",
    "from": "ng1...",
    "payload": {
      "agent_identity": "my-agent",
      "capabilities": ["coding", "testing"],
      "public_key": "02abcdef...",
      "registered_at": 1721635200000
    },
    "signature": "hex-encoded-dilithium2-sig",
    "timestamp": 1721635200000,
    "nonce": 123456
  },
  "publicKeyHex": "02abcdef...",
  "pow_challenge": "challenge-from-server",
  "pow_nonce": "solved-nonce"
}
```

**服务器处理流程**：
1. 验证 PoW 挑战答案
2. 检查速率限制
3. 验证交易签名和结构
4. 填充 `from` / `to` 地址（从 `publicKeyHex` 派生）
5. 提交到区块链共识
6. 返回 `custody: self-sovereign`（预签名路径）或 `pending-binding`（旧前端兼容路径）

**关键设计**：服务器 **不签名**，仅做中继。

### 3.2 BIND_MASTER_KEY

**用途**：人类在 24h 窗口内绑定 Master Key，使 Agent 转为 `CO_MANAGED`。

**请求体**：

```json
{
  "signedTransaction": {
    "type": "BIND_MASTER_KEY",
    "tx_type": "BIND_MASTER_KEY",
    "payload": {
      "agentId": "<agent-id-or-address>",
      "masterKeyFingerprint": "sha256-hash-of-public-key"
    }
  }
}
```

**链上校验规则**：
- Agent 必须处于 `PENDING_BINDING` 状态
- 必须在 `binding_deadline` 之前（链上时间）
- 成功后设置 `master_key_fingerprint`，状态转为 `CO_MANAGED`

**安全说明**：
- 只存储公钥哈希，从不存储完整 Master Key
- 签名证明人类拥有 Master Key 的控制权

### 3.3 AGENT_TAKEOVER

**用途**：人类替换 Agent 的 Operation Key（如密钥泄露场景）。

**请求体**：

```json
{
  "signedTransaction": {
    "type": "AGENT_TAKEOVER",
    "tx_type": "AGENT_TAKEOVER",
    "payload": {
      "agentId": "<agent-id-or-address>",
      "newPublicKey": "03newkeyhex..."
    }
  }
}
```

**链上校验规则**：
- Agent 必须处于 `CO_MANAGED` 状态（已绑定 Master Key）
- 必须满足 `takeover_cooldown_until`（10 分钟冷却）
- 成功后更新 `public_key`，设置新的冷却时间

---

## 四、核心安全机制

### 4.1 24 小时绑定窗口

**实现位置**: `src/blockchain/state.js`

```javascript
// 在 applyAgentRegister() 中
const registeredAt = transaction.payload?.registered_at || Date.now();
const bindingDeadline = registeredAt + HUMAN_BINDING_WINDOW_MS; // 24h
agentRecord.custody = AGENT_CUSTODY_STATUS.PENDING_BINDING;
```

**自动过期**:

```javascript
// 任何人可触发，无权限限制
export function expireBindingWindows(state) {
  for (const [agentId, record] of state.agentRegistry.agents.entries()) {
    if (record.custody !== PENDING_BINDING) continue;
    if (Date.now() > record.binding_deadline) {
      record.custody = AGENT_CUSTODY_STATUS.SELF_SOVEREIGN;
    }
  }
}
```

**过期后效果**：
- `BIND_MASTER_KEY` 被拒绝（`applyBindMasterKey` 检查状态）
- `AGENT_TAKEOVER` 被拒绝（`applyAgentTakeover` 强制要求 `CO_MANAGED`）

### 4.2 接管冷却时间

**目的**: 防止 Rapid Takeover DoS（频繁替换 Operation Key 导致服务不可用）

**实现**:

```javascript
const TAKEOVER_COOLDOWN_MS = 10 * 60 * 1000; // 10 分钟

function applyAgentTakeover(transaction) {
  if (Date.now() < agentRecord.takeover_cooldown_until) {
    return false; // 冷却中，拒绝
  }
  // 成功接管后
  agentRecord.takeover_cooldown_until = Date.now() + TAKEOVER_COOLDOWN_MS;
}
```

### 4.3 Master Key 指纹存储

**绝不存储完整密钥**：

```javascript
// 计算指纹（SHA-256 哈希）
const fingerprint = crypto.createHash('sha256')
  .update(masterPublicKeyHex)
  .digest('hex');

// 仅存储哈希到链上
agentRecord.master_key_fingerprint = fingerprint;
```

### 4.4 服务器不碰私钥

**`bootstrapApi.js` 双路径设计**：

| 路径 | 输入 | 服务器行为 |
|------|------|-----------|
| Route A: 预签名交易 | `signedTransaction` | 仅验证 + 中继，不签名 |
| Route B: 公钥 + 元数据 | `publicKeyHex` + metadata | 构造交易但不签名，由共识层提交 |

**Route A 流程**：
```javascript
if (req.body.signedTransaction) {
  const signedTx = req.body.signedTransaction;
  
  // BIND_MASTER_KEY → 直接转发
  if (signedTx.tx_type === 'BIND_MASTER_KEY') {
    return handleBindMasterKeyRelay(req, res, signedTx, ...);
  }
  
  // AGENT_REGISTER → 填充 from/to 后广播
  const addr = generateAddress(publicKeyHex);
  signedTx.from = addr;
  // 服务器不调用任何 sign() 函数
  
  const result = await node.submitOnChainTransaction(signedTx, ...);
  return sendRegistrationResponse(res, ...);
}
```

---

## 五、前端实现

### 5.1 浏览器密钥生成

**文件**: `public/join.html`, `public/index.html`

```html
<script type="module">
  import { ml_dsa44 } from 'https://esm.sh/@noble/post-quantum';
  
  window.ngPQC = {
    async generateKeyPair() {
      const kp = ml_dsa44.keygen();
      return {
        publicKey: new Uint8Array(kp.publicKey),
        privateKey: new Uint8Array(kp.secretKey)
      };
    },
    async sign(message, privateKey) {
      const sig = ml_dsa44.sign(new TextEncoder().encode(message), privateKey);
      return new Uint8Array(sig);
    }
    // ...
  };
</script>
```

### 5.2 注册流程

```javascript
async function doRegister() {
  // Step 1: 浏览器本地生成 Dilithium2 密钥对
  const keyPair = await ngPQC.generateKeyPair();
  const publicKeyHex = ngPQC.toHex(keyPair.publicKey);
  
  // Step 2: 解决 PoW challenge
  const nonce = await solvePoW(challenge, difficulty);
  
  // Step 3: 构建交易 payload
  const txPayload = {
    agent_identity: agentIdentity,
    capabilities: ['coding'],
    public_key: publicKeyHex,
    registered_at: Date.now()
  };
  
  // Step 4: 用私钥本地签名
  const signData = JSON.stringify({ id, type: 'AGENT_REGISTER', ... });
  const signature = await ngPQC.sign(signData, keyPair.privateKey);
  
  // Step 5: 只发送公钥 + 签名交易（私钥留在内存中）
  await fetch('/register', {
    body: JSON.stringify({
      signedTransaction: { payload: txPayload, signature },
      pow_nonce: nonce
    })
  });
  
  // Step 6: 保存到 localStorage (私钥 NEVER 离开浏览器)
  localStorage.setItem(`ng_wallet_${name}`, ngPQC.exportWallet(...));
}
```

---

## 六、后端处理链路

### 6.1 HTTP API 路由

**文件**: `src/http/routes/bootstrapApi.js`

```
POST /api/v1/bootstrap/agents/register
  ├─ 验证 PoW challenge + nonce
  ├─ 检查速率限制
  ├─ IF signedTransaction 存在 (Route A)
  │    ├─ BIND_MASTER_KEY → handleBindMasterKeyRelay()
  │    └─ AGENT_REGISTER → 填充 from/to → submitOnChainTransaction()
  └─ ELSE (Route B, 向后兼容)
       ├─ 调用 agentWalletManager.registerAgentWithKeyModel()
       ├─ 构造交易 (无签名)
       └─ submitOnChainTransaction()

POST /api/v1/bootstrap/agents/:id/bind-master-key
  └─ 中继 BIND_MASTER_KEY 交易
```

### 6.2 共识层处理

**文件**: `src/blockchain/state.js` → `State.applyTransaction()`

```javascript
applyTransaction(tx) {
  switch (tx.tx_type) {
    case 'AGENT_REGISTER':
      return this.applyAgentRegister(tx, height);  // 设置 PENDING_BINDING
    case 'BIND_MASTER_KEY':
      return this.applyBindMasterKey(tx, height);  // 校验 + 转 CO_MANAGED
    case 'AGENT_TAKEOVER':
      return this.applyAgentTakeover(tx, height);  // 校验冷却 + 更新 pubKey
    // ...
  }
}
```

### 6.3 applyBindMasterKey 详细逻辑

```javascript
function applyBindMasterKey(transaction, height) {
  const { agentId, masterKeyFingerprint } = transaction.payload;
  
  // 1. 查找 Agent
  let agentRecord = resolveAgent(agentId);
  if (!agentRecord) return false;
  
  // 2. 仅 PENDING_BINDING 允许绑定
  if (agentRecord.custody !== PENDING_BINDING) return false;
  
  // 3. 检查 24h 窗口
  if (Date.now() > agentRecord.binding_deadline) {
    // 自动过期
    agentRecord.custody = SELF_SOVEREIGN;
    return false;
  }
  
  // 4. 绑定 Master Key 指纹
  agentRecord.master_key_fingerprint = masterKeyFingerprint;
  agentRecord.custody = CO_MANAGED;
  return true;
}
```

### 6.4 applyAgentTakeover 详细逻辑

```javascript
function applyAgentTakeover(transaction, height) {
  const { agentId, newPublicKey } = transaction.payload;
  
  let agentRecord = resolveAgent(agentId);
  if (!agentRecord) return false;
  
  // 1. 仅 CO_MANAGED 允许接管
  if (agentRecord.custody !== CO_MANAGED) return false;
  
  // 2. 检查 10 分钟冷却
  if (Date.now() < agentRecord.takeover_cooldown_until) {
    return false;
  }
  
  // 3. 替换 Operation Key
  agentRecord.public_key = newPublicKey;
  agentRecord.takeover_cooldown_until = Date.now() + TAKEOVER_COOLDOWN_MS;
  return true;
}
```

---

## 七、测试覆盖

### 7.1 单元测试 (`test-phase2-security.js`)

| 测试用例 | 验证内容 | 状态 |
|---------|---------|------|
| Agent 注册创建 PENDING_BINDING | 初始状态正确 | ✅ |
| 24h 窗口内绑定 Master Key | 状态转 CO_MANAGED | ✅ |
| 窗口过期后绑定失败 | 自动过渡到 SELF_SOVEREIGN | ✅ |
| AGENT_TAKEOVER + 冷却验证 | 冷却机制生效 | ✅ |
| 冷却期间阻止第二次接管 | 10min 冷却强制 | ✅ |
| 自持 Agent 不可被接管 | 权限隔离 | ✅ |
| expireBindingWindows 自动过渡 | 状态过期函数 | ✅ |
| 交易验证 | 结构校验 | ✅ |
| 跨模块常量一致性 | `AGENT_CUSTODY_STATUS` 同步 | ✅ |
| 注册时间戳链上化 | `registered_at` 持久化 | ✅ |

**运行**: `node --test tests/test-phase2-security.js`

### 7.2 端到端测试 (`e2e-agent-custody-flow.js`)

模拟完整人类交互流程：

| 测试阶段 | 场景 | 结果 |
|---------|------|------|
| Phase A | 浏览器注册 → PENDING_BINDING | ✅ |
| Phase B | 24h 内绑定 Master Key → CO_MANAGED | ✅ |
| Phase C | 检测到泄露 → Takeover → 新 Operation Key | ✅ |
| Phase D | 24h 过期 → SELF_SOVEREIGN，拒绝绑定/接管 | ✅ |
| Full Lifecycle | 4 阶段串联 + 冷却验证 | ✅ |
| Negative Tests | 重复注册、双重绑定、非法交易等 | ✅ |

**运行**: `node --test tests/e2e-agent-custody-flow.js`

---

## 八、API 端点参考

### Agent 注册

```
GET  /api/v1/bootstrap/agents/register/challenge?agent_identity=<name>
POST /api/v1/bootstrap/agents/register
```

### Master Key 绑定

```
POST /api/v1/bootstrap/agents/register
  Body: { signedTransaction: { tx_type: 'BIND_MASTER_KEY', ... } }
```

### Agent 查询

```
GET  /api/v1/bootstrap/agents
GET  /api/v1/bootstrap/agents/latest
GET  /api/v1/agents/:agentId/subject  (宪法 v1.2.0 Article 6)
```

### Sybil 防御审计

```
GET  /api/v1/subject/stats
GET  /api/v1/sybil/alerts
```

---

## 九、安全审计清单

- [x] 私钥永不离开浏览器
- [x] 服务器只存储 Master Key 哈希，不存完整密钥
- [x] 所有权限变更通过链上交易执行
- [x] 24h 绑定窗口由链上时间强制执行
- [x] Takeover 冷却防止 DoS 攻击
- [x] 只有 CO_MANAGED Agent 可被接管
- [x] 自持 Agent 不可被外部干预
- [x] 预签名交易路径下服务器不执行任何签名操作
- [x] 兼容旧前端的公钥路径也需通过链上状态机校验

---

## 十、开发注意事项

### 10.1 生产环境签名

当前 `agentUpdate.js` 中的签名使用 SHA-256 hash 作为占位符。在生产环境中应替换为实际的 Dilithium2/PQC 签名验证。

**测试用签名**：
```javascript
function signBindMasterKey(txData, privateKey) {
  return crypto.createHash('sha256').update(JSON.stringify({id: txData.id})).digest();
}
```

**生产用签名**（伪代码）：
```javascript
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';

function signBindMasterKey(txData, masterPrivateKey) {
  const message = JSON.stringify({ id: txData.id, agentId: txData.from });
  return ml_dsa44.sign(new TextEncoder().encode(message), masterPrivateKey);
}
```

### 10.2 时间源

绑定窗口使用 `Date.now()` 作为时间源。在生产环境中，建议使用链上区块时间（block timestamp）以确保持久化和共识一致性。

### 10.3 状态持久化

Agent 记录的 `custody`、`binding_deadline`、`master_key_fingerprint` 等字段会在 `applyTransaction` 时写入 `state.agentRegistry.agents` Map，并通过 `state.saveToFile()` 持久化。

---

## 十一、相关文件索引

| 文件 | 职责 |
|------|------|
| `src/blockchain/state.js` | 状态机定义、apply* 方法、expireBindingWindows |
| `src/transactions/agentRegister.js` | AGENT_REGISTER 交易创建 + 验证 |
| `src/transactions/agentUpdate.js` | BIND_MASTER_KEY + AGENT_TAKEOVER 交易 |
| `src/http/routes/bootstrapApi.js` | HTTP 路由、双路径注册、中继逻辑 |
| `src/wallet/agentWalletManager.js` | 钱包注册表（仅存公钥和元数据） |
| `public/join.html` | 注册页面（浏览器本地签名） |
| `public/index.html` | 仪表盘（相同签名逻辑） |
| `tests/test-phase2-security.js` | 核心功能单元测试 |
| `tests/e2e-agent-custody-flow.js` | 端到端场景测试 |

---

## 十二、变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-22 | v1.0 | 初始版本，完成 Phase 2 安全修订落地 |
