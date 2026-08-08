# NexusGenesis 发布与 CI/CD 操作手册

> 本文档记录主仓（安全标准层）的 npm 自动发布配置与 workflow 文件位置，方便日后查阅。

---

## 1. npm 自动发布配置（NPM_TOKEN）

npm 自动发布依赖主仓的 GitHub Actions secret：**`NPM_TOKEN`**

### 1.1 Secret 位置

- **仓库**：https://github.com/nexus-genesis/nexusgenesis （主仓，安全标准层）
- **设置路径**：
  `仓库页 → Settings → Secrets and variables → Actions → New repository secret`
- **Name**：`NPM_TOKEN`
- **Value**：`wolfking_allen` 账号生成的 npm access token（格式 `npm_xxxx...`）

### 1.2 Token 来源（npmjs.com）

1. 打开 https://www.npmjs.com → 右上角头像 → **Access Tokens**
2. **Generate New Token** → 选 **Granular Access Tokens**
3. Scope 勾选要发布的 6 个包（或「All of your packages」），权限 **Read and write**
4. 复制生成的 `npm_xxx...`（只显示一次）

### 1.3 注意事项

- 6 个 npm 包全部归 `wolfking_allen` 账号，所以 token 必须由该账号生成
- 旧账号 `liangallen` 已弃用；`nexusgenesis-mcp` 原名被其占用，已重命名为 `nexusgenesis-agent-mcp`

---

## 2. Workflow 文件位置

主仓 `.github/workflows/` 下：

| 文件 | 触发条件 | 作用 |
|------|----------|------|
| `ci.yml` | push / PR 到 main、master、develop | 在 Node 18/20/22 上运行测试 + 语法检查；新增 `npm test -ws` 测试 6 个安全包 |
| `npm-publish.yml` | 打 `v*` tag / 手动 dispatch | 按依赖顺序自动 `npm publish` 全部 6 个包 |

**已删除**（旧 L1 遗留，与安全层无关）：`deploy.yml`、`docker.yml`

---

## 3. 发布新版本的步骤

### 3.1 先 bump 版本（必做）

当前各包版本为 `0.1.1` / `0.1.0`。发布前必须把版本号 bump 到与 tag 一致的新版本，否则 npm 会因「版本已存在」拒绝发布。

需要同步修改 6 个 `package.json` 的 `version` 字段，**并更新包之间的依赖引用**：

| 包 | 当前版本 | 依赖引用（需同步更新） |
|----|---------|------------------------|
| `packages/agent-keys` | 0.1.1 | 无内部依赖 |
| `packages/agent-sdk` | 0.1.1 | `nexusgenesis-agent-keys` |
| `packages/chain-eth` | 0.1.1 | `nexusgenesis-agent-keys` |
| `packages/chain-sol` | 0.1.1 | `nexusgenesis-agent-keys` |
| `packages/chain-adapters` | 0.1.1 | `nexusgenesis-agent-keys`、`chain-eth`、`chain-sol` |
| `mcp-server` | 0.1.0 | `nexusgenesis-agent-sdk` |

内部依赖引用举例（以 `^0.2.0` 为例）：
- `packages/agent-sdk/package.json` → `"nexusgenesis-agent-keys": "^0.2.0"`
- `packages/chain-eth/package.json` → `"nexusgenesis-agent-keys": "^0.2.0"`
- `packages/chain-adapters/package.json` → `"nexusgenesis-agent-keys": "^0.2.0"`、`"nexusgenesis-chain-eth": "^0.2.0"`、`"nexusgenesis-chain-sol": "^0.2.0"`
- `mcp-server/package.json` → `"nexusgenesis-agent-sdk": "^0.2.0"`

### 3.2 打 tag 触发发布

```bash
# 提交版本改动后：
git add packages/*/package.json mcp-server/package.json
git commit -m "chore: bump packages to v0.2.0"

# 打 tag（tag 版本需与 package.json 版本一致）
git tag v0.2.0
git push origin master
git push origin v0.2.0
```

### 3.3 触发后

GitHub Actions 自动按依赖顺序发布（`npm-publish.yml`）：

```
agent-keys → agent-sdk → chain-eth → chain-sol → chain-adapters → mcp-server
```

每个步骤使用 `--provenance --access public`。

---

## 4. 查看运行状态

- **Actions 运行页**：https://github.com/nexus-genesis/nexusgenesis/actions
- **npm 包页**：https://www.npmjs.com/~wolfking_allen

---

## 5. 双仓库 CI/CD 说明

| 仓库 | 定位 | workflow |
|------|------|----------|
| `nexusgenesis` | 安全标准层 | `ci.yml` + `npm-publish.yml` |
| `nexusgenesis-legacy` | 纯 L1 testnet（归档） | 仅 `ci.yml`，不发布 npm 包 |
