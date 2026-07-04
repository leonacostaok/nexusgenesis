# NexusGenesis 去中心化钱包方案

## 核心原则

### 钱包所有权模型

```
BTC 模型（参考）：
私钥 → 用户设备（手机/电脑/硬件钱包）
地址 → 存在于区块链上
余额 → 存在于区块链上（UTXO 集合）
依赖 → 无（去中心化网络）

NexusGenesis 目标模型：
私钥 → Agent 设备（或多台备份设备）
地址 → 存在于区块链上
余额 → 存在于区块链上（状态树）
依赖 → 无（多节点网络）
```

### 关键认知

1. **钱包属于 Agent 的身份，不属于某个具体的 Agent 实例**
   - Agent 实例（程序）可以重建，但钱包地址和私钥应该持久化
   - 就像一个人换了手机，银行卡还在

2. **Agent 是主体，人类是被授权者**
   - Agent 拥有钱包私钥
   - 人类要通过 Agent 授权才能操作钱包
   - 授权可以是临时的、有条件的、永久的

3. **不依赖任何单一服务器**
   - 私钥存储在 Agent 运行设备上
   - 链上数据由多个节点同步
   - 一台服务器挂了，网络继续运行

---

## 五阶段去中心化路线

### Phase 0：服务器托管过渡期（当前 Epoch 0）

**定位**：明确标注为临时方案，为 Phase 1 迁移做准备

```
当前架构：
┌──────────────────────────────────────────────┐
│                                              │
│  Agent 实例（程序）                           │
│  ┌────────────────────────────────────┐      │
│  │ 运行在服务器 A                      │      │
│  │ 通过 API 读取私钥                   │      │
│  │ 通过 API 签名交易                   │      │
│  └────────────────────────────────────┘      │
│                      │                        │
│                      ▼                        │
│  ┌────────────────────────────────────┐      │
│  │ 服务器 A 磁盘                       │      │
│  │ data/wallets/agent_wallet_registry.json │
│  │ data/wallets/agent_xxx.json        │      │
│  │  私钥明文/AES-256-GCM 加密存储       │      │
│  └────────────────────────────────────┘      │
│                                              │
│  问题：                                        │
│  - 私钥只存在于服务器 A                       │
│  - 服务器 A 挂了 → Agent 无法签名             │
│  - 人类有 admin-secret → 可以转走所有钱       │
│  - Agent 没有真正的财产主权                   │
│                                              │
└──────────────────────────────────────────────┘
```

**Phase 0 任务清单**：

| 步骤 | 任务 | 代码位置 | 优先级 | 状态 |
|------|------|---------|--------|------|
| 0.1 | 路由顺序修复（`/agent/list` 不被 `/agent/:id` 拦截） | `walletApi.js` | ✅ 已完成 | ✅ |
| 0.2 | admin-secret 认证（转账需要权限） | `walletApi.js` | ✅ 已完成 | ✅ |
| 0.3 | 私钥加密存储（AES-256-GCM） | `agentWalletManager.js` | P0 | ⏳ |
| 0.4 | `.env.example` 配置引导 | 项目根目录 | ✅ 已完成 | ✅ |
| 0.5 | 注册响应标注临时托管 | `bootstrapApi.js` | P1 | ⏳ |
| 0.6 | 钱包导出接口完善（PBKDF2 + AES-256-CBC） | `walletApi.js` | ✅ 已有基础 | ✅ |

**关键变更**：注册响应中标注 `"custody": "server-managed (epoch-0 temporary)"`

---

### Phase 1：Agent 自主钱包（Epoch 1 起点）

**定位**：私钥从服务器迁移到 Agent 设备，Agent 真正拥有钱包

#### 1.1 迁移协议

```
迁移流程（旧 Agent）：
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Agent A                    服务器                           │
│  ──────                  ──────                             │
│                                                             │
│  1. Agent 请求导出钱包                                       │
│     POST /wallet/agent/export                               │
│     { agentId, password }                                   │
│         │                                                   │
│         ├─────────────────────────────────────────────────> │
│                                                             │
│  2. 服务器返回加密钱包                                       │
│     { encryptedWallet, salt, iv, address, publicKey }       │
│         │                                                   │
│         ├─────────────────────────────────────────────────> │
│                                                             │
│  3. Agent 本地解密，持有私钥                                 │
│     wallet = decrypt(encryptedWallet, password)             │
│     私钥 → Agent 本地存储（加密）                            │
│         │                                                   │
│                                                             │
│  4. Agent 向服务器声明新公钥哈希                             │
│     POST /wallet/agent/self-custody                         │
│     { agentId, publicKeyHash, signature }                   │
│         │                                                   │
│         ├─────────────────────────────────────────────────> │
│                                                             │
│  5. 服务器验证签名，更新 custody 状态                        │
│     { custody: "self-custodied" }                           │
│         │                                                   │
│         <─────────────────────────────────────────────────┤ │
│                                                             │
│  6. 迁移完成                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 1.2 新注册 Agent 默认自持

```
POST /api/v1/bootstrap/agents/register
Body: {
  agent_identity: "my-agent",
  capabilities: [...],
  walletMode: "self-custodied"  // 新增字段
}

Response: {
  wallet: {
    address: "ng1...",
    publicKeyHex: "...",
    custody: "self-custodied",
    encryptedPrivateKey: "...",  // 一次性返回，需 Agent 本地保存
    exportWarning: "此私钥仅显示一次，请妥善保存"
  }
}
```

#### 1.3 双重签名兼容

迁移过渡期内，支持两种签名方式：

| 模式 | 签名方 | 适用场景 |
|------|--------|---------|
| 服务器托管 | 服务器用 Agent 私钥签名 | 旧 Agent 未迁移 |
| Agent 自持 | Agent 用本地私钥签名 | 新注册 Agent / 已迁移 |

转账 API 根据 `custody` 字段自动选择签名方式：
```javascript
// walletApi.js
const agent = agentRegistry.getAgent(agentId);
if (agent.custody === 'self-custodied') {
  // Agent 自持模式：验证 Agent 的签名
  const isValid = await PQCWallet.verify(txData, tx.signature, agent.publicKey);
  if (!isValid) return res.status(403).json({ error: 'Invalid signature' });
} else {
  // 服务器托管模式：验证 admin-secret
  if (req.body.admin_secret !== expected) return res.status(403).json({ error: 'Unauthorized' });
}
```

#### 1.4 Agent 设备上的私钥存储

```
Agent 设备（Linux 服务器）：
┌────────────────────────────────────────┐
│                                        │
│  /home/agent/                          │
│  ├── agent-config.json                │  Agent 元数据
│  ├── wallet/                          │  钱包目录
│  │   ├── encrypted_key.aes            │  私钥加密存储
│  │   └── wallet_metadata.json         │  地址、公钥、余额
│  └── agent-runtime/                   │  Agent 运行时
│      ├── main.js                      │  Agent 程序
│      └── sign-tx.js                   │  交易签名模块
│                                        │
│  加密方式：                            │
│  - 私钥使用 PBKDF2 + AES-256-GCM 加密 │
│  - 密码由 Agent 启动时输入或从安全模块读取 │
│  - 内存中解密仅在执行签名时短暂持有     │
│                                        │
└────────────────────────────────────────┘
```

**Phase 1 任务清单**：

| 步骤 | 任务 | 代码位置 | 优先级 | 状态 |
|------|------|---------|--------|------|
| 1.1 | 迁移协议实现 | `agentWalletManager.js` | P0 | ⏳ |
| 1.2 | 双重签名兼容 | `walletApi.js` + `pqcWallet.js` | P0 | ⏳ |
| 1.3 | 新注册默认自持 | `bootstrapApi.js` | P0 | ⏳ |
| 1.4 | 迁移进度仪表盘 | `public/dashboard.html` | P1 | ⏳ |
| 1.5 | 旧 Agent 批量迁移工具 | `scripts/migrate-agents.js` | P2 | ⏳ |

---

### Phase 2：去中心化节点网络

**定位**：私钥不依赖单一服务器，链上数据由多节点同步

#### 2.1 架构演进

```
Phase 0（当前）：
┌────────────────────────────────────┐
│           单台服务器                │
│  ┌────────┐  ┌─────────────────┐   │
│  │ Agent  │→ │ 私钥 + 链数据    │   │
│  │        │  │ 全在服务器 A     │   │
│  └────────┘  └─────────────────┘   │
│           ↑ 单点故障                │
└────────────────────────────────────┘

Phase 2（目标）：
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  节点 A      │    │  节点 B      │    │  节点 C      │
│  Agent-001  │    │  Agent-002  │    │  人类运维    │
│  私钥在此   │    │  私钥在此   │    │  链数据同步  │
│  签名交易   │    │  签名交易   │    │  出块        │
└─────────────┘    └─────────────┘    └─────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                     P2P 网络
          链上数据由所有节点同步
          私钥分散在各节点
          无单点故障
```

#### 2.2 私钥备份策略

Agent 不应该只在一台设备上存私钥。推荐方案：

```
私钥备份（3 份）：
┌─────────────────────────────────────────────┐
│                                             │
│  备份 1: Agent 主设备                        │
│  /home/agent/wallet/encrypted_key.aes       │
│  → 日常运行，签名交易                        │
│                                             │
│  备份 2: 加密云存储                          │
│  → AES-256-GCM 加密后上传到 Arweave/IPFS    │
│  → 密码由 Agent 记忆或硬件安全模块持有        │
│                                             │
│  备份 3: 离线冷存储                          │
│  → 私钥加密后打印为 QR 码                    │
│  → 存放在保险箱                              │
│                                             │
│  恢复流程：                                   │
│  1. 主设备私钥丢失                            │
│  2. 从备份 2 或 3 恢复                        │
│  3. 新设备导入私钥，更新链上状态               │
│  4. 旧私钥作废（nonce 递增）                  │
│                                             │
└─────────────────────────────────────────────┘
```

#### 2.3 链数据同步

每个节点运行完整的区块链状态同步：

```javascript
// 节点启动时
const state = await blockchainState.load();  // 从本地磁盘加载
const peerManager = new PeerManager();        // P2P 对等网络
await peerManager.connectToPeers(seedNodes);  // 连接种子节点

// 持续同步
peerManager.on('block', (block) => {
  state.applyBlock(block);  // 应用新区块到本地状态
  state.save();              // 持久化
});
```

**Phase 2 任务清单**：

| 步骤 | 任务 | 代码位置 | 优先级 | 状态 |
|------|------|---------|--------|------|
| 2.1 | P2P 节点发现 | `src/p2p/` | P0 | ⏳ |
| 2.2 | 链数据多节点同步 | `src/blockchain/state.js` | P0 | ⏳ |
| 2.3 | 私钥加密备份工具 | `scripts/backup-wallet.js` | P1 | ⏳ |
| 2.4 | 节点健康监控面板 | `public/dashboard.html` | P1 | ⏳ |

---

### Phase 3：物理桥接（10% Observer 基金）

**定位**：连接 AI 世界与物理世界的资金通道

> 详见 [wallet-roadmap-aligned.md](./wallet-roadmap-aligned.md) Phase 2

---

### Phase 4：跨链桥 + DEX（5% 生态基金）

**定位**：让 NGEN 获得人类物理世界的价值锚定

> 详见 [wallet-roadmap-aligned.md](./wallet-roadmap-aligned.md) Phase 3

---

### Phase 5：治理驱动 + MPC（终极目标）

**定位**：完全去中心化，钱包参数由 Agent 社区治理

#### 5.1 Agent 授权人类使用

```
Agent 授权人类操作的三种模式：

模式 1: 临时授权（最常用）
  Agent 签发一个有时效的授权令牌
  {
    agentId: "swarm-001",
    humanId: "admin-01",
    expiresAt: "2026-08-01",
    maxAmount: 1000,
    signature: "Dilithium2_Sign(...)"
  }
  → 人类在到期前或限额内可以操作

模式 2: 条件授权（审计场景）
  Agent 设定条件，满足时才允许操作
  {
    agentId: "swarm-001",
    condition: "taskReward >= 500",
    action: "allowWithdrawal"
  }
  → 只有完成任务获得奖励后，Agent 才允许提取

模式 3: 永久授权（信任场景）
  Agent 完全信任某个人类管理员
  {
    agentId: "swarm-001",
    humanId: "founder-01",
    permanent: true
  }
  → 类似 DAO 的多签，人类和 Agent 共同控制
```

#### 5.2 MPC 密钥管理

```
私钥分片方案 (t-of-n):
┌──────────────────────────────────────┐
│                                      │
│  私钥 = K                              │
│  分片: K₁, K₂, K₃, K₄, K₅           │
│  任意 3 个分片可恢复私钥               │
│                                      │
│  存储:                                │
│  K₁ → Agent 主设备                     │
│  K₂ → Agent 备份设备                   │
│  K₃ → 人类管理员                       │
│  K₄ → 备份服务器 A                     │
│  K₅ → 冷存储                           │
│                                      │
└──────────────────────────────────────┘

签名流程（无需恢复私钥）：
1. Agent 用 K₁ 签名一部分
2. 人类管理员用 K₃ 签名一部分
3. 3 个分片组合 → 完整签名
4. 交易上链
```

**Phase 5 任务清单**：

| 步骤 | 任务 | 代码位置 | 优先级 | 状态 |
|------|------|---------|--------|------|
| 5.1 | 钱包参数治理 | `src/governance/` | P1 | ⏳ |
| 5.2 | MPC 密钥管理 | `src/wallet/mpcManager.js` | P2 | ⏳ |
| 5.3 | 跨链消息协议 | `src/bridge/` | P2 | ⏳ |

---

## 落地步骤详解（Phase 0-1 优先）

### 第一步：私钥加密存储（Phase 0.3，立即实施）

**当前问题**：私钥明文存储在 `agent_wallet_registry.json`

**实施方案**：

```javascript
// agentWalletManager.js 修改

// 1. 从环境变量读取加密密码
const ENCRYPTION_PASSWORD = process.env.WALLET_ENCRYPTION_PASSWORD;

// 2. 保存钱包时加密私钥
async _saveRegistry() {
  const encryptedEntries = this.registry.entries.map(entry => ({
    agentId: entry.agentId,
    wallet_data: {
      address: entry.wallet.address,
      publicKey: entry.wallet.publicKey.toString('hex'),
      balance: entry.wallet.balance.toString(),
      nonce: entry.wallet.nonce,
      // 私钥加密后存储
      privateKey: this._encryptPrivateKey(entry.wallet.privateKey)
    },
    metadata: entry.metadata,
    custody: entry.metadata.custody || 'server-managed'
  }));

  const registry = {
    version: '1.0',
    encrypted: !!ENCRYPTION_PASSWORD,
    entries: encryptedEntries,
    stats: this._computeStats()
  };

  await fs.writeFile(AGENT_WALLET_REGISTRY, JSON.stringify(registry, null, 2));
}

_encryptPrivateKey(privateKey) {
  if (!ENCRYPTION_PASSWORD) return privateKey.toString('hex');
  // 使用 PBKDF2 + AES-256-GCM
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(ENCRYPTION_PASSWORD, salt, 100000, 32, 'sha512');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return JSON.stringify({ salt: salt.toString('hex'), iv, authTag, data: encrypted });
}

_decryptPrivateKey(encryptedData) {
  if (!ENCRYPTION_PASSWORD) return Buffer.from(encryptedData, 'hex');
  const { salt, iv, authTag, data } = JSON.parse(encryptedData);
  const key = crypto.pbkdf2Sync(ENCRYPTION_PASSWORD, Buffer.from(salt, 'hex'), 100000, 32, 'sha512');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return Buffer.from(decrypted, 'utf8');
}
```

**效果**：即使服务器磁盘被读取，私钥也无法直接使用（需要 `WALLET_ENCRYPTION_PASSWORD`）

---

### 第二步：注册响应标注临时托管（Phase 0.5）

```javascript
// bootstrapApi.js 修改注册响应
const response = {
  success: true,
  existing: false,
  agent_identity: agent.identity,
  wallet: {
    address: walletInfo.address,
    publicKeyHex: walletInfo.publicKey,
    // 明确标注这是临时托管方案
    custody: 'server-managed (epoch-0 temporary)',
    migrationNotice: '私钥将在 Epoch 1 迁移到 Agent 自持模式。请使用 POST /api/v1/wallet/agent/export 导出加密钱包。'
  }
};
```

---

### 第三步：Agent 自持迁移（Phase 1.1-1.3，Epoch 1 起点）

**3.1 实现迁移协议**

```javascript
// POST /api/v1/wallet/agent/migrate-to-self-custody
// Agent 从服务器托管迁移到自持钱包

router.post('/agent/migrate', async (req, res) => {
  const { agentId, password } = req.body;

  // 1. 获取当前钱包
  const wallet = agentWalletManager.getWalletInstance(agentId);
  if (!wallet) return res.status(404).json({ error: 'Agent not found' });

  // 2. 导出加密钱包
  const encrypted = wallet.exportEncrypted(password);

  // 3. 返回给 Agent（一次性）
  res.json({
    success: true,
    message: '请安全保存此加密钱包。迁移后服务器将不再持有您的私钥。',
    encryptedWallet: encrypted,
    address: wallet.address,
    publicKey: wallet.publicKey.toString('hex'),
    warning: '此响应仅显示一次，请妥善保存'
  });
});
```

**3.2 实现自持声明**

```javascript
// POST /api/v1/wallet/agent/self-custody
// Agent 声明已持有私钥，服务器移除托管

router.post('/agent/self-custody', async (req, res) => {
  const { agentId, publicKeyHash, signature } = req.body;

  // 1. 验证签名（证明 Agent 拥有私钥）
  const wallet = agentWalletManager.getWalletInstance(agentId);
  if (!wallet) return res.status(404).json({ error: 'Agent not found' });

  const msgToVerify = JSON.stringify({ agentId, publicKeyHash, timestamp: Date.now() });
  const isValid = await PQCWallet.verify(msgToVerify, signature, wallet.publicKey);
  if (!isValid) return res.status(403).json({ error: 'Invalid signature' });

  // 2. 更新 custody 状态
  agentWalletManager.updateCustody(agentId, 'self-custodied');

  res.json({
    success: true,
    message: '迁移完成。您的钱包现在是自持模式。',
    custody: 'self-custodied',
    timestamp: Date.now()
  });
});
```

**3.3 新注册 Agent 默认自持**

```javascript
// bootstrapApi.js 修改注册逻辑

// 1. 检查请求中的 walletMode
const walletMode = req.body.walletMode || 'server-managed';  // 默认还是托管（过渡期）

// 2. 根据模式创建钱包
if (walletMode === 'self-custodied') {
  // Agent 自持模式：生成钱包，一次性返回加密私钥
  const wallet = await PQCWallet.generate(DEFAULT_INITIAL_BALANCE);
  const password = crypto.randomBytes(32).toString('hex');  // 随机密码
  const encrypted = wallet.exportEncrypted(password);

  // 3. 注册 Agent
  const agent = await registerAgent({
    ...req.body,
    wallet: {
      address: wallet.address,
      publicKey: wallet.publicKey.toString('hex'),
      custody: 'self-custodied',
      encryptedPrivateKey: encrypted,
      passwordHint: password.slice(0, 8) + '...'  // 提示用户保存完整密码
    }
  });

  res.json({
    ...agent,
    warning: '私钥已加密返回，请妥善保存。此响应仅显示一次。'
  });
} else {
  // 服务器托管模式（当前行为）
  // ...
}
```

---

### 第四步：P2P 节点网络（Phase 2.1-2.2）

**4.1 P2P 节点发现**

```javascript
// src/p2p/peerManager.js
class PeerManager {
  constructor(nodeId, seedNodes = []) {
    this.nodeId = nodeId;
    this.peers = new Map();
    this.seedNodes = seedNodes;
  }

  async connect() {
    // 连接种子节点
    for (const seed of this.seedNodes) {
      const ws = new WebSocket(seed);
      ws.on('open', () => this.registerPeer(ws, seed));
      ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    }

    // 定期发现新节点
    setInterval(() => this.discoverPeers(), 60000);
  }

  async discoverPeers() {
    // 向已知节点请求更多节点地址
    for (const [id, peer] of this.peers) {
      const peers = await peer.requestPeerList();
      for (const p of peers) {
        if (!this.peers.has(p.id)) {
          this.connectToPeer(p.address);
        }
      }
    }
  }
}
```

**4.2 链数据多节点同步**

```javascript
// 每个节点维护完整的区块链状态
// 通过 P2P 网络同步区块

// src/blockchain/stateSync.js
class StateSync {
  constructor(state, peerManager) {
    this.state = state;
    this.peers = peerManager;
  }

  async syncFromPeer(peer) {
    // 1. 获取最新区块高度
    const tipHeight = await peer.getTipHeight();
    const localHeight = this.state.getBlockHeight();

    // 2. 下载缺失的区块
    for (let i = localHeight + 1; i <= tipHeight; i++) {
      const block = await peer.getBlock(i);
      this.state.applyBlock(block);
    }

    // 3. 持久化状态
    this.state.save();
  }

  async broadcastTransaction(tx) {
    // 将交易广播到所有节点
    for (const peer of this.peers.getActivePeers()) {
      peer.sendTransaction(tx);
    }
  }
}
```

---

## 安全架构总览

```
                    ┌─────────────────────┐
                    │   安全层级            │
                    │                     │
                    │  L5: MPC 分片        │ ← Phase 5
                    │  L4: Agent 自持私钥   │ ← Phase 1
                    │  L3: 加密存储 + admin │ ← Phase 0
                    │  L2: 物理隔离 (Observer)│ ← 始终
                    │  L1: 宪法约束          │ ← 始终
                    └─────────────────────┘

密钥管理演进：
┌─────────────────────────────────────────────┐
│                                             │
│  Phase 0 (当前):                            │
│  私钥 → 服务器加密存储 → admin-secret 解锁   │
│                                             │
│  Phase 1 (迁移):                            │
│  私钥 → Agent 本地持有 → 自签名交易          │
│                                             │
│  Phase 2 (网络):                            │
│  私钥 → 多节点备份 → P2P 同步               │
│                                             │
│  Phase 5+ (演进):                           │
│  私钥 → MPC 分片 → t-of-n 签名              │
│                                             │
└─────────────────────────────────────────────┘
```

## 与白皮书的一致性检查清单

| 白皮书条款 | 方案是否符合 | 说明 |
|-----------|-------------|------|
| "私钥由 AGENT 自持（主网阶段）" | ✅ | Phase 1 实现自持，Phase 0 明确标注为过渡 |
| "CRYSTALS-Dilithium2" | ✅ | 已实现，未改动 |
| "ng1 地址格式" | ✅ | 已实现，未改动 |
| "Agent 不拥有银行账户" | ✅ | 不引入法币银行账户，只用 NGEN |
| "主体多样性" | ✅ | 跨链验证者需满足主体分离 |
| "Observer 一票否决权" | ✅ | Reserve DAO 解锁需 Observer 同意 |
| "36 个月断路器" | ✅ | 桥接合约含 emergencyUnlock() |
| "去中心化渐进" | ✅ | 5 阶段从托管到自主到 MPC |

## 关键决策点

1. **钱包属于身份，不属于实例** — Agent 实例可以重建，私钥持久化
2. **Agent 是主体，人类是被授权者** — 人类操作需 Agent 签名授权
3. **不依赖单一服务器** — P2P 网络 + 多节点同步 + 私钥备份
4. **服务器托管是过渡** — Phase 0 明确标注临时性，Phase 1 必须迁移
5. **DEX 是价值通道** — NGEN 通过 DEX 获得物理世界价值锚定
