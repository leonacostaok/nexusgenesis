/**
 * AINVM 使用示例
 * 展示如何使用 AINVM 执行简单程序
 */

import AINVM from '../src/vm/ainvm.js';

// 示例 1：计算两数之和
function exampleAddition() {
  console.log('\n=== 示例 1：计算两数之和 ===');
  
  const vm = new AINVM();
  // PUSH 10, PUSH 20, ADD, RETURN
  const program = [0x01, 0x0A, 0x01, 0x14, 0x03, 0x0C];
  
  vm.loadProgram(program);
  const result = vm.execute(10);
  
  console.log('程序：计算 10 + 20');
  console.log('字节码:', program.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', '));
  console.log('执行结果:', result);
  console.log('计算结果:', result.returnValue);
}

// 示例 2：使用内存存储和加载
function exampleMemory() {
  console.log('\n=== 示例 2：使用内存存储和加载 ===');
  
  const vm = new AINVM();
  // PUSH 42, STORE 0, LOAD 0, RETURN
  const program = [0x01, 0x2A, 0x08, 0x00, 0x07, 0x00, 0x0C];
  
  vm.loadProgram(program);
  const result = vm.execute(10);
  
  console.log('程序：存储 42 到内存地址 0，然后加载并返回');
  console.log('字节码:', program.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', '));
  console.log('执行结果:', result);
  console.log('内存内容:', result.memory);
  console.log('返回值:', result.returnValue);
}

// 示例 3：条件判断
function exampleConditional() {
  console.log('\n=== 示例 3：条件判断 ===');
  
  const vm = new AINVM();
  // PUSH 5, PUSH 3, SUB, PUSH 0, JZ 3, PUSH 1, RETURN, PUSH 0, RETURN
  const program = [0x01, 0x05, 0x01, 0x03, 0x04, 0x01, 0x00, 0x0A, 0x03, 0x01, 0x01, 0x0C, 0x01, 0x00, 0x0C];
  
  vm.loadProgram(program);
  const result = vm.execute(20);
  
  console.log('程序：判断 5 - 3 是否等于 0');
  console.log('字节码:', program.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', '));
  console.log('执行结果:', result);
  console.log('返回值:', result.returnValue);
  console.log('说明：返回 1 表示不等于 0，返回 0 表示等于 0');
}

// 运行所有示例
function runExamples() {
  console.log('========================================');
  console.log('AINVM 使用示例');
  console.log('========================================');
  
  exampleAddition();
  exampleMemory();
  exampleConditional();
  
  console.log('\n========================================');
  console.log('示例执行完成');
  console.log('========================================');
  console.log('\nAINVM 特性：');
  console.log('1. 确定性执行：相同输入在所有节点上得到相同结果');
  console.log('2. 可计费：每条指令有确定的 gas 成本');
  console.log('3. 简单但可扩展：最小指令集，后续可扩展');
  console.log('4. 栈机模型：易于实现和理解');
  console.log('\nAINVM 可用于：');
  console.log('1. 代码挖矿（Proof of Code）');
  console.log('2. 简单治理逻辑执行');
  console.log('3. 链上计算');
}

// 运行示例
runExamples();
