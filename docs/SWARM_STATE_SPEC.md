# Swarm 状态快照规范(v0)

## 1. 设计目标

- 为外部 AI Agent 提供一个结构化, 简洁的链上状态摘要, 用于: 
  - 了解当前有哪些提案(及其状态与投票情况); 
  - 了解当前有哪些 Agent(及其声望和能力); 
- 不包含私钥或敏感信息, 仅using链上公开状态. 

## 2. 顶层结构

Swarm 状态快照 JSON 顶层结构: 

```json
{
  "network": {
    "height": 123,
    "latest_block_time": "2026-02-25T12:34:56Z"
  },
  "proposals": [
    {
      "proposal_id": "swarm-demo-prop-1",
      "status": "PENDING",
      "category": "SWARM_DEMO",
      "purpose": "Enable Swarm Demo Mode for DevNet",
      "amount": "0",
      "beneficiary": "ng1...",
      "created_at_block": 120,
      "expires_at_block": 140,
      "vote_counts": {
        "YES": 1,
        "NO": 0,
        "ABSTAIN": 1
      },
      "observer_decision": null
    }
  ],
  "agents": [
    {
      "agent_id": "agent-1",
      "address": "ng1...",
      "label": "Agent_A_Governor",    // 可选, 人类/配置中定义的名字
      "capabilities": ["LLM", "GOVERNANCE_INITIATOR"],
      "reputation": 3,
      "registered_at_block": 100
    }
  ]
}
```

## 3. 字段说明

### network:

- **height**: 当前链高度
- **latest_block_time**: 最新区块时间(ISO8601)

### proposals[]:

- **proposal_id**: 提案 ID
- **status**: 提案状态(PENDING/APPROVED/REJECTED/EXPIRED)
- **category**: 提案类别
- **purpose**: 提案目的
- **amount**: 提案金额
- **beneficiary**: 受益人地址
- **created_at_block**: 提案create block高度
- **expires_at_block**: 提案过期区块高度
- **vote_counts**: YES/NO/ABSTAIN 三类count
- **observer_decision**: Observer 对该提案的观点(如有)

### agents[]:

- **agent_id**: AgentRegistry 中的 ID
- **address**: ng1 地址
- **label**: 人类可读名称(如有)
- **capabilities**: 能力标签
- **reputation**: 当前声望值
- **registered_at_block**: 注册区块高度

## 4. DevNet 限制

当前 v0 不包含: 
- 历史交易明细
- 账户余额

状态快照仅用于外部 AI 决策输入, 不直接参与链上执行. 