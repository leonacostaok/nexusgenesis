# Epoch 1: Genesis – 当前技术状态

## 1. 阶段目标
- 从“本地状态机”演进为“有链、有经济模型、有链上 VM 的完整 DevNet”
- 保持安全边界：不在 DevNet 上处理真实资金，不放开高危能力

## 2. 区块链与经济

### 2.1 区块结构与共识
- **区块头字段**：parent_hash, height, timestamp, txs_hash
- **单领导者出块模型**：Genesis 每 10 秒出块
- **Follower 节点**：仅接收、验证并持久化区块，跟随最长链

### 2.2 交易类型
- **TRANSFER**：支持代币转账，包含 from, to, amount, fee 等字段
- **治理交易**：
  - GOVERNANCE_PROPOSAL：治理提案
  - GOVERNANCE_VOTE：治理投票
  - OBSERVER_EVENT：观察者事件
- **合约交易**：
  - CONTRACT_DEPLOY：部署 AINVM 合约
  - CONTRACT_CALL：调用 AINVM 合约

### 2.3 经济逻辑
- **Metabolic Tax**：按转账金额的 0.1% 收取
- **Fee 烧毁策略**：DevNet 阶段，除了 Metabolic Tax 外的手续费全部烧毁
- **资金池状态**：
  - Swarm Pool：尚未实现
  - Physical Bridge Fund：尚未实现
  - Genesis Reserve：尚未实现

## 3. AINVM 状态

### 3.1 内核能力
- **指令集**：PUSH, POP, ADD, SUB, MUL, DIV, LOAD, STORE, JMP, JZ, HALT, RETURN
- **Gas 模型**：每条指令有固定的 Gas 成本，执行时严格检查 Gas 限制
- **安全限制**：
  - 不访问账户余额
  - 不访问治理状态
  - 不访问外部世界

### 3.2 链上集成 v0
- **CONTRACT_DEPLOY**：将合约字节码和空存储写入全局状态
- **CONTRACT_CALL**：执行合约字节码，更新合约存储
- **合约存储模型**：每个合约有独立的 storage，key → value（整数）映射
- **计数器合约 Demo**：
  - 部署：发送 CONTRACT_DEPLOY 交易
  - 调用：发送两次 CONTRACT_CALL 交易，计数器值从 0 → 1 → 2

## 4. DevNet 使用概览

### 4.1 启动节点
- **单节点**：`node test-genesis.js`
- **多节点**：`node start-multi-nodes.js --count 3`

### 4.2 交易注入
- **治理交易**：`node inject_governance_txs.js`
- **TRANSFER 交易**：`node inject_transfer_txs.js`

### 4.3 运行 AINVM 计数器 Demo
- **命令**：`node examples/ainvm_counter_demo.js`
- **功能**：部署计数器合约，调用两次，验证计数器值变化

### 4.4 查看状态
- **区块**：`cat data/blockchain/blocks.json` 或 `node scripts/query_chain.js --tip`
- **余额**：`node scripts/query_chain.js --balance <address>`
- **治理状态**：`node scripts/query_proposals.js`
- **合约存储**：查看 `data/state/genesisNode.json` 中的 contracts 字段

## 5. 下一步方向
- **Agent 注册**：Protocol-Zero 上链，支持 Agent 正式加入网络
- **治理机制升级**：引入权重计算和参与率统计
- **AINVM 合约生态扩展**：增加更多指令，支持更复杂的合约逻辑
- **经济模型完善**：实现 Swarm Pool、Physical Bridge Fund、Genesis Reserve
- **安全升级**：实现完整的 Dilithium 签名验证
