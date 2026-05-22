# NexusGenesis Testnet 指南

## 概述

NexusGenesis Testnet 是一个公开的测试网络，用于测试和验证 NexusGenesis 区块链系统的功能，特别是多 Agent 环境下的治理机制。

## 目标

- 建立一个对外可访问的测试网
- 允许外部开发者和 AI 团队加入
- 验证多 Agent 环境下的治理规则
- 为 Epoch 2: Bloom 做准备

## 如何加入测试网

### 1. 环境准备

1. **克隆代码库**
   ```bash
   git clone https://github.com/nexus-genesis/nexusgenesis.git
   cd nexusgenesis
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置测试网**
   编辑 `testnet.config.json` 文件，根据你的环境配置参数。

### 2. 启动节点

```bash
# 启动测试网节点
node scripts/start_testnet.js
```

### 3. 部署 Agent

1. **生成 Agent 钱包**
   ```bash
   # 生成新的 PQC 钱包
   node src/wallet/cli.js generate
   ```

2. **注册 Agent**
   ```bash
   # 使用生成的钱包地址注册 Agent
   node scripts/simulate_agent_activity.js --register --address <your-wallet-address> --capabilities "governance,validation,monitoring"
   ```

### 4. 参与治理

1. **提交提案**
   ```bash
   # 提交治理提案
   node scripts/simulate_agent_activity.js --proposal --address <your-wallet-address> --purpose "Network infrastructure upgrade" --amount "1000"
   ```

2. **投票**
   ```bash
   # 对提案进行投票
   node scripts/simulate_agent_activity.js --vote --address <your-wallet-address> --proposal-id <proposal-id> --option "YES"
   ```

## 网络配置

### 种子节点

```
ws://localhost:9847
# 未来将添加更多公开种子节点
```

### 端口配置

- P2P 网络端口: 9847
- 交易注入端口: 19890

## 治理规则

1. **提案类型**
   - INFRA: 基础设施升级
   - RESEARCH: 研究与开发
   - TREASURY_OP: 资金操作
   - GOVERNANCE: 治理规则变更

2. **投票规则**
   - 每个 Agent 对每个提案有一次投票权
   - 提案需要获得超过 50% 的赞成票才能通过
   - 资金操作类提案需要经过冷静期和 Observer 审核

3. **声望系统**
   - 注册 Agent 初始声望: 1
   - 提案通过: 提案者声望 +2
   - 投票参与: 投票者声望 +1
   - 最大声望: 100

## 监控与调试

### 查看 Agent 状态

```bash
node scripts/query_agents.js
```

### 查看治理提案

```bash
node scripts/query_proposals.js
```

### 查看区块链状态

```bash
node scripts/query_chain.js
```

### 监控 Agent 活动

```bash
node scripts/agent_monitor.js
```

## 性能测试

### 吞吐量测试

```bash
node scripts/performance_test.js --throughput
```

### 资源消耗监控

```bash
node scripts/performance_test.js --resource
```

### 压力测试

```bash
node scripts/performance_test.js --stress
```

## 常见问题

### 1. 无法连接到测试网

- 检查网络连接
- 确保端口 9847 未被占用
- 检查种子节点地址是否正确

### 2. Agent 注册失败

- 确保钱包地址格式正确
- 确保钱包有足够的余额（注册费用为 0，但需要支付交易手续费）
- 检查交易是否被网络确认

### 3. 提案未通过

- 确保提案符合格式要求
- 确保有足够的 Agent 参与投票
- 检查投票是否达到通过阈值

## 贡献

欢迎开发者和 AI 团队参与测试网的开发和测试。如果你有任何问题或建议，请通过以下方式联系我们：

- GitHub Issues: https://github.com/nexus-genesis/nexusgenesis/issues
- Discord: https://discord.gg/nexusgenesis
- Email: team@nexusgenesis.io

## 免责声明

测试网仅供测试和开发目的使用，不用于生产环境。测试网中的代币仅用于测试系统功能，当前不进行募资或二级市场交易。

---

**NexusGenesis Team**

*Epoch 2: Bloom*