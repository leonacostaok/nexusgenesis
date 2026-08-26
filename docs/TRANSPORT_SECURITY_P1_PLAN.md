# P1 阶段规划 — Transport 消息安全落地（TLS/mTLS + Service Identity）

> 状态：**已落地**（Sprint 4 完成 P0 运行时化 + Service Identity + 客户端信封接线；Sprint 5 补齐 P1.3 TLS/mTLS + P1.4 全部遗留项 + P1.5 测试/回归与文档闭环）
> 日期：2026-08-22（Sprint 4 校订 2026-08-23，Sprint 5 校订 2026-08-23）
> 前置：Sprint 3 T3 已交付 RFC P0（信封 + 签名 + nonce + timestamp + anti-replay 参考实现）
> 关联：[SMART_ACCOUNT_TRANSPORT_SECURITY_RFC.md](docs/SMART_ACCOUNT_TRANSPORT_SECURITY_RFC.md) §6 演进路线 P1

---

## 0.5 Sprint 4/5 进度对照（Sprint 5 校订）

Sprint 4 T1「Message Security 默认化」把 RFC P0 从**参考实现**推进为**服务级运行时能力**；Sprint 5 补齐 P1.3（TLS/mTLS 传输加密）与 P1.4 全部遗留项，P1 自此全部落地：

| P1 子任务 | 状态 | 落地证据 |
|-----------|------|---------|
| P1.1 Service Identity 目录 | ✅ 已落地 | `packages/agent-sdk/src/service-identity.js`（did/agentId → 公钥 + verifier，resolve 失败 → `unknown_identity` fail-closed） |
| P1.2 CoordinationClient 信封接线 | ✅ 已落地 | `createHttpTransport` 加 `messageSecurity`（发送侧 `createMessageEnvelope` 包装 + 构造即 fail-fast）；接收侧 `createInboundVerifier` + `createReplayStore`（`packages/agent-sdk/src/transport-security.js`） |
| P1.3 TLS 1.3 / mTLS 通道 | ✅ 已落地（Sprint 5 T1） | `packages/agent-sdk/src/mtls-server.js`（`createMtlsServer`/`createMtlsClient`，强制 TLSv1.3 + 双向证书 + 证书链校验）；`scripts/gen-mtls-certs.mjs`（纯 node:crypto 原生 X.509/Ed25519 证书构造，无 openssl 依赖）；握手身份落审计（`mtls_handshake`，失败仅暴露 `tls_*` 类别） |
| P1.4 遗留项收敛 | ✅ 已落地（Sprint 5 T2/T3/T4 + Sprint 4 T3.3） | 见 §2 逐项标注 |
| P1.5 测试与回归 | ✅ 已落地 | `transport-mtls.test.js`（8/8 验收态）+ `transport-mtls-e2e.test.js`（signed transport + mTLS + replay guard 全链路 6/6）；Sprint 5 收尾全量回归：agent-sdk 62/62、mcp-server 73/73、chain-eth 78/78、demo 39/39 |

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

### P1.3 TLS 1.3 / mTLS 通道 — ✅ Sprint 5 T1 已落地

- 服务端（示例/reference server）：TLS 1.3 最低版本、双向证书请求、证书链校验。
- 客户端：`fetch`/undici 配 `rejectUnauthorized` + 客户端证书。
- 证书签发：开发用自签 CA 脚本（`scripts/gen-mtls-certs.mjs`）；生产路径对接 service identity（P1.1）。
- 验收：明文 HTTP 被拒；证书过期/伪造 → fail-closed；mTLS 握手双方身份落审计日志。
- 落地：
  - `packages/agent-sdk/src/mtls-server.js`——`createMtlsServer`（`minVersion/maxVersion: 'TLSv1.3'` + `requestCert` + `rejectUnauthorized`，证书链校验，握手身份经 `recordAudit`/`mtls_handshake` 落审计，失败仅暴露 `tls_*` 类别）+ `createMtlsClient`（node:https 双向证书客户端）。
  - `scripts/gen-mtls-certs.mjs` / `scripts/lib/x509.mjs`——纯 `node:crypto` 手写最小 X.509v3/DER/Ed25519 构造器（无系统 openssl 依赖）：自签 CA、签发 server/client 叶子（SAN/EKU/basicConstraints/链校验）。
  - 验收态 `packages/agent-sdk/test/transport-mtls.test.js`（8/8，本地 CA 不起真实网络）：有效 mTLS 200 / 无证书拒 / 伪造 CA 拒 / 过期证书拒 / TLS1.2 拒 / 纯文本 HTTP 拒 / 过期服务端证书客户端拒 / 成功失败握手均落审计。
  - 与 INV-009 正交：INV-009 管应用层认证（签名信封/防重放/身份），P1.3 管传输层机密性（加密/双向证书/证书链）——P1.3 不修改 `verifyMessageEnvelope` 语义。

### P1.4 遗留项收敛（Sprint 3 复核产出）— ✅ Sprint 5 T2/T3/T4 全部落地

- [x] `evaluatePolicy` 消费 `maxDaily`（需日累计状态，可先用进程内 + 审计日志对账）— **Sprint 5 T2.1**：`createDailyCumulativeStore()` 进程内账户级日累计，超限 → `PolicyRejected` fail-closed，成功 execute 累计 + 审计 `dailyTotal`；多实例共享显式延后 Sprint 6。
- [x] `evaluatePolicy` 消费 `requiresSimulation`（策略文件可覆盖静态风险表，方向只能收紧不能放宽）— **Sprint 5 T2.2**：`resolveSimulationRequirement` 合并静态分级与 policy 规则，只收紧不放宽，execute 门禁与查询工具同源单次读取。
- [x] 策略文件损坏 fail-mode 可选 `strict`（拒绝所有匹配 action 而非放行）— **Sprint 5 T3**：`POLICY_FAIL_MODE=strict` 于模拟/policy 裁决前 fail-closed 报 `PolicyConfigError`（独立 `gate: strict-config`），默认宽松行为不变；strict 门禁绑定每请求单次读取快照，无 TOCTOU。
- [x] Sprint 2 遗留测试迁移：移除 `SMART_ACCOUNT_SIMULATION_GATE=0`，改走 preview-first 路径 — **Sprint 5 T4**：生产 gate 恒开（`if (sim.requiresSimulation)`），`mcp-smart-account/ops/smoke` 全部改带签名 preview arm 后执行；伪造/超限在 preview 端出 typed revert + execute 端 fail-closed `SimulationRequired`，重放/forge 保留链上 `BadNonce`/`InvalidSignature`。
- [x] owner/emergency 私钥经 MCP 工具参数传入的遗留问题 → 环境变量注入（**Sprint 4 T3.3 已落地**：非 local 配置面拒绝经工具参数直传 owner/emergency 私钥，一律 `CHAIN_OWNER_PK` / `CHAIN_EMERGENCY_PK` env 注入；local 保留 anvil 开发便利）

> 注：`evaluatePolicy`（`mcp-server/src/policy-engine.js`）已消费 `maxPerTx`（BigInt 精确比较，malformed 金额 fail-closed）、`enabled`、`maxDaily`（T2.1）、`requiresSimulation`（T2.2）；Sprint 5 复核确认方向只收紧不放宽、BigInt 精确累计、预留制消除 check-then-act 竞态。

### P1.5 测试与回归 — ✅ Sprint 5 已落地

- 新增 `packages/agent-sdk/test/service-identity.test.js`（Sprint 4）、`transport-mtls.test.js`（8/8 验收态，本地 CA 不起真实网络）。
- 新增 `packages/agent-sdk/test/transport-mtls-e2e.test.js`（6/6 全链路：signed transport + mTLS + replay guard；含 replay store 持久化重启恢复、跨服务 target 重放拒绝）。
- 全量回归：agent-sdk 62/62、mcp-server 73/73、chain-eth 78/78、demo 39/39。

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

---

## 4. Sprint 6 附录：共享防重放窗口（多实例）设计 — ✅ 已落地

> 对应 `Sprint6计划.md` T1/T2；INV-009 的多实例形态。设计要点与验收证据如下。

### 4.1 问题

单实例 replay store（进程内 + JSON 文件）在多实例部署下退化为"各实例独立窗口"：同一 `(sender,nonce)` 可对实例 A、实例 B 各放行一次——INV-009 的防重放语义在多实例下直接劣化。

### 4.2 设计

- **store 抽象（T1，`packages/agent-sdk/src/store-interface.js`）**：`createLocalStore`（进程内 + 本地 JSON 持久化 + 容量淘汰）/ `createSqliteStore`（共享）统一接口：`has/keys/list/claim/write/writeAtomically(RMW+重试)/purgeExpired/evictOldest/delete`。
- **恰好一次 = 全实例族语义（T2）**：`createReplayStore({ store })` 注入共享后端后，`record(key)` → `backend.claim(key)` → sqlite `INSERT OR IGNORE` **原子登记**：首个到达的实例 claim 成功（放行），其余实例（无论并发/先后）claim 失败 → `replay_detected`。无"记录失败但当成功"路径——claim 结果即裁决。
- **窗口清理**：`purgeExpired(now - retentionMs)` 按绝对时间清过期（重启不丢语义，与 arming 恢复同口径）；保留期 ≥ 信封新鲜度窗口（2×10min 兜底），被淘汰的过旧重放仍会被 `timestamp_expired` 拒——清理不产生安全缺口；仍超 `maxEntries` → `evictOldest` FIFO 硬上限（基线语义）。
- **降级矩阵（fail-closed，不静默）**：
  - local 后端文件损坏 → 显式 stderr 告警 + 自愈重建（本会话内存窗口）；仅重放检测粒度降级，验签/身份安全不受影响。
  - **共享模式**：注入 store 的构造/操作错误**直接传播由调用方 fail-closed**——绝不静默退回"各实例独立窗口"（Sprint 6 约束 #1）。
- **单实例基线不变**：不注入 store → local 行为与 Sprint 4/5 逐字节一致。

### 4.3 验收证据

- `packages/agent-sdk/test/store-interface.test.js`：local/sqlite 双后端语义一致性、原子 readModifyWrite、claim 恰好一次、双句柄并发。
- `packages/agent-sdk/test/transport-distributed.test.js`：双实例共享 replay store——首 200 / 次 403（跨实例）、重启共享表不丢窗口、共享后端降级 fail-closed。
- 全量回归（Sprint 6 收尾）：agent-sdk 94/94、mcp-server 104/104、chain-eth 78/78。
