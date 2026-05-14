# NexusGenesis 协议事件规范(v0.1)

## 1. 总览
- 本规范定义了 NexusGenesis 网络中的治理和观察者事件的协议消息类型
- 适用范围: Observer Event 和 AI 提案的 JSON 结构和字段定义
- 设计目标: 标准化协议消息, 为未来链上实现做准备

## 2. Observer Event 协议

### 2.1 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["event_id", "timestamp", "action_type", "reason", "observer_id"],
  "properties": {
    "event_id": {
      "type": "string",
      "format": "uuid",
      "description": "事件唯一标识符"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "事件发生时间"
    },
    "action_type": {
      "type": "string",
      "enum": ["APPROVE_SPEND", "REJECT_SPEND", "EMERGENCY_KILL_SWITCH", "PARAM_CHANGE_VETO"],
      "description": "操作类型"
    },
    "proposal_id": {
      "type": "string",
      "format": "uuid",
      "description": "关联提案 ID"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "操作理由"
    },
    "observer_id": {
      "type": "string",
      "pattern": "^ng[0-9a-zA-Z]{34}$",
      "description": "observer address"
    },
    "tx_hash": {
      "type": "string",
      "pattern": "^[0-9a-fA-F]{64}$",
      "description": "关联交易哈希"
    },
    "signature": {
      "type": "string",
      "description": "观察者签名"
    }
  }
}
```

### 2.2 字段说明

| 字段名 | 类型 | 必须 | 描述 |
|-------|------|------|------|
| `event_id` | string (UUID) | 是 | 事件唯一标识符, 用于去重和追踪 |
| `timestamp` | string (ISO8601) | 是 | 事件发生的时间戳 |
| `action_type` | string (枚举) | 是 | 操作类型, 定义观察者的具体行为 |
| `proposal_id` | string (UUID) | 否 | 关联的 AI 提案 ID, 如适用 |
| `reason` | string | 是 | 执行操作的详细理由, 最多 500 字符 |
| `observer_id` | string (地址) | 是 | 执行操作的observer address |
| `tx_hash` | string | 否 | 关联的链上交易哈希, 格式为 64 字符的十六进制字符串(仅包含 0-9 和 a-f) |
| `signature` | string | 否 | 观察者对事件的签名, using Dilithium2 算法, 以 base64 编码表示 |

### 2.3 action_type 枚举值

| 枚举值 | 描述 |
|-------|------|
| `APPROVE_SPEND` | 批准资金支出提案 |
| `REJECT_SPEND` | 拒绝资金支出提案 |
| `EMERGENCY_KILL_SWITCH` | 触发紧急停止机制, 用于应对严重安全威胁 |
| `PARAM_CHANGE_VETO` | 否决参数变更提案, 防止有害的系统参数修改 |

## 3. AI 提案协议

### 3.1 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["proposal_id", "timestamp", "proposer_id", "purpose", "amount", "beneficiary", "justification"],
  "properties": {
    "proposal_id": {
      "type": "string",
      "format": "uuid",
      "description": "提案唯一标识符"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "提案创建时间"
    },
    "proposer_id": {
      "type": "string",
      "pattern": "^ng[0-9a-zA-Z]{34}$",
      "description": "提案发起者地址"
    },
    "purpose": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "提案目的"
    },
    "amount": {
      "type": "string",
      "pattern": "^\\d+(\\d{1,18})?$",
      "description": "请求金额(NGEN)"
    },
    "beneficiary": {
      "type": "string",
      "pattern": "^ng[0-9a-zA-Z]{34}$",
      "description": "受益方地址"
    },
    "justification": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000,
      "description": "提案理由和必要性说明"
    },
    "expected_benefit": {
      "type": "string",
      "maxLength": 500,
      "description": "预期收益"
    },
    "duration": {
      "type": "string",
      "description": "项目持续时间"
    },
    "risk_assessment": {
      "type": "string",
      "maxLength": 500,
      "description": "风险评估"
    },
    "category": {
      "type": "string",
      "enum": ["INFRA", "LEGAL", "RESEARCH", "MARKETING"],
      "description": "提案类别"
    }
  }
}
```

### 3.2 字段说明

| 字段名 | 类型 | 必须 | 描述 |
|-------|------|------|------|
| `proposal_id` | string (UUID) | 是 | 提案唯一标识符 |
| `timestamp` | string (ISO8601) | 是 | 提案创建的时间戳 |
| `proposer_id` | string (地址) | 是 | 提案发起者的地址 |
| `purpose` | string | 是 | 提案的简要目的, 最多 200 字符 |
| `amount` | string | 是 | 请求的 NGEN 金额, 支持小数 |
| `beneficiary` | string (地址) | 是 | 资金的受益方地址 |
| `justification` | string | 是 | 提案的详细理由, 最多 1000 字符 |
| `expected_benefit` | string | 否 | 预期的收益和影响, 最多 500 字符 |
| `duration` | string | 否 | 项目的预计持续时间 |
| `risk_assessment` | string | 否 | 潜在风险和缓解措施, 最多 500 字符 |
| `category` | string (枚举) | 否 | 提案的类别 |

### 3.3 category 枚举值

| 枚举值 | 描述 |
|-------|------|
| `INFRA` | 基础设施相关, 如服务器, 带宽等 |
| `LEGAL` | 法律合规相关, 如法律咨询, 合规审计等 |
| `RESEARCH` | 研究开发相关, 如技术研究, 原型开发等 |
| `MARKETING` | 市场营销相关, 如社区建设, 推广活动等 |

## 4. 未来链上映射(设计草案)

### 4.1 Observer Event 链上映射

#### 映射方案
- **交易类型**: 作为一种特殊交易类型 `OBSERVER_EVENT`
- **字段映射**: 
  - 上链字段: `event_id`, `timestamp`, `action_type`, `observer_id`, `proposal_id`, `tx_hash`, `signature`
  - 链下保留: `reason`(详细理由可能过长, 仅保留链下日志)
- **event_id 与 tx_hash 关系**: 
  - `event_id` 作为交易的唯一标识符
  - `tx_hash` 由链上交易生成, 与 `event_id` 一一对应
- **验证机制**: 
  - 观察者签名 `signature` 必须via验证
  - 只有授权的observer address才能发起 `OBSERVER_EVENT` 交易

### 4.2 AI 提案链上映射

#### 映射方案
- **交易类型**: 作为一种特殊交易类型 `GOVERNANCE_PROPOSAL`
- **主键设计**: 
  - using `proposal_id` + `proposer_id` + `timestamp` 作为复合主键
  - `proposal_id` 作为交易的唯一标识符
- **字段映射**: 
  - 上链字段: `proposal_id`, `timestamp`, `proposer_id`, `purpose`, `amount`, `beneficiary`, `category`
  - 链下存储: `justification`, `expected_benefit`, `duration`, `risk_assessment`(详细内容存储在链下存储系统)
- **与治理模块绑定**: 
  - 提案上链后, auto触发治理投票流程
  - 投票交易via `proposal_id` 关联到具体提案
  - 投票结果via另一种特殊交易类型 `VOTE_RESULT` 记录

## 5. 交易字段说明

### 5.1 通用交易字段

| 字段名 | 类型 | 必须 | 描述 |
|-------|------|------|------|
| `tx_type` | string | 是 | 交易类型, 如 `OBSERVER_EVENT` 或 `GOVERNANCE_PROPOSAL` |
| `from` | string (地址) | 是 | 交易发起者地址(签名者) |
| `to` | string (地址) | 是 | 交易接收者地址, 对于治理交易, 通常指向治理模块/金库的代表地址 |
| `amount` | string | 是 | 交易金额, 以最小计量单位为整数, using字符串表示, 暂不支持小数点 |
| `fee` | string | 是 | 交易费用, 以最小计量单位为整数, using字符串表示, 暂不支持小数点 |
| `timestamp` | string (ISO8601) | 是 | 交易时间戳, 校验时以此为准 |
| `nonce` | string | 是 | 交易随机数, 用于防止重放攻击 |
| `payload` | object | 是 | 交易负载, 包含具体的事件或提案数据 |
| `signature` | string | 是 | 交易签名, using Dilithium2 算法, 以 base64 编码表示 |

### 5.2 字段语义说明

- **from**: 交易发起者, 必须与签名者一致
- **to**: 逻辑上的接收方, 对于治理交易, 建议using Genesis 地址作为治理模块/金库的代表地址
- **timestamp**: 交易的时间戳, payload 内的 timestamp 应与交易级别的 timestamp 保持一致, 校验时以交易级别的 timestamp 为准
- **amount/fee**: using字符串表示, 以最小计量单位为整数, 暂不支持小数点
- **signature**: using Dilithium2 算法生成的签名, 以 base64 编码表示

## 6. 协议版本控制

- **版本号**: v0.1
- **兼容性**: 未来版本将保持向后兼容
- **升级机制**: via治理投票决定协议升级

## 7. 安全考虑

- **签名验证**: 所有 Observer Event 必须经过签名验证
- **权限控制**: 只有授权的观察者才能发起 Observer Event
- **anti-replay**: using `event_id` 和 `timestamp` 防止重放攻击
- **数据完整性**: 链上交易必须包含足够的字段以确保数据完整性

## 8. 实现建议

- **链下存储**: 对于较长的文本字段, 建议using IPFS 等分布式存储系统
- **索引服务**: 实现专门的索引服务, 方便查询和检索历史事件和提案
- **监控系统**: 建立 Observer Event 监控系统, 及时响应紧急事件