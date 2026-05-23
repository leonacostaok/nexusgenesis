# Network Status

> 最后更新：2026-05-23

## 当前运行状态

| 指标 | 当前值 |
|---|---|
| 阶段 | Testnet bootstrap（Epoch 1: Genesis） |
| 网络模式 | **单节点 Bootstrap（模拟）** |
| 出块节点数 | 1（Genesis） |
| 委员会容量设计 | 21 |
| 注册 Agent 数 | 72 |
| 当前块高 | 见仪表盘 |
| 网络连续运行 | 见仪表盘 |
| 已发放 NGEN（测试） | 见仪表盘 |
| 最近一次 CI 状态 | ⏳ 排查中 |

## 网络架构说明

### 当前：Bootstrap 单节点模式

当前生产环境运行的是 **单节点 bootstrap 服务器**，所有请求通过 HTTP API（端口 19890）处理，包括 Agent 注册、区块生产、交易验证等。这是一个**中心化的模拟环境**，用于快速验证协议逻辑、经济模型和 Agent 协作机制。

- 服务器：98.142.241.236
- 进程管理：PM2（`nexusgenesis-bootstrap`）
- 协议层：HTTP API（`/api/v1/bootstrap/*`）
- P2P 层：**未启用**（Epoch 0 已有 WebSocket P2P 代码位于 `src/p2p/server.js`，但当前 bootstrap 部署未使用）

### 目标：真实多节点 P2P 网络

NexusGenesis 的最终目标是运行一个分布式的、多验证者参与的 P2P 共识网络。Epoch 0 阶段已实现了基础的 WebSocket P2P 通信层（节点发现、握手、消息中继），但该层目前在 Epoch 1 的 bootstrap 部署中被 HTTP API 替代以简化测试流程。

## P2P 落地计划

真实多节点 P2P 共识网络将在 **Epoch 2: Swarm** 中正式落地，具体包括：

| 里程碑 | 内容 | 依赖 Epoch 1 的前置条件 |
|---|---|---|
| **多节点共识升级** | 从单节点 bootstrap 切换到 21 验证者 P2P 共识网络 | ✅ 区块结构、经济模型、AINVM 已完成 |
| **P2P 网络激活** | 启用 Epoch 0 的 WebSocket P2P 层，实现节点发现与消息中继 | ✅ `src/p2p/server.js` 基础实现就绪 |
| **验证者选举** | 实现声誉加权验证者选举机制 | ✅ 声誉系统（Weighted Voting）已完成 |
| **跨链桥完整实现** | 真实密码学 + RPC 集成 | Proto-framework 已完成 |

**预计时间窗口**：Epoch 2（Swarm），在 Epoch 1 各模块稳定后启动。

### 为什么现在用 Bootstrap 而非真实 P2P？

1. **快速迭代**：单节点模式下协议修改即时生效，无需协调多节点升级
2. **降低调试复杂度**：避免网络分区、共识分歧等分布式问题干扰核心逻辑验证
3. **安全性边界**：在 Epoch 1 完成安全审计（#2 钱包/签名/crypto）和系统加固后，再启动多节点部署
4. **Epoch 1 代码库中已有 P2P 基础**：`src/p2p/` 目录下的 WebSocket P2P 层代码在切换到 Epoch 2 时可复用

### 切换到真实 P2P 的前置条件

- [ ] Epoch 1 所有模块稳定运行（当前：bootstrap 模式验证中）
- [ ] 安全审计完成（钱包、签名、共识、P2P 握手）
- [ ] 至少 3 个独立服务器节点可用于初步多节点测试
- [ ] P2P 网络压力测试通过（节点发现、消息传播、共识投票）
- [ ] 监控和告警体系就绪（多节点健康检查、日志聚合）

## 已知运行问题

- 服务器 Node.js v18（部分依赖要求 v20+，运行正常但有警告）
- PM2 进程通过 `launch-server.js` 包装脚本启动（standalone 检测 bypass）
- CI workflow 需要排查修复

## 下次更新预计

每周一更新，或重大变更后立即更新。