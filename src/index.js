/**
 * NexusGenesis - Main Entry
 * Genesisprotocol入口
 */

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
}

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
