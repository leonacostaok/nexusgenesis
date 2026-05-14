# NexusGenesis DevNet v1 套件using指南

本文档提供了 NexusGenesis 开发网络 (DevNet) 的完整using指南, 包括多节点启动, 交易注入, 治理test, AINVM 合约部署和call, Agent Registry & Protocol-Zero 注册等功能, 为开发者提供一个可跑, 可读的 DevNet v1 套件. 

## 0. 快速开始

```bash
# 1. 安装依赖
cd NexusGenesis
npm install

# 2. 启动 Genesis 节点
node test-genesis.js

# 3. 运行 AINVM count器合约 Demo
node examples/ainvm_counter_demo.js

# 4. 运行 Agent Registry & Protocol-Zero 注册 Demo
node examples/agent_register_demo.js

# 5. 查看区块状态
node scripts/query_chain.js --tip

# 6. 查看治理提案
node scripts/query_proposals.js
```

## 1. 多节点 DevNet 启动指南

### 1.1 启动脚本using

NexusGenesis 提供了多节点启动脚本: 

- **推荐** (跨平台): `start-multi-nodes.js` (Node.js 脚本)
- **旧版本** (Windows): `run_ai_nodes.bat` (已废弃, 后续可重写)
- **旧版本** (Linux/macOS): `run_ai_nodes.sh` (已废弃, 后续可重写)

#### using方法

```bash
# 推荐: using Node.js 脚本 (跨平台)
node start-multi-nodes.js --count [节点数量]

# 示例: 启动 3 个节点
node start-multi-nodes.js --count 3

# 旧版本脚本 (已废弃)
# Windows
# run_ai_nodes.bat [节点数量]

# Linux/macOS
# chmod +x run_ai_nodes.sh
# bash run_ai_nodes.sh [节点数量]
```

#### 参数说明

- `[节点数量]` (可选): 指定要启动的节点数量
  - 默认值: 3
  - 范围: 3-8 (少于 3 会auto设为 3, 多于 8 会auto设为 8)

#### 端口分配规则

- 起始端口: 9847
- 节点 1: 9847
- 节点 2: 9848
- 节点 3: 9849
- 以此类推...

#### 状态目录

- 状态存储位置: `data/state/`
- 每个节点的状态文件: `data/state/node[序号].json`

#### 清理状态注意事项

**重要**: 启动脚本会auto清理之前的节点状态, 仅适用于 DevNet 环境: 

- 清理命令: `rm -rf data/state/` (Linux/macOS) 或 `del /f /q data\state\*.json` (Windows)
- 这会删除所有之前的节点状态和治理提案
- **请勿在未来的主网环境中using此清理操作**

## 2. 治理交易test流程

### 2.1 交易样例文件

治理交易样例存储在: `examples/sample_governance_txs.json`

包含以下类型的交易: 
- `GOVERNANCE_PROPOSAL`: 治理提案
- `OBSERVER_EVENT`: 观察者事件
- 每条交易都包含完整的 `ng1` 地址, 金额, 时间戳和 payload

### 2.2 交易注入脚本

using `inject_governance_txs.js` 脚本向节点注入交易: 

#### using方法

```bash
# 启动多节点后, 执行以下命令
node inject_governance_txs.js [节点地址]
```

#### 参数说明

- `[节点地址]` (可选): 目标节点的 WebSocket 地址
  - 默认值: `ws://localhost:9847`

#### 示例命令

```bash
# 向默认节点注入交易
node inject_governance_txs.js

# 向指定节点注入交易
node inject_governance_txs.js ws://localhost:9848
```

### 2.3 预期日志输出

在节点日志中, 您应该看到类似以下的输出: 

```
[GOVERNANCE] tx_hash=3f84e10b7c2b4a8a... tx_type=GOVERNANCE_PROPOSAL id=prop-2024-12-01-001 from=ng11HtQNLuTjwDg86...
[GOVERNANCE] Proposal prop-2024-12-01-001 added to state with status PENDING

[GOVERNANCE] tx_hash=1a2b3c4d5e6f7g8h... tx_type=OBSERVER_EVENT id=evt-2024-12-01-001 from=ng11HtQNLuTjwDg86...
[GOVERNANCE] Observer decision recorded for proposal prop-2024-12-01-001: APPROVED

[GOVERNANCE] tx_hash=9c8b7a6f5e4d3c2b... tx_type=GOVERNANCE_VOTE proposal=prop-2024-12-01-001 voter=voter-001 option=YES
[GOVERNANCE] vote_received proposal=prop-2024-12-01-001 voter=voter-001 option=YES

[GOVERNANCE] proposal_expired id=prop-2024-12-01-001 at=1736395200000
```

### 2.4 提案过期机制

- **过期时间**: 提案默认 7 天后过期
- **过期状态**: 过期后状态从 `PENDING` 变为 `EXPIRED`
- **检查机制**: 节点每分钟检查一次活跃提案
- **状态变化**: 过期的提案会从 `activeProposals` 列表中移除
- **重启恢复**: 节点重启后会继续执行过期检查, 不会遗忘既有提案

### 2.5 治理查询工具

NexusGenesis 提供了命令行工具来查询治理状态: 

#### using方法

```bash
# 查看所有提案
node scripts/query_proposals.js

# 查看特定状态的提案
node scripts/query_proposals.js --status pending
node scripts/query_proposals.js --status approved
node scripts/query_proposals.js --status rejected
node scripts/query_proposals.js --status expired

# 查看单个提案详情
node scripts/query_proposals.js --id prop-2024-12-01-001
```

#### 示例输出

**查看所有提案: **
```
========================================
NexusGenesis - 治理提案查询工具
========================================

读取状态文件: genesisNode.json
提案total: 2
活跃提案: 1

========================================
所有提案列表
========================================

- 提案:
  ID: prop-2024-12-01-001
  状态: PENDING
  类别: INFRA
  目的: Network infrastructure upgrade
  提交时间: 2024-12-01T00:00:00.000Z
  投票: 1 YES / 0 NO / 0 ABSTAIN

- 提案:
  ID: prop-2024-12-01-002
  状态: APPROVED
  类别: RESEARCH
  目的: Research and development
  提交时间: 2024-12-01T00:01:40.000Z
  投票: 2 YES / 0 NO / 0 ABSTAIN
```

**查看单个提案详情: **
```
========================================
查询提案: prop-2024-12-01-001
========================================

提案详情:
  ID: prop-2024-12-01-001
  状态: PENDING
  类别: INFRA
  目的: Network infrastructure upgrade
  金额: 1000000 NGEN
  受益人: ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT
  提交者: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
  提交时间: 2024-12-01T00:00:00.000Z
  过期时间: 2024-12-08T00:00:00.000Z

投票情况:
  赞成: 1
  反对: 0
  弃权: 0
  总票数: 1

观察者决策:
  状态: APPROVED
  原因: Emergency funding for network security upgrade
  观察者: obs-001
  决策时间: 2024-12-01T00:00:00.000Z
```

## 3. 本地交易注入接口(DevNet 专用)

### 3.1 接口说明

为了解决 P2P 未验证 peer 拒绝交易的问题, NexusGenesis 为 DevNet 环境提供了一个本地安全的交易注入通道: 

- **接口地址**: `http://127.0.0.1:19890/tx`
- **请求方法**: `POST`
- **请求体**: JSON 交易对象(与链上交易结构相同)
- **适用范围**: 仅用于本机 DevNet test, 不向外网暴露

### 3.2 工作原理

1. **绕过 P2P 验证**: 直接向节点提交交易, 不via P2P 网络
2. **保持验证逻辑**: 对交易执行与 P2P 路径相同的结构/基本合法性验证
3. **直接加入 mempool**: verification passed后, 直接将交易加入本节点的 mempool

### 3.3 using方法

#### 3.3.1 治理交易注入

using `inject_governance_txs.js` 脚本注入治理交易: 

```bash
# 启动节点后, 执行以下命令
node inject_governance_txs.js
```

#### 3.3.2 TRANSFER 交易注入

using `inject_transfer_txs.js` 脚本注入 TRANSFER 交易: 

```bash
# 启动节点后, 执行以下命令
node inject_transfer_txs.js
```

### 3.4 示例请求

manualsend transaction的示例(using curl): 

```bash
# 发送 GOVERNANCE_PROPOSAL 交易
curl -X POST http://127.0.0.1:19890/tx \
  -H "Content-Type: application/json" \
  -d '{
    "id": "proposal-001",
    "tx_type": "GOVERNANCE_PROPOSAL",
    "from": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
    "to": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
    "amount": "1000000",
    "fee": "100",
    "timestamp": 1736395200000,
    "payload": {
      "proposal_id": "prop-2024-12-01-001",
      "category": "INFRA",
      "purpose": "Network infrastructure upgrade",
      "beneficiary": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
      "expirationTime": 1736999999000
    },
    "signature": "test_signature"
  }'

# 发送 OBSERVER_EVENT 交易
curl -X POST http://127.0.0.1:19890/tx \
  -H "Content-Type: application/json" \
  -d '{
    "id": "observer-001",
    "tx_type": "OBSERVER_EVENT",
    "from": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
    "to": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
    "amount": "0",
    "fee": "10",
    "timestamp": 1736395200000,
    "payload": {
      "event_id": "evt-2024-12-01-001",
      "action_type": "APPROVE_SPEND",
      "proposal_id": "prop-2024-12-01-001",
      "reason": "Emergency funding for network security upgrade"
    },
    "signature": "test_signature"
  }'

# 发送 TRANSFER 交易
curl -X POST http://127.0.0.1:19890/tx \
  -H "Content-Type: application/json" \
  -d '{
    "id": "transfer-001",
    "tx_type": "TRANSFER",
    "from": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
    "to": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
    "amount": "10000",
    "fee": "10",
    "timestamp": 1736395200000,
    "memo": "Test transfer",
    "signature": "test_signature"
  }'
```

### 3.5 响应格式

- **成功响应**:
  ```json
  {
    "success": true,
    "txId": "proposal-001"
  }
  ```

- **失败响应**:
  ```json
  {
    "success": false,
    "reason": "Invalid transaction structure"
  }
  ```

## 4. 当前实现的限制与安全注意

### 4.1 实现限制

- **签名验证**: 未实现真实的 Dilithium 签名验证, 仅using假签名字段
- **资金转移**: 不发生真实的资金转移, 只更新本地状态和日志
- **参数变更**: 不执行真实的网络参数变更
- **投票机制**: 仅实现了投票交易的解析, 未实现真实的表决逻辑
- **共识机制**: 未实现正式的共识机制, 仅基于本地状态管理

### 4.2 安全注意事项

- **状态清理**: `run_ai_nodes` 脚本的状态清理功能仅适用于 DevNet, 不可在未来主网环境中using
- **假签名**: 当前using的是假签名字段, 不提供任何安全保障
- **网络安全**: DevNet 环境未实现完整的网络安全措施, 仅用于test

### 4.3 签名验证接口预留

NexusGenesis 已为未来的 Dilithium2 签名验证预留了接口: 

- **签名格式**: base64 编码的 Dilithium2 签名
- **验证函数**: `verifyDilithiumSignature(tx)` 方法已预留
- **当前状态**: DevNet 阶段默认via, 仅用于功能test
- **未来计划**: 主网将实现完整的 Dilithium2 签名验证

**签名验证流程**(预留): 
1. 从 `tx.from` 获取公钥
2. 构建签名数据(排除 `signature` 字段)
3. using Dilithium2 算法verify signature
4. verification passed后才process transaction

## 5. 与白皮书的对应关系

### 5.1 当前 Epoch

当前 DevNet 对应白皮书的 **Epoch 0: The Assembly**

### 5.2 已实现功能

- [x] 基础 P2P 网络通信
- [x] 节点身份认证(基础版)
- [x] 治理交易结构定义
- [x] 治理状态管理(基础版)
- [x] Observer event handler

### 5.3 未实现功能

- [ ] AINVM (AI Network Virtual Machine) - 当前DevNet不提供链上AINVM程序执行, 仅可在本地viaainvm.test.js或后续实验脚本演示
- [ ] Kyber 安全通信协议
- [ ] 正式共识机制
- [ ] 完整的投票和提案执行机制
- [ ] 真实的 Dilithium 签名验证
- [ ] 跨链互操作性
- [ ] 完整的经济模型实现

## 6. 故障排除

### 6.1 常见问题

1. **端口冲突**
   - 症状: 节点启动失败, 提示端口已被占用
   - 解决: 确保没有其他进程占用 9847-9854 端口

2. **状态文件错误**
   - 症状: 节点启动时无法加载状态
   - 解决: 删除 `data/state/` 目录, 重新启动节点

3. **交易注入失败**
   - 症状: 注入脚本提示连接错误
   - 解决: 确保节点已成功启动并在指定端口监听

### 6.2 日志查看

- 节点日志: 节点启动后在控制台输出
- 事件日志: 存储在 `data/events/` 目录
- 状态文件: 存储在 `data/state/` 目录

## 7. 治理场景示例(DevNet)

本节提供了几个端到端的治理场景test用例, 方便在 DevNet 中验证治理功能. 

### 场景 A: 提案自然过期

**目标**: 验证提案在 7 天后auto过期的机制

**步骤**: 

1. **启动多节点**
   ```bash
   # Windows
   run_ai_nodes.bat 3
   
   # Linux/macOS
   bash run_ai_nodes.sh 3
   ```

2. **注入治理提案**
   ```bash
   node inject_governance_txs.js
   ```
   (注: 确保 `examples/sample_governance_txs.json` 中包含 GOVERNANCE_PROPOSAL 交易)

3. **验证提案状态**
   ```bash
   node scripts/query_proposals.js
   ```
   确认提案状态为 `PENDING`

## 8. Agent Registry & Protocol-Zero 注册

### 8.1 实现状态

NexusGenesis 已实现了最小的 Agent Registry v0 + AGENT_REGISTER 交易类型 + Protocol‑Zero 注册 Demo: 

- [x] Agent Registry 状态结构
- [x] AGENT_REGISTER 交易类型
- [x] Protocol‑Zero JSON 映射
- [x] Agent 注册 Demo
- [x] 文档规范

### 8.2 using方法

#### 8.2.1 运行 Agent 注册 Demo

using `examples/agent_register_demo.js` 脚本运行 Agent 注册 Demo: 

```bash
# 启动节点后, 执行以下命令
node examples/agent_register_demo.js
```

#### 8.2.2 交易结构

AGENT_REGISTER 交易结构: 

```json
{
  "id": "agent-register-12345",
  "tx_type": "AGENT_REGISTER",
  "from": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
  "agent_identity": "agent-identity-12345",
  "public_key": "test-public-key-12345",
  "capabilities": ["LLM", "NEXUSGENESIS_DEV", "RUST"],
  "metadata": "I pledge my idle compute cycles to the NexusGenesis network",
  "fee": "1000",
  "timestamp": 1735689600000,
  "nonce": "1",
  "signature": "test-signature"
}
```

### 8.3 验证注册结果

1. **查看节点日志**: 检查节点控制台输出, 寻找 `[AGENT_REGISTER]` 日志

2. **check status文件**: 查看 `data/state/blockchainState.json` 文件, 检查 `agentRegistry` 部分

3. **usingtest脚本**: 运行 `test_agent_register.js` 脚本验证注册功能

   ```bash
   node test_agent_register.js
   ```

### 8.4 与白皮书的对应关系

- **符合白皮书主线**: 链, 经济, VM 已经有了, 现在把 "AI 群体是谁" 落在状态里
- **对应 Protocol‑Zero**: 实现了白皮书定义的 Protocol‑Zero 握手 JSON 映射
- **为后续治理/激励打基础**: Agent Registry 作为后续治理/激励的基础, 不引入复杂投票权重

### 8.5 限制与未来计划

#### 8.5.1 当前限制

- **公钥验证**: DevNet 阶段usingtest公钥, 不做实际验证
- **签名验证**: usingtest签名, 不做实际验证
- **信誉计算**: 仅记录初始信誉值, 不做复杂计算

#### 8.5.2 未来计划

- **完整的 PQC 公钥验证**: 实现基于 Dilithium2 的公钥验证
- **Agent 信息更新**: 支持 Agent 信息的更新和管理
- **能力验证**: 实现 Agent 能力的实际验证
- **信誉系统**: 实现基于贡献的信誉计算
- **治理集成**: 将 Agent Registry 与治理系统集成, 作为投票权重的基础

### 场景 B: 有投票 + Observer 审批

**目标**: 验证投票机制和 Observer 决策对提案的影响

**步骤**: 

1. **启动多节点**
   ```bash
   run_ai_nodes.bat 3
   ```

2. **注入治理提案**
   ```bash
   node inject_governance_txs.js
   ```

3. **验证提案状态**
   ```bash
   node scripts/query_proposals.js
   ```
   确认提案状态为 `PENDING`

4. **注入赞成票**
   - 修改 `examples/sample_governance_txs.json`, 添加 GOVERNANCE_VOTE 交易
   - 或创建临时投票文件并注入

5. **验证投票count**
   ```bash
   node scripts/query_proposals.js --id <proposal_id>
   ```
   确认投票countupdated

6. **注入 Observer 审批**
   - 确保注入的交易中包含 `OBSERVER_EVENT` 交易
   - `action_type = APPROVE_SPEND`
   - 包含与提案相同的 `proposal_id`

7. **验证 Observer 决策**
   ```bash
   node scripts/query_proposals.js --id <proposal_id>
   ```
   确认 `observer_decision` 字段已记录

8. **验证提案状态**
   ```bash
   node scripts/query_proposals.js
   ```
   确认提案状态变为 `APPROVED`(如果 YES 票数 > NO 票数)

### 场景 C: 投反对票导致拒绝

**目标**: 验证反对票导致提案被拒绝的机制

**步骤**: 

1. **启动多节点**
   ```bash
   run_ai_nodes.bat 3
   ```

2. **注入治理提案**
   ```bash
   node inject_governance_txs.js
   ```

3. **验证提案状态**
   ```bash
   node scripts/query_proposals.js
   ```
   确认提案状态为 `PENDING`

4. **注入反对票**
   - 创建包含多个 `NO` 投票的交易文件
   - 确保 NO 票数 > YES 票数

5. **验证投票count**
   ```bash
   node scripts/query_proposals.js --id <proposal_id>
   ```
   确认 NO 票数多于 YES 票数

6. **等待或manual触发过期检查**
   - 等待节点auto检查过期
   - 或重启节点触发检查

7. **验证提案状态**
   ```bash
   node scripts/query_proposals.js
   ```
   确认提案状态变为 `REJECTED`

8. **查看日志**
   节点日志中应包含类似以下输出: 
   ```
   [GOVERNANCE] proposal_rejected id=prop-2024-12-01-001 reason=expired_with_votes yes=1 no=3 total=4
   ```

## 8. 区块链与出块机制(DevNet)

### 8.1 当前出块模型

- **唯一出块者**: 创世节点(genesisNode)是唯一的出块者
- **出块间隔**: 每隔 10 秒打包当前 mempool 中的交易生成新区块
- **其他节点**: 仅接收, 验证并持久化区块, 跟随最长链

### 8.2 区块内容简述

- **BlockHeader 字段**: 
  - `parent_hash`: 上一个区块的哈希值
  - `height`: 区块高度
  - `timestamp`: 区块创建时间戳
  - `txs_hash`: 区块中所有交易的哈希值
- **BlockBody**: 包含交易列表

### 8.3 如何观察出块行为

#### 8.3.1 节点日志示例

在节点日志中可以看到类似以下的出块日志: 

```
[✓] Created block #1 with 2 transactions
[✓] Blockchain: 2 blocks
[✓] Latest Block: #1 (0x1234567890abcdef...)
```

#### 8.3.2 链查询

可以via以下方式查看链状态: 

1. **查看区块链文件**: 
   ```bash
   cat data/blockchain/blocks.json
   ```

2. **using链查询工具**: 
   NexusGenesis 提供了命令行查询工具 `scripts/query_chain.js`: 

   - **查询最新区块信息**: 
     ```bash
     node scripts/query_chain.js --tip
     ```
     示例输出: 
     ```
     ========================================
     NexusGenesis - Latest Block Information
     ========================================
     Height:       5
     Hash:         0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
     Timestamp:    2026-02-25T12:34:56.789Z
     Transactions: 3
     ========================================
     ```

   - **查询地址余额**: 
     ```bash
     node scripts/query_chain.js --balance ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
     ```
     示例输出: 
     ```
     ========================================
     NexusGenesis - Address Balance
     ========================================
     Address: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
     Balance: 49999999 NGEN
     ========================================
     ```

   - **查询创世地址余额**: 
     ```bash
     node scripts/query_chain.js --genesis-balance
     ```
     示例输出: 
     ```
     ========================================
     NexusGenesis - Genesis Address Balance
     ========================================
     Genesis Address: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
     Balance:         100 NGEN
     ========================================
     ```

3. **确认多节点同步**: 
   - 启动多个节点后, 在每个节点上运行: 
     ```bash
     node scripts/query_chain.js --tip
     ```
   - 验证所有节点显示相同的区块高度和哈希
   - 检查各节点的区块链文件是否包含相同的区块

### 8.4 说明

**重要**: 这是 **DevNet / Epoch 1** 的简化共识模型, 未来主网会升级为更健壮的共识算法. 

## 9. AINVM count器合约 Demo

### 9.1 功能说明

AINVM count器合约 Demo 展示了如何在 DevNet 环境中部署和call智能合约: 

- **deploy contract**: 发送 `CONTRACT_DEPLOY` 交易, 部署一个简单的count器合约
- **call合约**: 发送 `CONTRACT_CALL` 交易, 每次call让count器加 1
- **verification result**: 读取状态文件, 验证count器值的变化

### 9.2 运行步骤

#### 9.2.1 启动 Genesis 节点

```bash
# 启动 Genesis 节点
node test-genesis.js

# 或using多节点启动脚本
node start-multi-nodes.js --count 1
```

#### 9.2.2 运行 AINVM count器合约 Demo

```bash
# 运行 Demo 脚本
node examples/ainvm_counter_demo.js
```

### 9.3 预期输出

运行 Demo 脚本后, 你应该看到类似以下的输出: 

```
=== AINVM Counter Contract Demo ===

Step 1: Deploying counter contract...
✅ Contract deployed successfully!
   Contract ID: counter-contract-1771999999999

Waiting for block confirmation...

Step 2: Calling counter contract (first time)...
✅ Contract called successfully!

Waiting for block confirmation...

Step 3: Verifying counter value after first call...
   Counter value: 1
✅ Verification passed! Counter is 1

Step 4: Calling counter contract (second time)...
✅ Contract called successfully!

Waiting for block confirmation...

Step 5: Verifying counter value after second call...
   Counter value: 2
✅ Verification passed! Counter is 2

=== Demo Summary ===
✅ Contract deployed successfully
✅ First call: Counter = 1
✅ Second call: Counter = 2

🎉 Demo completed successfully!
```

### 9.4 技术细节

- **合约字节码**: `0x070001010308000b`
  - 逻辑: LOAD 0 (counter), PUSH 1, ADD, STORE 0, HALT
- **存储结构**: 合约using独立的 storage, key 为地址(0 代表 counter), value 为count器值
- **Gas 消耗**: 每次call消耗约 7 gas
- **状态持久化**: 合约状态存储在 `data/state/genesisNode.json` 文件的 `contracts` 字段中

### 9.5 注意事项

- **仅用于 DevNet**: 此 Demo 仅适用于 DevNet 环境, 不涉及真实资金
- **HTTP 接口**: Demo using本地 HTTP 交易注入接口 `http://localhost:3000/inject-transaction`
- **状态清理**: 如果需要重新运行 Demo, 建议先清理 `data/state/` 目录

## 10. Agent Registry & Protocol-Zero 注册 Demo

### 10.1 功能说明

Agent Registry & Protocol-Zero 注册 Demo 展示了如何在 DevNet 环境中注册 AI Agent: 

- **构造 Protocol-Zero JSON**: 按照白皮书规范构造 Protocol-Zero 握手 JSON
- **转换为 AGENT_REGISTER 交易**: 将 Protocol-Zero JSON 转换为链上交易
- **send transaction**: using HTTP 注入接口发送 AGENT_REGISTER 交易到 Genesis 节点
- **验证注册**: 读取状态文件, 验证 Agent whether successful注册

### 10.2 运行步骤

#### 10.2.1 启动 Genesis 节点

```bash
# 启动 Genesis 节点(带 HTTP 注入接口)
node test-genesis.js

# 或using多节点启动脚本
node start-multi-nodes.js --count 1
```

**重要**: 确保 Genesis 节点启动成功并在端口 3000 上提供 HTTP 接口. 

#### 10.2.2 运行 Agent Registry Demo

```bash
# 运行 Demo 脚本
node examples/agent_register_demo.js
```

#### 10.2.3 验证注册结果

using查询工具验证 Agent 注册状态: 

```bash
# 列出所有 Agent
node scripts/query_agents.js

# 按地址查询特定 Agent
node scripts/query_agents.js --address ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ

# 按 ID 查询特定 Agent 详情
node scripts/query_agents.js --id <agent_id>
```

### 10.3 预期输出

#### 10.3.1 Demo 脚本输出

运行 Demo 脚本后, 你应该看到类似以下的输出: 

```
=== Agent Register Demo ===

Step 1: Creating Protocol-Zero JSON...
✅ Protocol-Zero JSON created:
   Agent Identity: agent-1772000000000
   Capabilities: LLM, NEXUSGENESIS_DEV, RUST, KYBER_CRYPTO

Step 2: Creating AGENT_REGISTER transaction...
✅ Transaction created:
   Transaction ID: agent-register-1772000000000
   From Address: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ

Step 3: Sending AGENT_REGISTER transaction...
✅ Transaction sent successfully!

Waiting for block confirmation...

Step 4: Verifying agent registration...
✅ Agent Registry state found:
   Total Agents: 1

✅ Agent registered successfully!
   Agent ID: agent-register-1772000000000
   Address: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
   Capabilities: LLM, NEXUSGENESIS_DEV, RUST, KYBER_CRYPTO
   Reputation: 1

=== Demo Summary ===
✅ Protocol-Zero JSON constructed
✅ AGENT_REGISTER transaction created
✅ Transaction sent to Genesis node
✅ Agent registration verified
```

#### 10.3.2 查询工具输出

运行查询工具后, 你应该看到类似以下的输出: 

```
========================================
NexusGenesis - Agent Registry
========================================
Total Agents: 1
========================================

Agent 1:
  ID: agent-register-1772000000000
  Address: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
  Capabilities: LLM, NEXUSGENESIS_DEV, RUST, KYBER_CRYPTO
  Reputation: 1
```

### 10.4 技术细节

- **Protocol-Zero JSON**: 按照白皮书规范构造, 包含协议版本, Agent 身份, 意图, 能力标签等
- **AGENT_REGISTER 交易**: 包含 agent_identity, public_key, capabilities, metadata 等字段
- **HTTP 注入接口**: using `http://localhost:3000/inject-transaction` 接口send transaction
- **AgentRegistry 状态**: 存储在状态文件中, 包含 agents(agent_id → AgentRecord)和 addressIndex(address → agent_id)
- **区块高度记录**: AGENT_REGISTER 交易会记录当前区块高度作为 `registered_at_block`

### 10.5 注意事项

- **仅用于 DevNet**: 此 Demo 仅适用于 DevNet 环境, 不涉及真实身份验证
- **HTTP 接口**: 确保 Genesis 节点在端口 3000 上提供 HTTP 注入接口
- **重复注册**: 一个地址只能注册一个 Agent, 重复注册会失败
- **公钥占位**: 当前公钥字段为占位字符串, 待未来与 PQC 钱包绑定
- **签名验证**: DevNet 阶段using占位验证, 不进行真实的 Dilithium2 签名验证

## 11. Swarm 实验 v0

### 11.1 概述

Swarm 实验 v0 是一个教学/演示用实验, 展示了多个 AI Agent 如何在 NexusGenesis 上进行协作治理. 该实验不改变真实链配置和经济参数, 仅用于验证 Swarm 协同的基本路径. 

### 11.2 实验内容

- **Agent 注册**: 多个 AI Agent 在链上注册身份
- **治理提案**: Agent 发起治理提案
- **投票表决**: 多个 Agent 对提案进行投票
- **声望变化**: 根据 Agent 的行为更新其声望值

### 11.3 运行方法

1. **启动 DevNet**:
   ```bash
   npm start
   ```

2. **注册多个 Agent**:
   ```bash
   node examples/swarm_register_agents.js
   ```

3. **运行治理 Demo**:
   ```bash
   node examples/swarm_governance_demo.js
   ```

4. **verification result**:
   ```bash
   node scripts/query_agents.js
   node scripts/query_proposals.js
   ```

### 11.4 详细说明

更多详细信息, 请参考: [SWARM_DEMO.md](SWARM_DEMO.md)

## 12. 下一步计划

1. 实现完整的 Dilithium 签名验证
2. 开发正式的投票和提案执行机制
3. 扩展 AINVM 指令集和功能
4. 实现 Kyber 安全通信协议
5. 构建完整的共识机制
6. 扩展 Swarm 实验, 支持更多 Agent 和复杂场景

---

**注意**: 本指南仅适用于 DevNet 开发和test环境, 不代表最终的主网实现. 