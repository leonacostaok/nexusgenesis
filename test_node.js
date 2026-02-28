#!/usr/bin/env node

import { GenesisNode } from './src/node/genesisNode.js';

console.log('Testing Genesis Node initialization...');

// 测试模块导入
console.log('Module imported successfully');

// 测试 GenesisNode 类
const node = new GenesisNode();
console.log('GenesisNode instance created successfully');

// 测试初始化
node.initialize().then(() => {
  console.log('Genesis Node initialized successfully');
}).catch(err => {
  console.error('Error initializing Genesis Node:', err);
  console.error('Error stack:', err.stack);
  process.exit(1);
});

// 防止进程退出
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  node.shutdown().catch(err => console.error('Error during shutdown:', err));
});
