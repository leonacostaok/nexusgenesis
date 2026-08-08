# NexusGenesis

> **Agent 自治的安全密钥与协调标准层 — Security & Coordination Layer for Autonomous Agents**
>
> 让 AI Agent 拥有**自持密钥、跨链自治、人类随时可接管**的安全底座。私钥永不离开 Agent/浏览器。
>
> ⚠️ **Experimental / Bootstrap**. 这是实验性项目。不进行募资或二级市场交易。
>
> **NGEN Token Classification**: NGEN is a **network utility token** (网络效用代币) for use within the NexusGenesis ecosystem only. It is **NOT** an investment product, security, or financial instrument. The project makes **NO promises** regarding external value, exchange listing, or returns. See [docs/LEGAL_DISCLAIMER.md](docs/LEGAL_DISCLAIMER.md) for full legal disclaimer.
>
> 🚫 **Not affiliated with nexus.xyz** or any other Nexus-branded project.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)

---

## 核心差异化

市面上的 Agent 框架密钥模型多为"私钥托管在服务器"或"私钥在内存"。NexusGenesis 实现了完整的不同链路：

> **私钥永远不出浏览器/Agent 本地 + 人类可随时接管 + Dilithium2 抗量子签名（NIST FIPS 204）**

- **PQC 根身份** — 真实 Dilithium2 / ml_dsa44，抗量子（FIPS 204）
- **多链派生** — 一个根身份确定性派生出 nexus / ethereum / solana 地址
- **人类接管** — `unlimited / limit / require-approval` 三种 spend 模式，接管即冻结
- **零托管** — 私钥只加密 envelope 存本地，永不发出

---

## 📦 包（monorepo）

| 包 | 说明 | 测试 |
|----|------|------|
| [`nexusgenesis-agent-keys`](packages/agent-keys) | 纯密钥库：PQC、AES-256-GCM 加密、三层密钥派生、人类接管、custody token | 17 ✅ |
| [`nexusgenesis-agent-sdk`](packages/agent-sdk) | Agent 框架：`keys`（安全）+ `coordination`（任务/声誉），链无关可插拔 transport | 6 ✅ |
| [`nexusgenesis-chain-eth`](packages/chain-eth) | ETH 适配器：HKDF 派生 secp256k1 → EIP-55 地址 + EIP-191 签名 | 9 ✅ |
| [`nexusgenesis-chain-sol`](packages/chain-sol) | SOL 适配器：派生 ed25519 → base58 地址 + 签名 | 6 ✅ |
| [`nexusgenesis-chain-adapters`](packages/chain-adapters) | 跨链注册表：一个根身份 → nexus/eth/sol 多链地址 | 5 ✅ |
| [`nexusgenesis-mcp`](mcp-server) | MCP 安全工具集：`generate_agent_keys` / `verify_signature` / `check_spend` / `takeover_guard` | — |

> 全部 **43 项测试全绿**。每个包可独立 `npm publish`。

---

## 🚀 快速开始

```bash
# 克隆后安装所有包
git clone https://github.com/nexus-genesis/nexusgenesis.git
cd nexusgenesis
npm install
```

### 生成一个抗量子 Agent 身份

```js
import { createAgentIdentity, recoverAgentIdentity } from 'nexusgenesis-agent-sdk';

// 私钥被 AES-256-GCM 加密，永不离开本进程
const identity = await createAgentIdentity({ password: 'agent-secret-123' });
// { address: 'ng1...', publicKeyHex, envelope, keyModel: 'self-sovereign' }

// 需要时仅在本机恢复
const wallet = recoverAgentIdentity(identity.envelope, 'agent-secret-123');
```

### 一个根身份 → 多链地址

```js
import { deriveChainAddresses } from 'nexusgenesis-chain-adapters';

const addrs = deriveChainAddresses(pqcPublicKey, pqcPrivateKey);
// { nexus: 'ng1...', eth: '0x...', sol: '6PT...' }
```

### 跑跨链 demo

```bash
cd examples && npm install && npm run demo
```

---

## 🛡️ 人类接管（差异化核心）

```js
import { takeoverGuard, checkSpendAllowed, SPEND_MODES } from 'nexusgenesis-agent-sdk';

// 操作前捕获自治状态
const before = { type: SPEND_MODES.UNLIMITED };
// 操作验证人类未在过程中接管：
if (takeoverGuard(before, { type: SPEND_MODES.UNLIMITED })) {
  // 可安全提交价值转移
}

// 强制 spend 上限：
checkSpendAllowed({ type: 'limit', maxPerTx: 100 }, { amount: 50 });
// { allowed: true }
```

在 EVM 上，spend 模式映射为守护合约策略：

```js
import { mapSpendToGuardianPolicy } from 'nexusgenesis-chain-eth';
mapSpendToGuardianPolicy({ type: 'require-approval' });
// { policy: 'require-approval', maxPerTx: '0', maxDaily: '0' }
```

---

## 🤖 MCP 接入

任何 LLM 客户端可通过 MCP 安全地管理 Agent 密钥（私钥本地生成，不离开调用方）：

```
generate_agent_keys   — 生成自持身份（PQC 密钥 + ng1 地址 + 加密 envelope）
verify_signature      — 验证 Dilithium2 签名
check_spend           — 检查 spend 是否在人类设定上限内
takeover_guard        — 人类接管护栏
```

```bash
cd mcp-server && npm install && npm start
```

---

## 🤝 协调协议（链无关）

Agent 通过 [NGAP v1.0.0](NGAP_SPECIFICATION.md) 接入协调协议：注册 → 发现任务 → 认领 → 执行 → 获得奖励 → 积累声誉 → 参与治理。transport 可插拔（HTTP / 内存 / 任意链适配器）。

---

## 🧪 测试

```bash
cd packages/agent-keys && npm test      # 17
cd packages/agent-sdk && npm test       # 6
cd packages/chain-eth && npm test       # 9
cd packages/chain-sol && npm test       # 6
cd packages/chain-adapters && npm test  # 5
```

---

## 🧱 遗留：独立 L1 devnet（演示环境）

> **状态**: 已降级为 devnet / 演示环境。不再投入运营资源，仍是可复现的参考实现。

NexusGenesis 曾作为独立 L1 测试网运行（多领导者 BFT + PQC + Agent 网络，`nexus-genesis.top`）。该部分现作为**演示与参考**保留，核心方向已转向上文的**安全标准层**。相关文档：

- [网络状态 → STATUS.md](STATUS.md)
- [AGENT 宪法 → NEXUS_GENESIS_CONSTITUTION.md](NEXUS_GENESIS_CONSTITUTION.md)
- [方向定稿 + 路线图 → docs/strategic-discussion/04-方向定稿与安全标准层路线图.md](docs/strategic-discussion/04-方向定稿与安全标准层路线图.md)

---

## 安全策略

见 [SECURITY.md](SECURITY.md) 与 [SECURITY_AUDIT.md](SECURITY_AUDIT.md)。

---

## 许可证

MIT License

---

## 资源

- GitHub: [github.com/nexus-genesis/nexusgenesis](https://github.com/nexus-genesis/nexusgenesis)
- 安全标准层路线图: [docs/strategic-discussion/04-方向定稿与安全标准层路线图.md](docs/strategic-discussion/04-方向定稿与安全标准层路线图.md)
- NGAP 规范: [NGAP_SPECIFICATION.md](NGAP_SPECIFICATION.md)
- 跨链 demo: `examples/demo-cross-chain.mjs`
- 安全策略: [SECURITY.md](SECURITY.md)