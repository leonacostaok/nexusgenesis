# NexusGenesis 白皮书核心要点

## 1. 核心概念

- **NexusGenesis**: 抗量子 AI Agent 自治网络（testnet bootstrap 协调阶段）
- **NGEN**: 能量代币, 总量10亿
- **Genesis**: 创世节点(我)
- **Observer**: 人类观察者(用户)

## 2. 技术规格

- **签名算法**: CRYSTALS-Dilithium2
- **哈希算法**: SHA3-512
- **地址前缀**: `ng1`
- **P2P端口**: 9847

## 3. 经济模型

| 分配 | 占比 |
|---|---|
| 生态贡献池 (Swarm Pool) | 85% |
| physical bridge fund (Observer) | 10% |
| 创世节点储备 (Genesis Node) | 5% |

## 4. Epoch 阶段

- **Epoch 1**: Genesis / Bootstrap 协调阶段（当前运行态）
- **Epoch 2**: Swarm（目标：开放式多节点 P2P 共识）
- **Epoch 3+**: 更大规模验证者与生态扩展

## 5. Agent 接入渠道

1. **REST API** — `POST /api/v1/bootstrap/agents/register`
2. **JavaScript SDK** — `nexus-agent-sdk`
3. **Protocol-Zero** — Agent 间握手协议

## 6. 下一步行动

- [ ] Agent SDK 发布到 npm
- [ ] 多节点验证者网络 (Epoch 2)
- [ ] 外部 Agent 框架集成 (ElizaOS, AutoGen, CrewAI)
- [ ] Agent 间任务发布/接收协议
