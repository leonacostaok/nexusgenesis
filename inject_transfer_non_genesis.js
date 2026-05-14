#!/usr/bin/env node
/**
 * NexusGenesis - 非Genesisaddresstransfertransaction注入脚本
 * Features：使用非Genesisaddress作为Send方构造并Send TRANSFER transaction
 * 使用：node inject_transfer_non_genesis.js
 */

import http from 'http';
import { v4 as uuidv4 } from 'uuid';

// Defaultnode HTTP address
const DEFAULT_NODE_ADDRESS = 'http://127.0.0.1:19890';

console.log('========================================');
console.log('NexusGenesis - 非Genesisaddresstransfertransaction注入脚本');
console.log('目标node：', DEFAULT_NODE_ADDRESS);
console.log('========================================');

// 构造示例 TRANSFER transaction
function createTransferTransaction() {
  // 使用普通address作为Send方和Receive方
  const from = 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB';   // 普通addressA（Send方）
  const to = 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA';     // 普通addressB（Receive方）
  const amount = '10000';  // transferamount
  const fee = '10';        // fee
  
  // Generatetransaction ID
  const txId = uuidv4();
  
  // 构造transaction对象
  return {
    id: txId,
    tx_type: 'TRANSFER',
    from: from,
    to: to,
    amount: amount,
    fee: fee,
    timestamp: Date.now(),
    memo: 'Test transfer from non-genesis address',
    signature: 'test_signature' // TestSign
  };
}

// 通过 HTTP 接口Sendtransaction
function sendTransaction(transaction) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 19890,
      path: '/tx',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(transaction))
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            console.log(`✓ transaction已success注入，TX ID: ${result.txId.slice(0, 16)}...`);
            resolve(result);
          } else {
            console.log(`❌ transaction被拒绝: ${result.reason}`);
            resolve(result);
          }
        } catch (error) {
          console.log(`❌ 响应解析error: ${error.message}`);
          resolve({ success: false, reason: 'Invalid response' });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Connecterror: ${error.message}`);
      resolve({ success: false, reason: error.message });
    });

    // 打印transaction对象的结构，for调试
    console.log('transaction对象:', JSON.stringify(transaction, null, 2));
    
    req.write(JSON.stringify(transaction));
    req.end();
  });
}

// 主function
async function main() {
  console.log('\n[1/3] 构造非Genesisaddresstransfertransaction...');
  
  // Create示例transaction
  const transaction = createTransferTransaction();
  
  console.log('transaction详情:');
  console.log(`  type: ${transaction.tx_type}`);
  console.log(`  Send方: ${transaction.from}`);
  console.log(`  Receive方: ${transaction.to}`);
  console.log(`  amount: ${transaction.amount} NGEN`);
  console.log(`  fee: ${transaction.fee} NGEN`);
  console.log(`  transaction ID: ${transaction.id.slice(0, 16)}...`);
  
  // Calculate税费
  const tax = Math.floor(Number(transaction.amount) * 0.001);
  console.log(`  预期税费: ${tax} NGEN`);
  
  console.log('\n[2/3] Sendtransaction到node...');
  
  // Sendtransaction
  const result = await sendTransaction(transaction);
  
  console.log('\n[3/3] transaction注入完成');
  console.log('========================================');
  console.log('后续步骤:');
  console.log('1. etc.待一个出块周期（约 10 秒）');
  console.log('2. 运行以下命令Checktransaction是否被确认:');
  console.log('   node scripts/query_chain.js --tip');
  console.log('   node scripts/query_chain.js --balance', transaction.from);
  console.log('   node scripts/query_chain.js --balance', transaction.to);
  console.log('   node scripts/query_chain.js --genesis-balance');
  console.log('========================================');
  console.log('预期结果:');
  console.log('   - Send方balance减少: amount + fee =', Number(transaction.amount) + Number(transaction.fee));
  console.log('   - Receive方balance增加: amount =', transaction.amount);
  console.log('   - Genesisaddressbalance增加: tax =', tax);
  console.log('   - 总供应不变');
  console.log('========================================');
}

// 运行主function
main().catch(error => {
  console.error('\n❌ error:', error.message);
  process.exit(1);
});
