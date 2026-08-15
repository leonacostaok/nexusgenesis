# NexusGenesis 五大技术障碍增强 — 整改结果报告

> 面向技术团队复核  
> 日期: 2026-08-15  
> 覆盖范围: packages/agent-keys（核心安全包）

---

## 目录

1. [Barrier 1: 内存安全 — 密钥残留与侧信道泄露](#barrier-1-内存安全)
2. [Barrier 2: 进程隔离 — 密钥材料进程级泄露](#barrier-2-进程隔离)
3. [Barrier 3: 权限粒度 — Agent 全有全无授权](#barrier-3-权限粒度)
4. [Barrier 4: 策略僵化 — 无梯度授权与变更延迟](#barrier-4-策略僵化)
5. [Barrier 5: 后量子密码兼容 — 椭圆曲线陈旧的未来风险](#barrier-5-后量子密码兼容)
6. [交叉复核质量报告](#6-交叉复核质量报告)
7. [未完成项与风险](#7-未完成项与风险)

---

## Barrier 1: 内存安全

### 原始问题

私钥以连续明文形态驻留 V8 堆内存，攻击者可通过以下方式提取：
- 内存 dump（`/proc/.../mem`）
- Core dump 落盘
- Swap 分区读取
- V8 堆快照

### 整改措施

#### 1.1 `secureZero()` — 确定性覆写（[secure.js#L41-L53](../packages/agent-keys/src/secure.js#L41-L53))

```js
export function secureZero(...bufs) {
  for (const buf of bufs) {
    if (buf == null) continue;
    if (Buffer.isBuffer(buf) || buf instanceof Uint8Array) {
      buf.fill(0);  // 同步覆写底层 ArrayBuffer，不依赖 GC
    }
  }
}
```

- 同步调用，立即生效，不依赖垃圾回收时机
- 接受 `Buffer | Uint8Array | null | undefined`，调用方无需提前分支
- 只读/分离视图静默跳过（不抛异常）

#### 1.2 `ShardedSecret` — 2-of-2 XOR 内存分片（[secure.js#L83-L194](../packages/agent-keys/src/secure.js#L83-L194))

```
shardA = randomBytes(len)
shardB = secret XOR shardA
→ 两个分片存放在不连续内存区域
→ 任一分片单独泄漏不泄露任何信息（信息论安全的一次一密）
→ 重建 = shardA XOR shardB（仅在签名期间存活，finally 中立即清零）
```

**核心 API：**

| 方法 | 说明 |
|------|------|
| `new ShardedSecret(secret)` | 构造时立即分片，输入 buffer 被 `secureZero` 覆盖 |
| `use(fn)` | 推荐用法：重建明文 → 调用 fn → finally 中零化，明文永不超出回调 |
| `destroy()` | 销毁两个分片，幂等，实例不可再用 |
| `exportShards()` | 导出分片副本（用于持久化），不影响内存中分片 |
| `isDestroyed` | 检查实例是否已销毁 |

**接入点：**

| 文件 | 用法 |
|------|------|
| [signer-worker.js](../packages/agent-keys/src/signer-worker.js#L92) | 初始化时 `new ShardedSecret(privateKey)`，签名时 `sharded.use(pk => signSync(...))` |
| [MCP server.js](../packages/agent-keys-mcp/src/server.js#L79) | 密钥初始化后转为 ShardedSecret |
| [CLI cli.js](../packages/agent-keys-cli/src/cli.js#L62) | `loadKey()` 返回 ShardedSecret 实例 |

#### 1.3 `PQCWallet.destroy()` — 钱包级清理（[wallet.js](../packages/agent-keys/src/wallet.js)）

- 调用 `sharded.destroy()` 销毁分片
- 清除内部状态引用
- 幂等设计

#### 1.4 `disableCoreDumps()` — 进程级防御（[secure.js#L201-L211](../packages/agent-keys/src/secure.js#L201-L211))

```js
export function disableCoreDumps() {
  try {
    if (typeof process.setrlimit === 'function') {
      process.setrlimit('core', { soft: 0, hard: 0 });
      return true;
    }
  } catch { /* Windows / 受限环境 */ }
  return false;
}
```

- signer-worker.js 和 MCP/CLI 入口均调用
- 配合 OS 级配置（encrypted swap / mlock / 容器 seccomp）提供纵深防御

#### 1.5 攻击测试套件（[test/attack-simulations/](../packages/agent-keys/test/attack-simulations/)）

| 脚本 | 模拟场景 | 威胁 |
|------|---------|------|
| core-dump-sim.js | `process.abort()` 触发 core dump | 落盘泄露 |
| mem-scan-sim.js | 读取 `/proc/self/mem` | 运行时内存提取 |
| env-leak-sim.js | 检查 `/proc/self/environ` | 环境变量泄露 |
| swap-scan-sim.js | 模拟 swap 分页 | 交换分区泄露 |

#### 1.6 边界声明文档（[secure.js 文件头注释](../packages/agent-keys/src/secure.js#L1-L49))

诚实披露本软件层**不能**做到的事：
- V8 栈上临时拷贝 / JIT 中间数据无法覆盖
- 被调用库（@noble/post-quantum）内部副本
- DMA 攻击 / 冷启动 / JTAG 硬件探针等物理攻击（需 TEE 域）
- 详情见 Barrier 2 物理攻击边界声明

### 验证数据

- **内存卫生测试**: 16 项（[memory-hygiene.test.js](../packages/agent-keys/test/memory-hygiene.test.js)）
- **安全边界测试**: 若干（[security-boundary.test.js](../packages/agent-keys/test/security-boundary.test.js)）
- 全部 105 测试通过

---

## Barrier 2: 进程隔离

### 原始问题

密钥材料与 Agent 业务逻辑运行在同一进程内，任意第三方库漏洞（依赖投毒/原型链污染/恶意 npm 包）都能直接读取密钥。

### 整改措施

#### 2.1 Signer 子进程架构（[signer.js](../packages/agent-keys/src/signer.js) + [signer-worker.js](../packages/agent-keys/src/signer-worker.js))

```
┌──────────────────────┐     stdio (JSON-line)     ┌──────────────────────┐
│  父进程 (Agent)       │ ←────────────────────────→ │  Signer 子进程       │
│  无密钥访问权限       │       IPC 协议             │  ShardedSecret 持有  │
│  只能发 hash 取签名   │                           │  无网络/文件访问     │
└──────────────────────┘                           └──────────────────────┘
```

**IPC 协议：**

```
父进程 → 子进程:  {"type":"init",    "envelope":..., "password":..., "policy":...}
子进程 → 父进程:  {"type":"init_ok", "address":"ng1..."}
父进程 → 子进程:  {"type":"sign",    "requestId":1, "hash":"0x...", "amount":"..."}
子进程 → 父进程:  {"type":"signature","requestId":1, "sig":"0x..."}
                  {"type":"sign_timelock","requestId":1, "timelockMs":86400000, ...}
                  {"type":"sign_fail","requestId":1, "error":"..."}
```

**安全设计：**

| 防护 | 实现方式 |
|------|---------|
| 密钥永不传入父进程 | 仅在子进程内解密，以 ShardedSecret 持有 |
| 无网络访问 | 子进程无 listening socket，无 outbound 连接 |
| 无文件系统访问 | 初始化后不再读取文件 |
| 密码不暴露 | 通过 IPC（Unix socket / named pipe）传递，非 env/cmdline |
| 空闲超时自动退出 | 默认 5 分钟无请求自动退出 |
| 1 MiB 消息上限 | 防止 OOM / swap 侧信道 |
| 密码强度校验 | 最少 8 字符 |
| 信封格式校验 | `isValidEnvelope()` 拒绝畸形输入 |
| Core dump 禁止 | 入口调用 `disableCoreDumps()` |

#### 2.2 物理攻击防御边界声明（[secure.js 文件头](../packages/agent-keys/src/secure.js#L1-L49))

完整威胁象限矩阵：

```
┌──────────────┬──────────────────┬──────────────────┐
│              │ 软件攻击         │ 物理攻击         │
├──────────────┼──────────────────┼──────────────────┤
│ 运行时内存   │ ShardedSecret    │ ❌ 需 TEE        │
│              │ + secureZero     │ (Nitro/SEV-SNP)  │
├──────────────┼──────────────────┼──────────────────┤
│ 持久化存储   │ 加密信封(AES)    │ ❌ 需 HSM        │
│              │ + PBKDF2         │                  │
├──────────────┼──────────────────┼──────────────────┤
│ 进程间       │ Signer 子进程    │ ❌ 需 TEE        │
│              │ + IPC 隔离       │                  │
└──────────────┴──────────────────┴──────────────────┘
```

具体物理攻击向量及缓解：

| 攻击 | 软件缓解 | TEE 方案 |
|------|---------|---------|
| DMA (PCIe/Thunderbolt) | IOMMU + VT-d + 物理端口禁用 | Nitro Enclaves 内存隔离 |
| 冷启动 (RAM 残留) | 全盘加密 + 快速关机 | SEV-SNP 内存加密 |
| JTAG/SWD 调试接口 | eFuse 熔断 + 安全启动 | 芯片级熔断 |
| 物理芯片剥离 | 无缓解 | HSM / 硬件钱包冷存储 |

### 验证数据

- **Signer 测试**: 11 项 E2E 测试（[signer.test.js](../packages/agent-keys/test/signer.test.js)），每个测试真实 spawn 子进程并通过 stdio IPC 通信
- **amount-hash 不可链接性**: 已文档化为 KNOWN LIMITATION（[signer.js#L41-L60](../packages/agent-keys/src/signer.js#L41-L60)）

---

## Barrier 3: 权限粒度

### 原始问题

Agent 持有的密钥一旦授权，即可执行**任意操作**——无合约白名单、无方法白名单、无链限定、无交易限额、无过期时间。这是"全有全无"的授权模型，与被攻陷即全损等价。

### 整改措施

#### 3.1 Session Key 五维权限（[session.js](../packages/agent-keys/src/session.js))

**创建 session key：**

```js
const session = createSessionKey(masterPrivateKey, {
  agentId: 'agent-01',
  allowedContracts: ['0xToken...', '0xStaking...'],  // 合约白名单
  allowedMethods: ['transfer', 'stake'],                // 方法白名单
  allowedChains: ['ethereum', 'polygon'],               // 链限定
  maxPerTx: '100',                                      // 单笔上限
  maxDaily: '1000',                                     // 日累计上限
  ttl: 24 * 60 * 60 * 1000,                             // 过期时间 (1 天)
});
```

**访问控制检查：**

```js
const result = checkSessionAccess(session, {
  contract: '0xToken...',
  method: 'transfer',
  chain: 'ethereum',
  amount: '50',
});
// → { allowed: true }
```

**签名验证：**

```js
const valid = await verifySessionSignature(session, issuerPublicKey);
// → true/false（防止篡改）
```

**五维白名单机制：**

| 维度 | 检查规则 | 空数组行为 |
|------|---------|-----------|
| 合约 | `allowedContracts` 包含目标合约 | 放行所有合约 |
| 方法 | `allowedMethods` 包含目标方法 | 放行所有方法 |
| 链 | `allowedChains` 包含目标链（大小写不敏感） | 放行所有链 |
| 单笔 | `amount ≤ maxPerTx` | 0 表示不检查 |
| 日累计 | `spentToday + amount ≤ maxDaily` | 0 表示不检查 |

**安全加固：**

- 输入校验：`BigInt()` 非法输入（如 `'abc'`、空字符串）被 try-catch 捕获并 fail-closed 拒绝
- 过期检查：`TTL` 范围 1 分钟 ~ 365 天，服务端验证 `expiresAt`
- 篡改保护：`signature` 字段覆盖所有 scope 字段，任何字段修改后 `verifySessionSignature` 返回 false

#### 3.2 导出符号

```js
import {
  createSessionKey,      // 创建会话密钥
  checkSessionAccess,    // 五维权限检查
  verifySessionSignature, // 签名验证
  getSessionTTL,         // 获取剩余 TTL（ms）
  isSessionExpired,      // 是否过期（布尔）
} from 'nexusgenesis-agent-keys';
```

### 验证数据

- **Session Key 测试**: 17 项（[session.test.js](../packages/agent-keys/test/session.test.js)）
- 覆盖：正常创建、过期拒绝、非法输入拒绝、篡改检测、跨链白名单、日累计限额

---

## Barrier 4: 策略僵化

### 原始问题

Spend policy 只有"无限额 / 有限额 / 需审批"三档**静态**模式，且策略变更即时生效——攻陷 Agent 即可将策略调为"无限额"并立即提空。

### 整改措施

#### 4.1 三级梯度授权（[takeover.js#L80-L180](../packages/agent-keys/src/takeover.js#L80-L180))

基于金额的自动授权，阈值可配置：

| 档位 | 阈值 | 行为 | 人类可撤销 |
|------|------|------|-----------|
| **small-auto** | < 10 NGEN | 自动签名，零延迟 | N/A |
| **medium-timelock** | 10 - 100 NGEN | 24h 时间锁，到期自动签名 | 是（24h 窗口内） |
| **large-require-approval** | ≥ 100 NGEN | 需人类离线签名 | 隐含 |

**核心 API：**

```js
const tier = resolveTier(amount, thresholds);
// → 'small-auto' | 'medium-timelock' | 'large-require-approval'

const result = checkSpendAllowedTiered(config, { amount, spentToday });
// → { allowed: true/false, tier, timelockMs?, scheduledAt?, revocable?, requiresApproval? }
```

**安全设计：**

- 无 amount 时 fail-closed（返回 `requiresApproval`）
- 阈值反转（small ≥ large）时默认 REQUIRE_APPROVAL
- 非法金额字符串 fail-closed（try-catch 兜底）
- 默认阈值常量 `DEFAULT_TIER_THRESHOLDS = { SMALL: '10', LARGE: '100' }`

#### 4.2 策略变更时间锁（[takeover.js#L182-L280](../packages/agent-keys/src/takeover.js#L182-L280))

```js
const timelock = new PolicyTimelock();

// 调度策略变更（默认 48h 延迟生效）
const { changeId, effectiveAt } = timelock.scheduleChange(agentId, newPolicy);

// 撤销（在时间锁窗口内）
timelock.revokeChange(changeId);

// 获取已生效的变更
const changes = timelock.getEffectiveChanges();

// 紧急撤销所有挂起变更
timelock.clearAll();
```

**意义：** 即使 Agent 被攻陷，攻击者也无法立即将策略从 `small-auto` 改为 `unlimited`——48h 内人类可撤销。

#### 4.3 Signer 子进程集成（[signer-worker.js#L107-L155](../packages/agent-keys/src/signer-worker.js#L107-L155))

```js
// 签名请求的处理流程
case 'sign': {
  // 1. 策略检查
  const tiered = checkSpendAllowedTiered(policy, { amount: msg.amount, hash: msg.hash });
  if (!tiered.allowed) {
    respond({ type: 'sign_fail', requestId: msg.requestId, error: tiered.reason });
    return;
  }
  // 2. 中额时间锁
  if (tiered.timelockMs) {
    respond({ type: 'sign_timelock', requestId: msg.requestId, ...tiered });
    return;
  }
  // 3. 小额自动签名
  const sigHex = sharded.use(pk => signSync(hash, pk).toString('hex'));
  respond({ type: 'signature', requestId: msg.requestId, sig: '0x' + sigHex });
}
```

### 验证数据

- **三级授权测试**: 30 项（[takeover-tiered.test.js](../packages/agent-keys/test/takeover-tiered.test.js)）
- 覆盖：三档边界值、非法金额、无 amount 拒绝、阈值反转、时间锁调度/撤销/过期

---

## Barrier 5: 后量子密码兼容

### 原始问题

NexusGenesis 早期使用 ECDSA/EdDSA 签名，面临量子计算威胁（Shor 算法可破解 ECDSA，Grover 可加速哈希碰撞）。无滚降路径，无迁移计划。

### 整改措施

#### 5.1 Dilithium2 集成（[pqc.js](../packages/agent-keys/src/pqc.js))

基于 `@noble/post-quantum`（NIST FIPS 204 ML-DSA 标准实现）：

```js
const { publicKey, privateKey } = await generateKeyPair();
const signature = await sign(message, privateKey);
const valid = await verify(message, signature, publicKey);
```

**密钥尺寸对比：**

| 算法 | 公钥 (bytes) | 私钥 (bytes) | 签名 (bytes) |
|------|-------------|-------------|-------------|
| Dilithium2 (FIPS 204) | 1,312 | 2,560 | 2,420 |
| ECDSA P-256 | 91 | 138 | 64 |
| EdDSA Ed25519 | 44 | 48 | 64 |

> 脚注：以上为裸密钥长度。DER 编码（标准 PEM 格式）后 Dilithium2 公钥约 1,352 bytes，ECDSA 约 120 bytes，Ed25519 约 72 bytes。裸密钥对比约 14-28x，DER 编码后约 11-19x。

**性能对比（100 次迭代平均，[bench/pqc-benchmark.js](../packages/agent-keys/bench/pqc-benchmark.js)）：**

| 操作 | Dilithium2 (ms) | ECDSA P-256 (ms) | EdDSA Ed25519 (ms) |
|------|----------------|-----------------|-------------------|
| Key Generation | 1.677 | 0.062 | 0.053 |
| Signing | 6.300 | 0.057 | 0.051 |
| Verification | 1.681 | 0.012 | 0.128 |

Dilithium2 签名比 ECDSA 慢约 110x，但对 Agent 场景（毫秒级响应）是可接受的——**安全性的提升远大于延迟成本**。

#### 5.2 信任链声明（[pqc.js 文件头注释](../packages/agent-keys/src/pqc.js#L7-L28))

```
@noble/post-quantum 是唯一 PQC 依赖。@noble 系列是经过最广泛审计的 JS 加密栈：
  - @noble/hashes: 12M+ 周 npm 下载量，被 MetaMask/ethers.js 使用
  - @noble/curves: 5M+ 周下载量，被以太坊共识客户端使用
  - @noble/post-quantum: 实现 FIPS 204 (ML-DSA) 和 FIPS 205 (SLH-DSA)
  - 纯 JS，无 WASM，无原生绑定，无构建步骤——可审计
```

#### 5.3 KEY_MODELS 三档信任假设决策树（[derivation.js#L25-L29](../packages/agent-keys/src/derivation.js#L25-L29))

```js
export const KEY_MODELS = {
  HYBRID: 'hybrid',           // 人类 master key + Agent 操作密钥（推荐）
  SELF_SOVEREIGN: 'self-sovereign',  // Agent 完全自管理（无人类介入）
  SERVER_MANAGED: 'server-managed',  // 服务器托管密钥（旧版，已标记不安全）
};
```

**决策树：**

```
Agent 是否完全自主？       → self-sovereign
人类是否持有 master key？  → hybrid（推荐）
是否遗留中心化部署？       → server-managed（标记不安全，不支持新功能）
```

#### 5.4 多实例高可用方案（[pqc.js 文件头 + OPERATIONS.md](../docs/OPERATIONS.md#1-deployment-topology))

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Signer #1  │  │  Signer #2  │  │  Signer #3  │
│  (replica)  │  │  (replica)  │  │  (replica)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                ┌───────┴───────┐
                │  Local Proxy  │
                │  (HAProxy)    │
                └───────┬───────┘
                        │
                ┌───────┴───────┐
                │  Agent App    │
                └───────────────┘
```

- Signer 实例无状态，每个实例持有相同密钥信封
- 无需 leader election，任意实例可服务任意请求
- 推荐 2-3 副本用于 HA，1 用于开发环境

### 验证数据

- 基准测试: `node bench/pqc-benchmark.js`（100 次迭代，各指标稳定）
- 密钥派生确定性验证: `deriveOpKeySeed()` 相同 seed 始终产生相同密钥对

---

## 6. 交叉复核质量报告

三次独立交叉复核（Wave 1 / Wave 2 / Wave 3）：

| 复核轮次 | 发现缺陷 | 其中 P0 | 其中 P1 | 测试结果 |
|---------|---------|---------|---------|---------|
| Wave 1 复核 | 3 项 | 1 | 1 | 105/105 |
| Wave 2 首次复核 | 9 项 | 2 | 2 | 90+14→104/104 |
| Wave 2 深度复核 | 5 项 | 0 | 0 | 105/105 |
| Wave 3 复核 | 11 项 | 2 | 3 | 105/105 + 14+12 E2E |

**P0 缺陷根因（均已修复并回归验证）：**

| 缺陷 | 根因 | 修复 |
|------|------|------|
| Wave 2 P0-1: Worker 策略量形同虚设 | IPC 协议不携带 amount，policy.maxPerTx 冒充金额 | 扩展 IPC 协议，worker 用真实金额检查 |
| Wave 2 P0-2: checkSpendAllowedTiered fail-open | 无 amount 时返回 `allowed:true` | 改为 fail-closed 返回 requiresApproval |
| Wave 3 P0-1: Docker 镜像不可用 | 构建阶段无 npm install，file: 依赖逃逸 build context | 完全重写，repo-root context，显式组装 node_modules |
| Wave 3 P0-2: 时间锁安全绕过 | CLI/MCP 只检查 `allowed` 布尔，medium 档立即签名 | 三段式：拒绝/扣留/放行，与 signer-worker 对齐 |

### 最终测试状态

| 测试套件 | 数量 | 结果 |
|---------|------|------|
| agent-keys 核心 | 105 项 | ✅ 全部通过 |
| CLI E2E (e2e-smoke.mjs) | 14 项 | ✅ 全部通过 |
| MCP 冒烟 (mcp-smoke.mjs) | 8 项 | ✅ 全部通过 |
| MCP 签名分级 (mcp-sign-tier.mjs) | 4 项 | ✅ 全部通过 |

---

## 7. 未完成项与风险

### 已知限制（已文档化，不修复）

| 限制 | 风险 | 缓解策略 |
|------|------|---------|
| amount-hash 不可链接性 | 被攻陷父进程可发送假 amount 绕过策略检查 | Session key 层验证 / 大额人工审查 / 未来 ZK 方案 |
| PolicyTimelock 进程内调度 | 重启后挂起变更丢失 | 生产部署需持久层（Redis/链上） |
| Session Key 无撤销机制 | 泄露后只能等 TTL 过期 | 建议 TTL ≤ 24h，Wave 4 拟加 jti/吊销列表 |
| 中额时间锁无自动续签队列 | 调用方需自行调到期重试 | 已在 Wave 3 CLI/MCP 文档化 |

### 计划内未启动

| 阶段 | 任务 | 说明 |
|------|------|------|
| B1 | 第一篇技术文章 | PQC Agent 密钥自托管实战，未启动 |
| B2 | PR #1086 处置跟进 | 等待社区反馈 |
| B3 | npm 供应链加固 | 需 npm 账号配置 provenance |
| B4 | Agent Runtime SDK 示例 | 依赖 B1/B2 完成后的生态基础 |
| C1 | 异地节点 | 所有节点同机，单点故障风险 |
| C2 | 验证者扩容 | 4→7+ |
| C3 | 常驻监控 Agent | 无人值守自治样板 |
| D1-D3 | 治理激活 | 依赖 M1-M3 完成 |

### 最大风险

1. **异地节点缺失（C1）**：当前所有共识节点在同一台机器上，宕机即全网停
2. **技术文章未启动（B1）**：唯一未启动的外部增长动作，是 PR 引流与商业化的关键入口
---

## 第二轮强化：专家复核意见落地（2026-08-15）

外部专家对五大障碍整改给出正面结论，并提了 5 项"锦上添花"建议，全部落地：

| # | 专家建议 | 落地实现 | 验证 |
|---|---------|---------|------|
| E1 | V8 堆快照残留验证 | `test/heap-snapshot.test.js` + `attack-simulations/heap-snapshot-sim.js`：父子进程隔离设计（secret 仅存在于父进程），子进程分片→临时拼接→销毁→GC→全堆 dump，父进程扫描二进制与 hex 两种形态 | 实证通过：GC 后无连续明文残留 |
| E2 | Signer 子进程最小权限 | `signer-worker.js` 引导段：`NGX_SIGNER_DOWNGRADE=1` 且以 root 启动时降级为 nobody（降级失败即拒绝启动）；`deploy/seccomp/signer-seccomp.json` 参考白名单（defaultAction=ERRNO） | POSIX 降级逻辑 + seccomp profile（需 Linux 环境实测） |
| E3 | 权限只降不升刚性规则 | `session.js` 新增 `narrowSession()`：五维全部单向收窄——白名单子集校验、显式空数组/`'0'` 视为放开并拒绝、限额只降、过期钳制到父会话；省略维度=继承父作用域 | 10 项新增测试 |
| E4 | 策略变更告警闭环 | `takeover.js` PolicyTimelock 新增 `addNotifier()` + `POLICY_WEBHOOK_URL` 环境变量：scheduled/revoked/effective/cleared 四类生命周期事件，webhook 5s 超时 fire-and-forget，notifier 异常不阻断执行路径 | 6 项新增测试（含真实 HTTP 回调验证） |
| E5 | 审计边界严谨表述 | `pqc.js` Trust Chain Statement 重写为 AUDIT BOUNDARY 段：明确 @noble 原语已独立审计 vs NexusGenesis 组合层未审计，给出正确引用措辞 | 文档 |

**过程插曲**：本轮编辑曾误将 signer-worker 的 import 行回退为旧符号，导致 `checkSpendAllowedTiered is not defined`（3 个 signer 测试失败），交叉测试当场捕获并已修复。教训与 Wave 3 复核结论一致——编辑既有文件必须先读当前内容。

**回归验证**：121/121 单测 + CLI E2E 14 项 + MCP 冒烟 12 项全部通过。
