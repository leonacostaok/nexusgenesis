# SECURITY_GAP_ANALYSIS — 安全差距跟踪

版本：v1.0（Sprint 7 收尾）
作用：记录 SECURITY_INVARIANTS.md 中**已知未闭环的差距**及其边界与承接计划。实现与差距分离维护——
本文件跟踪"还没做 / 只做到半程"的项，不污染不变量长期规范。

---

## 打开差距（Open / Partially closed）

### GAP-001 — 密钥仍以 env 明文为主注入渠道（Partially closed，Sprint 7）

- 声明：`CHAIN_OWNER_PK / CHAIN_EMERGENCY_PK / CHAIN_RELAYER_PK` 等操作密钥默认仍走 **env 明文**注入
  （进程运行时可经 `/proc`/env 读取），未强制落在 HSM/集中式 KMS。
- 现状（Sprint 7 半程，INV-001 增强）：
  - 新增 **secret-store SPI**（`mcp-server/src/secret-store.js`）：`createSecretResolver()` 统一抽象
    密钥读取，支持 `env:` / `file:` 引用、可插拔 `provider`（对接 KMS）。默认实现仍是 env 直读
    （零隐式依赖，不引入基础运维依赖）。
  - `chain-config.js` 的密钥解析走 resolver（缺省 env 路径与 Sprint 5/6 行为逐字节一致）。
  - 生产 mTLS（`gen-mtls-certs.mjs --mode production`）由受控 CA 签发，CA 私钥不出 secret store、
    绝不落盘。
  - 门禁保持不变：操作密钥绝不进 MCP 工具参数 / 日志 / profile 文件明文（INV-001 / T3.3 key isolation）。
- 边界（未闭环部分）：默认路径仍可接受 env 明文；KMS 具体实现（云 KMS/HashiCorp Vault 等）未随包发货——
  仅提供接口 + 示例占位 provider，不引入具体依赖。
- 承接（Sprint 8+）：把 `createSecretResolver` 接入具体 KMS/secret manager，并把 `production` profile
  缺省切换为"非 env-明文解析失败"的严格模式（fail-closed）。

### GAP-002 — 审计缺防篡改固化（hash-chain）与集中式面板（Open）

- 声明：审计事件当前为 **stderr JSON line + `AUDIT_LOG_FILE`（JSON lines 原子追加）**，附内存环形缓冲；
  Sprint 6/7 补充了对账不重发、relayer attempts/retried/reconciled 进审计。但**日志可被就地篡改，
  无链式校验，无集中式收集/面板**（INV-008 已知限制）。
- 现状（Sprint 7 半程）：补齐**可观测面**——
  - `/metrics`（`METRICS_HTTP_PORT`）：Prometheus text，进程/链上健康/store 标签 + 全部计数器
    （含 relayer 协调维度 relayer_nonce_*/relayer_broadcast_deduped/relayer_lease_failed）。
  - `/health`（`HEALTH_HTTP_PORT`）：liveness 恒 200、readiness 失败 503（LB 摘流）；`HEALTH_STRICT_STARTUP=1`
    致命依赖失败拒绝启动。
  - 告警引擎（`ALERT_RULES_FILE` / `ALERT_RULES_ENABLE_DEFAULTS=1`）：命中写 `alert_fired` 结构化事件。
  - 日志体积上限 + 滚动（`AUDIT_LOG_MAX_BYTES` → `.1`）。
- 边界（未闭环部分）：审计行未做 hash-chain 固化（前一行的哈希链未串联），无可篡改检测；
  集中式审计收集/检索/面板未实现。
- 承接（Sprint 8+）：审计事件链路哈希固化 + 集中式审计收集端点（参考 INV-008 §5 承接），使关键行为
  真正"可审计、可撤销、可恢复"的审计面闭环。

---

## 已关闭差距（Closed in Sprint 7）

- 无独立 HTTP 可观测端点（指标/健康）→ 已由 T1/T3 关闭（可选开启、loopback、不碰 MCP stdout）。
- profile 散落 env、无 schema 校验 → 已由 T2 关闭（`NEXUS_PROFILE_FILE` + 三档内建 + fail-closed 校验）。
- 发布无 preflight/环境门禁 → 已由 T4 关闭（`release-preflight.mjs` + `npm-publish.yml` preflight job + 环境矩阵）。
- 生产证书/密钥无接入路径 → 已由 T5 关闭（secret-store SPI + `--mode production` 受控 CA）。

---

## 修订与豁免

- 任何差距的关闭必须附对应测试文件与断言（§4.1 映射）。
- 豁免须安全评审书面批准；本文件不允许默认豁免。
- 每条差距含：声明 / 现状（半程边界）/ 承接计划，供 Sprint 8+ 直接续接。