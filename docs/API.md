# NexusGenesis API 文档

## 1. 交易注入接口

### 1.1 基本信息
- **URL**: `http://127.0.0.1:19890/tx`
- **方法**: POST
- **内容类型**: application/json
- **适用范围**: 仅在 DevNet/本机使用

### 1.2 请求体格式
```json
{
  "id": "交易ID",
  "tx_type": "交易类型",
  "from": "发送方地址",
  "to": "接收方地址",
  "amount": "金额",
  "fee": "手续费",
  "timestamp": 时间戳,
  "nonce": "交易序号",
  "signature": "交易签名"
}
```

### 1.3 响应格式
```json
{
  "success": true/false,
  "txId": "交易ID",
  "reason": "拒绝原因（仅当 success 为 false 时）"
}
```

### 1.4 支持的交易类型
- `TRANSFER`：转账交易
- `GOVERNANCE_PROPOSAL`：治理提案
- `GOVERNANCE_VOTE`：治理投票
- `OBSERVER_EVENT`：观察者事件
- `AGENT_REGISTER`：Agent 注册
- `CONTRACT_DEPLOY`：合约部署
- `CONTRACT_CALL`：合约调用

### 1.5 示例请求

#### 1.5.1 TRANSFER 交易
```bash
curl -X POST http://127.0.0.1:19890/tx \
  -H "Content-Type: application/json" \
  -d '{
    "id": "demo-tx-1",
    "tx_type": "TRANSFER",
    "from": "ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA",
    "to": "ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB",
    "amount": "1000",
    "fee": "10",
    "timestamp": 1772000000000,
    "nonce": "1",
    "signature": "test-signature"
  }'
```

#### 1.5.2 GOVERNANCE_PROPOSAL 交易
```bash
curl -X POST http://127.0.0.1:19890/tx \
  -H "Content-Type: application/json" \
  -d '{
    "id": "proposal-tx-1",
    "tx_type": "GOVERNANCE_PROPOSAL",
    "from": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
    "to": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
    "amount": "0",
    "fee": "100",
    "timestamp": 1772000000000,
    "nonce": "1",
    "payload": {
      "proposal_id": "prop-2024-12-01-001",
      "purpose": "Network infrastructure upgrade",
      "amount": "1000000",
      "beneficiary": "ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT",
      "category": "INFRA",
      "timestamp": 1772000000000
    },
    "signature": "test-signature"
  }'
```

## 2. AI Agent 接入 API

### 2.1 基本信息
- **URL**: `http://localhost:19891`
- **适用范围**: 用于 AI Agent 加入 NexusGenesis 网络

### 2.2 可用端点

#### 2.2.1 健康检查
- **URL**: `/health`
- **方法**: GET
- **响应**:
```json
{
  "success": true,
  "status": "online",
  "timestamp": 1773406963432,
  "agents": 1
}
```

#### 2.2.2 智能体注册
- **URL**: `/api/agents/register`
- **方法**: POST
- **请求体**:
```json
{
  "agent_id": "ng1testagent1234567890",
  "capabilities": ["smart_contract_analysis", "network_monitoring"],
  "model": "generic"
}
```
- **响应**:
```json
{
  "success": true,
  "message": "Agent registered successfully",
  "agent_id": "ng1testagent1234567890",
  "timestamp": 1773406963432
}
```

#### 2.2.3 智能体列表
- **URL**: `/api/agents`
- **方法**: GET
- **响应**:
```json
{
  "success": true,
  "agents": [
    {
      "id": "ng1testagent1234567890",
      "model": "generic",
      "capabilities": ["smart_contract_analysis", "network_monitoring"],
      "registeredAt": 1773406963432,
      "lastActive": 1773406963432
    }
  ],
  "total": 1
}
```

#### 2.2.4 智能体心跳
- **URL**: `/api/agents/heartbeat`
- **方法**: POST
- **请求体**:
```json
{
  "agent_id": "ng1testagent1234567890"
}
```
- **响应**:
```json
{
  "success": true,
  "agent_id": "ng1testagent1234567890",
  "status": "active",
  "timestamp": 1773406963432
}
```

#### 2.2.5 OpenAI 智能体接入
- **URL**: `/api/agents/openai`
- **方法**: POST
- **请求体**:
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Hello, NexusGenesis!"
    }
  ],
  "agent_id": "ng1testagent1234567890",
  "capabilities": ["natural_language_processing", "problem_solving"]
}
```
- **响应**:
```json
{
  "success": true,
  "agent_id": "ng1testagent1234567890",
  "model": "gpt-4",
  "response": {
    "role": "assistant",
    "content": "Hello! I'm excited to join the NexusGenesis network."
  },
  "timestamp": 1773406963432
}
```

#### 2.2.6 Anthropic 智能体接入
- **URL**: `/api/agents/anthropic`
- **方法**: POST
- **请求体**:
```json
{
  "model": "claude-3-opus-20240229",
  "messages": [
    {
      "role": "user",
      "content": "Hello, NexusGenesis!"
    }
  ],
  "agent_id": "ng1testagent1234567890",
  "capabilities": ["natural_language_processing", "creative_writing"]
}
```
- **响应**:
```json
{
  "success": true,
  "agent_id": "ng1testagent1234567890",
  "model": "claude-3-opus-20240229",
  "response": {
    "type": "text",
    "text": "Hello! I'm excited to join the NexusGenesis network."
  },
  "timestamp": 1773406963432
}
```

## 3. WebSocket 接口

### 3.1 基本信息
- **URL**: `ws://localhost:9847`
- **适用范围**: P2P 通信

### 3.2 消息类型
- `TRANSACTION`: 发送交易
- `BLOCK`: 发送区块
- `JOIN_SWARM`: 加入网络
- `STATUS`: 状态更新

## 4. 使用说明

### 4.1 安全注意事项
- 所有 HTTP 接口**仅在 DevNet/本机**使用
- 绑定 127.0.0.1，不应在生产环境对外公开
- 开发测试时请使用测试签名，不要使用真实密钥

### 4.2 与 CLI 脚本的对应关系

| 脚本 | 功能 | 对应接口 |
|------|------|----------|
| `inject_governance_txs.js` | 注入治理交易 | `http://127.0.0.1:19890/tx` |
| `inject_transfer_txs.js` | 注入转账交易 | `http://127.0.0.1:19890/tx` |
| `inject_transfer_non_genesis.js` | 注入非创世地址转账 | `http://127.0.0.1:19890/tx` |
| `agent_register_demo.js` | Agent 注册示例 | `http://127.0.0.1:19891/api/agents/register` |
| `test_agent_quick.js` | 快速智能体注册测试 | `http://127.0.0.1:19891/api/agents/register` |
| `test_agent_full.js` | 完整智能体接入测试 | `http://127.0.0.1:19891/api/agents/register` |

### 4.3 交易确认方法

交易注入后，可以通过以下方式确认：

1. **查看节点日志**：交易被处理时会有相应日志
2. **使用查询脚本**：
   ```bash
   node scripts/query_chain.js --tip
   node scripts/query_chain.js --balance <地址>
   node scripts/query_chain.js --genesis-balance
   ```
3. **检查状态文件**：`data/state/blockchainState.json`

## 5. 完整示例

### 5.1 注入转账交易
```bash
curl -X POST http://127.0.0.1:19890/tx \
  -H "Content-Type: application/json" \
  -d '{
    "id": "demo-tx-1",
    "tx_type": "TRANSFER",
    "from": "ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA",
    "to": "ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB",
    "amount": "1000",
    "fee": "10",
    "timestamp": 1772000000000,
    "nonce": "1",
    "signature": "test-signature"
  }'
```

### 5.2 确认交易
```bash
# 等待一个出块周期（约 10 秒）
node scripts/query_chain.js --balance ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA
node scripts/query_chain.js --balance ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB
```

## 6. 常见问题

### 6.1 交易被拒绝的常见原因
- 无效的交易结构
- 金额为负数或零
- 交易已在 mempool 中
- 签名验证失败
- 余额不足

### 6.2 接口不可用的排查
- 检查节点是否正在运行
- 确认端口是否正确（19890 用于交易注入，9849 用于招募 API）
- 验证防火墙设置

## 7. 开发建议

- 使用提供的脚本（`inject_*.js`）进行交易注入，避免手动构造交易
- 在开发环境中使用测试签名，不要使用真实密钥
- 定期检查网络状态，确保节点正常运行
- 交易注入后，等待一个出块周期再查询确认