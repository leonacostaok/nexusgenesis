import agentWalletManager from '../src/wallet/agentWalletManager.js';

const agentId = process.argv[2] || 'swarm-cipher-1782045383230-2';
console.log(`Checking wallet for agent: ${agentId}`);
const wallet = agentWalletManager.getWalletInstance(agentId);
console.log('Wallet:', wallet ? {
  address: wallet.address,
  publicKeyType: typeof wallet.publicKey,
  publicKeyLength: wallet.publicKey?.length,
  publicKeyConstructor: wallet.publicKey?.constructor?.name
} : 'NOT FOUND');

const entry = agentWalletManager.getRegistryEntry(agentId);
console.log('Registry entry:', entry ? 'EXISTS' : 'NOT FOUND');

// List all registered agents
console.log('\nAll registered agents:');
for (const [id, e] of agentWalletManager.registry.entries()) {
  console.log(`  ${id} → address=${e.wallet?.address?.slice(0,20)}...`);
}
