console.log('Starting swarm demo...');

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx';

// 构造GovernanceProposaltransaction
const proposalTransaction = {
  id: `governance-proposal-${Date.now()}`,
  tx_type: 'GOVERNANCE_PROPOSAL',
  from: 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA',
  to: 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA',
  amount: '0',
  fee: '1000',
  timestamp: Date.now(),
  nonce: '1',
  payload: {
    proposal_id: 'swarm-demo-prop-1',
    purpose: 'Enable Swarm Demo Mode for DevNet',
    amount: '0',
    beneficiary: 'ng113LQwtaT1r84sS63CbroHGcMRLNFC9sLNA',
    category: 'SWARM_DEMO',
    timestamp: Date.now(),
    description: 'This proposal enables Swarm Demo Mode on DevNet to test multi-agent collaborative governance.'
  },
  signature: 'test-signature-' + Date.now()
};

console.log('Sending proposal transaction...');

try {
  const response = await axios.post(TX_INJECTION_URL, proposalTransaction, {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  console.log('Proposal response:', response.data);
  
  if (response.data.success) {
    console.log('✅ Proposal submitted successfully!');
  } else {
    console.log('❌ Failed to submit proposal:', response.data.error);
  }
} catch (error) {
  console.error('Error sending proposal:', error.message);
}
