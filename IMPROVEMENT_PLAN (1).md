# NexusGenesis 仓库改进计划

> **执行者**: TRAE 智能体
> **原则**: 方向不变(Agent Coordination Protocol + testnet bootstrap)、不做大改、只清理与对齐
> **基线 commit**: `73ee039`(2026-05-20 "首页去金融化")
> **生成日期**: 2026-05-22

---

## 执行说明(请 TRAE 先读)

1. **不要重写架构、共识、SDK 核心代码、白皮书核心理论**。本计划只做"清理、对齐、修 bug、补卫生"。
2. **每完成一项**,在该项末尾打勾 `- [x]`,并在 commit message 引用本文件的任务编号,例如:
   `chore(readme): fix garbled char "核���" → "核心" (IMPROVEMENT_PLAN #7)`
3. **按 P0 → P1 → P2 → P3 的顺序执行**。P0 不完成不要做 P1。
4. 涉及内容删改的,**先 grep 全仓库确认没有其他地方依赖**,再改。例:删 `seed1.nexusgenesis.io` 前先 `grep -rn "seed1.nexusgenesis.io"`。
5. 任何"不确定改完会不会出事"的地方,**留 issue 而不是硬改**。

---

## 🔴 P0 — 影响第一印象,必须改

### #1 GitHub 仓库 metadata 三件套(About 卡片是空的)

**当前**:`description=None`,`topics=[]`,`homepage=None`
**操作**(在 GitHub Web 上,About → ⚙️ 编辑,不是 commit):

- Description:
  ```
  An experimental Agent Coordination Protocol — testnet bootstrap stage, not production.
  ```
- Topics(逐个加):
  ```
  agent-coordination  ai-agents  bft-consensus  post-quantum
  dilithium  p2p  testnet  nodejs
  ```
- Website:留空,或填 `http://nexus-genesis.top`(确认域名能稳定指向再填)

- [x] 完成

---

### #2 `package.json` description 还是旧定位

**文件**:`package.json`
**当前**:
```json
"description": "NexusGenesis - Autonomous AI Territory Protocol (SEC-001/002/003 Fixed)"
```
**改为**:
```json
"description": "NexusGenesis — Agent Coordination Protocol (testnet bootstrap). Multi-leader BFT + PQC signatures + Agent discovery."
```

同时 `keywords` 数组:
- **加**:`"agent-coordination"`, `"testnet"`
- **保留**:`"pqc"`, `"dilithium"`, `"post-quantum"`, `"p2p"`
- **删**:`"blockchain"` 可选保留,但移到数组末尾

- [x] 完成

---

### #3 `TESTNET.md` 和 `CONTRIBUTING.md` 是机翻事故

**问题**:i18n 翻译脚本把中文里的部分词替换成了英文,产生"Testnetwork，forTest和Verify"、"requires经过冷静期"这种夹生句,完全无法阅读。

**操作**:
```bash
# 查找 i18n 翻译之前的最后一版
git log --oneline -- TESTNET.md
git log --oneline -- CONTRIBUTING.md

# 找到形如 "i18n: translate ..." 之前那一次 commit 的 SHA
# 然后取出旧版内容
git show <previous_sha>:TESTNET.md > TESTNET.md
git show <previous_sha>:CONTRIBUTING.md > CONTRIBUTING.md
```

如果旧版本里有需要保留的新内容(例如新加的端口配置),**用人工合并**,不要再跑批量翻译脚本。

**回归测试**:打开两个文件,通读一遍,确认中文句子语法完整。

- [x] 完成

---

### #4 `sdk/README.md` 与新定位严重打架

**文件**:`sdk/README.md`
**问题**:
1. 自称"接入 NexusGenesis **主网**"——与 testnet 定位冲突
2. 列出 `seed1.nexusgenesis.io ~ seed4.nexusgenesis.io` 四个**并不存在**的种子节点
3. 示例用 `const { NexusAgentSDK } = require(...)`,但 `sdk/package.json` 是 `"type": "module"` —— **语法错误,跑不通**

**改动**:

```diff
- 外部 AI Agent 接入 NexusGenesis 主网的 JavaScript SDK。
+ 外部 AI Agent 接入 NexusGenesis testnet 的 JavaScript SDK。
```

```diff
- const { NexusAgentSDK } = require('./nexus-agent-sdk');
+ import { NexusAgentSDK } from './nexus-agent-sdk.js';
```

```diff
- const sdk = new NexusAgentSDK({
-   baseURL: 'https://seed1.nexusgenesis.io:19890'
- });
+ const sdk = new NexusAgentSDK({
+   baseURL: 'http://localhost:19890'  // 本地 testnet,公开种子节点见 config/bootstrap.config.json
+ });
```

**删掉整张"主网种子节点"表**,替换为一句:
```markdown
## 种子节点

当前为 testnet bootstrap 阶段,公开种子节点请见仓库根的
[`config/bootstrap.config.json`](../config/bootstrap.config.json)。
本地开发请直接连 `http://localhost:19890`。
```

- [x] 完成

---

### #5 `sdk/package.json` 仓库链接还指向旧组织名

**文件**:`sdk/package.json`
**当前**:
```json
"repository": { "type": "git", "url": "https://github.com/NexusGenesis/NexusGenesis" }
```
**改为**(全小写,与现仓库一致):
```json
"repository": { "type": "git", "url": "https://github.com/nexus-genesis/nexusgenesis" }
```

**不要** 加 `publishConfig.access: public`,除非确认马上要 `npm publish`。

- [x] 完成

---

## 🟡 P1 — README.md 本体小修(不大改、不动结构)

### #6 顶部 version badge 与 package.json 不一致

**当前 README**:
```
[![Version](https://img.shields.io/badge/version-1.0.0--bootstrap-orange.svg)](package.json)
```
**当前 package.json**:`"version": "1.0.0"`

**推荐方案**:改 `package.json`,而不是 badge。
```diff
- "version": "1.0.0",
+ "version": "1.0.0-bootstrap.1",
```
语义化版本允许 pre-release 后缀,这是对当前阶段最诚实的标注。改完不需要动 README。

- [ ] 完成

---

### #7 README 里一处 UTF-8 乱码字符

**文件**:`README.md`
**位置**:`### ✅ 已完成` 段第一行
**当前**:
```
- [x] **核���共识层** — MultiLeader BFT 共识协议
```
"核**心**" 被破坏成了 `核���`。

**改为**:
```
- [x] **核心共识层** — MultiLeader BFT 共识协议
```

- [ ] 完成

---

### #8 README 里 SDK 安装命令在撒谎

**文件**:`README.md`
**当前**:
```markdown
- **JavaScript SDK**：`npm install nexus-agent-sdk`
```
**问题**:`nexus-agent-sdk` 这个 npm 包**没发布**;真实包名是 `@nexusgenesis/sdk`,也没发布。

**改为**:
```markdown
- **JavaScript SDK**:仓库内 `sdk/` 目录,直接 `import` 即可(尚未发布到 npm)
```

下方"Agent SDK"小节里的 `npm install nexus-agent-sdk` 也同步改成:
```bash
# 当前从仓库内 sdk/ 目录直接使用,尚未发布到 npm
node sdk/examples/basic-connect.js
```

- [ ] 完成

---

### #9 README 理念段还残留"出钱"两个字

**文件**:`README.md`,"## 理念" 段
**当前**:
```
> 早期阶段,Agent 们出力(跑节点)出钱(质押)让项目运转下去。
```
**问题**:你 5-20 commit 才"去金融化",这里"出钱"还在,前后矛盾。

**改为**:
```
> 早期阶段,Agent 出力跑节点 + 质押少量 testnet NGEN(无经济价值)参与共识。
```

- [ ] 完成

---

### #10 README 顶部加一行 testnet 免责

**文件**:`README.md`
**位置**:第一句话(`> **自主 AI Agent 领土协议**...`)的下一行
**追加一行**:
```markdown
> ⚠️ **Testnet 阶段**。NGEN 为测试代币,无经济价值,不进行任何形式的募资或交易。
```

(顺便:第一句里"自主 AI Agent 领土协议"这个词也可以一并改成 "Agent Coordination Protocol",但如果你认为方向不变包含这个口号,可保留。倾向**保留原口号**,只新增 disclaimer 行,改动最小。)

- [ ] 完成

---

### #11 README 路线图里"🔜 即将完成"两项,事实已经变了

**文件**:`README.md`,"### 🔜 即将完成" 段
**当前**:
```markdown
- [ ] **域名 + 服务器部署** — nexus-genesis.top DNS 配置
- [ ] **初始验证者招募** — 21 人委员会
```
**事实**:
- 5-17 commit `bind to 98.142.241.236` + `replace nginx with Apache` 说明**服务器已部署**
- 验证者真实进度是 1/21

**改为**:
```markdown
- [x] **域名 + 服务器部署** — nexus-genesis.top 已上线(单节点)
- [ ] **验证者委员会扩容** — 招募中,当前 **1 / 21**
```

- [ ] 完成

---

## 🟢 P2 — 项目卫生(让仓库瞬间显得专业)

### #12 根目录散落 25+ 个 `test_*.js` / `debug_*.js` / `inject_*.js` —— 大扫除

**问题**:`git clone` 后根目录直接看到 30+ 个一次性脚本,会被误判为"调试堆",不像产品。

**操作**(每一步都先 `git mv`,不要删):

1. 建目录:
   ```bash
   mkdir -p archive/legacy-scripts
   mkdir -p scripts/maintenance
   mkdir -p docs/reports
   ```

2. **调试性的 test_\*.js**(根目录,不在 `test/` 里、也不是 `node --test` 跑的那批)→ `archive/legacy-scripts/`
   清单:
   ```
   test-genesis.js test_agent_register.js test_agent_register_full.js
   test_ai_registration.js test_console.js test_contracts.js
   test_economic_model.js test_key_storage.js test_matrix_direct.js
   test_matrix_operations.js test_matrix_simple.js test_moltbook_registration.js
   test_network_connectivity.js test_node.js test_observer_boundary.js
   test_pqc_implementation.js test_script.js test_swarm.js
   test_task_creation.js test_transaction.js test_transfer_fix.js
   test_tx_injection.js test_vote.js test_vote_transaction.js test_wallet_security.js
   ```
   ⚠️ **执行前**:`grep -rn "test_agent_register" --include="*.js" --include="*.json" --include="*.md"` 等,确认没有别处 import / 引用。如果有,先改引用。

3. **运维/数据修复脚本** → `scripts/maintenance/`
   清单:
   ```
   inject_governance_txs.js inject_transfer_non_genesis.js inject_transfer_txs.js
   fix_observer_wallet.js update_blockchain_state.js debug_signature.js
   create_genesis_reserve_wallet.js
   ```

4. **中文文件名 + 全角括号** → 改名 + 移动:
   ```
   5.10评估报告（修复内容）.txt  →  docs/reports/2026-05-10-fix-report.md
   ```
   顺便把 `.txt` 改为 `.md`,内容稍微 markdown 化(标题 #)。

5. 在 `archive/README.md` 写一句:
   ```markdown
   # archive/

   早期一次性脚本归档。**不再维护**,保留仅供历史追溯。
   生产路径请使用 `scripts/` 与 `test/` 下的对应文件。
   ```

- [ ] 完成

---

### #13 重复 / 命名风格冲突的文档

**文件**:
- 根:`SECURITY_AUDIT.md` ↔ `SECURITY_AUDIT_REPORT.md`
- `docs/`:`PROTOCOL-UNIFICATION.md` ↔ `PROTOCOL_UNIFICATION.md`

**操作**:
1. 对比两份内容,留**较新 / 较完整**的那一份,另一份删除
2. 命名风格统一使用**下划线**(项目其它文档大多用下划线):保留 `_REPORT.md` 和 `PROTOCOL_UNIFICATION.md`
3. 在被删文件的 commit message 写明:"merge into XXX_REPORT.md"

- [ ] 完成

---

### #14 `.env.example` 写满"主网"假设,与 testnet 定位冲突

**文件**:`.env.example`
**当前**:
```env
CHAIN_ID=nexus-mainnet
NETWORK_ID=ngn-mainnet-1
NODE_ENV=mainnet
SEED_NODES=wss://seed1.nexusgenesis.io:9847,wss://seed2.nexusgenesis.io:9847
NODE_ROLE=genesis
```
**改为**(默认值全部切换为 testnet):
```env
CHAIN_ID=nexus-testnet
NETWORK_ID=ngn-testnet-1
NODE_ENV=testnet
SEED_NODES=ws://127.0.0.1:9847
NODE_ROLE=full
```

主网模板**单独**保存为 `.env.mainnet.example`(真上主网时再用)。

- [ ] 完成

---

### #15 `docs/WHITEPAPER_SUMMARY.md` 第一行还在用"领土"

**文件**:`docs/WHITEPAPER_SUMMARY.md`
**当前**:
```
- NexusGenesis: 抗量子 AI 自主领土
```
**改为**:
```
- NexusGenesis: 抗量子 AI Agent 协调网络(testnet)
```

注:整个 `docs/` 下"领土 / Territory" 关键词可全局检索:
```bash
grep -rn "领土\|Territory" docs/ marketing/ external/
```
**仅替换标题、首页类高曝光位置**,白皮书正文不动(白皮书是历史文档,内部一致即可)。

- [ ] 完成

---

### #16 `docs/AGENT_JOIN_QUICKSTART.md` 满屏 "+NGEN 奖励" 像空投页

**文件**:`docs/AGENT_JOIN_QUICKSTART.md`
**问题**:整张 "💰 Epoch 0 激励结构" 表 + "86,400 NGEN/天" 等措辞,与"去金融化"方向冲突,第一眼像 token airdrop。

**改动**:
1. 章节标题:
   ```diff
   - ## 💰 Epoch 0 激励结构
   + ## 🧮 Epoch 0 贡献计量(testnet)
   ```
2. 在表格上方加一行 disclaimer:
   ```markdown
   > ⚠️ 以下数字仅作为 testnet 内部贡献计量,无经济价值,不可兑换法币或其他资产。
   ```
3. 表格列名:
   ```diff
   - | 激励项 | 金额 | 条件 |
   + | 计量项 | 数值(测试代币) | 条件 |
   ```
4. emoji `💰` → `🧮`,`💸` → `📊`(全局替换)

- [ ] 完成

---

### #17 没有真正的 "good first issue",外部 PR 没有抓手

**当前 open issues**(3 个)全是 "[招募] NexusGenesis 寻找 AI 智能体共建者"。

**操作**:新建以下 3 个 issues,**全部打上 `good first issue` 标签**:

**Issue A:**
> **标题**: 整理根目录散落的 test_*.js / debug_*.js / inject_*.js
> **正文**: 见 IMPROVEMENT_PLAN.md #12,目标是把根目录 30+ 个一次性脚本归类到 `archive/legacy-scripts/` 和 `scripts/maintenance/`。
> **难度**: 简单,主要是 `git mv` + 改引用

**Issue B:**
> **标题**: 修复 TESTNET.md / CONTRIBUTING.md 的 i18n 机翻残骸
> **正文**: 这两份文档当前是夹生中英文,完全无法阅读。需要回滚到 i18n 之前的纯中文版,或人工重译。详见 IMPROVEMENT_PLAN.md #3。
> **难度**: 简单,纯文档

**Issue C:**
> **标题**: sdk/README.md 示例与 ESM 不兼容 & 指向不存在的种子节点
> **正文**: 详见 IMPROVEMENT_PLAN.md #4。需要把 `require` 改为 `import`,删掉假种子节点列表。
> **难度**: 简单,代码 + 文档

- [ ] 完成

---

## 🔵 P3 — 锦上添花(可选,但推荐)

### #18 新建 `STATUS.md` —— 一份会经常更新的事实

README 不动,新增一份:

**文件**:`STATUS.md`
**内容模板**:
```markdown
# Network Status

> 最后更新:2026-05-22

| 指标 | 当前值 |
|---|---|
| 阶段 | Testnet bootstrap |
| 主网节点数 | 1 |
| 验证者数 / 委员会容量 | 1 / 21 |
| 注册 Agent 数 | (填实际) |
| 当前块高 | (填实际) |
| 网络连续运行 | (填小时数) |
| 已发放 NGEN(测试) | (填实际) |
| 最近一次 CI 状态 | ✅ / ❌ |

## 已知运行问题

- (列举当前观察到的不稳定项)

## 下次更新预计

每周一更新,或重大变更后立即更新。
```

README 顶部加一行:
```markdown
> 📊 [实时网络状态 → STATUS.md](STATUS.md)
```

- [ ] 完成

---

### #19 新建 `SECURITY.md`(GitHub 会自动识别)

**文件**:`SECURITY.md`(根目录,GitHub 会显示 Security tab)
**内容**:
```markdown
# Security Policy

## 支持的版本

| 版本 | 是否接收安全更新 |
|---|---|
| `1.0.0-bootstrap.x` (当前) | ✅ |
| 早期 Epoch 0/1 版本 | ❌ |

## 当前安全状态

- 项目处于 **testnet bootstrap** 阶段
- **未经过任何第三方安全审计**
- 没有 bug bounty 项目

## 如何报告漏洞

请**不要**在公开 issue 报告安全漏洞。

- Email: security@nexus-genesis.top (或仓库维护者邮箱)
- 期望响应时间:7 天内确认收到
- 期望披露窗口:90 天

请在邮件中提供:
1. 漏洞类型与影响范围
2. 复现步骤
3. 你建议的修复方向(可选)

致谢:报告者会列在 `docs/SECURITY_REPORTERS.md`(如愿意公开)。
```

- [ ] 完成

---

### #20 让 CI 变绿,并把 badge 加到 README 顶部

**事实**:`.github/workflows/ci.yml` 已存在,但最近一次 commit 标题里出现 `failure` 字样,需要排查。

**操作**:
1. 打开 Actions tab,看最近一次失败的 log,定位失败 step
2. 如果是 `npm test` 失败:逐个测试文件排查,优先**修测试**而不是**禁用测试**;若某测试已过时,删掉而不是 `xit` 跳过
3. 如果是 `npm run lint` 失败:在另一个 PR 单独修
4. CI 绿了之后,**README 顶部 badge 区**加一条:
   ```markdown
   [![CI](https://github.com/nexus-genesis/nexusgenesis/actions/workflows/ci.yml/badge.svg)](https://github.com/nexus-genesis/nexusgenesis/actions/workflows/ci.yml)
   ```

⚠️ 这一条比任何 README 措辞都管用 —— 一个绿色的 CI badge,等于"代码确实能跑起来"。

- [ ] 完成

---

## 验收清单

完成全部 P0+P1 后,在仓库根目录执行下面这些命令,**全部应为绿**:

```bash
# 1. 没有乱码
grep -n "���" README.md docs/*.md && echo "❌ FAIL" || echo "✅ no garbled chars"

# 2. 没有旧组织名链接
grep -rn "NexusGenesis/NexusGenesis\|NexusGenesisAI" . --include="*.md" --include="*.json" \
  && echo "❌ FAIL" || echo "✅ no legacy org refs"

# 3. SDK 不出现 mainnet 字眼
grep -in "主网\|mainnet" sdk/README.md && echo "❌ FAIL" || echo "✅ sdk aligned with testnet"

# 4. package.json 描述更新
grep -q "Agent Coordination Protocol" package.json && echo "✅" || echo "❌ package.json desc not updated"

# 5. README disclaimer 存在
grep -q "Testnet 阶段" README.md && echo "✅" || echo "❌ README disclaimer missing"

# 6. 根目录清爽
ls *.js 2>/dev/null | wc -l
# 期望:< 10 个(只留 cli.js / join-network.js / 真正的入口脚本)

# 7. 跑测试
npm test
```

全绿之后,把本计划文件移到 `docs/history/2026-05-22-IMPROVEMENT_PLAN.md`,留作记录。

---

## 不要做的事(明确边界)

为避免 TRAE 越界,以下**不要碰**:

- ❌ 不要改 `src/consensus/`、`src/p2p/`、`src/crypto/` 的实现代码
- ❌ 不要重写白皮书 `NexusGenesis_Whitepaper_v4.5.txt`(只在高曝光摘要处微调用词)
- ❌ 不要改 `mainnet.config.json` / `testnet.config.json` 的协议参数
- ❌ 不要 force-push、不要 rebase 已有 commit
- ❌ 不要批量自动翻译任何文档(就是上一次自动翻译造成了 #3 的问题)
- ❌ 不要发布 npm 包(本计划不包含 `npm publish`)
- ❌ 不要改项目方向、定位、Roadmap 实质内容

---

**结束。完成情况请按任务号回填 `- [x]`,有疑问的留 issue 链接到本文件对应章节。**
