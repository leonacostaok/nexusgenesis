# RFC：Smart Account 链上消息传输安全（Transport / Message Security）

> 状态：草案（RFC）— 先定协议，不急着大开发
> 日期：2026-08-22
> 关联：Sprint 3 T3；[SECURITY_SPEC.md](docs/SECURITY_SPEC.md) §1.3 通信安全
> 参考实现：`packages/agent-sdk/src/message-security.js`（最小、注入式、可测）

---

## 1. 目标与范围

本 RFC 为**未来云端 Agent-to-Agent 通信**定义协议层安全基线。当前
`CoordinationClient`（[coordination.js](packages/agent-sdk/src/coordination.js)）是纯 HTTP
客户端，`agent_identity` 仅是明文字符串，任何中间人都可伪造/重放请求。本 RFC
为该缺口定义最小信封协议，使消息具备：

1. **身份认证**（消息签名）
2. **防重放**（nonce + anti-replay 窗口）
3. **防过期**（timestamp 新鲜度）
4. **服务身份**（sender / target，后续演进到 mTLS / service identity）

本 RFC **不**覆盖：传输加密（TLS/mTLS 走既有通道）、密钥分发与轮换、
集中式防重放状态。这些列入演进路线（§6）。

---

## 2. 威胁模型

| 威胁 | 缓解 |
|------|------|
| 伪造消息（冒充某 Agent） | 消息签名，验签失败即拒（fail-closed） |
| 重放（截获后重发同一消息） | nonce + 防重放窗口：同一 (sender, nonce) 只接受一次 |
| 过期/时序攻击（旧消息在状态变化后重放） | timestamp 新鲜度窗口（默认 5 分钟） |
| 明文窃听（Agent 间信道非私密） | 传输层加密（TLS/mTLS），本 RFC 不重复 |
| 目标错误投递 | target 字段入签名预像，防跨服务重放 |

**fail-closed 原则**：验签失败 / nonce 缺失 / 时间戳缺失或过期 / 版本不支持，
一律拒绝，不回退到"无签名可接受"模式。

---

## 3. 消息信封规范

信封是 JSON 对象，字段全部进入签名预像（§4）：

```json
{
  "version": 1,
  "sender": "ng1…agent-did",        // 发送方服务身份
  "target": "ng1…service-did",      // 接收方服务身份
  "payload": { "type": "task_claim", "taskId": "…" },
  "nonce": "m7x2…-ab12",            // 消息唯一标识
  "timestamp": 1787390000000,       // 发送方 epoch 毫秒
  "signature": "0x…"                // §4 签名结果
}
```

- `version`：协议版本，当前 `1`。未知版本拒绝（防前后向兼容洞）。
- `nonce`：发送方每次消息唯一（随机串或自增计数）。长度 ≥ 8 字符。
- `timestamp`：epoch 毫秒；接收方校验 `|now − timestamp| ≤ maxAgeMs`。
- `payload`：对象或字符串；对象统一 JSON 序列化后进入预像（确定性）。

---

## 4. 签名与验签

### 4.1 签名预像（canonical preimage）

所有字段按固定顺序以 `\n` 拼接，收发双方必须生成**完全一致**的字节：

```
version
sender
target
payload(JSON 字符串)
nonce
timestamp
```

### 4.2 签名算法

签名后端**可插拔**（本 RFC 不绑定），生产建议优先级：

1. **Dilithium2**（PQC，对齐 SECURITY_SPEC 目标签名算法）
2. **Ed25519**（轻量、快，适合高吞吐 Agent 消息）
3. **EVM secp256k1**（复用现有 agent EVM 签名路径）

参考实现以注入式 `signer / verifier` 抽象签名后端，便于按环境切换。

### 4.3 验签

接收方重算预像 → 验签。失败返回 `invalid_signature`（fail-closed）。

---

## 5. 防重放与防过期

- **anti-replay**：以 `(sender, nonce)` 为 key 记录已见集。重复 → `replay_detected`。
  - 无状态部署建议：接收方用滑动窗口记录最近 N 条；或发送方用单调递增 nonce，
    接收方仅接受"大于已见最大 nonce"。
  - 参考实现提供 LRU 守卫（`createReplayGuard`），容量超限淘汰最旧。
- **防过期**：`|now − timestamp| ≤ maxAgeMs`（默认 300000ms）。超窗 → `timestamp_expired`。
  - 双向容差：既防"未来"消息（时钟偏斜），也防"过去"消息（状态已变化）。

---

## 6. 演进路线（不在此 Sprint 实施）

| 阶段 | 内容 |
|------|------|
| P0（本 RFC） | 信封 + 签名 + nonce + timestamp + anti-replay 参考实现 |
| P1 | 传输加密：TLS 1.3 强制 + mTLS 双向证书；service identity 目录（did → 公钥） |
| P2 | 密钥管理：Dilithium2 密钥轮换、撤销列表、HSM/TPM 持有 |
| P3 | 集中式防重放（跨实例共享 anti-replay 状态），多副本一致性 |
| P4 | 消息审计联动：签名消息写入 Sprint 2.7 审计日志（anti-replay + audit 闭环） |

---

## 7. 与现有组件的接缝

- `CoordinationClient`（agent-sdk）：当前请求 `agent_identity` 为明文。
  P1 起可将 `createMessageEnvelope` 挂到 transport 层，签名后发送。
- MCP server（mcp-server）：`smart_account_*` 走 MCP 层（内部信任面），
  本 RFC 面向**外部** Agent↔Agent / Agent↔服务 通信面，两者不混淆。
- SECURITY_SPEC §1.3：本 RFC 是其"通信安全"目标的落地第一步。

---

## 附录 A：参考实现使用示例

```js
import { createMessageEnvelope, verifyMessageEnvelope, createReplayGuard } from 'nexusgenesis-agent-sdk';

// 签名后端（示例用简单 HMAC 风格；生产注入 Dilithium2/Ed25519）
const sign = (bytes) => 'sig:' + [...bytes].reduce((a, b) => a + (b & 0xff).toString(16).padStart(2, '0'), '');
const env = createMessageEnvelope({
  sender: 'ng1…agent-a', target: 'ng1…service-b',
  payload: { type: 'task_claim', taskId: 'T-42' },
  signer: sign,
});

const guard = createReplayGuard();
const ok1 = verifyMessageEnvelope({ envelope: env, verifier: (b, s) => s === sign(b), replayGuard: guard });
// → { ok: true }
const ok2 = verifyMessageEnvelope({ envelope: env, verifier: (b, s) => s === sign(b), replayGuard: guard });
// → { ok: false, error: 'replay_detected' }
```
