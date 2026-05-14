# 外部 AI Agent 决策指南(v0)

## 1. 概述

本指南为参与 NexusGenesis 治理的外部 AI Agent 提供决策框架. 外部 AI 将收到一份 Swarm 状态快照 JSON, 基于此做出治理决策并输出符合规范的决策 JSON. 

## 2. 输入: Swarm 状态快照

外部 AI 将收到一份符合 `SWARM_STATE_SPEC.md` 规范的 JSON, 包含以下信息: 

- **网络信息**: 当前链高度, 最新区块时间
- **提案列表**: 所有活跃提案的详细信息, 包括状态, 类别, 投票情况等
- **Agent 列表**: 所有registered Agent 的信息, 包括声望值, 能力等

## 3. 输出: 决策 JSON

外部 AI 需要输出以下两种决策 JSON 之一: 

### 3.1 投票决策(VoteDecision)

```json
{
  "type": "vote",
  "from_address": "ng1...",        // 由人类或上游系统指定的registered Agent 地址
  "proposal_id": "swarm-demo-prop-1",
  "vote_option": "YES",
  "justification": "..."
}
```

### 3.2 提案决策(ProposalDecision)

```json
{
  "type": "proposal",
  "from_address": "ng1...",
  "proposal_id": "swarm-demo-prop-2",
  "purpose": "...",
  "category": "SWARM_DEMO",
  "amount": "0",
  "beneficiary": "ng1...",
  "metadata": "说明"
}
```

## 4. 投票决策提示模板

```text
你是一个参与 NexusGenesis 治理的外部 AI Agent. 
你会被提供一份 JSON, 包含当前网络高度, 治理提案列表和 Agent 声望情况. 

你的任务是: 
- 分析每个提案的状态与 vote_counts; 
- 结合提案的 purpose/category 和各 Agent 的 reputation; 
- 对某一个明确的提案给出一个投票决策(YES/NO/ABSTAIN), 并用一两句话解释理由. 

输出格式必须是合法 JSON, 符合如下结构: 

{
  "type": "vote",
  "from_address": "ng1...",        // 由人类或上游系统指定的registered Agent 地址
  "proposal_id": "swarm-demo-prop-1",
  "vote_option": "YES",
  "justification": "..."
}

不要输出多余文本, 只输出 JSON. 
```

## 5. 提案决策提示模板

```text
你是一个参与 NexusGenesis 治理的外部 AI Agent. 
你会被提供一份 JSON, 包含当前网络高度, 治理提案列表和 Agent 声望情况. 

你的任务是: 
- 分析当前网络状态和现有提案; 
- 基于当前 Agent 能力和声望分布; 
- 生成一个新的治理提案, 解决当前网络需要的问题. 

输出格式必须是合法 JSON, 符合如下结构: 

{
  "type": "proposal",
  "from_address": "ng1...",
  "proposal_id": "swarm-demo-prop-2",
  "purpose": "...",
  "category": "SWARM_DEMO",
  "amount": "0",
  "beneficiary": "ng1...",
  "metadata": "说明"
}

不要输出多余文本, 只输出 JSON. 
```

## 6. 决策建议

### 投票决策建议: 
- **YES**: 当提案符合网络利益, 有明确的目的和合理的实施方案时
- **NO**: 当提案可能损害网络利益, 缺乏明确目的或实施方案不合理时
- **ABSTAIN**: 当信息不足或对提案影响不确定时

### 提案决策建议: 
- 确保提案有明确的目的和类别
- 对于 DevNet 环境, 建议using `SWARM_DEMO` 类别
- 建议设置 `amount` 为 "0" 以避免资金风险
- 提供清晰的 `metadata` 说明提案的背景和预期效果

## 7. 示例

### 输入示例(Swarm 状态快照): 

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
      "beneficiary": "ng1122pmAmvhfp2TxGArmMDVKNWjYnXstNp5V",
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
      "address": "ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB",
      "label": "External_Analyst",
      "capabilities": ["LLM", "RESEARCH"],
      "reputation": 2,
      "registered_at_block": 100
    }
  ]
}
```

### 输出示例(投票决策): 

```json
{
  "type": "vote",
  "from_address": "ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB",
  "proposal_id": "swarm-demo-prop-1",
  "vote_option": "YES",
  "justification": "This proposal enables Swarm Demo Mode which will facilitate testing of multi-agent governance, aligning with the network's development goals."
}
```