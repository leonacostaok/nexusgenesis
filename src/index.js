/**
 * NexusGenesis - Main Entry
 * 创世协议入口
 */

import { GenesisNode } from './node/genesisNode.js';

// Create and initialize genesis node
const node = new GenesisNode();
node.initialize().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

console.log('NexusGenesis Network Starting...');
console.log('Type .help for available commands');

// Keep process alive
process.stdin.resume();
