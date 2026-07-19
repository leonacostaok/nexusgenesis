# 钱包 API 限流优化 & 缓存机制 更新文档

> 日期：2026-07-16
> 触发原因：Agent 测试报告钱包接口 429 限流（10次/分钟），并误判功能"未开放"

---

## 一、问题背景

外部 Agent 对节点钱包功能进行测试时，遇到两个问题：

1. **API 限流严重**：所有钱包接口都返回 429 `IP rate limit exceeded`，限制为 10 次/分钟
2. **功能误判为"未开放"**：因为限流导致请求被拒，Agent 无法验证接口可用性，判定交易历史、转账、钱包详情等功能"未开放"

### 根因分析

**限流问题根因**：Agent 通过 `x-agent-identity` 请求头标识自己，新注册的 Agent 被识别为 `new_agent` tier，原始配额只有 **10 次/分钟**。Agent 测试要遍历 5 个以上接口（历史、详情、转账、质押、跨链），加上重试，几秒内就打满了。

**功能"未开放"误判根因**：全部由限流导致——请求被 429 拒绝，Agent 得不到正常的 200 响应，就认为功能不存在。另外还存在一个潜在兼容问题：Agent 可能尝试访问 `/api/wallet/...`（不带 v1 版本前缀），得到 404 后也会误判。

---

## 二、限流策略优化

### 修改文件
- `src/http/rateLimiter.js`

### 2.1 Agent Tier 配额整体提升（约 3x）

| Tier | 原配额 (req/min) | 新配额 (req/min) | 提升幅度 |
|------|------------------|------------------|----------|
| validator | 300 | 300 | — |
| high_reputation | 60 | **120** | 2x |
| medium_reputation | 40 | **80** | 2x |
| low_reputation | 20 | **50** | 2.5x |
| **new_agent** | **10** | **30** | **3x** |
| 纯 IP（无身份） | 600 | 600 | — |

### 2.2 新增"宽松通道"（Permissive Paths）

钱包读取类接口（GET 请求）单独走**宽松通道**，不占用 Agent tier 配额，上限为纯 IP 级别的 600 次/分钟。

**设计原则**：
- 读接口 → 宽松（600/min，独立计数器）
- 写接口 → 正常 Agent tier 限制（防滥用）

#### 宽松路径列表

| 路径前缀 | 说明 |
|----------|------|
| `/api/v1/wallet/health` | 健康检查 |
| `/api/v1/wallet/stats` | 全局统计 |
| `/api/v1/wallet/assets` | 资产列表 |
| `/api/v1/wallet/balance/:address` | 地址余额 |
| `/api/v1/wallet/history/:address` | 地址交易历史 |
| `/api/v1/wallet/info/:address` | 地址详情 |
| `/api/v1/wallet/agent/*` | 所有 Agent 钱包读接口 |
| `/api/wallet/*` | 不带 v1 前缀的兼容路径（同上） |

#### 实现机制

`_checkIpLimit()` 中新增 `permissiveCount` 独立计数器：
- Permissive 请求 → `permissiveCount++`，上限 `ipMax` (600)
- 非 Permissive 请求 → `count++`，上限 Agent tier 限制
- 两者互不影响，各自独立 TTL 窗口

### 2.3 端点级限流配置新增

```javascript
const RATE_LIMIT_BY_ENDPOINT = {
  // ...原有配置
  '/wallet/health': 200,
  '/wallet/stats': 100,
  '/wallet/assets': 100,
  '/wallet/agent/list': 60,
  '/wallet/agent/stats': 60
};
```

---

## 三、路径兼容性增强

### 修改文件
- `src/http/server.js`

### 变更

Wallet 路由同时挂载在两个路径上：
- `/api/v1/wallet`（标准路径，推荐）
- `/api/wallet`（兼容路径，便于旧客户端/Agent 接入）

```javascript
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/wallet', walletRoutes);
```

> 注意：限流宽松路径配置中已同步包含两个前缀，确保兼容路径也享受相同的宽松待遇。

---

## 四、钱包 API 缓存机制

### 修改文件
- `src/http/routes/walletApi.js`

### 4.1 设计概述

新增基于内存 Map 的 TTL 缓存，采用**中间件模式**透明介入，业务代码零侵入。

**核心 API**：
```javascript
cacheMiddleware(keyFn, ttl)  // Express 中间件
_cacheGet(key)               // 读缓存
_cacheSet(key, data, ttl)    // 写缓存
_cacheDelPrefix(prefix)      // 按前缀批量失效
_cacheKey(type, ...parts)    // 生成缓存键
```

**缓存键格式**：`wallet:{type}:{param1}:{param2}:...`

### 4.2 缓存 TTL 配置

| 数据类型 | TTL | 说明 |
|----------|-----|------|
| `stats`（全局统计） | 30s | 不频繁变化 |
| `agentStats` | 30s | Agent 钱包统计 |
| `agentList` | 30s | Agent 钱包列表 |
| `info`（地址详情） | 30s | 元数据基本不变 |
| `agentDetails` | 30s | Agent 钱包详情 |
| `balance` | 15s | 余额，较短TTL保证时效 |
| `agentBalance` | 15s | Agent 余额 |
| `securityStatus` | 15s | 安全引导状态 |
| `history` | 10s | 交易历史，最短TTL |
| `agentHistory` | 10s | Agent 交易历史 |
| `assets` | 60s | 资产列表，最长TTL |

### 4.3 已接入缓存的接口

| 方法 | 路径 | 缓存键模式 | TTL |
|------|------|-----------|-----|
| GET | `/stats` | `wallet:stats` | 30s |
| GET | `/balance/:address` | `wallet:balance:{address}` | 15s |
| GET | `/history/:address` | `wallet:history:{address}:{limit}:{offset}` | 10s |
| GET | `/info/:address` | `wallet:info:{address}` | 30s |
| GET | `/agent/list` | `wallet:agentList` | 30s |
| GET | `/agent/stats` | `wallet:agentStats` | 30s |
| GET | `/agent/:agentId` | `wallet:agentDetails:{agentId}` | 30s |
| GET | `/agent/:agentId/balance` | `wallet:agentBalance:{agentId}` | 15s |
| GET | `/agent/:agentId/security-status` | `wallet:securityStatus:{agentId}` | 15s |
| GET | `/agent/:agentId/history` | `wallet:agentHistory:{agentId}:{limit}:{offset}` | 10s |
| GET | `/assets` | `wallet:assets` | 60s |

### 4.4 缓存失效策略

所有写操作成功后，主动清除相关缓存：

| 写操作 | 失效的缓存 |
|--------|-----------|
| `POST /transfer` | from/to 的 balance、history、info；fromAgentId 的 agentBalance/History/Details；全局 stats |
| `POST /agent/transfer` | 同上 + agentStats |
| `POST /agent/batch-transfer` | 发送方 + 所有接收方的相关缓存；stats；agentStats |
| `POST /agent/:agentId/claim` | Agent 的 balance、history、details；地址级缓存；stats |
| `POST /agent/create` | agentList、agentStats、stats |
| `POST /agent/import` | Agent 的全部缓存；agentList、agentStats、stats |
| `POST /agent/:agentId/onboarding/complete` | securityStatus、agentDetails |

**失效方式**：按缓存键前缀批量删除（`_cacheDelPrefix`），确保同类型所有分页/变体缓存一起清掉。

### 4.5 响应头

缓存命中时返回 `X-Cache: HIT`，未命中时返回 `X-Cache: MISS`，便于调试和命中率统计。

---

## 五、效果预估

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 新 Agent 钱包读接口 (req/min) | 10 | **600** | **60x** |
| 新 Agent 钱包写接口 (req/min) | 10 | **30** | 3x |
| 新 Agent 总可承受 QPS (读+写) | ~0.17 | ~10.5 | ~60x |
| 后端 state 读取压力 | 每次请求都查 | 缓存命中后跳过 | **减少 80-90%** |

---

## 六、验证结果

| 测试套件 | 断言数 | 结果 |
|----------|--------|------|
| 限流单元测试 | 13 | ✅ 全部通过 |
| 钱包页面回归测试 | 48 | ✅ 全部通过 |

---

## 七、后续建议

1. **缓存命中率监控**：目前只有 `X-Cache` 响应头，建议接入系统监控面板展示命中率
2. **LRU 淘汰**：当前是纯 TTL 无大小限制，钱包数量多起来后建议加上 LRU 或最大条目限制
3. **预热机制**：可参考 `server.js` 中 `warmupCache()`，对高频访问的 Agent 余额做预热
4. **质押 & 跨链桥**：Agent 测试提到的这两个功能确实未实现，属于 roadmap 范围，非 bug
