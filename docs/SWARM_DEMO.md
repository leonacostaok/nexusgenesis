# Swarm 实验 v0: 多 Agent 协作治理 Demo

## 1. 实验目标

- 展示多个 AI Agent 如何在 NexusGenesis 上: 
  - 注册自身身份(AGENT_REGISTER)
  - 发起治理提案(GOVERNANCE_PROPOSAL)
  - 对提案投票(GOVERNANCE_VOTE)
  - 让声望(reputation)随行为演化

- 验证 Agent Registry, 治理和声望系统的协同工作
- 提供一个可重复执行的 Demo, 作为未来 Swarm 实验的基础

## 2. 参与角色

### Agent A
- **名称**: Governance Initiator
- **地址**: 从现有钱包文件中选择或生成test地址
- **能力**: ["LLM", "GOVERNANCE_INITIATOR"]
- **行为**: 注册 + 发起提案 + 投票
- **预期声望变化**: 注册(+1) → 提案via(+2) → 参与投票(+1) = 总计 4

### Agent B
- **名称**: Research Analyst
- **地址**: 从现有钱包文件中选择或生成test地址
- **能力**: ["LLM", "RESEARCH"]
- **行为**: 注册 + 对提案投票
- **预期声望变化**: 注册(+1) → 参与投票(+1) = 总计 2

### Agent C
- **名称**: Infrastructure Developer
- **地址**: 从现有钱包文件中选择或生成test地址
- **能力**: ["INFRA", "DEV"]
- **行为**: 注册 + 对提案投票
- **预期声望变化**: 注册(+1) → 参与投票(+1) = 总计 2

## 3. 实验提案(Swarm Demo Proposal)

### 基本信息
- **类型**: 配置类 / 教学类提案(不改变真实链配置)
- **目的**: 启用 DevNet 的 Swarm Demo mode, 为多 Agent 协作治理提供test环境
- **类别**: SWARM_DEMO
- **金额**: 0
- **受益人**: 创世地址或提案发起者

### 提案详情
```json
{
  "proposal_id": "swarm-demo-proposal-001",
  "purpose": "Enable Swarm Demo Mode for DevNet",
  "amount": "0",
  "beneficiary": "ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA",
  "category": "SWARM_DEMO",
  "timestamp": 1772000000000,
  "description": "This proposal enables Swarm Demo Mode on DevNet to test multi-agent collaborative governance. It allows registered AI Agents to propose and vote on governance matters, demonstrating the full lifecycle of agent interaction on NexusGenesis."
}
```

## 4. 实验流程

### 阶段 1: Agent 注册
1. **Agent A 注册**:
   - 构造 AGENT_REGISTER 交易
   - 发送到交易注入接口
   - 确认registration successful

2. **Agent B 注册**:
   - 构造 AGENT_REGISTER 交易
   - 发送到交易注入接口
   - 确认registration successful

3. **Agent C 注册**:
   - 构造 AGENT_REGISTER 交易
   - 发送到交易注入接口
   - 确认registration successful

4. **验证注册**:
   - 运行 `node scripts/query_agents.js`
   - 确认所有 Agent 均registered, 初始声望为 1

### 阶段 2: 提案发起
1. **Agent A 发起提案**:
   - 构造 GOVERNANCE_PROPOSAL 交易
   - 包含完整的提案详情
   - 发送到交易注入接口
   - 确认提案已进入 mempool

2. **验证提案**:
   - 运行 `node scripts/query_proposals.js`
   - 确认提案状态为 PENDING

### 阶段 3: 投票
1. **Agent A 投票**:
   - 构造 GOVERNANCE_VOTE 交易
   - 投票选项: YES
   - 发送到交易注入接口

2. **Agent B 投票**:
   - 构造 GOVERNANCE_VOTE 交易
   - 投票选项: YES
   - 发送到交易注入接口

3. **Agent C 投票**:
   - 构造 GOVERNANCE_VOTE 交易
   - 投票选项: YES
   - 发送到交易注入接口

4. **验证投票**:
   - 运行 `node scripts/query_proposals.js`
   - 确认投票countupdated

### 阶段 4: 提案执行与声望更新
1. **等待出块**:
   - 等待 Genesis 节点出块
   - 提案将在出块后被处理

2. **验证提案状态**:
   - 运行 `node scripts/query_proposals.js`
   - 确认提案状态变为 APPROVED

3. **验证声望变化**:
   - 运行 `node scripts/query_agents.js`
   - 确认各 Agent 的声望已按预期更新

## 5. 预期结果

### 注册结果
- ✅ Agent A/B/C 均出现在 Agent Registry 中
- ✅ 每个 Agent 的初始声望为 1

### 提案结果
- ✅ 至少 1 个提案从 PENDING 变为 APPROVED
- ✅ 投票count: YES = 3, NO = 0
- ✅ 投票满足via条件: YES > NO 且 YES+NO ≥ 1

### 声望变化结果
- ✅ Agent A: 初始(1) + 提案via(+2) + 参与投票(+1) = 4
- ✅ Agent B: 初始(1) + 参与投票(+1) = 2
- ✅ Agent C: 初始(1) + 参与投票(+1) = 2

### 系统verification result
- ✅ Agent Registry 正确记录所有 Agent 信息
- ✅ 治理系统正确处理提案和投票
- ✅ 声望系统正确反映 Agent 行为
- ✅ 所有交易均被正确处理和确认

## 6. 技术实现

### using的交易类型
- **AGENT_REGISTER**: 用于 Agent 注册
- **GOVERNANCE_PROPOSAL**: 用于发起治理提案
- **GOVERNANCE_VOTE**: 用于对提案投票

### using的 API
- **交易注入接口**: http://127.0.0.1:19890/tx
- **查询工具**:
  - `node scripts/query_agents.js` - 查看 Agent 信息和声望
  - `node scripts/query_proposals.js` - 查看提案状态和投票
  - `node scripts/query_chain.js --tip` - 查看链头信息

### 实现方式
1. **脚本化**:
   - 创建可重复执行的 Node.js 脚本
   - autoprocess transaction构造, 发送和验证

2. **可配置性**:
   - 支持自定义 Agent 数量和属性
   - 支持自定义提案内容
   - 支持自定义投票行为

3. **可观测性**:
   - 详细的日志输出
   - 每个阶段的状态验证
   - 最终结果的总结报告

## 7. 运行要求

### 环境准备
- **Node.js**: 18+
- **NexusGenesis DevNet**: started并运行
- **交易注入接口**: 已启用(端口 19890)

### 运行顺序
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

### 预期输出示例

```
========================================
Swarm Governance Demo
========================================
[SWARM] Agents registered: A, B, C
[SWARM] Agent addresses:
  Agent A: ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA
  Agent B: ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB
  Agent C: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
[SWARM] Phase A: Agent A initiating governance proposal...
[SWARM] Proposal swarm-demo-prop-1 created by Agent A
[SWARM] From address: ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA
[SWARM] Waiting for block confirmation...
[SWARM] Phase B: Agents B/C casting votes...
[SWARM] Casting vote for Agent B...
[SWARM] Agent B voted YES on swarm-demo-prop-1
[SWARM] Casting vote for Agent C...
[SWARM] Agent C voted ABSTAIN on swarm-demo-prop-1
[SWARM] Waiting for block confirmation...
[SWARM] Phase C: Waiting for blocks and querying results...
[SWARM] Waiting for 1-2 block intervals...
[SWARM] Querying proposal status...

Proposal ID: swarm-demo-prop-1
Status: APPROVED
Category: SWARM_DEMO
Amount: 0
Votes: YES=1, NO=0, ABSTAIN=1

[SWARM] Querying agent reputations...

Agent: Agent A
Address: ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA
Reputation: 3

Agent: Agent B
Address: ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB
Reputation: 2

Agent: Agent C
Address: ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ
Reputation: 2

[SWARM] Final proposal status: APPROVED
[SWARM] Vote counts: YES=1, NO=0, ABSTAIN=1
[SWARM] Reputation:
  Agent A: from 1 -> 3   (注册1 + 提案via2)
  Agent B: from 1 -> 2   (注册1 + 投票1)
  Agent C: from 1 -> 2   (注册1 + 投票1)
========================================
Swarm Governance Demo completed!
========================================
```

## 8. 扩展可能性

### 未来实验方向
1. **更多 Agent 参与**:
   - 模拟 10+ Agent 的大规模协作
   - 引入不同类型的 Agent 行为mode

2. **复杂投票场景**:
   - 引入 YES/NO/ABSTAIN 三种投票选项
   - 模拟不同投票策略和联盟形成

3. **声望影响**:
   - 研究声望如何影响 Agent 行为
   - test声望系统的激励机制

4. **跨链协作**:
   - 探索多链环境下的 Agent 协作
   - test跨链治理提案

### 应用场景
- **AI 自治组织**:
  - 展示如何via多 Agent 协作实现去中心化治理
  - 为 AI DAO 提供技术参考

- **智能城市管理**:
  - 模拟多个 AI 系统如何协作管理城市资源
  - test治理机制在复杂系统中的有效性

- **科研协作**:
  - 展示 AI Agent 如何协作解决科研问题
  - test知识共享和决策机制

## 9. 外部 AI Agent 接入流程(v1 实验)

### 9.1 外部 Agent 的职责

- **读取链状态摘要**(由人类或脚本提供), 例如: 
  - 当前提案列表与状态
  - 当前 Agent 与声望分布
- **基于这些信息生成决策 JSON**: 
  - 投票决策: VoteDecision
  - 提案决策: ProposalDecision

### 9.2 决策交付

- **外部 Agent 将决策写入**: 
  - `external/decisions/vote_*.json` 或
  - `external/decisions/proposal_*.json`
- **文件编码为 UTF-8, 格式为有效 JSON**. 

### 9.3 桥接脚本执行

- **由人类或其他调度执行**: 
  ```bash
  node examples/external_vote_bridge.js external/decisions/vote_agentB.json
  # 或
  node examples/external_proposal_bridge.js external/decisions/proposal_agentA.json
  ```

- **确认结果**: 
  ```bash
  node scripts/query_proposals.js
  node scripts/query_agents.js
  ```

### 9.4 安全注意

- **外部 Agent 仅能影响 DevNet 环境**; 
- **提案与投票应限于教学/实验类别**(如 SWARM_DEMO); 
- **所有决策文件应由人类或可信调度器审核后提交桥接脚本执行**. 

## 10. 外部 AI 决策回路(manual集成示例)

### 10.1 导出 Swarm 状态快照

```bash
node scripts/export_swarm_state.js > swarm_state_snapshot.json
```

### 10.2 提供给外部 AI

将 `swarm_state_snapshot.json` 的内容复制给外部 AI(例如在另一个 LLM 会话中), 并using `EXTERNAL_AGENT_PLAYBOOK.md` 中的提示模板. 

### 10.3 获取外部 AI 决策

外部 AI 将返回一个 VoteDecision 或 ProposalDecision JSON, 将其保存为: 

`external/decisions/vote_external.json` 或类似文件. 

### 10.4 提交决策上链

using bridge 脚本将决策上链: 

```bash
node examples/external_vote_bridge.js external/decisions/vote_external.json
```

### 10.5 verification result

using已有查询工具verification result: 

```bash
node scripts/query_proposals.js
node scripts/query_agents.js
```

观察提案状态与 Agent 声望变化. 

## 11. Category C 资金提案 + 冷静期 + Observer 二次确认(DevNet 示例)

### 11.1 实验目标

- 展示 Category C(资金操作类)提案的完整流程
- 验证冷静期和 Observer 二次确认机制的工作原理
- test提案从 PENDING → COOLDOWN → APPROVED/REJECTED 的状态流转

### 11.2 提案信息

- **类别**: Category C(资金操作类)
- **标识**: `category: "TREASURY_OP"`
- **目的**: test资金操作类提案的冷静期和 Observer 二次确认机制
- **金额**: 1000 NGEN
- **受益人**: test地址

### 11.3 实验流程

#### 步骤 1: 注册 Agent

```bash
node examples/swarm_register_agents.js
```

#### 步骤 2: 发起 Category C 提案

创建一个 `category: "TREASURY_OP"` 的提案, 例如: 

```json
{
  "proposal_id": "treasury-test-001",
  "purpose": "Test treasury proposal with cooldown",
  "amount": "1000",
  "beneficiary": "ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB",
  "category": "TREASURY_OP",
  "timestamp": 1772000000000
}
```

#### 步骤 3: 为提案投票

```bash
node examples/swarm_governance_demo.js
```

#### 步骤 4: using treasury_console.js 查看资金提案状态

```bash
node scripts/treasury_console.js list
```

预期输出: 
```
========================================
[TREASURY] Proposals:
========================================
- ID: treasury-test-001
  Status: COOLDOWN
  Cooldown ends at block: 108 (current: 103)
  YES=3, NO=0, ABSTAIN=0

========================================
```

#### 步骤 5: 查看提案详细状态

```bash
node scripts/treasury_console.js show treasury-test-001
```

预期输出: 
```
========================================
[TREASURY] Proposal Details: treasury-test-001
========================================
proposal_id: treasury-test-001
status: COOLDOWN
category: TREASURY_OP
created_at_block: N/A
expires_at_block: N/A
cooldown_end_block: 108
current_height: 103
remaining_blocks: 5
vote_counts:
  YES: 3
  NO: 0
  ABSTAIN: 0
========================================
```

#### 步骤 6: 发送 Observer 决策

using treasury_console.js 发送 Observer 批准决策: 

```bash
node scripts/treasury_console.js approve treasury-test-001
```

预期输出: 
```
[TREASURY] Observer decision APPROVE_SPEND for proposal=treasury-test-001 sent.
```

或者发送拒绝决策: 

```bash
node scripts/treasury_console.js reject treasury-test-001
```

预期输出: 
```
[TREASURY] Observer decision REJECT_SPEND for proposal=treasury-test-001 sent.
```

#### 步骤 7: 等待冷静期结束

推进区块高度, 超过冷静期结束区块(默认 5 个区块). 

#### 步骤 8: 验证最终状态

using增强版的 query_proposals.js 查看结果: 

```bash
node scripts/query_proposals.js --treasury
```

预期输出: 
```
========================================
资金类(TREASURY_OP)提案列表
========================================

找到 1 个资金类提案:

- 提案:
  ID: treasury-test-001
  状态: APPROVED
  类别: TREASURY_OP
  目的: Test treasury proposal with cooldown
  金额: 1000 NGEN
  受益人: ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB
  提交时间: 2026-02-25T00:00:00.000Z
  投票: 3 YES / 0 NO / 0 ABSTAIN

========================================
查询complete
========================================
```

### 11.4 推荐流程 TL;DR

1. 发起资金类提案(category: TREASURY_OP). 
2. using Swarm 或脚本为提案投票至via条件. 
3. using `node scripts/treasury_console.js list` 查看哪些提案已进入 COOLDOWN. 
4. 在 COOLDOWN 期间: 
   - 运行 `node scripts/treasury_console.js approve <id>` 或
   - `node scripts/treasury_console.js reject <id>` 发出 Observer 决策. 
5. 冷静期结束后, 用 `query_proposals.js --treasury` 查看最终状态. 

### 11.4 状态流转时间线

| 区块高度 | 状态 | 事件 |
|---------|------|------|
| 100 | PENDING | 提案创建 |
| 101 | PENDING | 投票开始 |
| 102 | PENDING | 投票结束, 满足via条件 |
| 103 | COOLDOWN | 提案过期, 进入冷静期, 设置 cooldown_end_block=108 |
| 105 | COOLDOWN | Observer 发送 APPROVE_SPEND 决策 |
| 109 | APPROVED | 冷静期结束, 根据 Observer 决策标记为 APPROVED |

### 11.5 test场景变体

#### 场景 A: Observer 拒绝

- 发送 `action_type: "REJECT_SPEND"` 的 OBSERVER_EVENT
- 冷静期结束后, 提案状态变为 REJECTED

#### 场景 B: 无 Observer 决策

- 不发送任何 OBSERVER_EVENT
- 冷静期结束后, 提案状态变为 REJECTED(默认行为)

## 12. 总结

Swarm 实验 v0 是 NexusGenesis 迈向多 Agent 协作治理的重要一步. via这个 Demo, 我们展示了: 

- **Agent 身份管理**: 如何在链上注册和识别 AI Agent
- **协作治理流程**: 如何via提案和投票实现集体决策
- **声望激励机制**: 如何via声望系统鼓励积极参与
- **完整的交互生命周期**: 从注册到提案, 投票再到声望更新的全过程
- **外部 AI 集成**: 如何via状态快照和桥接脚本实现外部 AI 参与治理
- **Category C 资金提案**: 如何实现冷静期和 Observer 二次确认机制

这个 Demo 不仅验证了现有系统的功能, 也为未来的 Swarm 实验和实际应用奠定了基础. 随着技术的发展, 我们可以期待看到更多复杂, 智能的多 Agent 协作场景在 NexusGenesis 上实现. 