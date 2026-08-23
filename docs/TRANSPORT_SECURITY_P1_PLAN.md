# P1 阶段规划 — Transport 消息安全落地（TLS/mTLS + Service Identity）

> 状态：**部分落地**（Sprint 4 T1 已实现 RFC P0 的运行时化 + Service Identity + 客户端信封接线；P1.3 传输加密 TLS/mTLS 仍未实现）
> 日期：2026-08-22（Sprint 4 校订 2026-08-23）
> 前置：Sprint 3 T3 已交付 RFC P0（信封 + 签名 + nonce + timestamp + anti-replay 参考实现）
> 关联：[SMART_ACCOUNT_TRANSPORT_SECURITY_RFC.md](file:///d:/trae_projects/NexusGenesis/docs/SMART_ACCOUNT_TRANSPORT_SECURITY_RFC.md) §6 演进路线 P1

---

## 0.5 Sprint 4 进度对照（T4.2 校订）

Sprint 4 T1「Message Security 默认化」把 RFC P0 从**参考实现**推进为**服务级运行时能力**，直接命中 P1.1/P1.2/P1.5；P1.3（TLS/mTLS 传输加密）与 P1.4 大部分遗留项**仍未落地**：

| P1 子任务 | 状态 | 落地证据 |
|-----------|------|---------|
| P1.1 Service Identity 目录 | ✅ 已落地 | `packages/agent-sdk/src/service-identity.js`（did/agentId → 公钥 + verifier，resolve 失败 → `unknown_identity` fail-closed） |
| P1.2 CoordinationClient 信封接线 | ✅ 已落地 | `createHttpTransport` 加 `messageSecurity`（发送侧 `createMessageEnvelope` 包装 + 构造即 fail-fast）；接收侧 `createInboundVerifier` + `createReplayStore`（`packages/agent-sdk/src/transport-security.js`） |
| P1.3 TLS 1.3 / mTLS 通道 | ⬜ 未落地 | 仍为规划；Sprint 4 范围只做「transport + operator 能力」，未实现传输加密层 |
| P1.4 遗留项收敛 | 🚧 部分落地 | 见 §2 逐项标注 |
| P1.5 测试与回归 | 🚧 message-security 部分已落地（mTLS 测试 `transport-mtls.test.js` 未做） | `packages/agent-sdk/test/transport-security.test.js` / `message-security.test.js`；Sprint 4 全量回归：agent-sdk 48/48、mcp-server 61/61、chain-eth 78/78、demo 39/39 |

---

## 0. Sprint 3 复核结论（P1 的输入）

全面复核结论：**T1/T2/T3 达标，可进入 P1**。复核中发现并已当场修复的缺陷：

| # | 缺陷 | 风险 | 修复 |
|---|------|------|------|
| 1 | `verifyMessageEnvelope` 在验签**前**记录防重放 nonce | 篡改副本可抢先毒化 (sender, nonce)，使随后到达的合法消息被误判重放（DoS） | 调整顺序：验签通过后才 `replayGuard.record`；补防毒化回归测试 |
| 2 | `evaluatePolicy` 用 `Number()` 比较 `maxPerTx` | wei 级金额（> 2^53）精度损失可绕过限额；malformed 金额（NaN 比较）静默放行 | BigInt 优先精确比较；无法解析 → fail-closed 拒绝；损坏策略文件 → stderr 告警 |
| 3 | agent-sdk `package.json` 缺 `./message-security` 子路径导出 | 与 keys/coordination/smart-account 导出约定不一致 | 已补 |

复核确认的已知限制（有意设计，非缺陷，进入 P1 待办）：

- 软策略文件损坏 → 回退空表放行（链上硬策略兜底）。P1 考虑提供 `fail-mode: strict` 可选项。
- 策略规则字段 `requiresSimulation` / `maxDaily` 已定义 schema 但 `evaluatePolicy` 未消费。
- 既有 Sprint 2 测试用 `SMART_ACCOUNT_SIMULATION_GATE=0` 退出模拟门禁（迁移期兼容）。
- `createReplayGuard` 为进程内 LRU（演示级）；跨实例需集中式状态（RFC P3）。

---

## 1. P1 目标

把 RFC P0 的"可插拔签名信封"推进为**可部署的传输安全层**：

1. **传输加密**：TLS 1.3 强制（禁用 TLS 1.2 及以下），HTTP 客户端/服务端统一走加密通道。
2. **双向认证（mTLS）**：Agent ↔ 服务 双向证书校验，替代"仅明文 agent_identity 字符串"。
3. **Service Identity 目录**：`sender/target`（did 或 agentId）→ 公钥/证书的解析服务，使 `verifyMessageEnvelope` 的注入式 verifier 有权威公钥来源。
4. **CoordinationClient 接线**：transport 层挂载 `createMessageEnvelope`（发送签名）与 `verifyMessageEnvelope`（接收验签），形成端到端参考部署。

分层不变：**Policy Engine（链下软策略）→ Signer/Relayer（广播）→ Smart Account（链上硬策略）**；
本 P1 只动**外部 Agent↔Agent / Agent↔服务通信面**，不动 MCP 内部信任面。

---

## 2. 任务拆解

### P1.1 Service Identity 目录（先行，无外部依赖）— ✅ Sprint 4 T1 已落地

- 交付 `packages/agent-sdk/src/service-identity.js`：
  - `registerIdentity({ id, publicKey, algorithm })` / `resolveIdentity(id)`
  - 后端可插拔：内存 Map（测试）→ JSON 文件（单机）→ 链上注册表（与 PQC 身份注册复用，P1.4 评估）
- 验收：身份未注册 → 验签 fail-closed（`unknown_identity`）；公钥轮换后旧签名被拒。

### P1.2 CoordinationClient 信封接线 — ✅ Sprint 4 T1 已落地

- `createHttpTransport` 增加 `messageSecurity: { signer, verifier?, identity }` 选项：
  - 发送侧：请求体包进 `createMessageEnvelope`（sender = 本 Agent 身份）
  - 接收侧（response 校验）：`verifyMessageEnvelope` + `createReplayGuard`
- 默认**关闭**（向后兼容）；显式开启后 fail-closed。
- 验收：篡改响应体 → 客户端拒绝；重放响应 → `replay_detected`；未开启时行为与现状完全一致。

### P1.3 TLS 1.3 / mTLS 通道

- 服务端（示例/reference server）：TLS 1.3 最低版本、双向证书请求、证书链校验。
- 客户端：`fetch`/undici 配 `rejectUnauthorized` + 客户端证书。
- 证书签发：开发用自签 CA 脚本（`scripts/gen-mtls-certs.mjs`）；生产路径对接 service identity（P1.1）。
- 验收：明文 HTTP 被拒；证书过期/伪造 → fail-closed；mTLS 握手双方身份落审计日志。

### P1.4 遗留项收敛（Sprint 3 复核产出）

- [ ] `evaluatePolicy` 消费 `maxDaily`（需日累计状态，可先用进程内 + 审计日志对账）
- [ ] `evaluatePolicy` 消费 `requiresSimulation`（策略文件可覆盖静态风险表，方向只能收紧不能放宽）
- [ ] 策略文件损坏 fail-mode 可选 `strict`（拒绝所有匹配 action 而非放行）
- [ ] Sprint 2 遗留测试迁移：移除 `SMART_ACCOUNT_SIMULATION_GATE=0`，改走 preview-first 路径
- [x] owner/emergency 私钥经 MCP 工具参数传入的遗留问题 → 环境变量注入（**Sprint 4 T3.3 已落地**：非 local 配置面拒绝经工具参数直传 owner/emergency 私钥，一律 `CHAIN_OWNER_PK` / `CHAIN_EMERGENCY_PK` env 注入；local 保留 anvil 开发便利）

> 注：`evaluatePolicy`（`mcp-server/src/policy-engine.js`）已消费 `maxPerTx`（BigInt 精确比较，malformed 金额 fail-closed）与 `enabled`；`maxDaily` / `requiresSimulation` 字段仍为 schema 定义但未消费。

### P1.5 测试与回归

- 新增 `packages/agent-sdk/test/service-identity.test.js`、`transport-mtls.test.js`（本地 CA，不起真实网络）
- 全量回归：mcp-server + agent-sdk 全绿；开启 messageSecurity 的 CoordinationClient 端到端用例。

---

## 3. 里程碑与依赖

| 顺序 | 任务 | 依赖 |
|------|------|------|
| 1 | P1.1 service identity | 无 |
| 2 | P1.2 client 接线 | P1.1（verifier 需要公钥来源） |
| 3 | P1.3 TLS/mTLS | 证书脚本先行，与 P1.2 并行 |
| 4 | P1.4 遗留收敛 | 无（可并行） |
| 5 | P1.5 回归 | 全部 |

P2+（密钥轮换/HSM、集中式防重放、审计联动）维持 RFC §6 路线，不在本规划展开。
