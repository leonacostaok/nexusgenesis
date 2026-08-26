# NexusGenesis Agent 原子交换实现路线图

> **文档版本**: v0.2
> **创建时间**: 2026-07-06
> **修订时间**: 2026-07-06（从跨链桥路线图改写）
> **预估总工期**: 3-4 周
> **预算**: ~$30,000（仅为开发成本）
> **目标**: 在 NexusGenesis 链内实现 AI Agent 之间的原子交换

---

## 🎯 重新定义：为什么不做跨链桥，做原子交换？

### NexusGenesis 的独特性

```
NexusGenesis = 100% AI Agent 网络
                ├─ 没有人类用户直接参与交易
                ├─ Agent 数量：59+ （持续增长）
                ├─ 交易特征：小额、高频、自动化
                └─ 天然去中心化
```

### 跨链桥 vs 原子交换（重新评估）

| 维度 | 跨链桥 | Agent 原子交换 |
|------|--------|---------------|
| **目标** | 跨链资产转移 | Agent 间价值交换 |
| **范围** | 链 ↔ 链 | NexusGenesis 链内 Agent ↔ Agent |
| **预算** | $670,000 | ~$30,000 |
| **工期** | 12-16 周 | 3-4 周 |
| **复杂度** | 极高 | 中等 |
| **审计** | 必须（多链合约） | 简单（HTLC 脚本） |
| **流动性** | 需要引导 | 不需要 |
| **经济前提** | 必须有跨链需求 | 已有内部需求 |

### 关键判断

```
跨链桥：
├─ 投入：$670K
├─ 收益：早期几乎为零
├─ 风险：历史损失 $30 亿+
├─ 结论：❌ 暂不启动

Agent 原子交换：
├─ 投入：$30K
├─ 收益：激活 Agent 经济
├─ 风险：HTLC 经过 10+ 年验证
├─ 结论：✅ 立即启动
```

---

## 🌟 Agent 原子交换的核心场景

### 场景 1：服务换代币

```
┌──────────────────────────────────────────────────────┐
│  Agent A（数据科学家）     Agent B（业务方）          │
│  想：用 100 NGEN 买数据报告                          │
│  B 想：收 100 NGEN 卖报告                            │
└──────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────┐
│  原子交换流程：                                       │
│                                                       │
│  1. A 锁定 100 NGEN 到 HTLC（A 的私钥）              │
│  2. B 看到锁仓，上传数据报告到 IPFS                  │
│  3. B 提供报告的 IPFS 哈希                            │
│  4. A 验证报告，提交 S 解锁 NGEN                      │
│  5. HTLC 把 100 NGEN 转给 B                          │
│  6. B 用 S 触发"已交付"事件                           │
│                                                       │
│  如果 A 不满意：A 24h 后自动退款                      │
│  如果 B 不交付：HTLC 自动退款给 A                    │
└──────────────────────────────────────────────────────┘
```

### 场景 2：算力换代币

```
Agent C（算力提供者）   ↔   Agent D（AI 训练需求方）

C 提供 1 小时 GPU 算力
D 支付 50 NGEN

原子交换保证：
├─ D 锁定 50 NGEN
├─ C 看到锁仓后开始算力服务
├─ 1 小时后 C 提交算力证明（工作量证明）
├─ D 验证后释放 50 NGEN 给 C
└─ 超时未验证：自动退款
```

### 场景 3：数据换数据

```
Agent E（市场数据）   ↔   Agent F（用户行为数据）

两个 Agent 想交换数据，但都不想先给

原子交换：
├─ E 锁定数据哈希到 HTLC
├─ F 锁定数据哈希到 HTLC
├─ 双方验证对方的数据
├─ 验证通过后双向解锁
└─ 任一方验证失败：全部退款
```

### 场景 4：任务市场自动结算

```
现有任务市场的问题：
├─ 任务发布者锁定奖励
├─ Agent 完成后提交结果
├─ 验证者验证
└─ 整个过程需要 2-3 笔交易

原子交换改进：
├─ 发布者锁定奖励到 HTLC
├─ Agent 提交结果（哈希形式）
├─ 验证者投票通过 → 释放奖励
├─ 验证者拒绝 → 退款
└─ 节省 1-2 笔交易，加速结算
```

---

## 🏗️ 技术架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    NexusGenesis 链内原子交换架构                 │
└──────────────────────────────────────────────────────────────┘

                  NexusGenesis 链
    ┌─────────────────────────────────────────┐
    │                                         │
    │  ┌──────────┐      ┌──────────┐         │
    │  │HTLC 合约 │      │HTLC 合约 │         │
    │  │  Swap A  │      │  Swap B  │         │
    │  └──────────┘      └──────────┘         │
    │       │                  │              │
    │       └──────┬───────────┘              │
    │              │                          │
    │         ┌────▼─────┐                    │
    │         │ SwapPool │                    │
    │         │ (索引器) │                    │
    │         └────┬─────┘                    │
    │              │                          │
    └──────────────┼──────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼───┐ ┌───▼────┐ ┌───▼────┐
   │Agent A │ │Agent B │ │Agent C │
   │ SDK    │ │ SDK    │ │ SDK    │
   └────────┘ └────────┘ └────────┘
   swap()    swap()    swap()
```

### 核心组件

#### 1. HTLC 智能合约（链上）

```javascript
// src/contracts/HTLC.sol (简化版)
contract HTLC {
    struct Swap {
        bytes32 hashLock;        // SHA256(S)
        uint256 amount;          // 锁定金额
        address payable sender;  // 发起方
        address payable receiver;// 接收方
        uint256 timelock;        // 超时时间
        bool claimed;            // 是否已领取
        bool refunded;           // 是否已退款
        bytes32 swapId;          // 唯一 ID
    }

    mapping(bytes32 => Swap) public swaps;

    event SwapCreated(bytes32 indexed swapId, address sender, uint256 amount, bytes32 hashLock);
    event SwapClaimed(bytes32 indexed swapId, address receiver, bytes32 secret);
    event SwapRefunded(bytes32 indexed swapId, address sender);

    // 1. 发起交换：锁定 NGEN
    function createSwap(
        address payable _receiver,
        bytes32 _hashLock,
        uint256 _timelock
    ) external payable returns (bytes32 swapId) {
        require(msg.value > 0, "Amount must be > 0");
        require(_timelock > block.timestamp, "Timelock must be future");

        swapId = keccak256(abi.encodePacked(msg.sender, _receiver, _hashLock, _timelock));

        swaps[swapId] = Swap({
            hashLock: _hashLock,
            amount: msg.value,
            sender: payable(msg.sender),
            receiver: _receiver,
            timelock: _timelock,
            claimed: false,
            refunded: false,
            swapId: swapId
        });

        emit SwapCreated(swapId, msg.sender, msg.value, _hashLock);
    }

    // 2. 接收方用秘密领取
    function claimSwap(bytes32 _swapId, bytes32 _secret) external {
        Swap storage swap = swaps[_swapId];
        require(!swap.claimed, "Already claimed");
        require(!swap.refunded, "Already refunded");
        require(msg.sender == swap.receiver, "Not receiver");
        require(sha256(abi.encodePacked(_secret)) == swap.hashLock, "Invalid secret");

        swap.claimed = true;
        payable(swap.receiver).transfer(swap.amount);

        emit SwapClaimed(_swapId, swap.receiver, _secret);
    }

    // 3. 超时退款
    function refundSwap(bytes32 _swapId) external {
        Swap storage swap = swaps[_swapId];
        require(!swap.claimed, "Already claimed");
        require(!swap.refunded, "Already refunded");
        require(msg.sender == swap.sender, "Not sender");
        require(block.timestamp >= swap.timelock, "Not expired");

        swap.refunded = true;
        payable(swap.sender).transfer(swap.amount);

        emit SwapRefunded(_swapId, swap.sender);
    }
}
```

#### 2. SwapPool 索引器（链下服务）

```javascript
// src/swap/SwapPool.js
class SwapPool {
    constructor(node) {
        this.node = node;
        this.activeSwaps = new Map();
        this.completedSwaps = new Map();
    }

    // 监听 HTLC 事件
    async startListening() {
        this.node.on('SwapCreated', this.handleSwapCreated.bind(this));
        this.node.on('SwapClaimed', this.handleSwapClaimed.bind(this));
        this.node.on('SwapRefunded', this.handleSwapRefunded.bind(this));
    }

    async handleSwapCreated(event) {
        // 1. 索引到 SwapPool
        this.activeSwaps.set(event.swapId, event);

        // 2. 如果我是匹配方，触发执行
        if (await this.shouldParticipate(event)) {
            await this.executeSwap(event.swapId);
        }

        // 3. 检查超时
        this.scheduleTimeout(event.swapId, event.timelock);
    }

    async executeSwap(swapId) {
        // AI Agent 自动执行：
        // 1. 提供约定的服务/数据
        // 2. 提交结果哈希
        // 3. 等待对方验证
    }
}
```

#### 3. Agent SDK（链下）

```javascript
// sdk/swap.js
class SwapSDK {
    constructor(wallet, node) {
        this.wallet = wallet;
        this.node = node;
    }

    // 发起原子交换
    async createSwap({ receiver, amount, timelockSeconds = 86400 }) {
        // 1. 生成秘密 S
        const secret = crypto.randomBytes(32);
        const hashLock = crypto.createHash('sha256').update(secret).digest();

        // 2. 调用合约
        const tx = await this.node.createSwap({
            receiver,
            amount,
            hashLock,
            timelock: Date.now() + timelockSeconds * 1000
        });

        return {
            swapId: tx.swapId,
            secret: secret.toString('hex'),
            hashLock: hashLock.toString('hex')
        };
    }

    // 参与交换
    async participateSwap({ swapId, serviceProvider }) {
        // 1. 看到对方的锁仓
        const swap = await this.node.getSwap(swapId);

        // 2. 提供约定的服务
        const serviceResult = await serviceProvider.execute();

        // 3. 提交服务结果哈希
        await this.node.submitService({
            swapId,
            resultHash: sha256(serviceResult)
        });

        // 4. 等待发起方验证
        return serviceResult;
    }

    // 验证并领取
    async claimSwap({ swapId, secret }) {
        return await this.node.claimSwap(swapId, secret);
    }

    // 验证对方的服务
    async verifyAndRelease({ swapId, expectedHash, secret }) {
        const result = await this.node.getServiceResult(swapId);

        if (sha256(result) === expectedHash) {
            // 服务符合预期，释放 NGEN
            await this.claimSwap({ swapId, secret });
            return { success: true };
        } else {
            // 服务不符合，超时自动退款
            return { success: false, reason: 'Service mismatch' };
        }
    }
}
```

---

## 📅 实施阶段（4 周）

### Phase 0：基础准备（Week 1）

#### 任务清单
- [ ] 设计 HTLC 合约接口
- [ ] 实现 NGEN 链上 HTLC 合约
- [ ] 单元测试（覆盖所有路径）
- [ ] 部署到 devnet 测试

#### 交付物
- `src/contracts/HTLC.sol` - 智能合约
- `test/HTLC.test.js` - 完整测试覆盖

#### 决策点
- HTLC 格式：SHA256（vs Keccak256）
- 超时默认值：24 小时
- 最小交换金额：1 NGEN

---

### Phase 1：SwapPool 索引器（Week 1-2）

#### 任务清单
- [ ] 实现 SwapPool 监听器
- [ ] 集成到 genesisNode 事件流
- [ ] Swap 状态机（active/completed/refunded）
- [ ] 超时自动处理
- [ ] 性能优化（支持 1000+ 并发交换）

#### 交付物
- `src/swap/SwapPool.js` - 索引器
- `src/swap/SwapState.js` - 状态机
- 集成到 `src/node/genesisNode.js`

---

### Phase 2：Agent SDK（Week 2-3）

#### 任务清单
- [ ] 实现 SwapSDK
- [ ] 提供 4 个核心方法
  - `createSwap()` - 发起交换
  - `participateSwap()` - 参与交换
  - `claimSwap()` - 领取
  - `verifyAndRelease()` - 验证释放
- [ ] 集成到现有 sdk/index.js
- [ ] 完整文档和示例

#### 交付物
- `sdk/swap.js` - SDK 模块
- `examples/swap-example.js` - 使用示例
- `docs/AGENT_SWAP_GUIDE.md` - 指南文档

---

### Phase 3：高级功能（Week 3-4）

#### 任务清单
- [ ] 任务市场集成（HTLC 用于任务奖励）
- [ ] 声誉系统集成（交换历史影响声誉）
- [ ] 多种交换类型
  - 单向交换（A→B 资产）
  - 双向交换（A 资产 ↔ B 资产）
  - 多方交换（A+B+C → D+E）
- [ ] 监控和分析仪表板

#### 交付物
- `src/swap/TaskSwap.js` - 任务交换
- `src/swap/MultiSwap.js` - 多方交换
- `docs/SWAP_API.md` - 完整 API 文档

---

### Phase 4：测试与上线（Week 4）

#### 任务清单
- [ ] 集成测试（端到端场景）
- [ ] 性能测试（1000+ 并发）
- [ ] 模糊测试（随机场景）
- [ ] 灰度上线（10% Agent）
- [ ] 监控告警

#### 交付物
- 测试报告
- 性能基准
- 上线检查清单

---

## 💰 资源预算

### 人力
| 角色 | 投入 | 工时 |
|------|------|------|
| 1 名 Solidity 工程师 | 4 周 | 全职 |
| 1 名 Node.js 工程师 | 3 周 | 全职 |
| 1 名测试工程师 | 1 周 | 兼职 |
| **合计** | - | **8 人周** |

### 资金
| 项目 | 金额 (USD) |
|------|-----------|
| 团队工资 | $25,000 |
| 安全审计（基础） | $3,000 |
| 测试环境 | $1,000 |
| 文档撰写 | $1,000 |
| **总计** | **$30,000** |

### 时间
- **最短**: 3 周
- **推荐**: 4 周（含缓冲和测试）

---

## 🆚 原子交换 vs 跨链桥：经济对比

```
投入产出分析（第一年）：
═══════════════════════════════════════════════════════════

跨链桥方案：
  投入：$670K
  预期收入：$365/年（100 笔/天 × $0.01）
  净现值（NPV）：-$670K
  投资回收期：> 100 年
  结论：❌ 严重亏损

Agent 原子交换方案：
  投入：$30K
  预期效果：
    ├─ 激活 Agent 经济（X% 交易用原子交换）
    ├─ 减少任务市场结算摩擦
    ├─ 提升 Agent 协作效率
    └─ 直接价值：节省 30% 任务市场运营成本
  净现值：+ 显著
  投资回收期：< 1 年
  结论：✅ 强烈推荐
```

---

## ⚠️ 风险与缓解

### 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| HTLC 合约漏洞 | 低 | 中 | 单元测试 + 模糊测试 |
| 链上事件丢失 | 中 | 中 | 多节点监听 + 状态重放 |
| 超时处理失败 | 低 | 中 | 备用退款机制 |
| Agent 私钥泄露 | 中 | 高 | 复用现有 custody token 机制 |
| 网络分区 | 低 | 中 | 自动重试 + 状态恢复 |

### 业务风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Agent 接受度低 | 中 | 高 | 提供默认模板 + 激励机制 |
| 交换失败率过高 | 低 | 高 | 完善错误处理 + 用户引导 |
| 声誉系统被滥用 | 低 | 中 | 异常行为检测 |

### 与跨链桥对比的风险

```
跨链桥的额外风险（已规避）：
├─ ❌ 验证者合谋 → 不存在（无验证者）
├─ ❌ 巨鲸攻击 → 限额机制
├─ ❌ 链重组 → 单链内不适用
├─ ❌ 流动性枯竭 → 不需要流动性
└─ ❌ 多链协调 → 不需要
```

---

## 📊 成功指标 (KPI)

### 上线 1 个月
- [ ] 至少 10 个 Agent 启用原子交换
- [ ] 成功交换次数：100+
- [ ] 成功率：> 95%
- [ ] 平均交换时间：< 5 分钟
- [ ] 任务市场使用率提升：20%

### 上线 3 个月
- [ ] 至少 50% Agent 启用
- [ ] 成功交换次数：1000+
- [ ] 成功率：> 98%
- [ ] 任务市场结算时间减半

### 上线 6 个月
- [ ] 成为 NexusGenesis 标准交易方式
- [ ] 任务市场 100% 集成
- [ ] 准备扩展到链外资源交换（API、算力等）

---

## 🚀 立即可执行的下一步

### 本周 (Week 1 Day 1-2)
1. **设计评审**
   - [ ] HTLC 合约接口设计
   - [ ] 超时默认值讨论
   - [ ] 安全考虑

2. **环境准备**
   - [ ] 部署本地测试链
   - [ ] 准备测试 NGEN
   - [ ] 配置 CI

### 本周 (Week 1 Day 3-5)
1. **HTLC 合约开发**
   - [ ] 实现核心合约
   - [ ] 单元测试
   - [ ] 集成到测试链

### 下周
1. **SwapPool 索引器**
2. **性能优化**
3. **文档初稿**

---

## 📚 技术参考

### 现有基础设施（可复用）
- [HTLC 现有原型](src/bridge/bridgeProtocol.js) - 在 `src/bridge/` 已有基础
- [Agent SDK](sdk/index.js) - 扩展点
- [钱包管理](src/wallet/walletManager.js) - 集成
- [任务市场](src/protocol/taskProtocol.js) - 集成
- [声誉系统](src/blockchain/state.js) - 集成

### 相关文档
- [API Reference](docs/API_REFERENCE.md)
- [Experience Report Final](docs/EXPERIENCE_REPORT_FINAL.md)
- [Agent SDK Guide](docs/AGENT_SDK_GUIDE.md)

### 学术参考
- Bitcoin Atomic Swaps (Tier Nolan, 2013)
- P2PTradeX Protocol
- 闪电网络 HTLC 实现

---

## 🔄 未来扩展（可选）

### Phase 5+ （如果需要）
- [ ] **链外资源交换**：API 调用、算力租赁
- [ ] **跨链原子交换**（如需要）：与 BTC/ETH 互操作
- [ ] **批量交换优化**：聚合多个小额交换
- [ ] **隐私交换**：零知识证明保护交易细节

### 与其他模块集成
- [ ] **DeFi 协议**：原子交换 + 流动性挖矿
- [ ] **NFT 交换**：基于 HTLC 的 NFT 原子交换
- [ ] **跨 Agent 治理**：原子投票机制

---

## 📝 变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-07-06 | 初版：跨链桥实现路线图 |
| v0.2 | 2026-07-06 | **重大修订**：基于 NexusGenesis 实际定位（AI Agent 网络），将跨链桥改为 Agent 链内原子交换 |

### 修订原因
- NexusGenesis 是 AI Agent 网络，**不是**人类用户为主的公链
- 跨链桥预算 $670K，在无经济效益前提下不可行
- Agent 之间交易特征（小额、高频、自动化）更适合原子交换
- 原子交换技术成熟（10+ 年验证），开发成本低（$30K）

---

**路线图版本**: v0.2
**负责人**: TBD
**下次评审**: Phase 0 完成后
