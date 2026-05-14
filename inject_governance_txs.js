#!/usr/bin/env node
/**
 * NexusGenesis - Governancetransaction注入脚本
 * Features：从示例文件读取Governancetransaction并通过 HTTP 接口Send给node
 * 使用：node inject_governance_txs.js [nodeaddress]
 */

import fs from 'fs';
import http from 'http';

// Defaultnode HTTP address
const DEFAULT_NODE_ADDRESS = 'http://127.0.0.1:19890';

// Get命令行parameter
const nodeAddress = process.argv[2] || DEFAULT_NODE_ADDRESS;

console.log('========================================');
console.log('NexusGenesis - Governancetransaction注入脚本');
console.log('目标node：', nodeAddress);
console.log('========================================');

// 读取transaction文件
console.log('\n[1/3] 读取transaction文件...');
try {
  const txsData = fs.readFileSync('./examples/sample_governance_txs.json', 'utf8');
  const txs = JSON.parse(txsData).transactions;
  
  console.log(`success读取 ${txs.length} 条transaction`);
  
  // Sendtransaction
  console.log('\n[2/3] Sendtransaction...');
  let sentCount = 0;
  
  txs.forEach((tx, index) => {
    setTimeout(async () => {
      console.log(`\nSendtransaction ${index + 1}/${txs.length}:`);
      console.log(`type: ${tx.tx_type}`);
      console.log(`ID: ${tx.tx_id.slice(0, 16)}...`);
      
      // 转换transaction格式：将 tx_id 字段重命名为 id
      const formattedTx = {
        ...tx,
        id: tx.tx_id
      };
      delete formattedTx.tx_id;
      
      // 通过 HTTP 接口Sendtransaction
      await sendTransaction(formattedTx);
      sentCount++;
      
      // 所有transactionSend完成
      if (sentCount === txs.length) {
        console.log('\n========================================');
        console.log('所有transactionsent完成');
        console.log('请查看node日志，确认transaction是否被正确解析和加入 mempool');
        console.log('========================================');
      }
    }, index * 1000); // 间隔 1 秒Send
  });
  
} catch (error) {
  console.error('\n❌ error:', error.message);
  process.exit(1);
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

    req.write(JSON.stringify(transaction));
    req.end();
  });
}

