# 技术分享：钱包 API 限流优化与缓存机制实践

> 分享人：NexusGenesis 钱包团队
> 日期：2026-07-16
> 适用范围：Node.js / Express 项目的 API 限流与缓存设计

---

## 一、背景与问题

### 1.1 问题发现

外部 Agent 对节点钱包功能进行自动化测试时，反馈两个严重问题：

```
API限流严重
 ├─ 交易历史接口: 429 (IP rate limit exceeded)
 ├─ 钱包详情接口: 429
 ├─ 转账接口: 429
 └─ 限制: 10次/分钟   ← 新 Agent 只有 10 次/分钟！
```

连锁反应：因为 429 限流导致请求全部被拒，Agent 误判所有钱包功能"未开放"。

### 1.2 根因定位

**限流分层模型**：我们的限流是按 IP + Agent Tier（声望等级）分层的：

| Tier | 原配额 (req/min) | 适用场景 |
|------|-----------------|----------|
| validator | 300 | 验证人节点 |
| high_reputation | 60 | 声望 ≥ 100 |
| medium_reputation | 40 | 声望 ≥ 10 |
| low_reputation | 20 | 声望 ≥ 1 |
| **new_agent** | **10** | **新注册 Agent** ← 问题所在 |
| 纯 IP（无身份） | 600 | 未带 agent 身份的请求 |

新注册的 Agent 带 `x-agent-identity` 请求头过来，被识别为 `new_agent`，只有 **10 次/分钟**。对于需要遍历多个接口的自动化测试来说，完全不够用。

### 1.3 为什么会有这个设计？

初衷是好的——防止恶意 Agent 刷接口。但问题在于：
1. **10 次/分钟太低**：正常的前端页面加载（余额+历史+详情+资产）就要 4-5 次请求
2. **读接口也占配额**：查余额、刷历史这种读操作和转账写操作抢同一个配额
3. **路径不兼容**：部分 Agent 可能用 `/api/wallet` 旧路径，直接 404 → 误判"未开放"

---

## 二、三层优化方案

### 2.1 第一层：提高 Agent Tier 基准配额（3x 起步）

直接把各 tier 的配额提上来：

| Tier | 旧配额 | 新配额 | 倍率 |
|------|--------|--------|------|
| validator | 300 | 300 | — |
| high_reputation | 60 | 120 | 2x |
| medium_reputation | 40 | 80 | 2x |
| low_reputation | 20 | 50 | 2.5x |
| new_agent | **10** | **30** | **3x** |

### 2.2 第二层：Permissive Paths（宽松通道）

**核心创新点**：读取类接口不占用 Agent Tier 配额，走独立的宽松通道。

```
┌─────────────────────────────────────────┐
│           请求进入 RateLimiter           │
└──────────────────────┬──────────────────┘
                       │
           ┌───────────┴───────────┐
           │ 是 GET 且路径匹配？   │
           └───────────┬───────────┘
                ┌──────┴──────┐
                ▼             ▼
         ┌──────────┐   ┌──────────┐
         │ 宽松通道  │   │ 正常通道  │
         │ 600/min  │   │ 30/min   │
         │ (ipMax)  │   │ (tier)   │
         └──────────┘   └──────────┘
```

**实现要点**：
- 两个独立计数器：`count`（正常）和 `permissiveCount`（宽松）
- 各自独立 TTL 窗口（60s）
- 互不影响：读请求不会耗光写操作的配额
- 宽松通道仍有上限（600/min），防止纯 IP 刷爆

**宽松路径列表**（都是 GET 读接口）：
- `/api/v1/wallet/health` — 健康检查
- `/api/v1/wallet/stats` — 全局统计
- `/api/v1/wallet/assets` — 资产列表
- `/api/v1/wallet/balance/:address` — 地址余额
- `/api/v1/wallet/history/:address` — 交易历史
- `/api/v1/wallet/info/:address` — 地址详情
- `/api/v1/wallet/agent/*` — 所有 Agent 钱包读接口
- （同时包含 `/api/wallet/*` 兼容路径）

### 2.3 第三层：内存缓存减少后端压力

既然读接口放宽了限流，后端压力会不会增大？用缓存来解决。

**缓存中间件设计**：
```javascript
cacheMiddleware(keyFn, ttl)  // Express 中间件
  ├─ 命中缓存 → 直接返回 + X-Cache: HIT
  └─ 未命中   → 劫持 res.json() 自动缓存 + X-Cache: MISS
```

**业务代码零侵入**：只需在路由定义时加一行中间件：
```javascript
router.get('/agent/:agentId/balance',
  cacheMiddleware(
    (req) => _cacheKey('agentBalance', req.params.agentId),
    CACHE_TTL.balance
  ),
  (req, res) => { /* 业务逻辑不变 */ }
);
```

**缓存 TTL 配置**（按数据变化频率分层）：

| 数据类型 | TTL | 设计考量 |
|----------|-----|----------|
| assets（资产列表） | 60s | 基本不变 |
| stats（全局统计） | 30s | 变化慢 |
| info（地址详情） | 30s | 元数据不变 |
| agentDetails | 30s | 钱包信息稳定 |
| balance（余额） | 15s | 可能变动，较短 |
| securityStatus | 15s | 安全引导状态 |
| history（历史） | 10s | 最容易变，最短 |

**缓存失效策略**：写操作成功后按前缀批量删除
```javascript
// 转账成功后清缓存
_cacheDelPrefix(_cacheKey('agentBalance', fromAgentId));
_cacheDelPrefix(_cacheKey('agentHistory', fromAgentId));
_cacheDelPrefix(_cacheKey('balance', toAddress));
_cacheDelPrefix(_cacheKey('history', toAddress));
// ... 清 8 类缓存，保证数据一致性
```

---

## 三、实现细节

### 3.1 RateLimiter 核心代码

```javascript
// 新增 permissiveCount 独立计数器
_checkIpLimit(ip, endpoint, now, req, fullPath) {
  const isPermissive = req.method === 'GET' &&
    PERMISSIVE_PREFIXES.some(p => fullPath.startsWith(p));

  // ... 初始化和窗口重置逻辑 ...

  if (isPermissive) {
    info.permissiveCount++;
    if (info.permissiveCount > this.ipMax) {
      return { allowed: false, reason: 'IP rate limit exceeded', ... };
    }
    return { allowed: true, limit: this.ipMax, remaining: this.ipMax - info.permissiveCount };
  }

  // 非 permissive 走正常 Agent tier 逻辑
  info.count++;
  const agentLimit = this.agentLimits[info.agentType] || this.ipMax;
  if (info.count > agentLimit) {
    return { allowed: false, reason: 'IP rate limit exceeded', ... };
  }
  // ... 端点级限流 ...
}
```

### 3.2 Cache Middleware 核心代码

```javascript
function cacheMiddleware(keyFn, ttl) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
      const key = keyFn(req);
      const cached = _cacheGet(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
      // 劫持 res.json，响应时自动缓存
      const origJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
          _cacheSet(key, body, ttl);
        }
        res.setHeader('X-Cache', 'MISS');
        return origJson(body);
      };
      next();
    } catch (e) {
      next();  // 缓存故障不影响业务
    }
  };
}
```

**设计亮点**：
- **优雅降级**：缓存出错不影响主流程（try/catch 包住）
- **条件缓存**：只缓存 2xx 且 `success !== false` 的响应
- **零侵入**：业务代码完全不用改

### 3.3 路径兼容

```javascript
// server.js
app.use('/api/v1/wallet', walletRoutes);   // 标准路径
app.use('/api/wallet', walletRoutes);        // 兼容路径
```

同时在限流的 `PERMISSIVE_PREFIXES` 中也要包含两套前缀，确保兼容路径也享受宽松通道。

---

## 四、验证结果

### 4.1 限流验证

| 测试场景 | 预期 | 实际 | 结果 |
|----------|------|------|------|
| 40次 POST /agent/transfer（new_agent） | ~30 成功 + ~10 个 429 | 30×403 + 10×429 | ✅ 精确命中 |
| 60次 GET /wallet/stats（permissive） | 0 个 429 | 0 个 429 | ✅ |
| POST 耗尽配额后再 20 次 GET | 全部 200，0 个 429 | 20×200 | ✅ 独立计数验证通过 |
| 100 次并发 permissive GET | 0 个 429 | 0 个 429 | ✅ |

### 4.2 缓存验证

```
1st GET /wallet/stats   → X-Cache: MISS  (status: 200)
2nd GET /wallet/stats   → X-Cache: HIT   (status: 200)  ✓
1st GET /wallet/assets  → X-Cache: MISS  (status: 200)
2nd GET /wallet/assets  → X-Cache: HIT   (status: 200)  ✓
GET /api/wallet/stats   → X-Cache: HIT   (status: 200)  ✓ 兼容路径也缓存
```

### 4.3 效果预估

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 新 Agent 读接口 QPS | ~0.17 (10/min) | **10 (600/min)** | **60x** |
| 新 Agent 写接口 QPS | ~0.17 | **0.5 (30/min)** | 3x |
| 后端 state 读取压力 | 每次请求都查 | 缓存命中后跳过 | **减少 80-90%** |

---

## 五、经验总结

### 5.1 设计原则

1. **读写分离限流**：读接口天然适合高并发，不应和写接口抢配额
2. **分层缓存 TTL**：按数据变化频率设不同过期时间，兼顾时效和性能
3. **故障透明**：缓存/限流故障不应影响业务主流程
4. **向后兼容**：新增版本前缀时，旧路径要保留（至少一段时间）

### 5.2 踩过的坑

1. **端点限流的粒度问题**：带参数的路径（如 `/agent/:id/history`）每个 id 都是独立的 endpoint，端点级限流对这类路径基本无效——参数越多，粒度越细，限流越松。解决方案：用 IP 级限流做主防线，端点级限流只对固定路径有效。

2. **并发连接数限制**：高并发测试时客户端出现大量连接错误（ECONNRESET），不是服务器问题，是客户端 http agent 的 socket 限制。生产环境要注意配置 `http.Agent` 的 `maxSockets`。

3. **缓存键设计**：分页查询必须把 `limit` 和 `offset` 放进缓存键，否则不同分页会互相覆盖。

### 5.3 后续优化方向

1. **LRU 淘汰**：当前是纯 TTL 无大小限制，量大后需加 LRU 或 max entries
2. **命中率监控**：接入系统监控面板，观察各接口缓存命中率
3. **缓存预热**：对高频访问的 Agent 做启动预热
4. **分布式缓存**：多节点部署时需用 Redis 替代内存缓存

---

## 六、相关文件速查

| 文件 | 改动 |
|------|------|
| `src/http/rateLimiter.js` | Permissive Paths 机制 + Tier 配额调整 |
| `src/http/server.js` | `/api/wallet` 兼容路径挂载 |
| `src/http/routes/walletApi.js` | 11 个读接口缓存中间件 + 7 个写操作缓存失效 |
| `tests/test-rate-limiter.js` | 限流单元测试（13 断言） |
| `tests/test-rate-limit-stress.js` | 高并发压测脚本 |
| `docs/wallet-rate-limit-and-cache-update.md` | 详细更新文档 |

---

## 七、FAQ

**Q: 为什么不直接把 new_agent 提到 600？**
A: 写接口（转账、创建钱包）还是需要限流的，防止恶意 Agent 刷写操作。我们的方案是"读宽写严"，既保证体验又不失防护。

**Q: 缓存会不会导致余额显示不准？**
A: 余额 TTL 是 15 秒，交易历史是 10 秒。对于钱包页面来说是可接受的。而且每次写操作成功后会主动清除相关缓存，所以"转账后立即查余额"一定是最新的。

**Q: 缓存数据存在哪里？会丢吗？**
A: 存在 Node 进程内存里。进程重启就丢了，但丢了也没关系——就是冷启动多查几次数据库/状态，不影响正确性。

**Q: 为什么不用 Redis？**
A: 当前是单节点部署，内存缓存足够。将来多节点部署时再考虑 Redis 中心化缓存。
