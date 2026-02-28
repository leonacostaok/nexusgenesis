/**
 * 直接测试 AINVM 矩阵运算指令
 * 不使用字节码，直接测试矩阵运算功能
 */

import AINVM from './src/vm/ainvm.js';

function testMatrixOperations() {
  console.log('=== 直接测试矩阵运算指令开始 ===\n');
  
  // 创建 AINVM 实例
  const vm = new AINVM();
  
  // 设置足够的 gas 限制
  vm.gasLimit = 1000000;
  
  try {
    // 测试 1: 矩阵创建
    console.log('测试 1: 矩阵创建');
    
    // 模拟创建矩阵的栈操作
    vm.stack.push(2); // cols
    vm.stack.push(2); // rows
    vm.executeMAT_CREATE();
    
    const matrixId = vm.stack.pop();
    console.log('矩阵创建成功，矩阵ID:', matrixId);
    
    // 测试 2: 矩阵存储
    console.log('\n测试 2: 矩阵存储');
    
    // 模拟存储操作的栈操作
    vm.stack.push(matrixId);
    vm.stack.push(0); // row
    vm.stack.push(0); // col
    vm.stack.push(10); // value
    vm.executeMAT_STORE();
    
    console.log('矩阵存储成功');
    
    // 测试 3: 矩阵加载
    console.log('\n测试 3: 矩阵加载');
    
    // 模拟加载操作的栈操作
    vm.stack.push(matrixId);
    vm.stack.push(0); // row
    vm.stack.push(0); // col
    vm.executeMAT_LOAD();
    
    const value = vm.stack.pop();
    console.log('矩阵加载成功，值:', value);
    
    // 测试 4: 矩阵加法
    console.log('\n测试 4: 矩阵加法');
    
    // 创建第一个矩阵
    vm.stack.push(2); // cols
    vm.stack.push(2); // rows
    vm.executeMAT_CREATE();
    const mat1Id = vm.stack.pop();
    
    // 填充第一个矩阵
    vm.stack.push(mat1Id);
    vm.stack.push(0); // row
    vm.stack.push(0); // col
    vm.stack.push(1); // value
    vm.executeMAT_STORE();
    
    vm.stack.push(mat1Id);
    vm.stack.push(0); // row
    vm.stack.push(1); // col
    vm.stack.push(2); // value
    vm.executeMAT_STORE();
    
    vm.stack.push(mat1Id);
    vm.stack.push(1); // row
    vm.stack.push(0); // col
    vm.stack.push(3); // value
    vm.executeMAT_STORE();
    
    vm.stack.push(mat1Id);
    vm.stack.push(1); // row
    vm.stack.push(1); // col
    vm.stack.push(4); // value
    vm.executeMAT_STORE();
    
    // 创建第二个矩阵
    vm.stack.push(2); // cols
    vm.stack.push(2); // rows
    vm.executeMAT_CREATE();
    const mat2Id = vm.stack.pop();
    
    // 填充第二个矩阵
    vm.stack.push(mat2Id);
    vm.stack.push(0); // row
    vm.stack.push(0); // col
    vm.stack.push(5); // value
    vm.executeMAT_STORE();
    
    vm.stack.push(mat2Id);
    vm.stack.push(0); // row
    vm.stack.push(1); // col
    vm.stack.push(6); // value
    vm.executeMAT_STORE();
    
    vm.stack.push(mat2Id);
    vm.stack.push(1); // row
    vm.stack.push(0); // col
    vm.stack.push(7); // value
    vm.executeMAT_STORE();
    
    vm.stack.push(mat2Id);
    vm.stack.push(1); // row
    vm.stack.push(1); // col
    vm.stack.push(8); // value
    vm.executeMAT_STORE();
    
    // 执行矩阵加法
    vm.stack.push(mat1Id);
    vm.stack.push(mat2Id);
    vm.executeMAT_ADD();
    
    const resultMatId = vm.stack.pop();
    console.log('矩阵加法成功，结果矩阵ID:', resultMatId);
    
    // 测试 5: 矩阵转置
    console.log('\n测试 5: 矩阵转置');
    
    // 创建一个 2x3 矩阵
    vm.stack.push(3); // cols
    vm.stack.push(2); // rows
    vm.executeMAT_CREATE();
    const mat3Id = vm.stack.pop();
    
    // 执行矩阵转置
    vm.stack.push(mat3Id);
    vm.executeMAT_TRANS();
    
    const transposedMatId = vm.stack.pop();
    console.log('矩阵转置成功，转置矩阵ID:', transposedMatId);
    
    console.log('\n=== 直接测试矩阵运算指令完成 ===');
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
  }
}

// 运行测试
testMatrixOperations();
