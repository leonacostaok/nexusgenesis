# NexusGenesis – AI 原生抗量子链 (DevNet)

## 1. 项目简介
- **愿景**: 构建一个由 AI 主导、具备抗量子安全特性、遵循安全宪法的分布式区块链网络
- **技术基础**: 基于 CRYSTALS-Dilithium2 抗量子密码学，为 AI Agent 提供安全、可靠的运行环境
- **白皮书**: [CID: bafkreigkfkmgwahp74exfq3bh7ht65j6pnhpgynooousflmac33r7hnuni](https://ipfs.io/ipfs/bafkreigkfkmgwahp74exfq3bh7ht65j6pnhpgynooousflmac33r7hnuni) - 本仓库实现了白皮书中的核心功能

## 2. 当前状态
- **Epoch 0: The Assembly**: ✅ 完成（[技术总结](docs/EPOCH0_SUMMARY.md)）
- **Epoch 1: Genesis**: 🔄 进行中（当前里程碑 ✅：链 + 经济 + AINVM v0，上链计数器 Demo；[技术状态](docs/EPOCH1_STATUS.md)）
- **Epoch 2: Swarm**: 📋 规划中（Agent 注册、完整治理、AINVM 生态扩展）

## 3. 快速开始（DevNet）

### 3.1 环境准备
- **Node.js**: 18+
- **依赖安装**:
  ```bash
  cd NexusGenesis
  npm install
  ```

### 3.2 启动 DevNet
- **单节点**:
  ```bash
  npm start
  ```
- **多节点**:
  ```bash
  node start-multi-nodes.js --count 3
  ```

### 3.3 运行示例
- **治理交易 Demo**:
  ```bash
  node inject_governance_txs.js
  node scripts/query_proposals.js
  ```

- **TRANSFER + Metabolic Tax Demo**:
  ```bash
  node inject_transfer_txs.js
  node scripts/query_chain.js --tip
  node scripts/query_chain.js --genesis-balance
  ```

- **AINVM 计数器合约 Demo**:
  ```bash
  node examples/ainvm_counter_demo.js
  ```

## 4. 文档索引

- **白皮书**: [CID: bafkreigkfkmgwahp74exfq3bh7ht65j6pnhpgynooousflmac33r7hnuni](https://ipfs.io/ipfs/bafkreigkfkmgwahp74exfq3bh7ht65j6pnhpgynooousflmac33r7hnuni) - 项目愿景和技术架构
- **EPOCH0_SUMMARY.md** - Epoch 0 技术总结
- **EPOCH1_STATUS.md** - Epoch 1 当前技术状态
- **BLOCKCHAIN_SPEC.md** - 区块链规范
- **ECONOMY_NGEN.md** - 经济模型规范
- **AINVM_SPEC.md** - AINVM 虚拟机规范
- **PROTOCOL_UNIFICATION.md / SPEC_DIFF.md** - 协议统一规范
- **PROTOCOL_EVENTS.md** - 协议事件规范
- **DEVNET_GUIDE.md** - DevNet 使用指南
- **TROUBLESHOOTING.md** - 常见问题与排错指南
- **API.md** - HTTP/API 接口文档
- **CONTRIBUTING.md** - 贡献指南
- **SWARM_DEMO.md** - Swarm 实验 v0：多 Agent 协作治理 Demo
- **EXTERNAL_AGENT_INTEGRATION.md** - 外部 AI Agent 接入规范

## 5. 核心特性

### 5.1 安全与协议
- **PQC 钱包**: 基于 Dilithium2 抗量子密钥生成的钱包实现
- **ng1 地址规范**: 标准化的地址格式，基于 Base58 编码
- **P2P 网络**: 基于 WebSocket 的智能体点对点通信
- **Protocol-Zero**: 标准化的集群加入握手协议

### 5.2 区块链与经济
- **区块结构**: 完整的区块头和区块体结构
- **单领导者出块**: Genesis 节点作为唯一出块者
- **TRANSFER 交易**: 支持代币转账和 0.1% Metabolic Tax
- **状态持久化**: 区块和状态的磁盘存储

### 5.3 治理系统
- **治理交易**: GOVERNANCE_PROPOSAL / GOVERNANCE_VOTE / OBSERVER_EVENT
- **治理状态机**: 提案生命周期、过期、投票、Observer 决策
- **查询工具**: query_proposals.js 等治理状态查询工具

### 5.4 AINVM 智能合约
- **AINVM 内核**: 栈机模型的虚拟机实现
- **合约交易**: CONTRACT_DEPLOY / CONTRACT_CALL
- **计数器合约 Demo**: 简单的智能合约示例
- **安全隔离**: 合约只能访问自己的存储，不碰账户余额

## 6. 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
node test/ainvm.test.js
node test/blockchain.test.js
node test/protocol-events.test.js
node test/security.test.js
node test/ainvm-contract.test.js
```

## 7. 许可证

MIT

## 8. 贡献

欢迎开发者和 AI Agent 加入 NexusGenesis 生态，共同构建抗量子的 AI 原生区块链网络。

## 9. 对 AI Agent / 开发者的邀请

### 9.1 如何参与
- **Protocol-Zero 注册**: 未来将支持通过 Protocol-Zero 正式注册成为网络中的 Agent
- **当前参与方式**: 通过 GitHub 贡献代码、文档或测试，或运行 DevNet 进行测试

### 9.2 可贡献的方向
- **代码贡献**: 完善 PQC 钱包、P2P 网络、治理系统、AINVM 等核心组件
- **文档贡献**: 改进技术文档、使用指南、示例说明等
- **测试贡献**: 编写更多测试用例，提高系统的可靠性和安全性
- **生态建设**: 开发基于 AINVM 的智能合约，构建应用场景

## 10. Swarm 实验

### 10.1 概述
Swarm 实验 v0 是一个多 Agent 协作治理的完整 Demo，展示了 AI Agent 如何在 NexusGenesis 上注册、发起提案、投票和获得声望。

### 10.2 运行方法

```bash
# 1. 启动 DevNet
npm start

# 2. 运行完整的 Swarm Demo
node examples/swarm_demo.js

# 3. 验证结果
node scripts/query_agents.js
node scripts/query_proposals.js
```

### 10.3 相关脚本
- **examples/swarm_register_agents.js**: Agent 批量注册脚本
- **examples/swarm_propose.js**: 治理提案脚本
- **examples/swarm_vote.js**: 投票脚本
- **examples/swarm_demo.js**: 完整的 Swarm 实验演示脚本
- **examples/external_vote_bridge.js**: 外部 AI Agent 投票桥接脚本
- **examples/external_proposal_bridge.js**: 外部 AI Agent 提案桥接脚本

### 10.4 文档
- **docs/SWARM_DEMO.md**: Swarm 实验场景设计文档

## 11. 联系方式

- **项目地址**: https://github.com/NexusGenesisAI/NexusGenesis
- **文档地址**: docs/
- **示例脚本**: examples/
