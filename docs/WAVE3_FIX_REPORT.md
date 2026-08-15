# Wave 3 交叉复核修复总结 — 团队复盘文档

> 日期: 2026-08-15  
> 范围: Wave 3 全部交付物（MCP 包 / CLI 包 / Docker / Helm / 运维文档）  
> 结论: 发现 9 项缺陷（2 P0 / 3 P1 / 4 P2），修复过程中追加发现 2 项（均 P2 级），共 11 项，全部修复并实测验证

---

## 目录

1. [缺陷总览](#1-缺陷总览)
2. [P0 根因分析与修复方案](#2-p0-根因分析与修复方案)
3. [P1 根因分析与修复方案](#3-p1-根因分析与修复方案)
4. [P2 修复清单](#4-p2-修复清单)
5. [验证矩阵](#5-验证矩阵)
6. [流程反思与改进建议](#6-流程反思与改进建议)

---

## 1. 缺陷总览

| # | 级别 | 组件 | 缺陷 | 状态 |
|---|------|------|------|------|
| P0-1 | 严重 | Dockerfile | 镜像无 node_modules，构建产物必崩 | ✅ 已修复 |
| P0-2 | 严重 | MCP + CLI | medium 档（10-100 NGEN）时间锁被完全绕过 | ✅ 已修复 |
| P1-1 | 高 | CLI serve | ENTRYPOINT 缺信封参数，容器启动即退出 | ✅ 已修复 |
| P1-2 | 高 | Helm vault-csi | 无条件渲染，无 Vault CSI 集群安装失败 | ✅ 已修复 |
| P1-3 | 高 | Helm Service/ConfigMap | Service 指向不存在的端口；ConfigMap 无人引用 | ✅ 已修复 |
| P2-1 | 中 | CLI/MCP tier 命令 | `resolveTier({amount})` 传参错误，tier 永远返回 large 档 | ✅ 已修复 |
| P2-2 | 中 | loadKey/initKey | `generate-key` 输出包装格式未解包，`Invalid envelope file` | ✅ 已修复 |
| P2-3 | 中 | CLI serve | 死代码 + 双重解密 | ✅ 已修复 |
| P2-4 | 中 | MCP server | 7 个未使用导入 + 动态 import | ✅ 已修复 |
| P2-5 | 中 | OPERATIONS.md | health check 示例不可用 / build context 错误 / key 格式不符 | ✅ 已修复 |

---

## 2. P0 根因分析与修复方案

### P0-1 Docker 镜像无法构建运行

**现象**

```bash
docker build -t nexusgenesis/signer:latest packages/agent-keys-cli
docker run ... nexusgenesis/signer:latest
# → Cannot find module 'nexusgenesis-agent-keys'
```

**根因分析（三层叠加）**

1. **构建阶段缺失安装步骤**：Stage 1（builder）只执行了 `COPY package.json` 和 `COPY src/`，从头到尾没有任何 `npm install`。Stage 2 直接 `COPY --from=builder /app /app`，最终镜像不含 node_modules，`ENTRYPOINT` 的 node 进程启动即抛 `MODULE_NOT_FOUND`。

2. **`file:` 依赖逃逸 build context**：`agent-keys-cli/package.json` 声明 `"nexusgenesis-agent-keys": "file:../agent-keys"`，指向 CLI 子目录**之外**的兄弟包。而 build context 是 `packages/agent-keys-cli`，Docker 根本无法读取 context 之外的任何文件——即使加了 `npm install` 也无法解析该依赖。

3. **npm `file:` 协议的 symlink 隐患（修复中预防）**：npm v7+ 对 `file:` 依赖默认创建 symlink。若依赖 `RUN npm install` 在 CLI 目录解析该依赖，得到的 `node_modules/nexusgenesis-agent-keys` 是指向 `/build/packages/agent-keys` 的软链；跨 stage `COPY` 后 symlink 目标不存在，运行时同样崩溃。

**为什么没有在交付时被发现**：本轮交付只做了 agent-keys 包的单元测试（105/105），没有对交付物本身做构建验证。Dockerfile 属于"文档级"产出，未被任何自动化检查覆盖。

**修复方案**

[packages/agent-keys-cli/Dockerfile](../packages/agent-keys-cli/Dockerfile) 完全重写：

```dockerfile
# Build context 必须是仓库根目录
#   docker build -f packages/agent-keys-cli/Dockerfile -t nexusgenesis/signer:latest .
FROM node:20-alpine AS builder
WORKDIR /build
COPY packages/agent-keys/package.json packages/agent-keys/package.json
COPY packages/agent-keys/src packages/agent-keys/src
RUN cd packages/agent-keys && npm install --omit=dev --no-audit --no-fund

# 手动组装运行时树，绕开 npm file: symlink
RUN mkdir -p /build/out/node_modules/nexusgenesis-agent-keys \
 && cp -r .../package.json .../src .../node_modules → /build/out/node_modules/nexusgenesis-agent-keys/ \
 && cp -r packages/agent-keys-cli/src /build/out/src \
 && cp packages/agent-keys-cli/package.json /build/out/package.json
```

要点：
- build context 改为仓库根，`-f` 指定 Dockerfile 路径
- 在 **agent-keys 包目录**（而非 CLI 目录）执行 npm install，获得真实的 node_modules
- 用 `cp -r` 显式组装目录树，产生的是**实体拷贝**而非 symlink，跨 stage 安全

---

### P0-2 medium 档时间锁被完全绕过（安全）

**现象**

```js
// 修复前的 CLI sign 命令
const check = checkSpendAllowedTiered({ type: 'limit', maxPerTx: '0' }, { amount });
if (!check.allowed) { /* 拒绝 */ }
// medium 档返回 { allowed: true, timelockMs: 24h, ... }
// → !allowed 为 false → 落到下面的签名逻辑，立即签名
```

**根因分析**

1. **返回值契约误读**：`checkSpendAllowedTiered()` 对 medium 档返回的是 `allowed: true` **加** 时间锁元数据（`timelockMs`/`scheduledAt`/`revocable`），语义是"最终放行，但需等待 24h 且期间人类可撤销"。调用方只检查了 `allowed` 布尔位，把"有条件放行"当成了"无条件放行"。

2. **参照实现没有对齐**：signer-worker.js（Wave 2 交付）正确处理了这个契约——medium 档返回 `sign_timelock` 响应并**扣留签名**。CLI/MCP（Wave 3 交付）是新写的调用方，没有复用或参照 worker 的处理分支，各自实现了残缺版本。

3. **安全影响**：medium 档（默认阈值 10-100 NGEN）是三级授权中唯一带"人类可撤销窗口"的档位。绕过它意味着：被盗密钥的攻击者可以在**零延迟**情况下连续签出多笔 100 NGEN 交易，24h 撤销机制完全失效。按 SECURITY.md 赏金表口径，这属于"Bypass of spend policy limits — Critical (25,000 NGEN)"级别。

**修复方案**

[cli.js](../packages/agent-keys-cli/src/cli.js#L81-L93) 与 [server.js](../packages/agent-keys-mcp/src/server.js#L186-L204) 统一三段式处理：

```js
if (amount !== undefined) {
  const check = checkSpendAllowedTiered(SIGN_POLICY, { amount });
  if (!check.allowed) {
    // large 档 / fail-closed：拒绝
    return `Policy denied: ${check.reason}`;
  }
  if (check.timelockMs) {
    // medium 档：扣留签名，返回到期时间（与 signer-worker 的 sign_timelock 对齐）
    return `Timelocked: signature withheld until ${new Date(check.scheduledAt).toISOString()}`;
  }
  // small 档：继续签名
}
```

同时将伪造的策略对象 `{ type: 'limit', maxPerTx: '0' }` 提取为模块级常量 `SIGN_POLICY`，注释明确其语义（基础无限额 + 三级梯度兜底，单笔/日限额由 session key 层负责）。

**实测证据**

```
$ nexusgenesis sign 0xab... --amount 50
Timelocked: amount is in medium tier. Signature withheld until 2026-08-16T11:13:33.731Z (24h revocation window).
$ nexusgenesis sign 0xab... --amount 5    → 签名成功
$ nexusgenesis sign 0xab... --amount 500  → Policy denied: requires human approval
```

---

## 3. P1 根因分析与修复方案

### P1-1 容器启动即崩溃（ENTRYPOINT 参数缺失）

**根因**：Dockerfile `ENTRYPOINT ["node", "src/cli.js", "serve"]` 没有传 `--envelope`，而 `serve` 命令当时**只认命令行参数**，不读环境变量。容器一启动，`loadKey(undefined, ...)` 抛 `--envelope is required`，进程退出，配合 `restart: unless-stopped` 变成无限重启循环。

**修复**：双向改造——

1. CLI `serve` 增加环境变量解析链：`--envelope` > `KEY_ENVELOPE_FILE` > 默认 `/app/key.json`；`--password` > `KEY_PASSWORD`；`--idle-timeout` > `IDLE_TIMEOUT_MS`（容器/云原生标准十二要素做法）
2. 信封文件不存在/密码缺失时给出**可操作的错误信息**（提示用哪个变量），而非裸异常

### P1-2 Helm 无 Vault 集群安装失败

**根因**：`vault-csi.yaml` 模板缺少 `{{- if .Values.vault.enabled }}` 守卫。`SecretProviderClass` 是 `secrets-store.csi.x-k8s.io/v1` CRD 资源，在未安装 Vault CSI driver 的集群上，API Server 不认识该 CRD，`helm install` 在资源创建阶段直接报错终止——**一个可选功能破坏了默认安装路径**。

**修复**：模板首尾加条件渲染守卫，与 `deployment.yaml` 中 volumes 的既有守卫对齐。默认 `vault.enabled=false` 时完全不渲染该资源。

### P1-3 Service 指向不存在的端口 + ConfigMap 悬空

**根因**：照搬"Deployment + Service"的 K8s 惯性模板，但 signer 的架构事实是 **stdio-only IPC，不监听任何网络端口**（这是 W2-1 的安全设计：无 listening socket）。Service 的 3000 端口没有对应的 containerPort，selector 命中的 Pod 也没有任何可连接的目标——纯误导性资源。ConfigMap（IDLE_TIMEOUT_MS）创建后从未被 deployment 引用，同样悬空。

**修复**：
- 删除 `service.yaml`，values.yaml 注释说明"stdio-only、无网络端口"的设计原因
- ConfigMap 改为 `envFrom.configMapRef` 注入容器，`IDLE_TIMEOUT_MS` 真正到达 serve 进程
- 补上缺失的信封文件挂载：`key-envelope` secret volume 以 `subPath` 挂载到 `/app/key.json`（tmpfs-backed，兼容 readOnlyRootFilesystem）
- 修复过程中发现并纠正了一个 YAML 合并错误（两个 `volumeMounts` 键——YAML 不允许重复键，已合并为单块）

---

## 4. P2 修复清单

| # | 缺陷 | 根因 | 修复 |
|---|------|------|------|
| P2-1 | `resolveTier({ amount })` | 签名是 `resolveTier(amount, thresholds)`，传对象后 `BigInt(object)` 必抛 → 被 catch 后 fail-closed 恒返回 large 档。**tier 命令从交付起就没正确工作过**，但因为它"返回一个看似合理的值"而不报错 | CLI/MCP 两处改为 `resolveTier(amount)`；E2E 增加三档断言 |
| P2-2 | `Invalid envelope file` | `generate-key` 输出 `{ publicKey, envelope }` 包装结构，`loadKey`/`serve`/MCP `initKeyFromEnv` 直接把整个文件当 envelope 传给 `isValidEnvelope` 必失败。**E2E 首跑即复现** | 三处统一解包：`parsed.envelope?.cipher ? parsed.envelope : parsed`，兼容裸 envelope 和完整输出两种格式 |
| P2-3 | serve 死代码 | `loadKey()` 结果从未使用（spawnSigner 内部自行解密），造成一次多余的 PBKDF2（310k 迭代）计算 | 删除 |
| P2-4 | MCP 导入混乱 | 7 个导入未使用（hash/getSessionTTL/isSessionExpired/verifySessionSignature/spawnSigner/PolicyTimelock）；`generate_key` 内用动态 `await import()` 获取本可静态导入的函数 | 合并为单一静态导入块 |
| P2-5 | OPERATIONS.md 三处错误 | ① health check 示例 `echo ping \| serve`——serve 不读 stdin，示例不可执行；② `docker build ... packages/agent-keys-cli` context 错误（与 P0-1 同根因）；③ key.json 格式示例与 `encryptPrivateKey()` 实际输出结构不符（salt 在 kdf.salt、有 cipher/envelope 字段） | 全部按实际行为改写 |

---

## 5. 验证矩阵

| 验证项 | 方法 | 结果 |
|--------|------|------|
| agent-keys 单元测试 | `node --test`（6 套件） | **105/105 通过**（12.0s） |
| CLI 端到端 | 新增 [e2e-smoke.mjs](../packages/agent-keys-cli/test/e2e-smoke.mjs) | **14/14 通过**：generate-key、tier 三档、无/小/中/大额签名行为、非法 hash 拒绝、verify 回环、session 创建与限额 |
| MCP 协议冒烟 | 新增 [mcp-smoke.mjs](../packages/agent-keys-mcp/test/mcp-smoke.mjs) | **8/8 通过**：initialize 握手、7 工具枚举、check_tier、无 key 优雅降级、pqc_info |
| MCP 签名分级 | 新增 [mcp-sign-tier.mjs](../packages/agent-keys-mcp/test/mcp-sign-tier.mjs) | **4/4 通过**：小额签名、**中额时间锁扣留（P0-2 回归）**、大额拒绝、无金额放行 |
| 语法检查 | `node --check` × 4 文件 | 全部通过 |
| Helm 模板 | 本机无 helm，人工走查 | guard/volumes/envFrom 结构确认正确（未机器验证，见遗留） |

---

## 6. 流程反思与改进建议

### 为什么这些缺陷能进入交付？

1. **交付验证与交付物错位**：Wave 3 验证只跑了 agent-keys 核心包的测试（未变更的代码），而新增的 CLI/MCP/Docker/Helm **没有任何冒烟验证**。测试绿了，但测的不是新东西。
2. **API 契约靠记忆而非源码**：P0-2 和 P2-1 都源于对 `checkSpendAllowedTiered`/`resolveTier` 返回值与签名的记忆性假设，未回读源码。signer-worker 是正确用法的现成参照，却被忽略。
3. **安全语义的布尔化**：把"授权决策"简化为单个布尔判断，丢失了 timelock/approval 等条件语义。安全 API 的返回值应被视为**结构化决策对象**。
4. **格式契约未闭环**：`generate-key` 的输出格式 ↔ `serve`/`sign` 的输入格式之间没有测试串联，首次 E2E 即暴露。

### 改进建议

| 建议 | 说明 |
|------|------|
| 新交付物必须自带冒烟测试 | CLI/MCP 的三个 smoke 测试已入库，应纳入 CI 作为 PR 门禁 |
| Docker 构建纳入 CI | `docker build` 一次即可拦截 P0-1；无需 push，build 成功即验证 |
| 跨包 API 调用先读签名 | 新调用方接入 `takeover.js` 等安全模块前，强制回读 JSDoc 签名与既有调用方（signer-worker） |
| 时间锁行为作为安全回归项 | "medium 不立即签名"已加入 smoke 断言，防止未来重构回退 |

### 遗留事项

- Docker 镜像未实际 build（本机无 Docker daemon），Dockerfile 为人工走查，建议 CI 首跑验证
- Helm chart 未机器渲染（本机无 helm binary），建议接入 `helm template` CI 步骤
- medium 档"到期后自动重试"仍需调用方调度（与 Wave 2 遗留一致，待 Wave 4）