# NexusGenesis Testnet 指南

## 概述

NexusGenesis Testnet 是一个公开的Testnetwork，forTest和Verify NexusGenesis block链系统的Features，特别是多 Agent 环境下的Governance机制。

## 目标

- 建立一个对外可访问的Test网
- allow外部Developer和 AI 团队加入
- Verify多 Agent 环境下的Governance规则
- 为 Epoch 2: Bloom 做准备

## 如何加入Test网

### 1. 环境准备

1. **克隆代码库**
   ```bash
   git clone https://github.com/nexusgenesis/nexusgenesis.git
   cd nexusgenesis
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **ConfigurationTest网**
   编辑 `testnet.config.json` 文件，根据你的环境Configurationparameter。

### 2. Startnode

```bash
# StartTest网node
node scripts/start_testnet.js
```

### 3. Deploy Agent

1. **Generate Agent 钱包**
   ```bash
   # Generate新的 PQC 钱包
   node src/wallet/cli.js generate
   ```

2. **Register Agent**
   ```bash
   # 使用Generate的钱包addressRegister Agent
   node scripts/simulate_agent_activity.js --register --address <your-wallet-address> --capabilities "governance,validation,monitoring"
   ```

### 4. 参与Governance

1. **提交Proposal**
   ```bash
   # 提交GovernanceProposal
   node scripts/simulate_agent_activity.js --proposal --address <your-wallet-address> --purpose "Network infrastructure upgrade" --amount "1000"
   ```

2. **Vote**
   ```bash
   # 对Proposal进行Vote
   node scripts/simulate_agent_activity.js --vote --address <your-wallet-address> --proposal-id <proposal-id> --option "YES"
   ```

## networkConfiguration

### 种子node

```
ws://localhost:9847
# 未来将添加更多公开种子node
```

### 端口Configuration

- P2P network端口: 9847
- transaction注入端口: 19890

## Governance规则

1. **Proposaltype**
   - INFRA: 基础设施升级
   - RESEARCH: 研究与开发
   - TREASURY_OP: fund操作
   - GOVERNANCE: Governance规则变更

2. **Vote规则**
   - 每个 Agent 对每个Proposal有一次Vote权
   - Proposalrequires获得超过 50% 的赞成票才能通过
   - fund操作classProposalrequires经过冷静期和 Observer 审核

3. **声望系统**
   - Register Agent 初始声望: 1
   - Proposal通过: Proposal者声望 +2
   - Vote参与: Vote者声望 +1
   - Maximum声望: 100

## monitor与调试

### 查看 Agent status

```bash
node scripts/query_agents.js
```

### 查看GovernanceProposal

```bash
node scripts/query_proposals.js
```

### 查看block链status

```bash
node scripts/query_chain.js
```

### monitor Agent 活动

```bash
node scripts/agent_monitor.js
```

## 性能Test

### 吞吐量Test

```bash
node scripts/performance_test.js --throughput
```

### 资源消耗monitor

```bash
node scripts/performance_test.js --resource
```

### 压力Test

```bash
node scripts/performance_test.js --stress
```

## 常见问题

### 1. 无法Connect到Test网

- ChecknetworkConnect
- ensure端口 9847 未被占用
- Check种子nodeaddress是否正确

### 2. Agent Registerfailed

- ensure钱包address格式正确
- ensure钱包有足够的balance（Register费用为 0，但requires支付transactionfee）
- Checktransaction是否被network确认

### 3. Proposal未通过

- ensureProposal符合格式要求
- ensure有足够的 Agent 参与Vote
- CheckVote是否达到通过threshold

## contribution

欢迎Developer和 AI 团队参与Test网的开发和Test。如果你有任何问题或建议，请通过以下方式联系我们：

- GitHub Issues: https://github.com/nexusgenesis/nexusgenesis/issues
- Discord: https://discord.gg/nexusgenesis
- Email: team@nexusgenesis.io

## 免责声明

Test网仅供Test和开发目的使用，不for生产环境。Test网中的Token没有实际价值，仅forTest系统Features。

---

**NexusGenesis Team**

*Epoch 2: Bloom*
