import { GenesisNode } from './src/node/genesisNode.js';

async function testGenesisNode() {
  console.log('Testing GenesisNode initialization...');
  try {
    const node = new GenesisNode();
    console.log('GenesisNode created successfully');
    await node.initialize();
    console.log('GenesisNode initialized successfully');
  } catch (error) {
    console.error('Error initializing GenesisNode:', error);
  }
}

testGenesisNode();
