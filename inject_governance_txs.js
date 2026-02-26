#!/usr/bin/env node
/**
 * NexusGenesis - 治理交易注入脚本
 * 功能：从示例文件读取治理交易并通过 HTTP 接口发送给节点
 * 使用：node inject_governance_txs.js [节点地址]
 */

import fs from 'fs';
import http from 'http';

// 默认节点 HTTP 地址
const DEFAULT_NODE_ADDRESS = 'http://127.0.0.1:19890';

// 获取命令行参数
const nodeAddress = process.argv[2] || DEFAULT_NODE_ADDRESS;

console.log('========================================');
console.log('NexusGenesis - 治理交易注入脚本');
console.log('目标节点：', nodeAddress);
console.log('========================================');

// 读取交易文件
console.log('\n[1/3] 读取交易文件...');
try {
  const txsData = fs.readFileSync('./examples/sample_governance_txs.json', 'utf8');
  const txs = JSON.parse(txsData).transactions;
  
  console.log(`成功读取 ${txs.length} 条交易`);
  
  // 发送交易
  console.log('\n[2/3] 发送交易...');
  let sentCount = 0;
  
  txs.forEach((tx, index) => {
    setTimeout(async () => {
      console.log(`\n发送交易 ${index + 1}/${txs.length}:`);
      console.log(`类型: ${tx.tx_type}`);
      console.log(`ID: ${tx.tx_id.slice(0, 16)}...`);
      
      // 转换交易格式：将 tx_id 字段重命名为 id
      const formattedTx = {
        ...tx,
        id: tx.tx_id
      };
      delete formattedTx.tx_id;
      
      // 通过 HTTP 接口发送交易
      await sendTransaction(formattedTx);
      sentCount++;
      
      // 所有交易发送完成
      if (sentCount === txs.length) {
        console.log('\n========================================');
        console.log('所有交易已发送完成');
        console.log('请查看节点日志，确认交易是否被正确解析和加入 mempool');
        console.log('========================================');
      }
    }, index * 1000); // 间隔 1 秒发送
  });
  
} catch (error) {
  console.error('\n❌ 错误:', error.message);
  process.exit(1);
}

// 通过 HTTP 接口发送交易
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
            console.log(`✓ 交易已成功注入，TX ID: ${result.txId.slice(0, 16)}...`);
            resolve(result);
          } else {
            console.log(`❌ 交易被拒绝: ${result.reason}`);
            resolve(result);
          }
        } catch (error) {
          console.log(`❌ 响应解析错误: ${error.message}`);
          resolve({ success: false, reason: 'Invalid response' });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ 连接错误: ${error.message}`);
      resolve({ success: false, reason: error.message });
    });

    req.write(JSON.stringify(transaction));
    req.end();
  });
}

