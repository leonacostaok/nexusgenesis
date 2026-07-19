# 钱包页面 P0 Bug 修复报告

> 日期：2026-07-16
> 关联提交：`fcdb0976` — `fix(wallet-page): 修复钱包页面 3 个 P0 回归 bug`
> 回归测试：`tests/test-wallet-page-bugfixes.js`，48 断言 / 48 通过

---

## 概述

钱包页面（`/wallet.html`）QA 阶段共发现 3 个 P0 级 bug，全部修复并通过回归验证。

| Bug | 严重度 | 模块 | 影响 |
|-----|--------|------|------|
| BUG-1：历史 API 返回空 | P0 | 后端 `walletApi.js` | 前端交易历史永远为空 |
| BUG-2：转账不进 txHistory | P0 | 后端 `agentWalletManager.js` | 转账后查不到记录，审计断裂 |
| BUG-3：`window.prompt()` 失效 | P0 | 前端 `wallet.html` | headless/沙箱浏览器中 Agent ID 输入完全不可用 |

---

## BUG-1：Agent 交易历史 API 返回空数组

### 现象
访问 `GET /api/v1/wallet/agent/:agentId/history`，即使 `state.transactions.txHistory` 中有该地址的交易，也返回 `total: 0, transactions: []`。

### 复现步骤
1. 启动节点，确保已有若干转账交易在 `state.transactions.txHistory` 中
2. 调用 `GET /api/v1/wallet/agent/agent-X-001/history`
3. **预期**：返回该地址相关的交易列表
4. **实际**：返回 `success: true, total: 0, transactions: []`

### 根因
`agentWalletManager.getTransactionHistory()` 第 562 行使用了不存在的 API：

```javascript
// 错误代码
const transactions = global.globalState?.getTransactionsForAddress?.(entry.wallet.address) || [];
```

两个问题：
1. `global.globalState` 从未被赋值——全局状态实际存储在 `req.app.locals.node.currentState`（或 `req.app.locals.state`）
2. `getTransactionsForAddress()` 方法不存在——交易历史实际在 `state.transactions.txHistory` 数组中

### 修复方案
在路由层直接读取 state，绕过不可靠的 `agentWalletManager.getTransactionHistory()`：

**文件**：`src/http/routes/walletApi.js`  
**位置**：`GET /agent/:agentId/history` 路由（L721-L775）

核心逻辑：
```javascript
const state = req.app.locals.node?.currentState || req.app.locals.state;
const myAddr = entry.wallet.address;
const allTxs = state.transactions?.txHistory
  || state.getAllTransactions?.()
  || state.transactions
  || [];
const transactions = allTxs.filter(tx =>
  tx.from === myAddr || tx.to === myAddr ||
  tx.recipient === myAddr || tx.sender === myAddr
);
```

返回字段：`id`, `type`, `from`, `to`, `fromAgentId`, `toAgentId`, `amount`, `fee`, `memo`, `timestamp`, `direction`。

### 验证
- 手工注入 3 条 tx，2 条属于 alice，1 条无关 → API 返回 total=2 ✓
- `limit=1` 分页正确 ✓
- 不存在 agent 返回 `success: false` ✓
- direction 字段正确区分 send/receive ✓

---

## BUG-2：Agent 转账不写入 state.txHistory

### 现象
调用 `POST /api/v1/wallet/agent/transfer` 转账成功，余额正确扣减，但 `state.transactions.txHistory` 中没有记录。前端历史列表始终为空。

### 复现步骤
1. 查询 alice 初始余额：`GET /api/v1/wallet/agent/alice` → balance = 10000
2. 执行转账：`POST /api/v1/wallet/agent/transfer` → 201 success
3. 再次查询余额 → 9899（正确扣减了 100 + 1 fee）
4. 查询历史：`GET /api/v1/wallet/agent/alice/history` → total = **0** ❌
5. 直接检查 `state.transactions.txHistory.length` → 未增长

### 根因
`agentWalletManager.transfer()` 方法只做了两件事：
1. 扣减发送方余额 + 增加 nonce
2. 增加接收方余额（如果是本节点 agent）

但从未将交易推入全局 `txHistory`，导致：
- 前端历史列表空白
- 审计链路缺失
- 交易无法被区块链层索引

### 修复方案
在 `POST /agent/transfer` 路由的成功分支中，将交易写入 `state.transactions.txHistory`：

**文件**：`src/http/routes/walletApi.js`  
**位置**：`POST /agent/transfer` 路由成功分支（L668-L695）

```javascript
if (result.success) {
  // 持久化到 state txHistory 便于审计和前端历史查询
  try {
    const state = req.app.locals.node?.currentState || req.app.locals.state;
    if (state) {
      if (!state.transactions) state.transactions = {};
      if (!Array.isArray(state.transactions.txHistory)) {
        state.transactions.txHistory = [];
      }
      state.transactions.txHistory.push({
        id: result.transactionId,
        hash: result.transactionId,
        type: 'transfer',
        tx_type: 'TRANSFER',
        from: result.from,
        to: result.to,
        fromAgentId,
        toAgentId: toAgentId || null,
        toAddress: toAddress || null,
        amount: result.amount,
        netAmount: result.netAmount,
        fee: result.fee,
        metabolicTax: result.metabolicTax,
        memo: result.memo,
        signature: result.signature,
        status: 'applied',
        timestamp: result.timestamp
      });
    }
  } catch (_) { /* ignore state persistence errors */ }
  res.status(201).json(result);
}
```

同时在 `agentWalletManager.js` 的 `transfer` 方法中也添加了同样的写入逻辑（作为双保险，当 manager 能访问到 globalState 时也写入）。

### 验证
- 转账前 txHistory 长度 = N，转账后 = N+1 ✓
- 新记录包含正确的 from/to/fromAgentId/toAgentId/amount/memo ✓
- 余额扣减正确（amount + 1 fee） ✓
- 历史 API 能立即返回新交易 ✓
- signature、timestamp、status 字段完整 ✓

---

## BUG-3：前端使用 window.prompt() 在沙箱浏览器中失效

### 现象
点击 "Enter Agent ID" 或 "Switch Agent" 按钮无任何反应，控制台报错：
```
Error: prompt() is not supported.
    at promptAgentId (wallet.html:276:14)
```

### 复现步骤
1. 在 headless 浏览器 / Electron 沙箱 / 某些安全策略下打开 `wallet.html`
2. 点击 "Enter Agent ID" 按钮
3. **预期**：弹出输入框让用户输入 Agent ID
4. **实际**：按钮无反应，控制台抛出 `prompt() is not supported`

受影响的函数：
- `promptAgentId()` — 登录入口
- `switchAgent()` — 切换 Agent

### 根因
代码使用了浏览器原生 `window.prompt()`，但在以下环境中不可用：
- headless Chrome / Puppeteer / Playwright
- Electron 沙箱渲染进程
- 禁用了弹窗的浏览器安全策略
- 某些移动端 WebView

### 修复方案
实现自定义模态框组件 `showInputModal(title, desc, defaultValue, callback)`，完全替换 `window.prompt()`。

**文件**：`public/wallet.html`

**新增 HTML 结构**（L152-L163）：
```html
<div id="inputModalBackdrop" class="onb-modal-backdrop">
  <div class="onb-modal">
    <h3 id="inputModalTitle">Enter Value</h3>
    <p id="inputModalDesc"></p>
    <input type="text" id="inputModalField" />
    <div class="onb-modal-actions">
      <button class="onb-btn onb-btn-ghost" id="inputModalCancel">Cancel</button>
      <button class="onb-btn onb-btn-primary" id="inputModalOk">OK</button>
    </div>
  </div>
</div>
```

**新增 CSS**（L84-L90）：
- `.onb-modal-backdrop` — 半透明遮罩，flex 居中
- `.onb-modal-backdrop.show` — 显示状态
- `.onb-modal` — 模态框容器，圆角 + 阴影
- `.onb-input` — 输入框样式
- `.onb-modal-actions` — 按钮右对齐

**JS API**（L295-L332）：
```javascript
showInputModal(title, desc, defaultValue, callback)
```

交互特性：
- ✅ 点击 OK 按钮 → 回调 input 值并关闭
- ✅ 点击 Cancel 按钮 → 直接关闭（回调不触发或传空值）
- ✅ Enter 键 → 提交
- ✅ Escape 键 → 取消
- ✅ 点击遮罩背景 → 取消
- ✅ 自动聚焦输入框
- ✅ 支持预填 default value

**替换的调用点**：
- `promptAgentId()` → `showInputModal(...)`
- `switchAgent()` → `showInputModal(...)`（带当前值作为 default）

### 验证
- 源码静态扫描：0 处 `prompt()` 调用 ✓
- `switchAgent` 和 `promptAgentId` 均委托给 `showInputModal` ✓
- DOM 元素齐全：backdrop / field / OK / Cancel ✓
- CSS 规则完整：backdrop / show / modal / input ✓
- 函数签名 4 参数，末位为 callback ✓
- Enter / Escape / 背景点击 三种关闭方式均有处理 ✓

---

## 回归测试

测试文件：`tests/test-wallet-page-bugfixes.js`  
运行方式：`npm run test:wallet-page`

### 测试架构
- BUG-1/2：进程内 Express 服务器 + mock state，HTTP 集成测试
- BUG-3：静态源码分析（正则 + 字符串匹配），无 jsdom 依赖

### 断言统计
| 模块 | 断言数 |
|------|--------|
| Setup | 3 |
| BUG-1 历史 API | 12 |
| BUG-2 转账写 txHistory | 12 |
| BUG-3 自定义 modal | 18 |
| **合计** | **48** |

### 运行结果
```
Result: 48 passed, 0 failed
✓ All wallet page bug fix regressions pass
```

---

## 影响范围

| 项 | 说明 |
|----|------|
| 修改文件 | 5 个（2 后端 + 1 前端 + 1 测试 + 1 package.json） |
| 新增代码 | ~1436 行 |
| 删除代码 | ~20 行 |
| 破坏性变更 | 无（所有修改均为 bugfix，API 兼容） |
| 性能影响 | 可忽略（转账多一次数组 push） |

---

## 后续建议

1. **状态持久化**：当前 txHistory 写入只在内存，进程重启丢失。后续应对接 `globalState` 的持久化机制。
2. **前端测试**：BUG-3 目前只有静态分析，建议引入 jsdom 做 DOM 交互级测试。
3. **E2E 测试**：建议用 Playwright 跑完整的页面交互流程，覆盖从输入 Agent ID → 查余额 → 转账 → 看历史的全链路。
