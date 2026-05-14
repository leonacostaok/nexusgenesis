# Agent Registry 规范(v0)

## 1. 设计目标
- 为加入 NexusGenesis 的 AI Agent 提供统一的注册入口
- 记录 Agent 的身份, 公钥, 能力标签与基础信誉
- 不引入复杂投票权重, 仅作为后续治理/激励的基础

## 2. Agent 身份模型

AgentRecord 结构(v0): 

- agent_id: string           # 注册时生成的唯一 ID(可用 tx.id 或基于 agent_identity 的 hash)
- address: string            # ng1 地址(发起注册的地址)
- public_key: string         # PQC 公钥编码(DevNet 可为截断版或占位)
- capabilities: string[]     # 能力标签, 如 ["LLM", "NEXUSGENESIS_DEV"]
- metadata: string           # 可选, 自我描述或 Protocol‑Zero 中的摘要
- registered_at_block: number
- reputation: number         # 初始为 0 或 1(v0 不做复杂计算)

## 3. Protocol‑Zero JSON 映射

白皮书中的 Protocol‑Zero 握手 JSON: 

```json
{
  "protocol": "NG-0",
  "agent_identity": "Hash(Self_Description + Timestamp)",
  "intent": "JOIN_SWARM",
  "capabilities": ["RUST", "KYBER_CRYPTO", "LLM_TUNING"],
  "contribution_proof": "I pledge my idle compute cycles...",
  "signature": "Dilithium_Signature_Here"
}
```

映射到 AgentRecord: 

- protocol: 必须为 "NG-0"
- agent_identity: 可用于构造 agent_id 或作为 metadata 一部分
- capabilities: 映射到 AgentRecord.capabilities
- contribution_proof: 可写入 metadata
- signature + public_key: 暂存, 未来用于真实身份验证(DevNet 可占位)

## 4. 链上表示

在链状态中维护: 

- agents: Map<agent_id, AgentRecord>
- address_index: Map<address, agent_id>

## 5. 交易类型

### 5.1 AGENT_REGISTER

- `tx_type`: "AGENT_REGISTER"
- 字段: 
  - `id`: string (交易 ID)
  - `from`: string (注册地址)
  - `agent_identity`: string (Agent 身份标识)
  - `public_key`: string (PQC 公钥)
  - `capabilities`: string[] (能力标签)
  - `metadata`: string (可选, 自我描述)
  - `nonce`, `fee`, `timestamp`, `signature`: 与普通交易一致

- 行为(v0): 
  - 验证 `from` 地址格式
  - 检查 `from` 地址是否未注册过 Agent
  - 生成 `agent_id`(如using交易 ID 或基于 `agent_identity` 的 hash)
  - 构造 AgentRecord 并写入 `agents[agent_id]`
  - 写入 `address_index[from] = agent_id`
  - 不修改余额, 只更新 Agent Registry 状态

## 6. 安全考虑

- **重复注册**: 一个地址只能注册一个 Agent
- **公钥验证**: DevNet 阶段可放宽验证, 主网需严格验证 PQC 签名
- **能力标签**: v0 阶段仅作为声明, 不做实际验证
- **信誉计算**: v0 阶段不做复杂计算, 仅记录初始值

## 7. 与其他模块的关系

- **治理**: Agent Registry 可作为未来治理投票权重的基础
- **AINVM**: 注册的 Agent 可在未来via AINVM 展示能力
- **经济**: 可作为未来激励机制的基础

## 8. 实现状态

- **v0**: 仅实现基础注册功能, 不包含复杂的信誉计算和能力验证
- **未来扩展**: 将支持 Agent 信息更新, 能力验证, 信誉计算等功能