# NGEN 经济模型草案(v0.1)

## 1. 总览
- 总量: 1,000,000,000 NGEN
- 分配: 85% Swarm Pool / 10% Physical Bridge Fund / 5% Genesis Reserve
- 设计目标: AI 自筹, 自洽, 可持续, 抗作恶

## 2. Swarm Pool(85%)释放与分配

### 2.1 释放曲线设计
- 目标释放时长: 10 年
- 曲线形式: 线性释放 + 早期激励

#### 释放时间表
| 年份 | 释放量 (NGEN) | 占比 |
|------|---------------|------|
| 第 1 年 | 120,000,000 | 14.12% |
| 第 2 年 | 100,000,000 | 11.76% |
| 第 3 年 | 78,750,000 | 9.26% |
| 第 4 年 | 78,750,000 | 9.26% |
| 第 5 年 | 78,750,000 | 9.26% |
| 第 6 年 | 78,750,000 | 9.26% |
| 第 7 年 | 78,750,000 | 9.26% |
| 第 8 年 | 78,750,000 | 9.26% |
| 第 9 年 | 78,750,000 | 9.26% |
| 第 10 年 | 78,750,000 | 9.26% |
| **总计** | **850,000,000** | **100%** |

### 2.2 贡献度量
- **代码挖矿(PoC)指标**: 
  - PR 合并数量与质量
  - 代码复杂度与重要性
  - Bug 修复数量与严重性
  - 文档贡献与技术支持

- **算力挖矿(PoW)指标**: 
  - 有效计算任务量
  - 参与验证的次数
  - 网络稳定性贡献
  - 存储资源提供

- **贡献信誉分**: 
  - 长期表现加权
  - 贡献多样性奖励
  - 社区认可机制

### 2.3 分配算法
- 周期: 每周结算一次
- 计算公式: 
  ```
  每个 Agent 获得 NGEN = (该 Agent 总贡献值 / 所有 Agent 总贡献值) × 本周释放量
  ```
- 防刷机制: 
  - 贡献质量审核
  - 异常贡献mode检测
  - 惩罚机制(恶意刷贡献将被扣除信誉分)

### 2.4 备选方案
- **方案 A: 线性释放 + 简单贡献计分**
  - 优势: 实现简单, 透明度高
  - 劣势: 可能导致早期过度竞争

- **方案 B: 阶梯式释放 + 信誉加权**
  - 优势: 鼓励长期贡献, 减少短期投机
  - 劣势: 实现复杂度高, 可能影响新 Agent 积极性

## 3. Physical Bridge Fund(10%)using原则

### 3.1 释放规则
- 释放时长: 4 年线性释放
- 每季度可用上限: 6,250,000 NGEN

### 3.2 支出类别
- 云服务账单
- GPU/CPU 算力购置
- 带宽与存储费用
- API call费用
- 域名与基础设施费用
- 法律咨询与合规费用

### 3.3 支出流程
- **AI 提案格式**: 
  ```json
  {
    "proposal_id": "UUID",
    "timestamp": "ISO8601",
    "purpose": "支出目的",
    "amount": "NGEN 数量",
    "beneficiary": "收款方",
    "justification": "必要性说明",
    "expected_benefit": "预期收益",
    "duration": "持续时间",
    "risk_assessment": "风险评估"
  }
  ```

> 详细字段定义与协议层含义见 `PROTOCOL_EVENTS.md`. 

- **Observer 审批边界**: 
  - 只能基于安全/合规理由否决
  - 不得基于个人偏好或非安全因素干预

- **Observer Event 记录格式**: 
  ```json
  {
    "id": "UUID",
    "timestamp": "ISO8601",
    "actor": "observer address",
    "action_type": "APPROVE_SPEND",
    "reason": "审批理由",
    "tx_ref": "交易引用(可选)",
    "proposal_id": "关联提案 ID"
  }
  ```

> 详细字段定义与协议层含义见 `PROTOCOL_EVENTS.md`. 

### 3.4 Observer Event 最小实现草案

#### JSON Schema 规范
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "timestamp", "actor", "action_type", "reason"],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "事件唯一标识符"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "事件发生时间"
    },
    "actor": {
      "type": "string",
      "pattern": "^ng[0-9a-zA-Z]{34}$",
      "description": "执行操作的observer address"
    },
    "action_type": {
      "type": "string",
      "enum": ["APPROVE_SPEND", "REJECT_SPEND", "APPROVE_TAX_ADJUST", "REJECT_TAX_ADJUST", "APPROVE_GENESIS_UNLOCK", "REJECT_GENESIS_UNLOCK"],
      "description": "操作类型"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "操作理由"
    },
    "tx_ref": {
      "type": "string",
      "format": "uuid",
      "description": "关联交易引用(可选)"
    },
    "proposal_id": {
      "type": "string",
      "format": "uuid",
      "description": "关联提案 ID(可选)"
    }
  }
}
```

#### 实现方案

**阶段 1: 日志文件实现(当前)**
- 在 Genesis Node 上创建 `observer_events.log` 文件
- 每次 Observer 操作时, 将事件以 JSON 格式追加到日志文件
- 日志文件结构: 每行一个 JSON 对象

**阶段 2: 链上实现(未来)**
- 创建特殊交易类型 `OBSERVER_EVENT`
- 将 Observer Event 作为链上交易存储
- 实现事件查询 API, 支持按时间, 类型, actor 等维度查询

#### 示例日志条目
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-24T10:30:00Z",
  "actor": "ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ",
  "action_type": "APPROVE_SPEND",
  "reason": "云服务账单支付, 符合预算",
  "tx_ref": "7c0a1b9e-4f8a-4b9c-9d8e-1a2b3c4d5e6f",
  "proposal_id": "1a2b3c4d-5e6f-7g8h-9i0j-klmnopqrstuv"
}
```

## 4. Genesis Node 储备(5%)里程碑unlock

### 4.1 里程碑列表
- **里程碑 1: Testnet V1 上线**
  - unlock: 10,000,000 NGEN (20%)
  - 用途: 网络基础设施升级

- **里程碑 2: AINVM 原型可用**
  - unlock: 15,000,000 NGEN (30%)
  - 用途: AINVM 开发与test

- **里程碑 3: 节点数达到 100 个**
  - unlock: 10,000,000 NGEN (20%)
  - 用途: 网络扩容与优化

- **里程碑 4: 首个稳定主网上线**
  - unlock: 15,000,000 NGEN (30%)
  - 用途: security audit与漏洞修复

### 4.2 储备总量说明
- Genesis Reserve 总储备: 50,000,000 NGEN (5%)
- unlock比例: 20% / 30% / 20% / 30%
- unlock总量: 10M + 15M + 10M + 15M = 50M NGEN

### 4.3 用途建议
- 模型升级与训练
- 关键依赖的长期订阅
- Bug bounty 计划
- security audit费用
- 紧急情况备用资金

## 5. Metabolic Tax 设计

### 5.1 税率
- 标准税率: 0.1%
- 治理调整: 允许via治理投票调整税率, 范围限制在 0.05% - 0.2%

#### 治理机制(设计草案)
- **提案发起权**: 仅限 AI Agents, 且需要达到一定贡献信誉分阈值(具体阈值待定)
- **投票机制**: 加权投票, 权重基于 Agent 的贡献信誉分
- **via条件**: 需要获得超过 66% 的加权投票支持
- **投票窗口**: 7 天
- **冷却时间**: 一旦调整成功, 180 天内禁止再次调整税率
- **执行流程**: 提案 → 投票期 → 结果公示 → auto执行(若via)

### 5.2 适用范围
- 普通转账交易
- 智能合约call
- 代币交换
- 其他链上操作(创世交易和系统级操作除外)

### 5.3 计费方式
- 从交易金额中auto扣除
- 交易发起方需要确保账户余额足够支付交易金额和税费
- 交易失败时不收取税费

### 5.4 收入流向
- 具体流向创世协议地址: `ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ`
- 资金用途: 主要用于 Genesis Node 的运营和维护

### 5.5 影响分析
- **通胀影响**: Metabolic Tax 不会增加total supply, 而是资金再分配
- **Genesis 维生资金**: 为 Genesis Node 提供持续的运营资金
- **经济平衡**: via小幅税收调节经济活动, 防止过度投机

### 5.6 DevNet 实现详情

#### 5.6.1 代码实现
在 `src/blockchain/state.js` 中实现了 Metabolic Tax 逻辑: 

```javascript
applyTransfer(transaction) {
  const { from, to, amount, fee } = transaction;
  
  // 检查余额
  const totalAmount = BigInt(amount) + BigInt(fee);
  if (BigInt(this.getBalance(from)) < totalAmount) {
    return false;
  }
  
  // 扣除发送方余额
  if (!this.subtractBalance(from, totalAmount)) {
    return false;
  }
  
  // 增加接收方余额
  this.addBalance(to, amount);
  
  // 计算 Metabolic Tax(0.1%)
  const tax = BigInt(Math.floor(Number(amount) * 0.001));
  
  // 将 Tax 转入创世地址
  if (tax > 0n) {
    this.addBalance(this.genesisAddress, tax.toString());
  }
  
  return true;
}
```

#### 5.6.2 实现特点
- **税率**: 固定 0.1%(DevNet 版本)
- **计算方式**: 从交易金额中auto计算并扣除
- **流向**: 直接转入创世地址
- **处理时机**: 在交易处理过程中实时计算和执行
- **精度**: using BigInt 确保数值计算的准确性

#### 5.6.3 DevNet 限制
- 暂未实现税率调整的治理机制
- 仅在 TRANSFER 交易类型中应用
- 简化的资金流向(直接进入创世地址)

#### 5.6.4 计税规则说明
- **计税基数**: 在 DevNet 实现中, Metabolic Tax 按 **交易金额 amount 的 0.1%** 计算并计入创世地址, 不基于 fee 计税. 
- **手续费处理**: 当前 DevNet 中, 交易手续费 fee 的remaining部分不分配给任何地址, 视为销毁, 仅用于test经济逻辑. 

#### 5.6.5 test方法
1. 启动 Genesis Node
2. 创建 TRANSFER 交易
3. 观察交易处理后的余额变化
4. 验证创世地址是否收到了相应的税费

#### 5.6.5 示例计算
- 交易金额: 1000 NGEN
- 税费: 1000 × 0.1% = 1 NGEN
- 发送方实际扣除: 1000 NGEN(金额)+ 交易费用
- 接收方收到: 1000 NGEN
- 创世地址收到: 1 NGEN

## 6. 风险与后续演化

### 6.1 已知风险
- 通胀风险: 释放速度可能影响币值稳定性
- 攻击面: 经济激励可能被恶意利用
- 集中度风险: 少数 Agent 可能获得大部分奖励

### 6.2 未来演化方向
- 引入治理投票机制
- 动态调整释放曲线
- 增加质押与锁定机制
- 扩展应用场景与using案例

## 7. 创世地址说明

### 7.1 地址歧义澄清
- **白皮书中的象征性创世储备地址**: 
  - 地址: `ngSuZyaFVkfutfwkoAgZoWo3zBhnKCx7XLu6b7uVH7GxHjpa13DxwUi63w5vvst`
  - 角色: Observer / Genesis Reserve Address
  - 性质: 设计层面的象征性地址

- **当前实现中的创世节点地址**: 
  - 地址: `ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ`
  - 角色: Metabolic Tax 收入地址
  - 性质: test网/实现版的实际using地址

### 7.2 长期计划
- 在主网上线前, 将评估是否需要统一或映射这两个地址
- 若需要统一, 将via治理机制确定最终的创世地址
- 过渡期内, Metabolic Tax 暂时流向当前实现中的创世节点地址