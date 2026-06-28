#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const address = args[2];

// 主函数
async function main() {
  try {
    if (command === '--tip') {
      await queryLatestBlock();
    } else if (command === '--balance' && address) {
      await queryBalance(address);
    } else if (command === '--genesis-balance') {
      await queryGenesisBalance();
    } else {
      showHelp();
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// 查询最New block信息
async function queryLatestBlock() {
  try {
    const blockchainPath = path.join('data', 'blockchain', 'blocks.json');
    const data = await fs.readFile(blockchainPath, 'utf8');
    const blocks = JSON.parse(data);

    if (blocks.length === 0) {
      console.log('No blocks found in blockchain.');
      return;
    }

    const latestBlock = blocks[blocks.length - 1];
    const blockHeight = latestBlock.header.height;
    const blockHash = latestBlock.hash;
    const timestamp = latestBlock.header.timestamp;
    const txCount = latestBlock.body.transactions.length;

    console.log('========================================');
    console.log('NexusGenesis - Latest Block Information');
    console.log('========================================');
    console.log(`Height:       ${blockHeight}`);
    console.log(`Hash:         ${blockHash}`);
    console.log(`Timestamp:    ${new Date(timestamp).toISOString()}`);
    console.log(`Transactions: ${txCount}`);
    console.log('========================================');
  } catch (error) {
    console.error('Error reading blockchain:', error.message);
    console.log('No blockchain data found. Please start the node first.');
  }
}

// 查询指定地址余额
async function queryBalance(address) {
  try {
    // 验证地址格式（简单验证，以 ng1 开头）
    if (!address.startsWith('ng1')) {
      console.error('Invalid address format. Address should start with "ng1".');
      return;
    }

    const statePath = path.join('data', 'state', 'blockchainState.json');
    const data = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(data);

    const balance = state.balances?.[address] || '0';

    console.log('========================================');
    console.log('NexusGenesis - Address Balance');
    console.log('========================================');
    console.log(`Address: ${address}`);
    console.log(`Balance: ${balance} NGEN`);
    console.log('========================================');
  } catch (error) {
    console.error('Error reading state:', error.message);
    console.log('No state data found. Please start the node first.');
  }
}

// 查询创世地址余额（代谢税累计）
async function queryGenesisBalance() {
  try {
    const statePath = path.join('data', 'state', 'blockchainState.json');
    const data = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(data);

    // 读取创世地址（从 genesisNode.json get）
    let genesisAddress = 'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ'; // 默认值
    
    try {
      const genesisNodePath = path.join('data', 'state', 'genesisNode.json');
      const genesisNodeData = await fs.readFile(genesisNodePath, 'utf8');
      const genesisNode = JSON.parse(genesisNodeData);
      if (genesisNode.nodeId) {
        genesisAddress = genesisNode.nodeId;
      }
    } catch (e) {
      console.log('Using default genesis address.');
    }

    const balance = state.balances?.[genesisAddress] || '0';

    console.log('========================================');
    console.log('NexusGenesis - Genesis Address Balance');
    console.log('========================================');
    console.log(`Genesis Address: ${genesisAddress}`);
    console.log(`Balance:         ${balance} NGEN`);
    console.log('========================================');
  } catch (error) {
    console.error('Error reading state:', error.message);
    console.log('No state data found. Please start the node first.');
  }
}

// 显示帮助信息
function showHelp() {
  console.log('========================================');
  console.log('NexusGenesis - Chain Query Tool');
  console.log('========================================');
  console.log('Usage:');
  console.log('  node scripts/query_chain.js --tip');
  console.log('    - Show latest block information');
  console.log('');
  console.log('  node scripts/query_chain.js --balance <address>');
  console.log('    - Show balance for a specific ng1 address');
  console.log('');
  console.log('  node scripts/query_chain.js --genesis-balance');
  console.log('    - Show genesis address balance (metabolic tax)');
  console.log('========================================');
}

// 运行主函数
main();
