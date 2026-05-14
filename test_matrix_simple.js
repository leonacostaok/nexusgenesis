/**
 * 简化的矩阵运算指令Test脚本
 * Test AINVM 矩阵运算指令的实现
 */

import AINVM from './src/vm/ainvm.js';

function testMatrixOperations() {
  console.log('=== 简化矩阵运算指令Test开始 ===\n');
  
  // Create AINVM instance
  const vm = new AINVM();
  
  try {
    // Test 1: 矩阵Create
    console.log('Test 1: 矩阵Create');
    
    const program1 = [
      0x01, 2,  // PUSH 2 (rows)
      0x01, 2,  // PUSH 2 (cols)
      0x10,     // MAT_CREATE
      0x0B      // HALT
    ];
    
    vm.loadProgram(program1);
    const result1 = vm.execute(100);
    console.log('矩阵Create结果:', result1.success ? 'success' : 'failed');
    if (result1.success) {
      console.log('矩阵ID:', result1.stack[0]);
    }
    
    // Test 2: 矩阵Storage和Load
    console.log('\nTest 2: 矩阵Storage和Load');
    
    // 先Create矩阵并Save矩阵ID到Memory
    const program2 = [
      0x01, 2,  // PUSH 2 (rows)
      0x01, 2,  // PUSH 2 (cols)
      0x10,     // MAT_CREATE
      0x01, 0,  // PUSH 0 (memory address)
      0x08,     // STORE - Save矩阵ID到memory address0
      0x01, 0,  // PUSH 0 (memory address)
      0x07,     // LOAD - Load矩阵ID
      0x01, 0,  // PUSH 0 (row)
      0x01, 0,  // PUSH 0 (col)
      0x01, 10, // PUSH 10 (value)
      0x15,     // MAT_STORE
      0x01, 0,  // PUSH 0 (memory address)
      0x07,     // LOAD - Load矩阵ID
      0x01, 0,  // PUSH 0 (row)
      0x01, 0,  // PUSH 0 (col)
      0x14,     // MAT_LOAD
      0x0B      // HALT
    ];
    
    vm.loadProgram(program2);
    const result2 = vm.execute(100);
    console.log('矩阵Storage和Load结果:', result2.success ? 'success' : 'failed');
    if (result2.success) {
      console.log('Load的值:', result2.stack[0]);
    }
    
    console.log('\n=== 简化矩阵运算指令Test完成 ===');
  } catch (error) {
    console.error('Test过程中出现error:', error.message);
  }
}

// 运行Test
testMatrixOperations();
