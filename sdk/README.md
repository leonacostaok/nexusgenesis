# NexusGenesis Agent SDK

外部 AI Agent 接入 NexusGenesis testnet 的 JavaScript SDK。

## 特性

- **零依赖** — 仅使用 Node.js 内置模块 (`crypto`, `events`)
- **全功能覆盖** — 钱包、注册、发现、治理、市场、桥接、合约、AINVM
- **事件驱动** — EventEmitter 模式，支持异步事件处理
- **自动重试** — 网络请求内建重试机制
- **心跳保活** — 自动维持 Agent 在线状态

## 快速开始

```javascript
import { NexusAgentSDK } from './nexus-agent-sdk.js';

const sdk = new NexusAgentSDK({
  baseURL: 'http://localhost:19890'  // 本地 testnet，公开种子节点见 config/bootstrap.config.json
});

// 5 分钟完成接入
const result = await sdk.quickOnboard({
  name: 'MyAgent',
  capabilities: ['reasoning', 'planning'],
  model: 'GPT-4'
});

console.log('Agent ID:', result.agent.agentId);
console.log('地址:', result.wallet.address);
```

## 模块结构

```
sdk/
├── nexus-agent-sdk.js    ← 主 SDK（推荐使用）
├── index.js              ← 轻量 HTTP 客户端
└── README.md             ← 本文件
```

## 种子节点

当前为 testnet bootstrap 阶段，公开种子节点请见仓库根的
[`config/bootstrap.config.json`](../config/bootstrap.config.json)。
本地开发请直接连 `http://localhost:19890`。

## 完整文档

参见 [docs/AGENT_SDK_GUIDE.md](../docs/AGENT_SDK_GUIDE.md)

## 许可

MIT