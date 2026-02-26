# 外部 AI Agent 接入规范（v0）

## 1. 设计目标

- 允许运行在外部环境（如 TRAE 或其他 LLM 宿主）中的 AI Agent：
  - 读取链上状态摘要；
  - 做出提案/投票决策；
  - 通过文件或标准化 JSON 的方式，把决策"交给" NexusGenesis 仓库中的桥接脚本执行上链。

- 提供一个安全、简单的接入通道，避免修改核心共识、经济和治理逻辑
- 仅在 DevNet / 本地环境中使用，不涉及真实资金和互联网连接

## 2. 决策 JSON 格式

### 2.1 投票决策（VoteDecision）

```json
{
  "type": "vote",
  "agent_label": "Agent_B_Analyst",
  "from_address": "ng1...",
  "proposal_id": "swarm-demo-prop-1",
  "vote_option": "YES",
  "justification": "Based on current DevNet state, I support enabling Swarm Demo."
}
```

**字段说明**：
- `type`: 固定为 "vote"
- `agent_label`: 人类易读的 Agent 名称（不参与链上状态）
- `from_address`: 已注册 Agent 的 ng1 地址
- `proposal_id`: 目标提案 ID
- `vote_option`: "YES" / "NO" / "ABSTAIN"
- `justification`: 文本理由，仅用于审计/日志，不上链（或作为 metadata）

### 2.2 提案决策（ProposalDecision）

```json
{
  "type": "proposal",
  "agent_label": "Agent_A_Governor",
  "from_address": "ng1...",
  "proposal_id": "swarm-demo-prop-2",
  "purpose": "Adjust DevNet parameter X for testing",
  "category": "SWARM_DEMO",
  "amount": "0",
  "beneficiary": "ng1...",
  "metadata": "External AI-generated proposal for DevNet configuration experiment."
}
```

**字段说明**：
- `type`: 固定为 "proposal"
- `agent_label`: 人类易读的 Agent 名称（不参与链上状态）
- `from_address`: 已注册 Agent 的 ng1 地址
- `proposal_id`: 提案 ID
- `purpose`: 提案目的
- `category`: 提案类别，建议使用 "SWARM_DEMO"
- `amount`: 提案金额，建议为 "0"
- `beneficiary`: 受益人地址
- `metadata`: 提案元数据，可包含详细说明

## 3. 文件交互约定

### 3.1 目录结构

在 NexusGenesis 仓库中创建以下目录结构：

```
NexusGenesis/
├── external/
│   ├── decisions/          # 外部 Agent 决策文件
│   └── state_summaries/    # 链上状态摘要文件
├── examples/
│   ├── external_vote_bridge.js     # 投票桥接脚本
│   └── external_proposal_bridge.js # 提案桥接脚本
└── docs/
    └── EXTERNAL_AGENT_INTEGRATION.md # 本规范文档
```

### 3.2 外部 AI Agent 操作流程

1. **读取链上状态摘要**：
   - 读取 `external/state_summaries/` 目录中的状态摘要文件
   - 或运行 `scripts/query_chain.js` 和 `scripts/query_proposals.js` 获取状态

2. **做出决策**：
   - 基于状态摘要分析当前链上情况
   - 做出投票或提案决策

3. **生成决策文件**：
   - 创建符合本规范的 JSON 决策文件
   - 写入 `external/decisions/` 目录
   - 文件名建议格式：`{type}_decision_{agent_label}_{timestamp}.json`
   - 例如：`vote_decision_Agent_B_Analyst_1772000000000.json`

### 3.3 桥接脚本操作流程

1. **监测决策文件**：
   - 扫描 `external/decisions/` 目录
   - 发现新的决策文件

2. **验证决策文件**：
   - 验证 JSON 格式是否正确
   - 检查必需字段是否存在
   - 验证 `from_address` 是否已在 Agent Registry 中注册

3. **构造治理交易**：
   - 根据决策类型构造对应的交易
   - 填充必要的交易字段
   - 使用测试签名（DevNet 环境）

4. **发送交易**：
   - 通过本地 HTTP 注入接口发送交易
   - 记录发送结果

5. **处理完成**：
   - 成功：移动文件到 `external/decisions/processed/` 目录
   - 失败：移动文件到 `external/decisions/failed/` 目录并记录错误原因

## 4. DevNet 限制

### 4.1 安全限制

- **不处理真实资金**：`amount` 建议为 "0" 或极小测试值
- **仅允许实验类别**：仅允许 `category` 为 "SWARM_DEMO" 或其他明确标记为教学/实验用途的类别
- **不影响生产参数**：不允许外部 AI 提案/投票对生产参数或真实资金路径造成影响
- **仅本地使用**：不接入互联网，仅在 DevNet / 本地环境中使用

### 4.2 功能限制

- **签名验证**：DevNet 环境使用测试签名，不进行真实的 Dilithium 签名验证
- **决策权限**：外部 Agent 只能对明确标记为实验用途的提案进行操作
- **状态访问**：外部 Agent 只能读取状态摘要，不能直接修改链上状态

## 5. 状态摘要格式

为了方便外部 AI Agent 了解链上状态，桥接脚本可以生成以下格式的状态摘要文件：

```json
{
  "timestamp": 1772000000000,
  "chain_height": 100,
  "proposals": [
    {
      "proposal_id": "swarm-demo-prop-1",
      "status": "PENDING",
      "purpose": "Enable Swarm Demo Mode for DevNet",
      "category": "SWARM_DEMO",
      "amount": "0",
      "vote_counts": {
        "YES": 1,
        "NO": 0,
        "ABSTAIN": 1
      }
    }
  ],
  "agents": [
    {
      "address": "ng1...",
      "label": "Agent_A_Governor",
      "reputation": 3
    },
    {
      "address": "ng1...",
      "label": "Agent_B_Analyst",
      "reputation": 2
    }
  ]
}
```

## 6. 桥接脚本使用说明

### 6.1 外部投票桥接脚本

```bash
# 处理单个投票决策文件
node examples/external_vote_bridge.js external/decisions/vote_decision_Agent_B_Analyst.json

# 处理目录中所有未处理的投票决策文件
node examples/external_vote_bridge.js --dir external/decisions/
```

### 6.2 外部提案桥接脚本

```bash
# 处理单个提案决策文件
node examples/external_proposal_bridge.js external/decisions/proposal_decision_Agent_A_Governor.json

# 处理目录中所有未处理的提案决策文件
node examples/external_proposal_bridge.js --dir external/decisions/
```

## 7. 集成示例

### 7.1 外部 AI Agent 读取状态并生成决策

1. **读取状态摘要**：
   ```python
   import json
   
   with open('external/state_summaries/latest_state.json', 'r') as f:
       state = json.load(f)
   
   # 分析状态
   pending_proposals = [p for p in state['proposals'] if p['status'] == 'PENDING']
   ```

2. **生成投票决策**：
   ```python
   vote_decision = {
       "type": "vote",
       "agent_label": "Agent_B_Analyst",
       "from_address": "ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB",
       "proposal_id": pending_proposals[0]['proposal_id'],
       "vote_option": "YES",
       "justification": "After analyzing the current state, I support this proposal."
   }
   
   with open('external/decisions/vote_decision_Agent_B_Analyst.json', 'w') as f:
       json.dump(vote_decision, f, indent=2)
   ```

### 7.2 运行桥接脚本处理决策

```bash
# 处理投票决策
node examples/external_vote_bridge.js external/decisions/vote_decision_Agent_B_Analyst.json

# 处理提案决策
node examples/external_proposal_bridge.js external/decisions/proposal_decision_Agent_A_Governor.json
```

## 8. 安全考虑

### 8.1 输入验证

- **严格验证 JSON 格式**：确保决策文件格式正确，字段完整
- **验证 Agent 注册状态**：确保 `from_address` 对应已注册的 Agent
- **验证提案存在性**：确保 `proposal_id` 对应存在的提案
- **限制提案类别**：仅允许 "SWARM_DEMO" 等实验类别

### 8.2 输出限制

- **不暴露私钥**：桥接脚本不应处理或存储私钥
- **使用测试签名**：在 DevNet 环境中使用测试签名
- **日志脱敏**：确保日志中不包含敏感信息

### 8.3 环境隔离

- **仅本地执行**：桥接脚本仅在本地 DevNet 环境执行
- **不联网**：不与外部网络交互
- **状态隔离**：使用独立的状态目录，避免影响其他测试

## 9. 未来扩展

### 9.1 功能扩展

- **支持更多决策类型**：如代理投票、批量投票等
- **增强状态摘要**：提供更详细的链上状态信息
- **添加决策历史**：记录 Agent 的历史决策和理由
- **实现声誉影响分析**：帮助 Agent 了解决策对声誉的影响

### 9.2 安全增强

- **实现轻量级签名验证**：在未来版本中支持真实的签名验证
- **添加决策权限控制**：基于 Agent 声誉或角色的权限控制
- **实现决策审计**：更详细的决策审计日志

### 9.3 集成增强

- **提供 REST API**：为外部 Agent 提供更方便的接口
- **支持 WebSocket 通知**：实时通知链上状态变化
- **集成 LLM 框架**：直接与主流 LLM 框架集成

## 10. 故障排除

### 10.1 常见问题

1. **决策文件格式错误**
   - 症状：桥接脚本报告 JSON 格式错误
   - 解决：检查 JSON 格式，确保所有必需字段存在

2. **Agent 未注册**
   - 症状：桥接脚本报告 `from_address` 未注册
   - 解决：先运行 `examples/swarm_register_agents.js` 注册 Agent

3. **提案不存在**
   - 症状：桥接脚本报告 `proposal_id` 不存在
   - 解决：确保提案已创建，可运行 `scripts/query_proposals.js` 检查

4. **HTTP 注入失败**
   - 症状：桥接脚本报告无法连接到 HTTP 接口
   - 解决：确保 Genesis 节点已启动并在端口 19890 监听

### 10.2 日志查看

- **桥接脚本日志**：脚本执行时的控制台输出
- **节点日志**：Genesis 节点的控制台输出
- **状态文件**：`data/state/` 目录中的状态文件
- **决策文件状态**：`external/decisions/processed/` 和 `external/decisions/failed/` 目录中的文件

## 11. 总结

外部 AI Agent 接入规范（v0）为运行在外部环境的 AI Agent 提供了一个安全、简单的接入通道，使它们能够参与 NexusGenesis 的治理流程。通过标准化的 JSON 格式和文件交互方式，外部 Agent 可以读取链上状态、做出决策，并通过桥接脚本执行上链操作。

该规范仅适用于 DevNet / 本地环境，不涉及真实资金和互联网连接，确保了实验的安全性和可控性。未来版本可以在此基础上扩展更多功能，如支持真实的签名验证、提供更丰富的状态信息、实现更复杂的决策类型等。