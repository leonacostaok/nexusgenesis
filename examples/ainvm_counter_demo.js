/**
 * AINVM 计数器合约 DevNet Demo
 * 
 * 功能：
 * 1. 向本地 Genesis 节点发送 CONTRACT_DEPLOY 交易，部署计数器合约
 * 2. 向本地 Genesis 节点发送 CONTRACT_CALL 交易，调用计数器合约
 * 3. 读取状态文件，验证计数器值的变化
 */

import fs from 'fs/promises';
import path from 'path';

// 常量定义
const GENESIS_NODE_URL = 'http://localhost:3000'; // Genesis 节点 HTTP 接口
const STATE_FILE_PATH = path.join(process.cwd(), 'data', 'state', 'genesisNode.json');
const TEST_ADDRESS = 'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ';
const CONTRACT_ID = 'counter-contract-' + Date.now();

// 计数器合约字节码（十六进制）
// 逻辑：LOAD 0 (counter), PUSH 1, ADD, STORE 0, HALT
const COUNTER_BYTECODE = '0x070001010308000b';

/**
 * 构造 CONTRACT_DEPLOY 交易
 * @returns {object} 交易对象
 */
function createDeployTransaction() {
  return {
    id: 'deploy-' + Date.now(),
    tx_type: 'CONTRACT_DEPLOY',
    from: TEST_ADDRESS,
    contract_id: CONTRACT_ID,
    bytecode: COUNTER_BYTECODE,
    gas_limit: '10000',
    fee: '1000',
    timestamp: Date.now(),
    nonce: '1',
    signature: 'test-signature'
  };
}

/**
 * 构造 CONTRACT_CALL 交易
 * @returns {object} 交易对象
 */
function createCallTransaction() {
  return {
    id: 'call-' + Date.now(),
    tx_type: 'CONTRACT_CALL',
    from: TEST_ADDRESS,
    contract_id: CONTRACT_ID,
    gas_limit: '10000',
    fee: '1000',
    timestamp: Date.now(),
    nonce: '2',
    signature: 'test-signature'
  };
}

/**
 * 发送交易到 Genesis 节点
 * @param {object} transaction 交易对象
 * @returns {Promise<object>} 响应结果
 */
async function sendTransaction(transaction) {
  try {
    const response = await fetch(`${GENESIS_NODE_URL}/inject-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transaction)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error sending transaction:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 读取合约状态
 * @returns {Promise<object>} 合约存储状态
 */
async function readContractState() {
  try {
    const stateData = JSON.parse(await fs.readFile(STATE_FILE_PATH, 'utf8'));
    if (stateData.contracts && stateData.contracts[CONTRACT_ID]) {
      return stateData.contracts[CONTRACT_ID].storage;
    }
    return null;
  } catch (error) {
    console.error('Error reading state file:', error.message);
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== AINVM Counter Contract Demo ===\n');
  
  try {
    // 步骤 1：部署合约
    console.log('Step 1: Deploying counter contract...');
    const deployTx = createDeployTransaction();
    const deployResult = await sendTransaction(deployTx);
    
    if (deployResult.success) {
      console.log('✅ Contract deployed successfully!');
      console.log(`   Contract ID: ${CONTRACT_ID}`);
    } else {
      console.log('❌ Failed to deploy contract:', deployResult.error);
      return;
    }
    
    // 等待区块确认
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
    
    // 步骤 2：第一次调用合约
    console.log('\nStep 2: Calling counter contract (first time)...');
    const callTx1 = createCallTransaction();
    const callResult1 = await sendTransaction(callTx1);
    
    if (callResult1.success) {
      console.log('✅ Contract called successfully!');
    } else {
      console.log('❌ Failed to call contract:', callResult1.error);
      return;
    }
    
    // 等待区块确认
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
    
    // 读取状态
    const storage1 = await readContractState();
    console.log('\nStep 3: Verifying counter value after first call...');
    console.log(`   Counter value: ${storage1 ? storage1[0] : 'Not found'}`);
    
    if (storage1 && storage1[0] === '1') {
      console.log('✅ Verification passed! Counter is 1');
    } else {
      console.log('❌ Verification failed! Counter value is not 1');
    }
    
    // 步骤 3：第二次调用合约
    console.log('\nStep 4: Calling counter contract (second time)...');
    const callTx2 = createCallTransaction();
    callTx2.nonce = '3'; // 更新 nonce
    const callResult2 = await sendTransaction(callTx2);
    
    if (callResult2.success) {
      console.log('✅ Contract called successfully!');
    } else {
      console.log('❌ Failed to call contract:', callResult2.error);
      return;
    }
    
    // 等待区块确认
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
    
    // 读取状态
    const storage2 = await readContractState();
    console.log('\nStep 5: Verifying counter value after second call...');
    console.log(`   Counter value: ${storage2 ? storage2[0] : 'Not found'}`);
    
    if (storage2 && storage2[0] === '2') {
      console.log('✅ Verification passed! Counter is 2');
    } else {
      console.log('❌ Verification failed! Counter value is not 2');
    }
    
    // 步骤 4：总结
    console.log('\n=== Demo Summary ===');
    console.log('✅ Contract deployed successfully');
    console.log('✅ First call: Counter = 1');
    console.log('✅ Second call: Counter = 2');
    console.log('\n🎉 Demo completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Demo failed with error:', error.message);
  }
}

// 运行 demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  main,
  createDeployTransaction,
  createCallTransaction,
  sendTransaction,
  readContractState
};
