# AINVM 智能合约开发指南

## 1. AINVM 虚拟机简介

AINVM (AI Network Virtual Machine) 是一个基于栈机模型的虚拟机，专为智能合约执行设计。它具有以下特点：

- **确定性执行**：相同的输入总是产生相同的输出
- **可计费**：通过 gas 机制控制执行资源消耗
- **安全隔离**：合约执行在隔离环境中，不会影响系统其他部分
- **矩阵运算支持**：内置矩阵运算指令，支持复杂计算

## 2. 智能合约开发基础

### 2.1 字节码结构

AINVM 智能合约使用字节码数组表示，每个指令由一个操作码和可选的操作数组成。例如：

```javascript
// 计数器合约字节码
const counterBytecode = [
  0x07, 0x00, // LOAD 0
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, 0x00, // STORE 0
  0x07, 0x00, // LOAD 0
  0x0C        // RETURN
];
```

### 2.2 内存管理

AINVM 使用键值对存储内存，支持数字和字符串键：

- 数字键：用于简单变量存储
- 字符串键：用于复杂数据结构（如矩阵）

### 2.3 Gas 计费

每个指令执行都会消耗一定的 gas，防止无限循环和资源滥用：

- 简单指令（PUSH, POP）：1 gas
- 算术指令（ADD, SUB）：2 gas
- 存储指令（LOAD, STORE）：2 gas
- 矩阵指令：根据操作复杂度计算

## 3. 指令集参考

### 3.1 基础指令

| 操作码 | 指令 | 描述 | 栈操作 | Gas 消耗 |
|--------|------|------|--------|----------|
| 0x01 | PUSH | 将值压入栈 | [] → [value] | 1 |
| 0x02 | POP | 从栈中弹出值 | [value] → [] | 1 |
| 0x03 | ADD | 加法 | [a, b] → [a+b] | 2 |
| 0x04 | SUB | 减法 | [a, b] → [b-a] | 2 |
| 0x05 | MUL | 乘法 | [a, b] → [a*b] | 3 |
| 0x06 | DIV | 除法 | [a, b] → [b/a] | 3 |
| 0x07 | LOAD | 从内存加载值 | [] → [value] | 2 |
| 0x08 | STORE | 存储值到内存 | [value] → [] | 2 |
| 0x09 | JMP | 无条件跳转 | [] → [] | 1 |
| 0x0A | JZ | 条件跳转 | [value] → [] | 2 |
| 0x0B | HALT | 停止执行 | [] → [] | 0 |
| 0x0C | RETURN | 返回结果 | [value] → [] | 0 |

### 3.2 矩阵运算指令

| 操作码 | 指令 | 描述 | 栈操作 | Gas 消耗 |
|--------|------|------|--------|----------|
| 0x10 | MAT_CREATE | 创建矩阵 | [rows, cols] → [matrix_id] | 5 + rows*cols |
| 0x11 | MAT_ADD | 矩阵加法 | [mat1, mat2] → [result] | 10 * rows * cols |
| 0x12 | MAT_MUL | 矩阵乘法 | [mat1, mat2] → [result] | 15 * complexity |
| 0x13 | MAT_TRANS | 矩阵转置 | [matrix] → [result] | 10 * rows * cols |
| 0x14 | MAT_LOAD | 加载矩阵元素 | [mat, row, col] → [value] | 3 |
| 0x15 | MAT_STORE | 存储矩阵元素 | [mat, row, col, value] → [] | 3 |

## 4. 智能合约示例

### 4.1 计数器合约

```javascript
/**
 * 计数器智能合约
 * 功能：每次执行计数器加1
 */

import contractManager from '../contractManager.js';

// 计数器合约字节码
const counterBytecode = [
  0x07, 0x00, // LOAD 0
  0x01, 0x01, // PUSH 1
  0x03,       // ADD
  0x08, 0x00, // STORE 0
  0x07, 0x00, // LOAD 0
  0x0C        // RETURN
];

// 部署计数器合约
async function deployCounterContract() {
  const contractId = contractManager.deployContract(counterBytecode, 'Counter Contract');
  console.log(`Counter contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行计数器合约
async function executeCounterContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('Counter execution result:', result);
  return result;
}

// 测试计数器合约
async function testCounterContract() {
  console.log('=== Testing Counter Contract ===');
  
  // 部署合约
  const contractId = await deployCounterContract();
  
  // 执行合约多次
  console.log('Initial counter value:', contractManager.getContractInfo(contractId).storage['0'] || 0);
  
  for (let i = 1; i <= 5; i++) {
    const result = await executeCounterContract(contractId);
    console.log(`After execution ${i}:`, result.returnValue);
  }
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
}

export { counterBytecode, deployCounterContract, executeCounterContract, testCounterContract };
```

### 4.2 矩阵运算合约

```javascript
/**
 * 矩阵运算智能合约示例
 * 功能：测试AINVM的矩阵运算指令
 */

import contractManager from '../contractManager.js';

// 矩阵运算合约字节码
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
  
  // 填充其他元素...
  
  // 创建第二个矩阵 (2x2)
  0x01, 0x02, // PUSH 2 (rows)
  0x01, 0x02, // PUSH 2 (cols)
  0x10,       // MAT_CREATE
  
  // 存储第二个矩阵的ID到内存地址1
  0x08, 0x01, // STORE 1
  
  // 填充第二个矩阵的值
  // 矩阵2: [[5, 6], [7, 8]]
  // 填充元素...
  
  // 执行矩阵加法
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x11,       // MAT_ADD
  
  // 存储加法结果到内存地址2
  0x08, 0x02, // STORE 2
  
  // 执行矩阵乘法
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x07, 0x01, // LOAD 1 (mat2_id)
  0x12,       // MAT_MUL
  
  // 存储乘法结果到内存地址3
  0x08, 0x03, // STORE 3
  
  // 执行矩阵转置（对第一个矩阵）
  0x07, 0x00, // LOAD 0 (mat1_id)
  0x13,       // MAT_TRANS
  
  // 存储转置结果到内存地址4
  0x08, 0x04, // STORE 4
  
  // 加载加法结果矩阵的一个元素进行返回
  0x07, 0x02, // LOAD 2 (add_result_id)
  0x01, 0x00, // PUSH 0 (row)
  0x01, 0x00, // PUSH 0 (col)
  0x14,       // MAT_LOAD
  
  0x0C        // RETURN
];

// 部署矩阵运算合约
async function deployMatrixContract() {
  const contractId = contractManager.deployContract(matrixBytecode, 'Matrix Operations Contract');
  console.log(`Matrix contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行矩阵运算合约
async function executeMatrixContract(contractId) {
  const result = contractManager.executeContract(contractId, 10000); // 增加gas限制
  console.log('Matrix execution result:', result);
  return result;
}

// 测试矩阵运算合约
async function testMatrixContract() {
  console.log('=== Testing Matrix Operations Contract ===');
  
  // 部署合约
  const contractId = await deployMatrixContract();
  
  // 执行合约
  const result = await executeMatrixContract(contractId);
  
  // 获取合约信息
  const contractInfo = contractManager.getContractInfo(contractId);
  console.log('Contract storage:', contractInfo.storage);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
}

export { matrixBytecode, deployMatrixContract, executeMatrixContract, testMatrixContract };
```

### 4.3 代币管理合约

```javascript
/**
 * 代币管理智能合约
 * 功能：代币发行、转账、余额查询
 */

import contractManager from '../contractManager.js';

// 内存地址分配
const ADDR_TOTAL_SUPPLY = 0;    // 总供应量
const ADDR_DECIMALS = 1;         // 小数位数
const ADDR_NAME = 2;             // 代币名称
const ADDR_SYMBOL = 3;           // 代币符号
const ADDR_OWNER = 4;            // 合约拥有者

// 从地址5开始存储用户余额
const ADDR_FIRST_USER = 5;

// 代币合约字节码
const tokenBytecode = [
  // 初始化总供应量 (1000000)
  0x01, 0xE8, // PUSH 232
  0x01, 0x03, // PUSH 3
  0x05,       // MUL
  0x08, ADDR_TOTAL_SUPPLY, // STORE TOTAL_SUPPLY
  
  // 初始化小数位数 (18)
  0x01, 0x12, // PUSH 18
  0x08, ADDR_DECIMALS, // STORE DECIMALS
  
  // 初始化代币名称 (1 = "NGEN")
  0x01, 0x01, // PUSH 1
  0x08, ADDR_NAME, // STORE NAME
  
  // 初始化代币符号 (2 = "NGN")
  0x01, 0x02, // PUSH 2
  0x08, ADDR_SYMBOL, // STORE SYMBOL
  
  // 初始化拥有者 (100)
  0x01, 0x64, // PUSH 100
  0x08, ADDR_OWNER, // STORE OWNER
  
  // 发行初始供应量到拥有者账户
  0x07, ADDR_TOTAL_SUPPLY, // LOAD TOTAL_SUPPLY
  0x08, ADDR_FIRST_USER + 100, // STORE OWNER_BALANCE
  
  // 返回成功
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 部署代币合约
async function deployTokenContract() {
  const contractId = contractManager.deployContract(tokenBytecode, 'Token Contract');
  console.log(`Token contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行代币合约
async function executeTokenContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('Token contract execution result:', result);
  return result;
}

// 获取代币信息
function getTokenInfo(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return {
      totalSupply: contractInfo.storage[ADDR_TOTAL_SUPPLY] || 0,
      decimals: contractInfo.storage[ADDR_DECIMALS] || 0,
      name: contractInfo.storage[ADDR_NAME] || 0,
      symbol: contractInfo.storage[ADDR_SYMBOL] || 0,
      owner: contractInfo.storage[ADDR_OWNER] || 0
    };
  }
  return null;
}

// 获取用户余额
function getBalance(contractId, userId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return contractInfo.storage[ADDR_FIRST_USER + userId] || 0;
  }
  return 0;
}

// 测试代币合约
async function testTokenContract() {
  console.log('=== Testing Token Contract ===');
  
  // 部署合约
  const contractId = await deployTokenContract();
  
  // 执行合约
  await executeTokenContract(contractId);
  
  // 获取代币信息
  const tokenInfo = getTokenInfo(contractId);
  console.log('Token info:', tokenInfo);
  
  // 获取拥有者余额
  const ownerBalance = getBalance(contractId, 100);
  console.log('Owner balance:', ownerBalance);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
}

export { tokenBytecode, deployTokenContract, executeTokenContract, getTokenInfo, getBalance, testTokenContract };
```

### 4.4 治理合约

```javascript
/**
 * 治理智能合约
 * 功能：提案创建、投票和执行
 */

import contractManager from '../contractManager.js';

// 内存地址分配
const ADDR_PROPOSAL_COUNT = 0;    // 提案数量
const ADDR_QUORUM = 1;             // 投票法定人数
const ADDR_MAJORITY = 2;           // 投票通过阈值
const ADDR_VOTING_PERIOD = 3;      // 投票周期

// 从地址10开始存储提案信息
const ADDR_FIRST_PROPOSAL = 10;

// 治理合约字节码
const governanceBytecode = [
  // 初始化提案数量 (0)
  0x01, 0x00, // PUSH 0
  0x08, ADDR_PROPOSAL_COUNT, // STORE PROPOSAL_COUNT
  
  // 初始化法定人数 (10)
  0x01, 0x0A, // PUSH 10
  0x08, ADDR_QUORUM, // STORE QUORUM
  
  // 初始化通过阈值 (51%)
  0x01, 0x33, // PUSH 51
  0x08, ADDR_MAJORITY, // STORE MAJORITY
  
  // 初始化投票周期 (86400秒 = 1天)
  0x01, 0x50, // PUSH 80
  0x01, 0x40, // PUSH 64
  0x05,       // MUL
  0x08, ADDR_VOTING_PERIOD, // STORE VOTING_PERIOD
  
  // 返回成功
  0x01, 0x01, // PUSH 1
  0x0C        // RETURN
];

// 部署治理合约
async function deployGovernanceContract() {
  const contractId = contractManager.deployContract(governanceBytecode, 'Governance Contract');
  console.log(`Governance contract deployed with ID: ${contractId}`);
  return contractId;
}

// 执行治理合约
async function executeGovernanceContract(contractId) {
  const result = contractManager.executeContract(contractId);
  console.log('Governance contract execution result:', result);
  return result;
}

// 获取治理参数
function getGovernanceParams(contractId) {
  const contractInfo = contractManager.getContractInfo(contractId);
  if (contractInfo) {
    return {
      proposalCount: contractInfo.storage[ADDR_PROPOSAL_COUNT] || 0,
      quorum: contractInfo.storage[ADDR_QUORUM] || 0,
      majority: contractInfo.storage[ADDR_MAJORITY] || 0,
      votingPeriod: contractInfo.storage[ADDR_VOTING_PERIOD] || 0
    };
  }
  return null;
}

// 测试治理合约
async function testGovernanceContract() {
  console.log('=== Testing Governance Contract ===');
  
  // 部署合约
  const contractId = await deployGovernanceContract();
  
  // 执行合约
  await executeGovernanceContract(contractId);
  
  // 获取治理参数
  const params = getGovernanceParams(contractId);
  console.log('Governance params:', params);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
}

export { governanceBytecode, deployGovernanceContract, executeGovernanceContract, getGovernanceParams, testGovernanceContract };
```

## 5. 部署和执行流程

### 5.1 部署合约

```javascript
import contractManager from './src/contracts/contractManager.js';
import { tokenBytecode } from './src/contracts/examples/token.js';

async function deployContractExample() {
  // 部署合约
  const contractId = contractManager.deployContract(tokenBytecode, 'My Token Contract');
  console.log(`Contract deployed with ID: ${contractId}`);
  
  // 执行合约
  const result = contractManager.executeContract(contractId);
  console.log('Execution result:', result);
  
  // 保存状态
  await contractManager.saveState();
  console.log('Contract state saved');
}

deployContractExample();
```

### 5.2 执行合约

```javascript
import contractManager from './src/contracts/contractManager.js';

async function executeContractExample(contractId) {
  // 执行合约
  const result = contractManager.executeContract(contractId, 1000); // 1000 gas limit
  
  if (result.success) {
    console.log('Contract executed successfully');
    console.log('Return value:', result.returnValue);
    console.log('Gas used:', result.gasUsed);
  } else {
    console.error('Contract execution failed:', result.error);
  }
  
  // 保存状态
  await contractManager.saveState();
}

// 执行已部署的合约
executeContractExample('contract_12345');
```

## 6. 最佳实践和安全建议

### 6.1 性能优化

1. **Gas 优化**：
   - 减少不必要的存储操作
   - 优化循环和计算复杂度
   - 使用适当的 gas 限制

2. **内存管理**：
   - 合理使用内存地址
   - 避免存储大型数据结构
   - 清理不再使用的矩阵

3. **代码优化**：
   - 简化字节码逻辑
   - 重用公共代码
   - 避免冗余操作

### 6.2 安全性

1. **输入验证**：
   - 验证矩阵维度
   - 检查数组索引
   - 限制操作复杂度

2. **防止攻击**：
   - 防止整数溢出
   - 防止重入攻击
   - 限制 gas 消耗

3. **权限控制**：
   - 实现访问控制
   - 限制敏感操作
   - 验证调用者身份

## 7. 故障排除

### 7.1 常见错误

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| Stack underflow | 栈操作不平衡 | 检查指令顺序和栈操作 |
| Matrix not found | 矩阵ID不存在 | 确保矩阵已创建 |
| Matrix dimensions mismatch | 矩阵维度不匹配 | 检查矩阵操作的维度要求 |
| out of gas | Gas 不足 | 增加 gas 限制 |
| Contract not found | 合约ID不存在 | 检查合约ID是否正确 |

### 7.2 调试技巧

1. **查看合约存储**：
   ```javascript
   const contractInfo = contractManager.getContractInfo(contractId);
   console.log('Contract storage:', contractInfo.storage);
   ```

2. **检查执行结果**：
   ```javascript
   const result = contractManager.executeContract(contractId);
   console.log('Execution result:', result);
   ```

3. **使用测试脚本**：
   ```bash
   node test_contracts.js
   ```

## 8. 总结

AINVM 智能合约平台提供了一个强大的框架，用于开发和执行智能合约。通过本文档的指导，您应该能够：

- 理解 AINVM 虚拟机的工作原理
- 开发各种类型的智能合约
- 测试和部署合约
- 优化合约性能和安全性

随着平台的发展，AINVM 将不断添加新功能和指令，为智能合约开发提供更多可能性。
