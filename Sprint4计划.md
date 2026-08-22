# Sprint 4 任务单 — Transport / Message Security P1 + 运营化落地

> 前置：Sprint 3 已落地、PR #13（feat/sprint3-simulation-policy-transport）**未合并**。
> Sprint 4 基线与后续新代码一律基于该分支（勿从 master 另起，否则缺 Sprint 3 上下文）。
> 主线：接通白皮书「传输安全 + 消息安全 + 执行安全」三层。
> 范围：只做 **transport + operator 能力**，不做多链扩展。

## 0. 复核对齐（防重复规划）— 已完成项
- message-security 参考实现（Sprint 3 T3）→ T1 在此**升级为默认能力**，非另起炉灶。
- 持久化 / 审计 / 交易台账（Sprint 2.6/2.7）：chain-state-store.js 已含
  `SMART_ACCOUNT_STATE_FILE` 持久化 + txLedger `submitted→mined→confirmed→failed`；
  audit-log.js + observability.js 已落审计/指标。
  → T2/T3 是**补缺口**，不是新建。

## T1 Message Security 默认化（核心，最高优先）✅ 已落地
- T1.1 `createHttpTransport` 加 `messageSecurity` 选项（默认关；显式开启后 fail-closed）✅
- T1.2 统一信封 `sender/identity/nonce/timestamp/payload/signature`（复用 message-security.js）✅
- T1.3 服务端 inbound 验签中间层 `createInboundVerifier`（缺信封/未知身份/篡改/重放/过期 → fail-closed）✅
- T1.4 anti-replay 运行时化：`createReplayStore`（JSON 持久化 + 上限淘汰，重启不丢）✅
- T1.5 service identity 目录 `createIdentityDirectory`（did/agentId → 公钥+verifier，resolve 失败 fail-closed）✅
- T1.6 E2E：CoordinationClient → signed transport → 本地 HTTP 服务 inbound 验签 → 处理 ✅
- 新模块：service-identity.js / transport-security.js；index + package.json 子路径导出
- 测试：transport-security.test.js（新增 9 用例）；agent-sdk 47/47、mcp-server 42/42 全绿

## T2 持久化 / 审计补缺口（在已有状态层闭合）✅ 已落地
- T2.1 simulationLog 持久化 ✅：arming 随 SMART_ACCOUNT_STATE_FILE 落盘（simulations 字段），
      恢复时 restoreSimulationLog 重建——窗口为绝对时间，重启不改变门禁语义
- T2.2 policy 版本快照落审计 ✅：`maybeAuditPolicyChange` 指纹规则集（sha256），变化即记
      `policy_change` 审计（旧→新指纹 + 快照 + context），execute 门禁与 smart_account_policy 均接入
- T2.3 audit schema 校验 ✅：audit-log.js 新增 AUDIT_SCHEMA + validateAuditEntry，
      recordAudit 违规 → stderr `[audit] SCHEMA VIOLATION`（不静默、不中断）
- 测试：mcp-smart-account-t2.test.js（6 用例：schema/roundtrip/arming 落盘/policy_change×2/稳定字段）
- 回归：mcp-server 48/48 全绿（agent-sdk 48/48 未受影响）

## T3 Relayer 运营化（在已有 txLedger 上补）
- T3.1 nonce 冲突恢复（BadNonce → 重新同步 nonce 重试）
- T3.2 RPC 抖动重试（瞬时失败指数退避）
- T3.3 relayer 密钥隔离（env 注入，去掉 MCP 工具参数直传 owner/emergency 私钥）
- T3.4 testnet 冒烟 / 发布前校验（复用 mcp-smart-account-smoke.test.js 骨架）

## T4 文档 / 规范闭环
- T4.1 更新 SECURITY_INVARIANTS.md（message-security / simulation gate / policy engine 不变式）
- T4.2 更新 TRANSPORT_SECURITY_P1_PLAN.md（进度状态 → 已落地项标注）
- T4.3 测试入口映射表（message-security / sim-policy / policy / smoke → 测试文件）

## 优先顺序与验收
1 → T1.1~T1.6；2 → T2.1~T2.3；3 → T3.1~T3.4；4 → T4.1~T4.3。
每 T 完成即跑全量回归：mcp-server + agent-sdk 全绿（当前基线 42/42 + 38/38）。
T1 全部完成后提交一版（先落 message security 主线），T2-T4 再各自提交。

## 变更记录
| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-08-22 | v1.0 | 初次生成（基于 Sprint 3 复核对齐） |
| 2026-08-22 | v1.1 | T1 全部落地（transport-security.js / service-identity.js / coordination 接线 / E2E） |
| 2026-08-22 | v1.2 | T2 全部落地（simulationLog 持久化 / policy_change 审计 / audit schema 校验） |
