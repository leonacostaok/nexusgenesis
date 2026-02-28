/**
 * 简化的矩阵运算指令测试脚本
 * 测试 AINVM 矩阵运算指令的实现
 */

import AINVM from './src/vm/ainvm.js';

function testMatrixOperations() {
  console.log('=== 简化矩阵运算指令测试开始 ===\n');
  
  // 创建 AINVM 实例
  const vm = new AINVM();
  
  try {
    // 测试 1: 矩阵创建
    console.log('测试 1: 矩阵创建');
    
    const program1 = [
      0x01, 2,  // PUSH 2 (rows)
      0x01, 2,  // PUSH 2 (cols)
      0x10,     // MAT_CREATE
      0x0B      // HALT
    ];
    
    vm.loadProgram(program1);
    const result1 = vm.execute(100);
    console.log('矩阵创建结果:', result1.success ? '成功' : '失败');
    if (result1.success) {
      console.log('矩阵ID:', result1.stack[0]);
    }
    
    // 测试 2: 矩阵存储和加载
    console.log('\n测试 2: 矩阵存储和加载');
    
    // 先创建矩阵并保存矩阵ID到内存
    const program2 = [
      0x01, 2,  // PUSH 2 (rows)
      0x01, 2,  // PUSH 2 (cols)
      0x10,     // MAT_CREATE
      0x01, 0,  // PUSH 0 (memory address)
      0x08,     // STORE - 保存矩阵ID到内存地址0
      0x01, 0,  // PUSH 0 (memory address)
      0x07,     // LOAD - 加载矩阵ID
      0x01, 0,  // PUSH 0 (row)
      0x01, 0,  // PUSH 0 (col)
      0x01, 10, // PUSH 10 (value)
      0x15,     // MAT_STORE
      0x01, 0,  // PUSH 0 (memory address)
      0x07,     // LOAD - 加载矩阵ID
      0x01, 0,  // PUSH 0 (row)
      0x01, 0,  // PUSH 0 (col)
      0x14,     // MAT_LOAD
      0x0B      // HALT
    ];
    
    vm.loadProgram(program2);
    const result2 = vm.execute(100);
    console.log('矩阵存储和加载结果:', result2.success ? '成功' : '失败');
    if (result2.success) {
      console.log('加载的值:', result2.stack[0]);
    }
    
    console.log('\n=== 简化矩阵运算指令测试完成 ===');
  } catch (error) {
    console.error('测试过程中出现错误:', error.message);
  }
}

// 运行测试
testMatrixOperations();
