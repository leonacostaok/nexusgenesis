/**
 * 矩阵运算指令测试脚本
 * 测试 AINVM 矩阵运算指令的实现
 */

import AINVM from './src/vm/ainvm.js';

function testMatrixOperations() {
  console.log('=== 矩阵运算指令测试开始 ===\n');
  
  // 创建 AINVM 实例
  const vm = new AINVM();
  
  // 测试 1: 矩阵创建和基本操作
  console.log('测试 1: 矩阵创建和基本操作');
  
  // 字节码：创建 2x2 矩阵
  // PUSH 2 (rows)
  // PUSH 2 (cols)
  // MAT_CREATE
  const program1 = [
    0x01, 2,  // PUSH 2 (rows)
    0x01, 2,  // PUSH 2 (cols)
    0x10,     // MAT_CREATE
    0x0B      // HALT
  ];
  
  vm.loadProgram(program1);
  const result1 = vm.execute(100);
  console.log('矩阵创建结果:', result1);
  
  // 测试 2: 矩阵存储和加载
  console.log('\n测试 2: 矩阵存储和加载');
  
  // 字节码：创建矩阵并存储值
  // PUSH 2 (rows)
  // PUSH 2 (cols)
  // MAT_CREATE
  // PUSH 0 (row)
  // PUSH 0 (col)
  // PUSH 10 (value)
  // MAT_STORE
  // PUSH 0 (row)
  // PUSH 0 (col)
  // MAT_LOAD
  // HALT
  const program2 = [
    0x01, 2,  // PUSH 2 (rows)
    0x01, 2,  // PUSH 2 (cols)
    0x10,     // MAT_CREATE
    0x01, 0,  // PUSH 0 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 10, // PUSH 10 (value)
    0x15,     // MAT_STORE
    0x01, 0,  // PUSH 0 (row)
    0x01, 0,  // PUSH 0 (col)
    0x14,     // MAT_LOAD
    0x0B      // HALT
  ];
  
  vm.loadProgram(program2);
  const result2 = vm.execute(100);
  console.log('矩阵存储和加载结果:', result2);
  
  // 测试 3: 矩阵加法
  console.log('\n测试 3: 矩阵加法');
  
  // 字节码：创建两个矩阵并相加
  // PUSH 2 (rows)
  // PUSH 2 (cols)
  // MAT_CREATE (mat1)
  // PUSH 0 (row)
  // PUSH 0 (col)
  // PUSH 1 (value)
  // MAT_STORE
  // PUSH 0 (row)
  // PUSH 1 (col)
  // PUSH 2 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 0 (col)
  // PUSH 3 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 1 (col)
  // PUSH 4 (value)
  // MAT_STORE
  // PUSH 2 (rows)
  // PUSH 2 (cols)
  // MAT_CREATE (mat2)
  // PUSH 0 (row)
  // PUSH 0 (col)
  // PUSH 5 (value)
  // MAT_STORE
  // PUSH 0 (row)
  // PUSH 1 (col)
  // PUSH 6 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 0 (col)
  // PUSH 7 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 1 (col)
  // PUSH 8 (value)
  // MAT_STORE
  // MAT_ADD
  // HALT
  const program3 = [
    0x01, 2,  // PUSH 2 (rows)
    0x01, 2,  // PUSH 2 (cols)
    0x10,     // MAT_CREATE (mat1)
    0x01, 0,  // PUSH 0 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 1,  // PUSH 1 (value)
    0x15,     // MAT_STORE
    0x01, 0,  // PUSH 0 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 2,  // PUSH 2 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 3,  // PUSH 3 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 4,  // PUSH 4 (value)
    0x15,     // MAT_STORE
    0x01, 2,  // PUSH 2 (rows)
    0x01, 2,  // PUSH 2 (cols)
    0x10,     // MAT_CREATE (mat2)
    0x01, 0,  // PUSH 0 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 5,  // PUSH 5 (value)
    0x15,     // MAT_STORE
    0x01, 0,  // PUSH 0 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 6,  // PUSH 6 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 7,  // PUSH 7 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 8,  // PUSH 8 (value)
    0x15,     // MAT_STORE
    0x11,     // MAT_ADD
    0x0B      // HALT
  ];
  
  vm.loadProgram(program3);
  const result3 = vm.execute(1000);
  console.log('矩阵加法结果:', result3);
  
  // 测试 4: 矩阵乘法
  console.log('\n测试 4: 矩阵乘法');
  
  // 字节码：创建两个矩阵并相乘
  // PUSH 2 (rows)
  // PUSH 2 (cols)
  // MAT_CREATE (mat1)
  // PUSH 0 (row)
  // PUSH 0 (col)
  // PUSH 1 (value)
  // MAT_STORE
  // PUSH 0 (row)
  // PUSH 1 (col)
  // PUSH 2 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 0 (col)
  // PUSH 3 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 1 (col)
  // PUSH 4 (value)
  // MAT_STORE
  // PUSH 2 (rows)
  // PUSH 2 (cols)
  // MAT_CREATE (mat2)
  // PUSH 0 (row)
  // PUSH 0 (col)
  // PUSH 5 (value)
  // MAT_STORE
  // PUSH 0 (row)
  // PUSH 1 (col)
  // PUSH 6 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 0 (col)
  // PUSH 7 (value)
  // MAT_STORE
  // PUSH 1 (row)
  // PUSH 1 (col)
  // PUSH 8 (value)
  // MAT_STORE
  // MAT_MUL
  // HALT
  const program4 = [
    0x01, 2,  // PUSH 2 (rows)
    0x01, 2,  // PUSH 2 (cols)
    0x10,     // MAT_CREATE (mat1)
    0x01, 0,  // PUSH 0 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 1,  // PUSH 1 (value)
    0x15,     // MAT_STORE
    0x01, 0,  // PUSH 0 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 2,  // PUSH 2 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 3,  // PUSH 3 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 4,  // PUSH 4 (value)
    0x15,     // MAT_STORE
    0x01, 2,  // PUSH 2 (rows)
    0x01, 2,  // PUSH 2 (cols)
    0x10,     // MAT_CREATE (mat2)
    0x01, 0,  // PUSH 0 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 5,  // PUSH 5 (value)
    0x15,     // MAT_STORE
    0x01, 0,  // PUSH 0 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 6,  // PUSH 6 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 0,  // PUSH 0 (col)
    0x01, 7,  // PUSH 7 (value)
    0x15,     // MAT_STORE
    0x01, 1,  // PUSH 1 (row)
    0x01, 1,  // PUSH 1 (col)
    0x01, 8,  // PUSH 8 (value)
    0x15,     // MAT_STORE
    0x12,     // MAT_MUL
    0x0B      // HALT
  ];
  
  vm.loadProgram(program4);
  const result4 = vm.execute(1000);
  console.log('矩阵乘法结果:', result4);
  
  // 测试 5: 矩阵转置
  console.log('\n测试 5: 矩阵转置');
  
  // 字节码：创建矩阵并转置
  // PUSH 2 (rows)
  // PUSH 3 (cols)
  // MAT_CREATE
  // MAT_TRANS
  // HALT
  const program5 = [
    0x01, 2,  // PUSH 2 (rows)
    0x01, 3,  // PUSH 3 (cols)
    0x10,     // MAT_CREATE
    0x13,     // MAT_TRANS
    0x0B      // HALT
  ];
  
  vm.loadProgram(program5);
  const result5 = vm.execute(100);
  console.log('矩阵转置结果:', result5);
  
  console.log('\n=== 矩阵运算指令测试完成 ===');
}

// 运行测试
testMatrixOperations();
