import { AgentMarketplace } from '../src/agent/agentMarketplace.js';

console.log('class:', typeof AgentMarketplace);
console.log('setBlockchainState:', typeof AgentMarketplace.setBlockchainState);
console.log('blockchainState (before):', AgentMarketplace.blockchainState);

// Simulate state injection
const fakeState = {
  getBalance: () => '1000',
  subtractBalance: () => {},
  addBalance: () => {},
};
AgentMarketplace.setBlockchainState(fakeState);
console.log('blockchainState (after):', AgentMarketplace.blockchainState === fakeState ? 'INJECTED' : 'NOT INJECTED');
