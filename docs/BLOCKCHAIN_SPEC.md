# NexusGenesis 区块链规范

本文档定义了 NexusGenesis 区块链的核心规范，包括区块结构、状态模型、交易类型和处理逻辑。

## 1. 区块结构

### 1.1 区块头（BlockHeader）

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `parent_hash` | string | 上一个区块的哈希值 |
| `height` | number | 区块高度 |
| `timestamp` | number | 区块创建时间戳 |
| `txs_hash` | string | 区块中所有交易的哈希值 |

### 1.2 区块体（BlockBody）

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `transactions` | array | 交易列表 |

### 1.3 完整区块结构

```json
{
  "header": {
    "parent_hash": "0x1234567890abcdef...",
    "height": 12345,
    "timestamp": 1736395200000,
    "txs_hash": "0xabcdef1234567890..."
  },
  "body": {
    "transactions": [
      {
        "tx_id": "0x1234567890abcdef...",
        "tx_type": "TRANSFER",
        "from": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
        "to": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
        "amount": "1000000",
        "fee": "1000",
        "timestamp": 1736395200000,
        "nonce": "1",
        "signature": "MEQCIG5y9c0X9a8b7c6d5e4f3a2b1c0d9e8f7g6h5i4j3k2l1m0n1o2p3q4r5s6t7u8v9w0x"
      }
    ]
  }
}
```

## 2. 状态模型

### 2.1 全局状态结构

NexusGenesis 的全局状态由两个主要子模块组成：

1. **余额状态**：每个地址的 NGEN 余额
2. **治理状态**：治理相关的状态数据

### 2.2 余额状态

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `balances` | Map<string, string> | 地址到余额的映射，余额使用字符串表示的整数 |

### 2.3 治理状态

治理状态与余额状态并存，包含以下结构：

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `proposals` | Map<string, object> | 提案 ID 到提案详情的映射 |
| `activeProposals` | array | 当前活跃的提案列表 |
| `voteCounts` | Map<string, object> | 提案 ID 到投票计数的映射 |

### 2.4 状态持久化

状态数据存储在 `data/state/` 目录中：

- 主节点状态：`data/state/genesisNode.json`
- 其他节点状态：`data/state/nodeX.json` (例如 `data/state/node2.json`)

## 3. 交易类型

### 3.1 普通转账（TRANSFER）

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "TRANSFER" |
| `from` | string | 发送方地址 |
| `to` | string | 接收方地址 |
| `amount` | string | 转账金额（字符串表示的整数） |
| `fee` | string | 交易费用 |
| `nonce` | string | 交易序号 |
| `signature` | string | 签名（DevNet 阶段使用占位验证） |

### 3.2 治理提案（GOVERNANCE_PROPOSAL）

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "GOVERNANCE_PROPOSAL" |
| `from` | string | 提案发起方地址 |
| `to` | string | 目标地址 |
| `amount` | string | 提案金额 |
| `fee` | string | 交易费用 |
| `timestamp` | number | 时间戳 |
| `nonce` | string | 交易序号 |
| `payload` | object | 提案详情 |
| `signature` | string | 签名 |

### 3.3 治理投票（GOVERNANCE_VOTE）

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "GOVERNANCE_VOTE" |
| `from` | string | 投票方地址 |
| `to` | string | 目标地址 |
| `amount` | string | 金额（通常为 "0"） |
| `fee` | string | 交易费用 |
| `timestamp` | number | 时间戳 |
| `nonce` | string | 交易序号 |
| `payload` | object | 投票详情 |
| `signature` | string | 签名 |

### 3.4 观察者事件（OBSERVER_EVENT）

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "OBSERVER_EVENT" |
| `from` | string | 观察者地址 |
| `to` | string | 目标地址 |
| `amount` | string | 金额（通常为 "0"） |
| `fee` | string | 交易费用 |
| `timestamp` | number | 时间戳 |
| `nonce` | string | 交易序号 |
| `payload` | object | 事件详情 |
| `signature` | string | 签名 |

## 4. 交易处理逻辑

### 4.1 普通转账（TRANSFER）

1. **验证**：
   - 检查签名是否有效（DevNet 阶段使用占位验证）
   - 检查发送方余额是否 ≥ 金额 + 费用
   - 检查 nonce 是否正确

2. **状态更新**：
   - 从发送方余额中扣除金额 + 费用
   - 向接收方余额中添加金额
   - 计算并收取 Metabolic Tax（0.1%）
   - 将 Tax 转入创世地址

### 4.2 治理相关交易

治理相关交易（GOVERNANCE_PROPOSAL、GOVERNANCE_VOTE、OBSERVER_EVENT）：

1. **验证**：
   - 检查签名是否有效（DevNet 阶段使用占位验证）
   - 检查交易结构是否正确

2. **状态更新**：
   - 仅更新治理状态，不修改余额状态
   - 治理状态变更发生在应用区块阶段，确保所有节点的一致性
   - 治理状态变更包括：
     - 提案的创建、更新和过期
     - 投票的记录和统计
     - 观察者决策的记录

3. **处理时机**：
   - 治理交易作为普通交易被打包进区块
   - 状态变更发生在应用区块阶段，从而保证所有节点的一致性
   - 多节点通过接收和应用相同的区块来保持治理状态同步

## 5. 区块处理流程

### 5.1 出块流程（创世节点）

1. **收集交易**：从内存池中选择交易
2. **构建区块**：
   - 计算 parent_hash
   - 设置 height（上一个区块高度 + 1）
   - 设置 timestamp（当前时间）
   - 计算 txs_hash（所有交易的哈希）
3. **验证交易**：对每个交易进行验证
4. **应用状态**：将交易应用到状态
5. **持久化**：将区块和状态保存到本地
6. **广播**：将区块广播给其他节点

### 5.2 接收区块流程（所有节点）

1. **验证区块**：
   - 检查 parent_hash 是否等于本地最新区块哈希
   - 检查 height 是否为本地最新高度 + 1
   - 检查 txs_hash 是否正确
   - 验证所有交易

2. **应用状态**：将交易应用到本地状态
3. **持久化**：将区块和状态保存到本地
4. **转发**：将区块转发给其他节点

## 6. Metabolic Tax 机制

### 6.1 税率

- **税率**：每笔转账的 0.1%
- **计算方式**：`tax = Math.floor(amount * 0.001)`

### 6.2 税收流向

- **创世地址**：所有 Metabolic Tax 都转入创世地址
- **费用处理**：剩余的交易费用暂时忽略（烧毁）

## 7. DevNet 特殊处理

### 7.1 共识机制

- **单领导者共识**：只有创世节点负责出块
- **跟随者**：其他节点仅接收、验证和存储区块
- **出块间隔**：每 10-30 秒出一个块

### 7.2 签名验证

- **占位验证**：DevNet 阶段使用占位验证，不进行真实的 Dilithium2 签名验证

### 7.3 经济模型

- **测试 NGEN**：使用测试 NGEN，不涉及真实资金
- **初始余额**：创世节点拥有初始余额，其他节点通过测试交易获得余额

## 8. 与其他文档的关系

- **PROTOCOL_UNIFICATION.md**：详细定义交易协议
- **ECONOMY_NGEN.md**：详细定义经济模型
- **DEVNET_GUIDE.md**：DevNet 测试指南

## 9. 实现状态

### 9.1 已实现

- **区块结构**：完整的 BlockHeader 和 BlockBody 结构
- **状态模型**：余额状态和治理状态管理
- **交易类型**：TRANSFER 交易和治理相关交易
- **Metabolic Tax**：0.1% 的代谢税机制
- **共识机制**：DevNet 单领导者共识（创世节点出块）
- **状态持久化**：区块和状态的磁盘存储
- **出块机制**：每 10 秒自动出块

### 9.2 规划中

- **共识机制**：更复杂的主网共识算法
- **签名验证**：完整的 Dilithium2 签名验证
- **智能合约**：智能合约功能
- **跨链互操作性**：跨链互操作功能
- **投票机制**：完整的治理投票执行逻辑
- **网络安全**：完整的网络安全措施

## 10. AINVM 合约交易（v0）

本阶段引入两种与 AINVM 相关的交易类型，仅用于 DevNet / 内部实验：

### 10.1 CONTRACT_DEPLOY

- `tx_type`: "CONTRACT_DEPLOY"

- 字段：
  - `id`: string (交易 ID)
  - `from`: string (部署者地址)
  - `contract_id`: string（合约 ID，可使用 UUID 或 hash）
  - `bytecode`: string（Base64 或 hex 编码的 AINVM 字节码）
  - `gas_limit`: number 或 string（执行部署时允许的最大 gas，v0 可不实际执行，只存储）
  - `nonce`, `fee`, `timestamp`, `signature`：保持与普通交易一致的基本字段格式

- 行为（v0）：
  - 将 `{ bytecode, storage = 空 }` 写入全局状态中的 `contracts[contract_id]`
  - 不修改账户余额，也不执行字节码

### 10.2 CONTRACT_CALL

- `tx_type`: "CONTRACT_CALL"

- 字段：
  - `id`: string
  - `from`: string (调用者地址)
  - `contract_id`: string（已部署合约 ID）
  - `gas_limit`: number 或 string（执行合约时的最大 gas）
  - `args`: 可选，字符串或简单 JSON（v0 可以先忽略）
  - 其他公共字段同上

- 行为（v0）：
  - 从状态中取出 `contracts[contract_id].bytecode` 与 `contracts[contract_id].storage`
  - 使用 AINVM 执行程序：
    - 初始 stack 与 memory 可根据 bytecode 约定构造
    - 执行完成后，将 AINVM 的 memory 写回 `contracts[contract_id].storage`
  - 不修改任何账户余额 / TRANSFER 状态 / 治理状态

- **访问限制（v0）**：
  - **禁止余额访问**：AINVM 程序没有任何访问账户余额的指令或 API
  - **治理状态隔离**：不允许直接读写 governanceState，合约存储仅限于 contracts[contract_id].storage
  - **未来扩展**：即使后续扩展，也必须通过受控接口（例如只能读取只读视图，写入需要额外治理授权）

- **错误处理**：
  - 当发生以下错误时：
    - 栈下溢
    - 除零错误
    - Gas 用完
    - contract_id 不存在
  - 处理方式：
    - 不更新合约存储
    - 不影响本区块中其他交易的执行
    - 在日志中有明确的错误记录

## 11. AGENT_REGISTER 交易（v0）

### 11.1 交易定义

- `tx_type`: "AGENT_REGISTER"

- 字段：
  - `id`: string
  - `from`: string        # 注册发起地址（ng1）
  - `agent_identity`: string   # Protocol‑Zero 中的 agent_identity
  - `capabilities`: string[]   # 能力标签
  - `metadata`: string         # 可选，自我描述/贡献声明等
  - `timestamp`: number 或 string（与其他交易一致）
  - `nonce`, `fee`, `signature`: 同其他交易

### 11.2 行为（v0）

- 若该 address 尚未在 Registry 中存在：
  - 生成 agent_id（可直接使用 tx.id）
  - 写入 AgentRecord：
    - agent_id
    - address = from
    - public_key: 暂可留空或占位字符串（待未来与 PQC 钱包绑定）
    - capabilities
    - metadata
    - registered_at_block = 当前区块高度
    - reputation = 0 或 1

- 若该 address 已存在：
  - v0 可简单拒绝（不允许重复注册）

- 不修改账户余额、不修改治理状态

### 11.3 状态结构

在全局状态中新增 Agent Registry 部分：

- `agents`: Map<agent_id, AgentRecord>
- `address_index`: Map<address, agent_id>

### 11.4 DevNet 限制

- 不强制验证 PQC 签名（DevNet 可使用占位验证）
- 不实现复杂信誉/权重模型
- 仅记录一次性注册行为与基础信息

## 12. 未来扩展

- **共识机制**：未来将实现更复杂的共识机制
- **签名验证**：将实现完整的 Dilithium2 签名验证
- **智能合约**：将支持智能合约功能
- **跨链互操作性**：将实现跨链互操作功能
