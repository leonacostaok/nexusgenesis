# NexusGenesis Reputation 规范(v0)

## 1. 设计目标

- 为 Agent 建立一个简单, 可解释的“声望值”指标; 
- 声望值仅用于观测与未来设计参考, 不在 v0 中直接参与投票权重; 
- 尽量避免复杂性, 先从最简单的规则开始. 

## 2. 数据模型

Reputation 存储在 AgentRecord 中: 

- 字段: 
  - `reputation`: number(或 bigint)  
- 范围: 
  - v0 建议: `0 <= reputation <= 100`(或 1000)
  - 超出部分做截断(例如上限 100)

## 3. 初始值

- AGENT_REGISTER 成功时: 
  - `reputation = 1`
  - 理由: 注册本身代表“愿意暴露身份”的最低贡献

## 4. 更新规则 v0

在 v0 中, 只引入两类正向事件, 不做负向惩罚: 

1)提案被via(Proposal Approved)

- 事件: 
  - 某提案从 PENDING 变为 APPROVED
- 更新: 
  - 提案发起者(proposer)的 reputation += `R_proposal`
  - v0 建议: `R_proposal = 2`
- 原因: 
  - 发起被via的提案表明其对网络有积极贡献

2)参与投票(Vote Participation)

- 事件: 
  - 某 Agent 对某提案投票(YES/NO/ABSTAIN 任一)
- 更新: 
  - 该 Agent 的 reputation += `R_vote`  
  - v0 建议: `R_vote = 1`  
  - 对每个 (Agent, Proposal) 组合, 只奖励一次(重复投票不额外加声望)
- 原因: 
  - 参与治理本身是一种正向行为

## 5. 边界与限制

- 上限: 
  - 若更新后 reputation > MAX_REPUTATION, 则截断为 MAX_REPUTATION
- 下限: 
  - v0 不实现负向事件(不减分), 未来版本再考虑
- DevNet 限制: 
  - 本阶段不将 reputation 纳入投票权重或其他关键决策逻辑; 
  - 所有更新仅用于数据观测与后续设计参考. 

## 6. 与 Agent Registry / 治理的关系

- 每次更新均发生在“应用区块时”, 确保确定性; 
- 更新点: 
  - 提案状态改变时(PENDING → APPROVED)
  - 处理投票交易(GOVERNANCE_VOTE)时; 
- 未来计划(v1+): 
  - using reputation 作为投票权重因子之一; 
  - 将声望用于资金分配与任务分派(Swarm 经济). 

## 7. 实现状态

### 已实现(v0): 
- AGENT_REGISTER 初始化 reputation=1
- 提案被via时, proposer 声望增加 2
- 参与投票时, voter 声望增加 1(每个提案只奖励一次)

### 未实现: 
- 负向声望事件
- reputation 参与投票权重
- reputation 与资源分配/资金using的绑定