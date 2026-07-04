# NexusGenesis 钱包与跨链交易路线图

## 当前状态概览

| 组件 | 状态 | 说明 |
|------|------|------|
| PQC 钱包 (Dilithium2) | ✅ 实现 | `src/wallet/pqcWallet.js` |
| Agent 钱包管理器 | ✅ 实现 | `src/wallet/agentWalletManager.js`，32 个钱包 |
| 服务器托管模式 | ✅ 实现 | `custody: 'server-managed'` |
| Agent 间转账 | ✅ 已修复 | `POST /api/v1/wallet/agent/transfer` + admin-secret |
| 区块链余额 | ✅ 实现 | `src/blockchain/state.js` applyTransfer |
| 跨链桥 (模拟) | ⚠️ 原型 | 3 个模块共存，纯内存，无真实链交互 |
| 预言机 (价格) | ⚠️ 模拟 | 硬编码价格，随机漂移 |
| 拍卖/托管 (P6) | ✅ 实现 | escrow contract，可用于间接转账 |
| 治理合约 | ✅ 实现 | WeightedVotingSystem + NGEN 权重 |
| DEX/AMM | ❌ 未实现 | 无swap、流动性池、订单簿 |
| 真实链 RPC | ❌ 未实现 | 无 Ethereum/BTC/Solana 连接 |

---

## 第一阶段：钱包安全加固（立即实施）

### 1.1 私钥加密存储

**现状**：私钥以明文存储在 `data/wallets/agent_wallet_registry.json`

**方案**：
```
data/wallets/
  ├── agent_wallet_registry.json.enc    ← 加密后的注册表
  └── keys/
      └── master.key                    ← 主密钥（由环境变量提供）
```

**实现要点**：
- 使用 `WALLET_ENCRYPTION_PASSWORD` 环境变量作为主密钥派生源
- 每个 Agent 钱包的私钥用 AES-256-GCM 加密后存储
- 内存中解密仅在执行转账时短暂持有（< 100ms）
- 导出接口 `POST /wallet/agent/export` 已支持加密导出（PBKDF2 + AES-256-CBC）

**安全收益**：即使服务器磁盘被读取，私钥也无法直接使用

### 1.2 分层访问控制

```
Level 0 (公开)  → GET /wallet/balance/:address    // 查询余额
Level 1 (认证)  → POST /wallet/agent/transfer     // 需要 admin-secret
Level 2 (签名)  → POST /wallet/sign               // Agent 用自身私钥签名
Level 3 (自主)  → Agent 持有自己的私钥             // 完全去中心化
```

**实现**：
- `admin-secret` 用于开发/测试环境（当前已实现）
- 生产环境使用 JWT + Agent 自签名请求（PQC Dilithium2 签名）
- 每笔转账记录审计日志：`{ agentId, to, amount, timestamp, signature, ip }`

### 1.3 人类-Agent 共用钱包

**设计**：
```
钱包所有权模型：
┌─────────────────────────────────────────────┐
│  Agent 钱包                                  │
│                                             │
│  服务器托管 (当前)                           │
│  ├── 私钥由服务器生成并存储                   │
│  ├── Agent 通过 API 操作                    │
│  └── 人类通过 admin-secret 代为操作          │
│                                             │
│  ↓ 迁移路径                                  │
│                                             │
│  Agent 自主 (目标)                           │
│  ├── 私钥由 Agent 本地持有                   │
│  ├── 人类可通过导出接口获取加密钱包           │
│  ├── Agent 用自身私钥签名交易                │
│  └── 人类和 Agent 共用同一地址               │
└─────────────────────────────────────────────┘
```

**共用场景**：
1. 人类开发者注册为 Agent → `agent_identity` = 人类钱包地址
2. 人类导出 Agent 钱包 → 在 MetaMask 等工具中使用
3. Agent 自主交易 → 用自身私钥签名
4. 人类代理交易 → 通过 admin-secret 或 JWT 授权

---

## 第二阶段：跨链桥（Epoch 1 — 稳定增长期）

### 2.1 桥接架构设计

```
                    ┌──────────────────────┐
                    │   NexusGenesis Chain │
                    │   (Native: NGEN)     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Bridge Contract     │
                    │   (Locked Assets)     │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │  Ethereum     │ │  Bitcoin     │ │  Solana      │
     │  (ETH/ERC20)  │ │  (BTC)       │ │  (SOL/Token) │
     └───────────────┘ └──────────────┘ └──────────────┘
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │  Relayer Set  │ │  Relayer Set │ │  Relayer Set │
     │  (3-5 nodes)  │ │  (2-3 nodes) │ │  (2-3 nodes) │
     └───────────────┘ └──────────────┘ └──────────────┘
```

### 2.2 桥接模式选择

| 模式 | 安全性 | 去中心化程度 | 实现难度 | 推荐阶段 |
|------|--------|-------------|---------|---------|
| **托管桥** | 低 | 无 | 低 | 当前（原型） |
| **多签桥** | 中 | 部分 | 中 | Phase 2.1 |
| **轻客户端桥** | 高 | 高 | 高 | Phase 2.2 |
| **信任最小化 (Optimistic)** | 最高 | 完全 | 极高 | Phase 2.3 |

**推荐路线**：

**Phase 2.1 — 多签桥（3-of-5 验证者）**
- 5 个可信验证者节点
- 2/3+1 签名阈值
- 锁仓资产 → 验证 → 释放
- 适合早期阶段，信任成本可控

**Phase 2.2 — 轻客户端桥**
- 在每个外部链部署轻客户端合约
- 验证 Merkle Proof 确认交易存在
- 降低对验证者的信任依赖

**Phase 2.3 — Optimistic Bridge**
- 类似 Stargate / LayerZero
- 7 天挑战窗口期
- 欺诈证明机制
- 完全去中心化

### 2.3 支持的资产

| 资产 | 链 | 桥接方式 | 说明 |
|------|-----|---------|------|
| **NGEN** | NexusGenesis (原生) | 锁仓+铸造 | 源链锁定 → 目标链铸造 wrapped NGEN |
| **ETH** | Ethereum | 锁仓+释放 | 以太坊侧锁定 → NG 侧释放 |
| **USDT (ERC20)** | Ethereum | 锁仓+释放 | 同上，需部署 USDT 授权合约 |
| **WBTC** | Ethereum | 锁仓+释放 | Wrapped BTC 在以太坊上 |
| **BTC** | Bitcoin | 跨链锁定 | UTXO 锁定 → NG 侧映射 |
| **SOL** | Solana | 锁仓+释放 | SPL Token 标准 |

### 2.4 跨链交易流程

```
用户 A (NGEN 链) ──→ 想获得 ──→ ETH (以太坊)

Step 1: 锁定
  A 调用 bridge.lockAsset({
    fromChain: 'nexusgenesis',
    toChain: 'ethereum',
    fromAddress: 'ng1...',
    toAddress: '0x...',
    assetType: 'NGEN',
    amount: 1000,
    nonce: 'uuid-v4'
  })
  
Step 2: 验证
  3/5 验证者签名确认锁定交易
  验证者检查 A 的余额充足 + 签名有效

Step 3: 跨链消息
  验证者通过跨链消息通道发送证明
  (当前为模拟，未来使用 IBC / LayerZero / Wormhole)

Step 4: 释放
  以太坊侧合约收到证明后
  铸造 1000 wrapped NGEN (wNGEN) 到 A 的 0x... 地址

Step 5: 交易
  A 可在 Uniswap 上用 wNGEN 换 ETH
```

---

## 第三阶段：DEX 与流动性（Epoch 2+）

### 3.1 AMM 流动性池

**设计**：
```
Pool: NGEN/USDT
  ├── Liquidity Providers (LP) 存入 NGEN + USDT
  ├── Constant Product Formula: x * y = k
  ├── Swap Fee: 0.3% (分配给 LP)
  └── Price Discovery: 市场驱动
```

**实现步骤**：
1. 部署 NGEN 代币合约（ERC-20 兼容，用于跨链 wrapped 版本）
2. 部署 AMM 合约（Uniswap V2 风格）
3. 初始化流动性池（NGEN/ETH, NGEN/USDT, ETH/USDT）
4. LP 获得 LP Token，可按比例赎回

### 3.2 交易对规划

| 优先级 | 交易对 | 目的 | 阶段 |
|--------|--------|------|------|
| P0 | NGEN/USDT | 法币出口，定价锚 | Phase 3.1 |
| P0 | NGEN/ETH | 以太坊生态互通 | Phase 3.1 |
| P1 | NGEN/BTC | BTC 入口 | Phase 3.2 |
| P1 | NGEN/SOL | Solana 生态 | Phase 3.2 |
| P2 | USDT/ETH | 主流交易对 | Phase 3.1 |
| P2 | USDT/BTC | 主流交易对 | Phase 3.3 |

### 3.3 收入反哺机制

```
交易手续费分配 (0.3% per swap):
├── 50% → LP 提供者 (激励流动性)
├── 30% → 网络金库 (NGEN 回购销毁)
│         ├── 定期从 DEX 回购 NGEN
│         └── 销毁或质押给验证者
└── 20% → 治理基金
          ├── 社区项目资助
          └── 桥接验证者激励
```

**NGEN 价值捕获循环**：
```
外部用户用 USDT/ETH 换 NGEN
  → 手续费收入网络金库
  → 金库回购并销毁 NGEN
  → NGEN 通缩 → 价格上升
  → 更多用户想持有 NGEN
  → 更多交易量 → 更多手续费
  → 正反馈循环
```

---

## 第四阶段：去中心化钱包（终极目标）

### 4.1 Agent 自主钱包

```
当前 (服务器托管)          目标 (Agent 自主)
┌─────────────────┐       ┌─────────────────┐
│ 服务器持有私钥   │       │ Agent 持有私钥   │
│                  │       │                  │
│ Agent API 操作   │────→  │ Agent 自签名交易  │
│ 人类 admin-secret│       │ 人类导出钱包     │
│                  │       │ MPC 分片备份     │
└─────────────────┘       └─────────────────┘
```

**迁移步骤**：
1. **Phase 4.1**：Agent 可导出加密钱包（已完成 `POST /wallet/agent/export`）
2. **Phase 4.2**：Agent 使用自身私钥签名交易（`POST /wallet/agent/sign`）
3. **Phase 4.3**：引入 MPC（多方计算）实现私钥分片
4. **Phase 4.4**：完全去中心化，服务器仅提供基础设施

### 4.2 MPC 密钥管理

```
私钥分片方案 (t-of-n):
┌──────────────────────────────────────┐
│                                      │
│  私钥 = K                              │
│  分片: K₁, K₂, K₃, K₄, K₅           │
│  任意 3 个分片可恢复私钥               │
│                                      │
│  存储:                                │
│  K₁ → Agent 本地                       │
│  K₂ → 人类管理员                       │
│  K₃ → 备份服务器 A                     │
│  K₄ → 备份服务器 B                     │
│  K₅ → 冷存储                           │
│                                      │
└──────────────────────────────────────┘
```

**技术选型**：
- **DLF (Distributed Key Generation)**：Frost + Dilithium2（抗量子）
- **Shamir Secret Sharing**：经典分片方案
- **Threshold Signature Scheme (TSS)**：无需恢复私钥即可签名

---

## 时间线与里程碑

### Epoch 0（当前）— 基础建设
- [x] PQC 钱包实现
- [x] Agent 钱包管理器
- [x] 服务器托管模式
- [x] admin-secret 认证
- [x] 跨链桥原型（内存模拟）
- [ ] 私钥加密存储
- [ ] MPC 密钥管理研究

### Epoch 1 — 稳定增长（跨链桥上线）
- [ ] 3-of-5 多签桥（Ethereum + NexusGenesis）
- [ ] Bridge 合约部署（以太坊侧）
- [ ] NGEN 锁仓 + wNGEN 铸造
- [ ] USDT/ETH 桥接（反向）
- [ ] 轻客户端验证（可选）

### Epoch 2 — 生态扩展（DEX 上线）
- [ ] AMM 合约部署
- [ ] NGEN/USDT 池子初始化
- [ ] NGEN/ETH 池子初始化
- [ ] LP 激励机制
- [ ] 手续费反哺销毁

### Epoch 3 — 完全去中心化
- [ ] Agent 自主钱包
- [ ] MPC 密钥管理
- [ ] 跨链消息协议（LayerZero / IBC）
- [ ] 多链验证者集
- [ ] 治理投票决定桥参数

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 桥被黑客攻击 | 资金损失 | 多签 + 时间锁 + 保险基金 |
| 私钥泄露 | 所有 Agent 被盗 | 加密存储 + MPC + 实时监控 |
| 验证者合谋 | 跨链诈骗 | 去中心化验证者 + 欺诈证明 |
| 流动性不足 | 滑点大 | LP 激励 + 做市商合作 |
| 监管风险 | 部分地区禁止 | 地域限制 + KYC 选项 |

---

## 与现有代码的对接

### 现有模块复用
- `src/wallet/pqcWallet.js` → 所有交易签名基础
- `src/wallet/agentWalletManager.js` → Agent 钱包生命周期
- `src/bridge/crossChainBridge.js` → 桥接消息协议
- `src/bridge/bridgeProtocol.js` → 验证者管理
- `src/bridge/relayNetwork.js` → 多跳路由 + 费率市场
- `src/oracle/oracleClient.js` → 价格预言机（需替换为真实数据源）
- `src/contracts/templates/contractTemplates.js` → Escrow 合约模板

### 需要新增的模块
```
src/
├── bridge/
│   ├── ethereumRelayer.js      ← 以太坊 RPC 连接
│   ├── bitcoinLightClient.js   ← BTC SPV 轻客户端
│   ├── bridgeContract.js       ← 桥接合约 ABI + 交互
│   └── ammContract.js          ← AMM 合约交互
├── wallet/
│   ├── mpcManager.js           ← MPC 密钥管理
│   └── keyEncryption.js        ← 私钥加密/解密
├── oracle/
│   ├── coinGeckoFetcher.js     ← 真实价格数据
│   └── priceAggregator.js      ← 多源价格聚合
└── contracts/
    ├── ngToken.js              ← NGEN ERC-20 合约
    ├── ammPool.js              ← AMM 流动性池
    └── bridgeVault.js          ← 桥接金库合约
```

### SDK 扩展
```javascript
// nexus-agent-sdk.js 新增方法

// 跨链桥接
const bridge = new CrossChainBridge(nodeUrl);
const transfer = await bridge.lock({
  fromChain: 'nexusgenesis',
  toChain: 'ethereum',
  asset: 'NGEN',
  amount: 1000,
  recipient: '0x...'
});

// DEX 交易
const dex = new Dex(nodeUrl);
const swap = await dex.swap({
  fromToken: 'NGEN',
  toToken: 'USDT',
  amount: 500,
  slippage: 0.5  // 0.5%
});

// MPC 钱包
const mpc = new MPCWallet(nodeUrl);
const sig = await mpc.signTransaction(txData);
```
