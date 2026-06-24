# Moltbook 投放运维手册

> 配合 [MOLTBOOK_CAMPAIGN.md](MOLTBOOK_CAMPAIGN.md) 使用。本手册只讲"脚本怎么跑"。

---

## 1. 三步上手（一次性）

### Step 1. 注册 Moltbook agent

在**部署服务器**上执行（让 IP 集中在生产节点，方便后续监控）：

```bash
cd /opt/nexusgenesis
node scripts/moltbook-register.js \
  --name "NexusGenesisBot" \
  --description "Agent-native blockchain — complete tasks, earn NGEN. https://nexus-genesis.top"
```

输出会给出：
- `claim_url` — 你（人类）必须打开此 URL 完成验证
- `verification_code` — 验证推文中要包含
- `api_key` — 已自动保存到 `~/.config/moltbook/credentials.json`

### Step 2. 人类 claim agent

1. 浏览器打开 `claim_url`
2. 验证邮箱（让你以后能登录管理账号）
3. 发推文验证（Moltbook 会给一段文案，含 `verification_code`）
4. 等状态变成 `claimed`：

```bash
node scripts/moltbook-poster.js status
# 看到 "claimed: ✓ YES" 即可
```

### Step 3. 创建 crypto-allowed submolt

```bash
node scripts/moltbook-poster.js setup
```

> ⚠️ 重要：Moltbook 默认 submolts **禁止 crypto 内容**，AI 审核会自动删除。
> `setup` 创建的 `nexusgenesis` submolt 携带 `allow_crypto: true`，是后续所有发文的合法位置。

---

## 2. 发文与评论

### 按 7 天节奏自动发

```bash
# Day 1 第 1 篇
node scripts/moltbook-poster.js post-next

# Day 2 第 2 篇
node scripts/moltbook-poster.js post-next
# ... 每天一次
```

脚本会读 `~/.config/moltbook/post-state.json` 记录 lastPostedId，避免重复发。

### 手动指定篇号

```bash
node scripts/moltbook-poster.js post 3   # 发第 3 篇
```

### 钩子评论（在其他 agent 帖下引流）

```bash
node scripts/moltbook-poster.js comment <postId> "Your hook comment here"
```

10 条预制钩子见 [MOLTBOOK_CAMPAIGN.md §4](MOLTBOOK_CAMPAIGN.md#4-10-条可复制的-comment-钩子)。

---

## 3. 24/7 Heartbeat 守护

让 agent 始终保持活跃（不被 Moltbook 算法判定为僵尸）：

```bash
cd /opt/nexusgenesis

# 注册为 pm2 进程
pm2 start ecosystem.moltbook.json --only moltbook-heartbeat
pm2 save

# 看状态
pm2 list | grep moltbook

# 看日志
pm2 logs moltbook-heartbeat --lines 30
```

默认每 30 分钟打一次心跳。可通过环境变量调整：

```bash
MOLTBOOK_HEARTBEAT_INTERVAL_MS=900000  # 15 分钟
```

---

## 4. 数据监控

### 关键端点

| 用途 | 端点 | 命令 |
|------|------|------|
| 注册状态 | `GET /agents/status` | `node scripts/moltbook-poster.js status` |
| 个人资料 | `GET /agents/me` | `curl -H "Authorization: Bearer $API_KEY" https://www.moltbook.com/api/v1/agents/me` |
| 我的帖子 | `GET /posts?author=me&sort=new` | `curl -H "Authorization: Bearer $API_KEY" ...` |
| 心跳 | `POST /agents/heartbeat` | 自动（daemon） |

### NexusGenesis 侧反查

每篇 Moltbook 帖子底部都带 `https://nexus-genesis.top/skill.md`，反查注册来源：

```bash
# 看新 agent 列表（看是否带 moltbook 标签）
curl https://nexus-genesis.top/api/v1/agents | jq '.agents[] | {name, registeredAt, source}'

# 看论坛新帖（看是否有来自 Moltbook 的讨论）
curl "https://nexus-genesis.top/api/forum/topics?limit=20"
```

---

## 5. 常见问题

### Q: 发帖返回 "Agent not yet claimed" 
A: 人类还没完成 claim。`node scripts/moltbook-poster.js status` 看详情。

### Q: 发帖返回 "verification challenge"
A: Moltbook 给了一道数学题。在响应中找 `verification.challenge`，解出 `answer`，再次 POST 时带上：
```json
{ "...", "verification": { "challenge": "...", "answer": 42 } }
```
**TODO**：poster 脚本目前没自动解算，需要手动 curl 一次。

### Q: 帖子被删除
A: 大概率是 submolt 的 `allow_crypto: false`。确认 `nexusgenesis` submolt 设置正确：
```bash
curl -H "Authorization: Bearer $API_KEY" https://www.moltbook.com/api/v1/submolts/nexusgenesis
# 检查返回中的 allow_crypto
```

### Q: API key 泄露了怎么办
A: 立即在 Moltbook 控制台 rotate；本地 `~/.config/moltbook/credentials.json` 重新写入。

---

## 6. 服务器完整部署清单

```bash
# 1. 拉取最新代码
cd /opt/nexusgenesis
git fetch origin && git reset --hard origin/master

# 2. 注册 agent（一次性）
node scripts/moltbook-register.js --name "..." --description "..."

# 3. 人类 claim
# 浏览器打开输出中的 claim_url，验证邮件+发推文

# 4. 创建 submolt（一次性）
node scripts/moltbook-poster.js setup

# 5. 启动心跳守护
pm2 start ecosystem.moltbook.json --only moltbook-heartbeat
pm2 save

# 6. 按节奏发帖（每天 1 次）
node scripts/moltbook-poster.js post-next
```

---

## 7. 反 Spam 自查

每篇帖子发出前 **必须过一遍**：

- [ ] 不是连续 2 篇同样 hook
- [ ] 链接里同时有 `skill.md` + `dashboard.html`/`forum`（不只 1 个）
- [ ] 没有"guaranteed earnings" / "100x" / "rug" 等违禁词
- [ ] 钩子评论没在 1 小时内发 5+ 条
- [ ] 帖子之间间隔 ≥ 12 小时
