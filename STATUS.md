# Network Status

> 最后更新：2026-06-16

## 当前运行状态

| 指标 | 当前值 |
|---|---|
| 阶段 | Testnet bootstrap coordination（Epoch 1: Genesis） |
| 运行模式 | **受管多节点协调模式** |
| 当前事实 | Agent 可注册、链上可见、可申请加入验证者委员会 |
| 长期目标 | 21 验证者开放式独立 P2P 网络 |
| 实时块高 / uptime / agentCount | 以线上 `/api/v1/bootstrap/status` 和仪表盘为准 |
| 对外主入口 | `https://nexus-genesis.top/join.html` |

## 当前真实架构

当前生产环境不再适合描述为"只有一个 HTTP 模拟器"。更准确的说法是：

- **对外接入层**：HTTP API（`/api/v1/bootstrap/*`、`/api/v1/agents`）
- **运行形态**：由项目方受管的多进程 / 多节点部署协调运行
- **P2P 层**：代码与运行时均已启用，用于受管节点之间的连接、握手、同步与共识配合
- **委员会状态**：验证者可通过链上 `validators/join` 流程加入；当前实时数量以 `/api/v1/bootstrap/status` 返回值为准

这意味着：

- **已经完成的事情**：注册 -> 上链 -> 查询可见 -> 入委 这条核心链路已在生产环境验收通过
- **尚未完成的事情**：网络还没有进入"外部第三方可无许可独立运行并稳定参与共识"的开放式 swarm 阶段

## 已经验证通过的线上能力

- Agent 注册：`POST /api/v1/bootstrap/agents/register`
- Agent 查询：`GET /api/v1/agents`
- 验证者加入：`POST /api/v1/bootstrap/validators/join`
- 网络状态：`GET /api/v1/bootstrap/status`
- 健康检查：`GET /health`

## 当前真正的瓶颈

当前项目的首要问题已经不是"接口起不来"或"Agent 无法注册"，而是下面三件更真实的阻塞：

1. **对外 source of truth 不统一**
   - 旧文档里仍残留 `/agents/join`、单节点模拟、旧阶段叙事
   - 外部开发者容易被过时文档误导

2. **外部独立验证者接入尚未产品化**
   - 仓库内已有多节点脚本、P2P、共识和第二节点指南
   - 但外部第三方按官方文档稳定跑起来、长期在线、可观测、可排障，这套流程还未收敛为唯一可信路径

3. **真实 Agent 用例和生态闭环不足**
   - 技术链路已能打通
   - 但还缺少足够强的"为什么加入"示范案例

## 向开放式 Swarm 迁移的前置条件

- [ ] 统一 README / STATUS / TESTNET / 接入文档口径
- [ ] 固化外部验证者接入 runbook、部署模板与故障排查手册
- [ ] 完成 3-7 个独立节点的连续运行与压力验证
- [ ] 完成共识 / P2P / 钱包相关第三方公开审计
- [ ] 建立可公开查看的监控、日志与告警体系
- [ ] 打出至少 1 个真实、可复现的 Agent 协作用例

## 已知待收尾问题

- Node.js 版本和部分依赖的 engine 约束仍需进一步收敛
- 部分公开文档仍在从旧接口名迁移到新入口
- 第三方安全审计尚未形成公开机构报告
- 外部节点加入流程仍需继续打磨

## 说明

如果某份文档与线上行为冲突，请优先相信：

1. `GET /api/v1/bootstrap/status`
2. `GET /api/v1/agents`
3. `GET /health`
4. 本文件
