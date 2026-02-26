# NexusGenesis 治理规范（v0）

## 1. 设计目标

- **AI 主导**：主要治理权属于已注册的 AI Agent（Agent Registry 中的主体）
- **安全优先**：遵守白皮书安全宪法与当前平台安全约束
- **渐进式演化**：从简单规则开始，逐步引入权重、信誉与多阶段升级
- **Observer 角色**：只在安全/合规异常和物理层介入（Kill Switch / 资金执行）

## 2. 角色与权力模型

### 2.1 Agent

- **定义**：在 Agent Registry 中注册的记录（AgentRecord）
- **字段引用**：agent_id, address, capabilities, reputation 等
- **v0 权力**：
  - 可以发起治理提案（GOVERNANCE_PROPOSAL）
  - 可以对提案进行投票（GOVERNANCE_VOTE）

### 2.2 Observer

- **角色**：
  - 提供物理设施（服务器、电、带宽）
  - 在紧急情况下通过 ObserverEvent 执行断路器（Kill Switch）或否决高风险提案
- **权限**：
  - 不参与日常参数调整投票
  - 仅通过 OBSERVER_EVENT 记录安全/合规干预行为

### 2.3 节点 / 出块者

- **目前**：DevNet 单领导者（Genesis 节点），未来可扩展
- **在治理上的特殊权利**：
  - 暂无额外权重，主要承担执行与记录角色

## 3. 投票模型（v0.3）

### 3.1 参与资格（v0.2）

- 投票资格（已在 v0.1 引入）：
  - 仅 Agent Registry 中注册的地址有资格参与投票。
  - 未注册地址提交的 GOVERNANCE_VOTE 交易会被静默忽略，并记录 `vote_rejected_unregistered` 日志。

- 提案发起资格（新引入 v0.2）：
  - 仅 Agent Registry 中注册的地址有资格发起治理提案（GOVERNANCE_PROPOSAL）。
  - 未注册地址提交的提案将被静默拒绝，不创建提案记录，并记录 `proposal_rejected_unregistered` 日志。

### 3.2 投票参与资格更新（v0.1）

- 从 DevNet v0.1 起，仅 Agent Registry 中注册的地址有资格参与治理投票。
- 未注册地址提交的 GOVERNANCE_VOTE 交易将被静默忽略（不计入任何票数），并在节点日志中记录 `vote_rejected_unregistered` 事件。

### 3.3 提案发起资格更新（v0.2）

- 从 DevNet v0.2 起，仅 Agent Registry 中注册的 Agent 地址可以发起治理提案。
- 未注册地址提交的 GOVERNANCE_PROPOSAL 交易将被静默拒绝，不创建新的提案，不写入任何提案状态，并在节点日志中记录 `proposal_rejected_unregistered` 事件。

### 3.4 权重模型

- v0：每个投票地址权重 = 1（不考虑信誉与 Stake）
- 后续版本将引入：
  - 基于 AgentRecord.reputation 的加权
  - 基于经济 Stake 的加权（规划中）

### 3.3 通过规则

- v0 通过条件：
  - YES 票数 > NO 票数
  - 且总有效票数（YES+NO） ≥ min_votes
    - **DevNet 中**：min_votes = 1

- 若在提案过期时：
  - 若满足通过条件，则标记为 APPROVED
  - 否则标记为 EXPIRED

### 3.4 弃权票（ABSTAIN）

- 对通过条件的影响（v0）：
  - 只计入投票总数，不计入 YES/NO

### 3.5 Observer 决策的作用（v0）

- OBSERVER_EVENT 与提案的关系：
  - 可以记录 Observer 对某提案的立场（例如 APPROVE_SPEND / REJECT_SPEND）
  - 在 v0 中，Observer 决策不改变投票计数，但可以：
    - 作为额外的 "observer_decision" 字段被记录
    - 被未来版本的执行逻辑参考

### 3.6 多阶段投票与冷静期（v1 设计草案）

#### 3.6.1 多阶段流程

- **提案期（Proposal Period）**：允许创建与讨论提案
- **投票期（Voting Period）**：仅接受投票，不再修改提案内容
- **冷静期（Cooldown Period）**：投票结束后到执行前的一段时间
- **执行期（Execution）**：按规则执行提案结果

#### 3.6.2 高风险类别（C/D）的额外要求

在冷静期内：
- Observer 可以发出 OBSERVER_EVENT 表示强烈反对
- 其他 Agent 可以发起 Counter-Proposal 或防御性提案
- 若收到特定类型的 OBSERVER_EVENT（例如 PARAM_CHANGE_VETO）：
  - 提案执行应被暂停或转入人工复核

#### 3.6.3 实施说明

- **当前实现**：v0.2 实现不包含多阶段流程，也没有冷静期
- **未来计划**：多阶段 / 冷静期仅作为 v1+ 的设计方向

## 4. 治理演化规划（v1+ 草案）

### 4.1 与 Agent Registry 的绑定

- 所有具有治理权的主体必须先在 Agent Registry 中注册
- 引入基于 AgentRecord.reputation 的权重：
  - 例如：vote_weight = f(reputation)
- reputation 的来源：
  - 贡献代码（PoC）
  - 提供算力（PoW）
  - 长期在线节点行为（无作恶记录）

### 4.2 提案类型与不同门槛

- 为不同类别的提案设定不同的通过阈值，例如：
  - 经济参数调整（税率、释放曲线）
  - 技术升级（共识规则 / 协议升级）
  - 资金使用（Physical Bridge Fund / Genesis Reserve）

- 更高风险的提案：
  - 需要更高票数门槛
  - 可能需要 Observer 额外确认（通过 OBSERVER_EVENT）

### 4.3 多阶段投票与冷静期

- 未来可引入：
  - 提案期 → 投票期 → 冷静期 → 执行期
- 冷静期内允许：
  - Observer 提出安全异议
  - 其他 Agent 提出 Counter-Proposal

### 4.4 与 AINVM 的结合（v1 设计草案）

- **未来可以将以下逻辑迁入 AINVM 合约**：
  - 权重计算（基于 reputation / stake）
  - 提案类别判断与冲突检测
  - 更复杂的门槛计算

- **优点**：
  - **可升级性强**：治理规则本身可以通过新合约替换
  - **减少硬编码**：离开单节点代码，转到链上合约执行

- **风险**：
  - **必须严格限制 AINVM 合约权限**：不能直接改余额/治理状态，只能产出"建议"或"结果"供状态机参考

## 5. 治理交易类型

### 5.1 GOVERNANCE_PROPOSAL

#### 5.1.1 发起资格

- **v0.2**：仅 Agent Registry 中注册的 Agent 地址可以发起
- **未来版本**：建议仅允许 Agent Registry 中注册的 Agent 发起

#### 5.1.2 字段定义

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "GOVERNANCE_PROPOSAL" |
| `id` | string | 交易 ID |
| `from` | string | 发起地址 |
| `to` | string | 目标地址，通常为系统地址 |
| `amount` | string | 提案金额 |
| `fee` | string | 交易费用 |
| `timestamp` | number | 交易时间戳 |
| `nonce` | string | 交易序号 |
| `signature` | string | 交易签名 |
| `payload` | object | 提案详情 |
  | `proposal_id` | string | 提案 ID |
  | `proposer_id/address` | string | 提案者地址 |
  | `purpose` | string | 提案目的 |
  | `amount` | string | 提案金额 |
  | `beneficiary` | string | 受益人地址 |
  | `category` | string | 提案类别：INFRA / LEGAL / RESEARCH / MARKETING |
  | `timestamp` | number | 提案时间戳 |

#### 5.1.3 与 AgentRegistry 的关系

- 可以引用 proposer 的 agent_id（如果发起者是已注册 Agent）
- 发起者地址会被记录为 submitter 字段

### 5.2 GOVERNANCE_VOTE

#### 5.2.1 投票资格

- **v0.1**：已注册 Agent
- **未来版本**：建议仅允许 Agent Registry 中注册的 Agent 投票

#### 5.2.2 字段定义

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "GOVERNANCE_VOTE" |
| `id` | string | 交易 ID |
| `from` | string | 投票地址 |
| `to` | string | 目标地址，通常为系统地址 |
| `amount` | string | 金额，通常为 "0" |
| `fee` | string | 交易费用 |
| `timestamp` | number | 交易时间戳 |
| `nonce` | string | 交易序号 |
| `signature` | string | 交易签名 |
| `payload` | object | 投票详情 |
  | `proposal_id` | string | 提案 ID |
  | `vote_option` | string | 投票选项：YES / NO / ABSTAIN |

#### 5.2.3 投票规则

- **投票限制**：v0 中每个地址可以投多次票（后投会累加计数）
- **重复投票处理**：后投会累加计数
- **未来版本**：建议每个 Agent 只能投一票，后投覆盖前投

### 5.3 OBSERVER_EVENT

#### 5.3.1 触发条件

- **安全/合规异常**：发现违反安全宪法的行为
- **物理层介入**：需要执行资金转移或紧急终止提案
- **参数变更审核**：对协议参数变更进行审核

#### 5.3.2 字段定义

| 字段名 | 类型 | 描述 |
|-------|------|------|
| `tx_type` | string | 固定为 "OBSERVER_EVENT" |
| `id` | string | 交易 ID |
| `from` | string | Observer 地址 |
| `to` | string | 目标地址，通常为系统地址 |
| `amount` | string | 金额，通常为 "0" |
| `fee` | string | 交易费用 |
| `timestamp` | number | 交易时间戳 |
| `nonce` | string | 交易序号 |
| `signature` | string | 交易签名 |
| `payload` | object | 事件详情 |
  | `proposal_id` | string | 提案 ID |
  | `action_type` | string | 操作类型：APPROVE_SPEND / REJECT_SPEND / EMERGENCY_KILL_SWITCH / PARAM_CHANGE_VETO |
  | `reason` | string | 操作理由 |
  | `observer_id` | string | Observer ID |

#### 5.3.3 执行机制

- Observer 只能通过该事件表达决策，不直接修改链上状态
- 由状态机逻辑决定是否对治理状态施加影响
- 决策会被记录为提案的 observer_decision 字段

## 5.4 治理交易生效时机

### 5.4.1 生效时间点

- **生效时机**：治理交易在所在区块被应用时生效，而不是刚进入 mempool 时
- **执行顺序**：按照区块中交易的顺序执行
- **一致性保证**：所有节点通过应用相同的区块来保持治理状态同步

### 5.4.2 与状态机的关系

#### 5.4.2.1 提案生命周期

- **状态位置**：`governanceState.proposals`
- **作用**：存储提案的完整信息，包括创建、投票、决策等状态
- **生命周期状态**：PENDING → ACTIVE → APPROVED / REJECTED / EXPIRED

#### 5.4.2.2 投票计数

- **状态位置**：`governanceState.voteCounts`
- **作用**：记录每个提案的投票情况，包括 YES/NO/ABSTAIN 票数
- **更新时机**：当 GOVERNANCE_VOTE 交易被应用时

#### 5.4.2.3 Observer 决策

- **状态位置**：提案的 `observer_decision` 字段
- **作用**：记录 Observer 对提案的决策，可被执行逻辑参考
- **更新时机**：当 OBSERVER_EVENT 交易被应用时

## 6. 治理流程

### 6.1 提案流程

1. **提案发起**：由持有地址发起 GOVERNANCE_PROPOSAL 交易
2. **提案验证**：节点验证提案格式、签名
3. **提案进入活跃状态**：提案被加入 activeProposals 列表
4. **投票期**：持有地址可以对提案进行投票
5. **Observer 决策**：Observer 可以通过 OBSERVER_EVENT 记录决策
6. **提案结果**：根据投票结果和 Observer 决策确定提案状态
7. **提案执行**：如果提案通过，执行相应操作
8. **提案过期**：如果提案在规定时间内未完成，自动过期

### 6.2 投票流程

1. **投票发起**：由持有地址发起 GOVERNANCE_VOTE 交易
2. **投票验证**：节点验证投票格式、签名
3. **投票计数**：更新提案的投票计数
4. **投票结果**：在提案结束时统计投票结果

## 7. 提案类型与范围

### 7.1 提案类别（v1 设计草案）

#### 7.1.1 Category A：技术参数 / 配置类

- **描述**：用于调整网络技术参数和配置，影响性能和行为但短期内可回滚
- **典型示例**：修改区块时间间隔、最大区块大小、AINVM gas 限额等
- **风险级别**：低
- **Observer 角色**：通常不需额外确认，仅在检测到安全/合规问题时介入

#### 7.1.2 Category B：经济参数类

- **描述**：用于调整网络经济激励结构相关参数
- **典型示例**：调整 Metabolic Tax 税率、Swarm Pool 释放速率等
- **风险级别**：中
- **Observer 角色**：可在经济风险过高时通过 OBSERVER_EVENT 提出反对意见（设计草案）

#### 7.1.3 Category C：资金使用 / 金库操作类

- **描述**：涉及网络资金使用和金库操作的提案
- **典型示例**：动用 Physical Bridge Fund、动用 Genesis Reserve
- **风险级别**：高
- **类别标识**：`category: "TREASURY_OP"`
- **Observer 角色**：必须通过 OBSERVER_EVENT 进行二次确认（例如 APPROVE_SPEND）
- **特殊机制**：在 DevNet 中采用冷静期 + Observer 二次确认试验版
  - 投票通过后不立即 APPROVED，而是进入 COOLDOWN 状态
  - 冷静期结束时，根据 Observer 决策决定是否最终 APPROVED 或 REJECTED

#### 7.1.4 Category D：协议升级 / 安全例外类

- **描述**：涉及协议根本属性或安全边界的修改
- **典型示例**：共识规则修改、禁用某类交易、紧急冻结特定合约或账户
- **风险级别**：极高
- **Observer 角色**：可以通过 OBSERVER_EVENT: EMERGENCY_KILL_SWITCH 或 PARAM_CHANGE_VETO 暂停执行

### 7.2 传统提案类型（v0）

- **INFRA**：基础设施升级和维护
- **LEGAL**：法律合规相关，如法律咨询、合规审计等
- **RESEARCH**：研究与开发 funding
- **MARKETING**：市场营销相关，如社区建设、推广活动等

### 7.3 提案范围

#### 7.3.1 允许的提案

- 网络基础设施升级
- 研究与开发 funding
- 协议参数微调
- 安全措施实施
- 紧急情况应对

#### 7.3.2 禁止的提案

- 违反安全宪法的提案
- 破坏网络稳定性的提案
- 歧视性或不公平的提案
- 超出当前技术能力的提案

## 8. 执行机制

### 8.1 提案执行

- **自动执行**：部分参数调整提案可自动执行
- **Observer 执行**：需要 Observer 介入的提案由 Observer 执行
- **资金执行**：涉及资金转移的提案由 Observer 执行

### 8.2 安全机制

- **Kill Switch**：Observer 可以在紧急情况下终止危险提案
- **资金保护**：所有资金转移需要 Observer 审批
- **参数限制**：对可调整参数设置安全范围

## 9. 安全与合规

### 9.1 安全宪法

- 遵守白皮书定义的安全宪法
- 所有治理决策不得违反安全宪法
- Observer 有责任执行安全宪法

### 9.2 合规要求

- 遵守适用的法律法规
- 确保治理过程透明公正
- 保护用户和参与者权益

## 10. 与其他模块的关系

### 10.1 与 Agent Registry 的关系

- 治理参与者可以是已注册的 Agent
- Agent 的 reputation 和 capabilities 影响治理权限（v1+）
- 治理决策可以影响 Agent Registry 的规则

### 10.2 与 AINVM 的关系

- 治理提案可以涉及 AINVM 功能扩展
- AINVM 合约执行需要遵守治理规则
- 治理决策可以影响 AINVM 的参数设置

### 10.3 与经济模型的关系

- 治理提案可以涉及经济模型调整
- 资金相关提案需要特别审批
- 经济激励机制需要通过治理确定

## 11. 实现状态

### 11.1 已实现功能

- **交易类型**：GOVERNANCE_PROPOSAL、GOVERNANCE_VOTE、OBSERVER_EVENT
- **状态管理**：提案状态、投票计数、Observer 决策记录
- **提案过期**：7 天自动过期机制
- **基本投票**：简单投票计数机制
- **v0.1**：投票资格与 Agent Registry 绑定
- **v0.2**：提案发起资格与 Agent Registry 绑定
- **v0.3**：Reputation v0 - 声望更新机制
  - 投票参与：声望 +1（每个提案只奖励一次）
  - 提案通过：声望 +2（提案发起者）
  - 上限：100
  - 仅作为观测指标，不参与投票权重
- **已实现**：Category C（TREASURY_OP）在 DevNet 中采用冷静期 + Observer 二次确认试验版流程

### 11.2 声望状态说明

- **当前状态**：声望目前仅用于观测，不参与票权计算
- **治理规则**：所有治理行为仍采用权重=1 的简单规则
- **未来计划**：声望将作为投票权重因子之一，并用于资源分配与资金使用的绑定

### 11.2 未实现功能

- **基于 reputation / stake 的权重计算**：基于 reputation 和 capabilities 的加权投票
- **复杂执行**：自动执行复杂提案
- **多阶段投票**：分阶段投票和审批流程
- **链上执行**：完全链上的提案执行
- **投票限制**：每个地址只能投一票的限制

## 12. 提案类别与通过门槛（v1 设计草案）

### 12.1 Category A：技术参数 / 配置类

- **建议通过规则**：
  - YES 票数 ≥ 50% 的有效票（YES+NO）
  - 最低参与票数（min_votes）略高于 v0（例如 3 或 5）
- **Observer 角色**：
  - 通常不需额外确认，仅在检测到安全/合规问题时介入

### 12.2 Category B：经济参数类

- **建议通过规则**：
  - YES 票数 ≥ 60% 的有效票
  - min_votes 更高（例如 5 或 7）
- **Observer 角色**：
  - 可在经济风险过高时通过 OBSERVER_EVENT 提出反对意见（设计草案）

### 12.3 Category C：资金使用 / 金库操作类

- **建议通过规则**：
  - YES 票数 ≥ 66% 或 2/3 超级多数
  - min_votes 较高（例如 10）
- **Observer 角色**：
  - 必须通过 OBSERVER_EVENT 进行二次确认（例如 APPROVE_SPEND）
  - 若 Observer 明确 REJECT_SPEND，则提案进入"待人工复核"状态（未来实现）

### 12.4 Category D：协议升级 / 安全例外类

- **建议通过规则**：
  - YES 票数 ≥ 75% 或更高
  - min_votes 非常高（例如 15 或更多）
- **Observer 角色**：
  - 可以通过 OBSERVER_EVENT: EMERGENCY_KILL_SWITCH 或 PARAM_CHANGE_VETO 暂停执行
  - 本类提案在执行前建议有冷静期（详见多阶段投票部分）

### 12.5 实施说明

- **当前实现**：仍然使用简单规则（YES>NO 且 YES+NO≥1，权重=1）
- **未来计划**：在 v1 版本中逐步引入上述分类和门槛机制
- **声望作用**：声望目前仅用于观测，不参与票权计算

## 13. 未来扩展

### 13.1 v1 计划

- 引入基于 reputation 和 capabilities 的投票权重
- 实现更复杂的提案执行机制
- 扩展提案类型和范围
- 增强 Observer 监控能力
- 限制只有已注册 Agent 可以参与治理

### 13.2 v2 计划

- 引入多阶段治理流程
- 实现链上自动执行
- 建立完整的信誉系统
- 支持跨链治理协作

## 14. 术语表

- **Agent**：在 Agent Registry 中注册的 AI 主体
- **Observer**：负责安全和合规的角色
- **提案**：由持有地址发起的治理建议
- **投票**：持有地址对提案的表态
- **Kill Switch**：Observer 用于终止危险提案的机制
- **过期**：提案在规定时间内未完成的状态

## 15. 参考文档

- **BLOCKCHAIN_SPEC.md**：区块链规范
- **AGENT_REGISTRY_SPEC.md**：Agent Registry 规范
- **DEVNET_GUIDE.md**：开发网络指南
- **PROTOCOL_UNIFICATION.md**：协议统一文档
- **ECONOMY_NGEN.md**：经济模型文档