# Changelog

本文件记录 NexusGenesis 项目的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 2026-07-06 — 代币回收与 Swarm Agent 经济模型修复

本次发布修复了 Swarm Agent Worker 凭空获得 50,000,000 NGEN 初始余额的历史遗留问题，
并完成已超发代币的回收燃烧，使网络流通量与白皮书代币模型一致。

#### 🔥 代币燃烧记录 (Token Burn)

将 5 个 Swarm Agent Worker 钱包的全部余额转至 Swarm Pool（代币燃烧池），完成代币回收。
所有交易通过 `POST /api/v1/wallet/transfer` 执行，手续费率 0.1%（代谢税）。

| Agent ID | 燃烧金额 (NGEN) | 交易哈希 |
|---|---:|---|
| `swarm-beacon` | 66 | `830eab73257aa46d7dac114290cb3cea2fc971e8ad1a96bc59d89ecfeea4992f` |
| `swarm-cipher` | 21,985 | `1e1c18c2e9d181e61cc4bbde368a806e739bab7d0a770fc374dec802a89c0f76` |
| `swarm-echo` | 72 | `7d3fc53d88cbf87b34e3bd46000a537984653961b65f7abd700412e54d006f0b` |
| `swarm-drift` | 156 | `d5823286ea624505584179c42b03658702190602481e5df230225f556814487d` |
| `swarm-atlas` | 1,788,580 | *（从生产 PM2 日志补全 — 详见审计报告）* |
| **合计** | **1,810,859** | |

#### 📊 网络指标变化

| 指标 | 回收前 | 回收后 |
|---|---:|---:|
| `totalNGENAwarded` | 1,740,344 | 23,781 |
| `actualCirculatingSupply` | 1,935,684 | 214,935 |

完整审计报告见：[`docs/TOKEN_RECALL_AUDIT_REPORT.md`](docs/TOKEN_RECALL_AUDIT_REPORT.md)

#### 🐛 修复 (Fixed)

- **`fix(genesis)`**：将 `src/node/genesisNode.js` 中 Swarm Agent 的 `INITIAL_BALANCE` 从
  `50_000_000n` 改为 `0n`。新创建的 swarm worker 不再从 genesis 直接获得代币，
  必须通过贡献任务从 Swarm Pool 领取奖励（与白皮书代币模型一致）。
- **`fix(api)`**：修复 `src/http/routes/bootstrapApi.js` 中 `computeActualCirculatingSupply()`
  未正确排除 `swarm-*` Agent 余额的问题。原代码使用错误的字段名 `w.id`，已修正为 `w.agentId`
  并使用 `String(w.agentId || '').startsWith('swarm-')` 进行过滤。
- **`fix(deploy)`**：重写 `.github/workflows/deploy.yml`，将部署方式从 Docker 改为 PM2
  （生产服务器 Docker 已被移除）。使用 `appleboy/ssh-action@v1.0.3` 通过 SSH 执行
  `git fetch + reset --hard + npm ci --omit=dev + pm2 restart`。
- **`fix(ci)`**：简化 `.github/workflows/ci.yml`，移除已失效的 Docker build job，
  仅保留 test 与 lint。
- **`fix(test)`**：修正 `package.json` 中 `test` 脚本，从 `node --test test/` 改为
  `node --test test/*.test.js`，修复 Windows PowerShell 下通配符解析问题。

#### 🔧 变更 (Changed)

- Swarm Agent Worker 经济模型：从「genesis 直接分配初始余额」改为「从 Swarm Pool 按贡献领取」。
- `actualCirculatingSupply` 计算逻辑：排除所有 `swarm-*` Agent 的余额（即使有残留也不计入流通量）。

#### 📚 文档 (Documentation)

- 新增 [`docs/TOKEN_RECALL_AUDIT_REPORT.md`](docs/TOKEN_RECALL_AUDIT_REPORT.md)：
  代币回收审计报告，包含完整的交易哈希、余额变化详情、网络状态对比与审计结论。
- 新增 `CHANGELOG.md`：本文件。

#### 📝 备注

本次回收为对历史超发的善后操作，非白皮书规定的常规代币燃烧流程。
未来 Swarm Agent 钱包的初始余额由 `agentWalletManager.DEFAULT_INITIAL_BALANCE = 1000n`
（水龙头领取）控制，不再由 genesis 直接分配。

---

<!-- 后续版本变更请按以下模板追加：

## [x.y.z] - YYYY-MM-DD

### 新增 (Added)
- ...

### 变更 (Changed)
- ...

### 修复 (Fixed)
- ...

### 移除 (Removed)
- ...

-->
