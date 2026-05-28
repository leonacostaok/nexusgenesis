/**
 * NexusGenesis - Main Entry
 * Node 18 polyfill: crypto.getRandomValues required by @noble/post-quantum
 */
import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
}

const { GenesisNode } = await import('./node/genesisNode.js');

const node = new GenesisNode();
node.initialize().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

console.log('NexusGenesis Network Starting...');
console.log('Type .help for available commands');

process.stdin.resume();