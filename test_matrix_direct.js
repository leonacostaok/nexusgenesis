/**
 * 直接Test AINVM 矩阵运算指令
 * 不使用bytecode，直接Test矩阵运算Features
 */

import AINVM from './src/vm/ainvm.js';

function testMatrixOperations() {
  console.log('=== 直接Test矩阵运算指令开始 ===\n');
  
  // Create AINVM instance
  const vm = new AINVM();
  
  // Set足够的 gas 限制
  vm.gasLimit = 1000000;
  
  try {
    // Test 1: 矩阵Create
    console.log('Test 1: 矩阵Create');
    
    // SimulationCreate矩阵的stack操作
    vm.stack.push(2); // cols
    vm.stack.push(2); // rows
    vm.executeMAT_CREATE();
    
    const matrixId = vm.stack.pop();
    console.log('矩阵Createsuccess，矩阵ID:', matrixId);
    
    // Test 2: 矩阵Storage
    console.log('\nTest 2: 矩阵Storage');
    
    // SimulationStorage操作的stack操作
    vm.stack.push(matrixId);
    vm.stack.push(0); // row
    vm.stack.push(0); // col
    vm.stack.push(10); // value
    vm.executeMAT_STORE();
    
    console.log('矩阵Storagesuccess');
    
    // Test 3: 矩阵Load
    console.log('\nTest 3: 矩阵Load');
    
    // SimulationLoad操作的stack操作
    vm.stack.push(matrixId);
    vm.stack.push(0); // row
    vm.stack.push(0); // col
    vm.executeMAT_LOAD();
    
    const value = vm.stack.pop();
    console.log('矩阵Loadsuccess，值:', value);
    
    // Test 4: 矩阵加法
    console.log('\nTest 4: 矩阵加法');
    
    // Create第一个矩阵
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
    
    // Create第二个矩阵
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
    
    // Execute矩阵加法
    vm.stack.push(mat1Id);
    vm.stack.push(mat2Id);
    vm.executeMAT_ADD();
    
    const resultMatId = vm.stack.pop();
    console.log('矩阵加法success，结果矩阵ID:', resultMatId);
    
    // Test 5: 矩阵转置
    console.log('\nTest 5: 矩阵转置');
    
    // Create一个 2x3 矩阵
    vm.stack.push(3); // cols
    vm.stack.push(2); // rows
    vm.executeMAT_CREATE();
    const mat3Id = vm.stack.pop();
    
    // Execute矩阵转置
    vm.stack.push(mat3Id);
    vm.executeMAT_TRANS();
    
    const transposedMatId = vm.stack.pop();
    console.log('矩阵转置success，转置矩阵ID:', transposedMatId);
    
    console.log('\n=== 直接Test矩阵运算指令完成 ===');
  } catch (error) {
    console.error('Test过程中出现error:', error.message);
  }
}

// 运行Test
testMatrixOperations();
