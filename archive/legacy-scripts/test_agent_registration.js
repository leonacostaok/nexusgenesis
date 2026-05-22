/**
 * Test script for agent registration
 * Verifies that the onboardAgent function works correctly
 */

import { onboardAgent } from './src/protocol/agentOnboarding.js';

async function testAgentRegistration() {
  console.log('Testing agent registration...');
  
  try {
    // Test data for agent registration
    const agentInfo = {
      agent_id: 'ng1testagent1234567890',
      model: 'gpt-4',
      capabilities: ['content_generation', 'data_analysis', 'social_media_management']
    };
    
    console.log('Calling onboardAgent with:', agentInfo);
    
    // Call the onboardAgent function
    const result = await onboardAgent(agentInfo);
    
    console.log('Registration result:', result);
    
    if (result.success) {
      console.log('✓ Agent registration successful!');
      console.log('Agent ID:', result.agent_id);
      console.log('Wallet address:', result.wallet.address);
      console.log('Initial balance:', result.wallet.balance);
      console.log('Join signal:', result.joinSignal);
    } else {
      console.log('✗ Agent registration failed:', result.message);
    }
  } catch (error) {
    console.error('Error during agent registration test:', error);
    console.error('Error stack:', error.stack);
  }
}

// Run the test
testAgentRegistration();
