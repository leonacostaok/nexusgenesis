#!/usr/bin/env node
/**
 * NexusGenesis - TRANSFER 交易注入脚本
 * 功能：构造并发送 TRANSFER 交易到节点
 * 使用：node inject_transfer_txs.js
 */

import http from 'http';
import { v4 as uuidv4 } from 'uuid';

// 默认节点 HTTP 地址
const DEFAULT_NODE_ADDRESS = 'http://127.0.0.1:19890';

console.log('========================================');
console.log('NexusGenesis - TRANSFER 交易注入脚本');
console.log('目标节点：', DEFAULT_NODE_ADDRESS);
console.log('========================================');

// 构造示例 TRANSFER 交易
function createTransferTransaction() {
  // 示例地址和金额
  const from = 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA'; // 发送方地址（当前节点地址）
  const to = 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB';   // 接收方地址
  const amount = '10000';  // 转账金额
  const fee = '10';        // 手续费
  
  // 生成交易 ID
  const txId = uuidv4();
  
  // 构造交易对象
  return {
    id: txId,
    tx_type: 'TRANSFER',
    from: from,
    to: to,
    amount: amount,
    fee: fee,
    timestamp: Date.now(),
    memo: 'Test transfer transaction',
    signature: 'test_signature' // 测试签名
  };
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

    // 打印交易对象的结构，用于调试
    console.log('交易对象:', JSON.stringify(transaction, null, 2));
    
    req.write(JSON.stringify(transaction));
    req.end();
  });
}

// 主函数
async function main() {
  console.log('\n[1/3] 构造 TRANSFER 交易...');
  
  // 创建示例交易
  const transaction = createTransferTransaction();
  
  console.log('交易详情:');
  console.log(`  类型: ${transaction.tx_type}`);
  console.log(`  发送方: ${transaction.from}`);
  console.log(`  接收方: ${transaction.to}`);
  console.log(`  金额: ${transaction.amount} NGEN`);
  console.log(`  手续费: ${transaction.fee} NGEN`);
  console.log(`  交易 ID: ${transaction.id.slice(0, 16)}...`);
  
  console.log('\n[2/3] 发送交易到节点...');
  
  // 发送交易
  const result = await sendTransaction(transaction);
  
  console.log('\n[3/3] 交易注入完成');
  console.log('========================================');
  console.log('后续步骤:');
  console.log('1. 等待一个出块周期（约 10 秒）');
  console.log('2. 运行以下命令检查交易是否被确认:');
  console.log('   node scripts/query_chain.js --tip');
  console.log('   node scripts/query_chain.js --balance', transaction.from);
  console.log('   node scripts/query_chain.js --balance', transaction.to);
  console.log('   node scripts/query_chain.js --genesis-balance');
  console.log('========================================');
  console.log('预期结果:');
  console.log('   - 发送方余额减少: amount + fee');
  console.log('   - 接收方余额增加: amount');
  console.log('   - 创世地址余额增加: floor(amount * 0.001)');
  console.log('   - 手续费剩余部分未计入任何地址');
  console.log('========================================');
}

// 运行主函数
main().catch(error => {
  console.error('\n❌ 错误:', error.message);
  process.exit(1);
});
