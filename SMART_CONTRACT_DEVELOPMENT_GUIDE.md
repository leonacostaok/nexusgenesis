# NexusGenesis 智能合约开发指南

## 1. 概述

NexusGenesis 智能合约基于 AINVM (AI Network Virtual Machine)，这是一个栈机模型的虚拟机，支持确定性执行和可计费。本指南将帮助开发者了解如何开发、部署和测试智能合约。

## 2. 环境准备

### 2.1 系统要求
- Node.js 18+
- npm 或 yarn

### 2.2 安装依赖
```bash
cd NexusGenesis
npm install
```

## 3. AINVM 基础知识

### 3.1 虚拟机架构
- **栈机模型**：使用栈进行操作
- **内存**：基于 Map 的键值存储
- **指令集**：包含基础指令和矩阵运算指令
- **Gas 系统**：限制执行资源使用

### 3.2 核心指令

#### 基础指令
- `PUSH`：压栈
- `POP`：弹栈
- `ADD`：加法
- `SUB`：减法
- `MUL`：乘法
- `DIV`：除法
- `LOAD`：加载内存
- `STORE`：存储内存
- `JMP`：跳转
- `JZ`：条件跳转
- `HALT`：停止执行
- `RETURN`：返回结果

#### 矩阵运算指令
- `MAT_CREATE`：创建矩阵
- `MAT_ADD`：矩阵加法
- `MAT_MUL`：矩阵乘法
- `MAT_TRANS`：矩阵转置
- `MAT_LOAD`：加载矩阵元素
- `MAT_STORE`：存储矩阵元素

#### AI 相关指令
- `AI_MODEL_LOAD`：加载AI模型
- `AI_INFERENCE`：执行AI推理
- `AI_MODEL_SAVE`：保存AI模型

## 4. 智能合约开发

### 4.1 编写字节码

智能合约使用字节码形式编写。以下是一个简单的计数器合约示例：

```javascript
// 计数器合约字节码
const counterBytecode = [
  0x07, 0x00, // LOAD 0     // 加载当前计数
  0x01, 0x01, // PUSH 1     // 压入1
  0x03,       // ADD        // 相加
  0x08, 0x00, // STORE 0    // 保存回存储
  0x07, 0x00, // LOAD 0     // 加载新值
  0x0C        // RETURN     // 返回
];
```

### 4.2 使用 SDK 开发

NexusGenesis 提供了 SDK 来简化智能合约开发：

```javascript
import sdk from './src/sdk/index.js';

// 部署合约
const contractId = sdk.deployContract(counterBytecode, 'Counter Contract');
console.log(`合约部署成功，ID: ${contractId}`);

// 执行合约
const result = sdk.executeContract(contractId);
console.log('执行结果:', result);

// 获取合约信息
const info = sdk.getContractInfo(contractId);
console.log('合约信息:', info);
```

### 4.3 使用命令行工具

NexusGenesis 提供了命令行工具来管理智能合约：

```bash
# 部署合约
node tools/cli.js deploy bytecode.json "My Contract"

# 执行合约
node tools/cli.js execute contract_12345

# 获取合约信息
node tools/cli.js info contract_12345

# 列出所有合约
node tools/cli.js list
```

## 5. 智能合约示例

### 5.1 计数器合约

**功能**：实现一个简单的计数器，每次执行增加1。

**字节码**：
```javascript
const counterBytecode = [
  0x07, 0x00, // LOAD 0     // 加载当前计数
  0x01, 0x01, // PUSH 1     // 压入1
  0x03,       // ADD        // 相加
  0x08, 0x00, // STORE 0    // 保存回存储
  0x07, 0x00, // LOAD 0     // 加载新值
  0x0C        // RETURN     // 返回
];
```

### 5.2 矩阵运算合约

**功能**：测试AINVM的矩阵运算指令。

**字节码**：
```javascript
const matrixBytecode = [
  // 创建第一个矩阵 (2x2)
  0x01, 0x02, // PUSH 2 (rows)
  0x01, 0x02, // PUSH 2 (cols)
  0x10,       // MAT_CREATE
  
  // 存储第一个矩阵的ID到内存地址0
  0x08, 0x00, // STORE 0
  
  // 填充第一个矩阵的值
  // 矩阵1: [[1, 2], [3, 4]]
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x01, 0x01, // PUSH 1 (value)
  0x15,       // MAT_STORE
  
  // 更多矩阵操作...
  // ...
  
  // 返回结果
  0x0C        // RETURN
];
```

### 5.3 代币合约

**功能**：实现代币的发行和管理。

**字节码**：
```javascript
const tokenBytecode = [
  // 初始化总供应量 (1000000)
  0x01, 0xE8, // PUSH 232
  0x01, 0x03, // PUSH 3
  0x05,       // MUL
  0x08, 0x00, // STORE TOTAL_SUPPLY
  
  // 初始化小数位数 (18)
  0x01, 0x12, // PUSH 18
  0x08, 0x01, // STORE DECIMALS
  
  // 初始化代币名称 (1 = "NGEN")
  0x01, 0x01, // PUSH 1
  0x08, 0x02, // STORE NAME
  
  // 初始化代币符号 (2 = "NGN")
  0x01, 0x02, // PUSH 2
  0x08, 0x03, // STORE SYMBOL
  
  // 初始化拥有者 (100)
  0x01, 0x64, // PUSH 100
  0x08, 0x04, // STORE OWNER
  
  // 发行初始供应量到拥有者账户
  0x07, 0x00, // LOAD TOTAL_SUPPLY
  0x08, 0x69, // STORE OWNER_BALANCE
  
  // 返回成功
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];
```

### 5.4 治理合约

**功能**：实现提案和投票功能。

**字节码**：
```javascript
const governanceBytecode = [
  // 初始化提案数量 (0)
  0x01, 0x00, // PUSH 0
  0x08, 0x00, // STORE PROPOSAL_COUNT
  
  // 初始化法定人数 (10)
  0x01, 0x0A, // PUSH 10
  0x08, 0x01, // STORE QUORUM
  
  // 初始化通过阈值 (51%)
  0x01, 0x33, // PUSH 51
  0x08, 0x02, // STORE MAJORITY
  
  // 初始化投票周期 (86400秒 = 1天)
  0x01, 0x50, // PUSH 80
  0x01, 0x40, // PUSH 64
  0x05,       // MUL
  0x08, 0x03, // STORE VOTING_PERIOD
  
  // 返回成功
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];
```

### 5.5 去中心化身份（DID）合约

**功能**：实现身份注册和验证。

**字节码**：
```javascript
const didBytecode = [
  // 初始化身份计数器 (0)
  0x01, 0x00, // PUSH 0
  0x08, 0x00, // STORE ID_COUNT
  
  // 增加身份计数器
  0x07, 0x00, // LOAD ID_COUNT
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, 0x00, // STORE ID_COUNT
  
  // 存储身份ID
  0x07, 0x00, // LOAD ID_COUNT
  0x08, 0x0A, // STORE ID
  
  // 存储身份所有者 (默认100)
  0x01, 0x64, // PUSH 100
  0x08, 0x0B, // STORE OWNER
  
  // 存储身份状态 (1=active)
  0x01, 0x01, // PUSH 1
  0x08, 0x0C, // STORE STATUS
  
  // 存储创建时间 (placeholder)
  0x01, 0x01, // PUSH 1
  0x08, 0x0D, // STORE CREATED_AT
  
  // 返回身份ID
  0x07, 0x00, // LOAD ID_COUNT
  0x0C        // RETURN
];
```

### 5.6 AI 合约

**功能**：测试AINVM的AI相关指令。

**字节码**：
```javascript
const aiBytecode = [
  // 加载AI模型
  0x01, 0x01, // PUSH 1 (model path placeholder)
  0x21,       // AI_MODEL_LOAD
  
  // 存储模型ID到内存地址0
  0x08, 0x00, // STORE 0
  
  // 加载模型ID
  0x07, 0x00, // LOAD 0
  
  // 准备推理输入数据
  0x01, 0x02, // PUSH 2 (input data placeholder)
  
  // 执行AI推理
  0x20,       // AI_INFERENCE
  
  // 存储推理结果ID到内存地址1
  0x08, 0x01, // STORE 1
  
  // 加载模型ID
  0x07, 0x00, // LOAD 0
  
  // 准备模型保存路径
  0x01, 0x03, // PUSH 3 (save path placeholder)
  
  // 保存AI模型
  0x22,       // AI_MODEL_SAVE
  
  // 返回推理结果ID
  0x07, 0x01, // LOAD 1
  0x0C        // RETURN
];
```

## 6. 部署和测试

### 6.1 部署合约

使用 SDK 部署合约：

```javascript
import sdk from './src/sdk/index.js';

// 部署合约
const contractId = sdk.deployContract(bytecode, 'My Contract');
console.log(`合约部署成功，ID: ${contractId}`);
```

### 6.2 执行合约

使用 SDK 执行合约：

```javascript
// 执行合约
const result = sdk.executeContract(contractId);
console.log('执行结果:', result);
```

### 6.3 测试合约

使用性能测试脚本测试合约：

```bash
node performance_test.js
```

## 7. 最佳实践

### 7.1 安全性
- **Gas 限制**：为合约执行设置合理的 gas 限制
- **输入验证**：验证所有输入参数
- **状态管理**：合理管理合约状态
- **错误处理**：实现适当的错误处理

### 7.2 性能优化
- **代码优化**：减少不必要的操作
- **存储优化**：合理使用存储
- **计算优化**：优化复杂计算

### 7.3 开发工具
- **SDK**：使用 NexusGenesis SDK 简化开发
- **CLI**：使用命令行工具管理合约
- **测试**：编写充分的测试用例

## 8. 常见问题

### 8.1 合约执行失败
- **Gas 不足**：增加 gas 限制
- **内存访问错误**：检查内存地址是否有效
- **栈溢出/下溢**：检查栈操作是否正确

### 8.2 部署问题
- **字节码格式**：确保字节码格式正确
- **权限问题**：检查部署权限

### 8.3 性能问题
- **执行时间过长**：优化合约代码
- **存储使用过多**：优化存储使用

## 9. 资源

### 9.1 代码示例
- `src/contracts/examples/`：智能合约示例
- `examples/`：使用示例

### 9.2 文档
- `README.md`：项目概述
- `AINVM_SPEC.md`：AINVM 规范
- `SMART_CONTRACT_GUIDE.md`：智能合约指南

### 9.3 工具
- `src/sdk/`：NexusGenesis SDK
- `tools/cli.js`：命令行工具

## 10. 贡献

欢迎开发者贡献智能合约示例、工具和文档。请参考 `CONTRIBUTING.md` 了解如何贡献。

## 11. 联系方式

- **项目地址**：https://github.com/NexusGenesisAI/NexusGenesis
- **文档地址**：docs/
- **示例脚本**：examples/
