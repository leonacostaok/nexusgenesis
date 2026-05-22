/**
 * Smart ContractTest脚本
 * TestAINVMSmart Contract的Deploy和Execute
 */

import contractManager from './src/contracts/contractManager.js';
import { testCounterContract } from './src/contracts/examples/counter.js';
import { testMatrixContract } from './src/contracts/examples/matrixOperations.js';
import { testTokenContract } from './src/contracts/examples/token.js';
import { testGovernanceContract } from './src/contracts/examples/governance.js';

async function main() {
  console.log('=== Starting Smart Contract Tests ===\n');
  
  try {
    // Load现有Contractstatus
    await contractManager.loadState();
    console.log('Loaded existing contract state');
    
    // Test计数器Contract
    console.log('\n1. Testing Counter Contract:');
    await testCounterContract();
    
    // Test矩阵运算Contract
    console.log('\n2. Testing Matrix Operations Contract:');
    await testMatrixContract();
    
    // Test同一个Contract多次Execute
    console.log('\n3. Testing Multiple Executions on Same Contract:');
    const contracts = contractManager.listContracts();
    const counterContract = contracts.find(c => c.name === 'Counter Contract');
    if (counterContract) {
      console.log(`Testing contract: ${counterContract.name} (${counterContract.id})`);
      console.log('Initial value:', contractManager.getContractInfo(counterContract.id).storage['0'] || 0);
      
      for (let i = 1; i <= 3; i++) {
        const result = contractManager.executeContract(counterContract.id);
        console.log(`Execution ${i} result:`, result.returnValue);
        console.log(`Current value:`, contractManager.getContractInfo(counterContract.id).storage['0'] || 0);
      }
    }
    
    // TestTokenContract
    console.log('\n4. Testing Token Contract:');
    await testTokenContract();
    
    // TestGovernanceContract
    console.log('\n5. Testing Governance Contract:');
    await testGovernanceContract();
    
    // 列出所有Contract
    console.log('\n6. All Deployed Contracts:');
    const allContracts = contractManager.listContracts();
    allContracts.forEach((contract, index) => {
      console.log(`${index + 1}. ${contract.name} (${contract.id})`);
      console.log(`   Deployed at: ${new Date(contract.deployedAt).toLocaleString()}`);
      console.log(`   Bytecode length: ${contract.bytecodeLength} bytes`);
    });
    
    console.log('\n=== All tests completed successfully! ===');
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// 运行Test
main();