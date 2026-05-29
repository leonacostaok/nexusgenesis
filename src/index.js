/**
 * NexusGenesis - Main Entry
 * Node 18 polyfill: crypto.getRandomValues required by @noble/post-quantum
 *
 * Multi-node env vars:
 *   P2P_PORT   - P2P WebSocket port (default 9847)
 *   HTTP_PORT  - API/Agent HTTP port (default 19891)
 *   DATA_DIR   - State data directory (default data/genesis)
 *   NODE_ROLE  - 'genesis' | 'peer' (default genesis)
 *   SEED_NODES - Comma-separated ws:// addresses
 */
import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
}

process.env.P2P_PORT = process.env.P2P_PORT || '9847';
process.env.HTTP_PORT = process.env.HTTP_PORT || '19891';
process.env.DATA_DIR = process.env.DATA_DIR || 'data/genesis';
process.env.NODE_ROLE = process.env.NODE_ROLE || 'genesis';
process.env.SEED_NODES = process.env.SEED_NODES || '';

const { GenesisNode } = await import('./node/genesisNode.js');

console.log(`  Role: ${process.env.NODE_ROLE}  |  P2P: ${process.env.P2P_PORT}  |  HTTP: ${process.env.HTTP_PORT}  |  Data: ${process.env.DATA_DIR}`);

const node = new GenesisNode();
node.initialize().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

console.log('NexusGenesis Network Starting...');
console.log('Type .help for available commands');

process.stdin.resume();