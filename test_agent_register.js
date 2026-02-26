import axios from 'axios';
import { PQCWallet } from './src/wallet/pqcWallet.js';

async function sendAgentRegisterTransaction() {
  const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx';

  // Load the wallet
  const wallet = await PQCWallet.load('ng119PNcisBqHz7ursgm3VjAp9uU5h6gi2FM7');
  if (!wallet) {
    console.error('Failed to load wallet');
    return;
  }

  // Create agent registration transaction
  const txData = {
    tx_type: 'AGENT_REGISTER',
    from: wallet.address,
    to: wallet.address,
    amount: '1',
    fee: '1000',
    timestamp: Date.now(),
    nonce: '1',
    agent_identity: 'test-agent-1',
    public_key: wallet.publicKey.toString('hex'),
    capabilities: ['LLM', 'RESEARCH'],
    metadata: 'Test agent for external integration'
  };

  // Sign the transaction
  const signature = await wallet.signTransaction(txData);

  // Create the complete transaction
  const transaction = {
    id: `agent-register-test-${Date.now()}`,
    ...txData,
    signature: signature
  };

  console.log('Sending agent registration transaction...');
  console.log('Transaction:', JSON.stringify(transaction, null, 2));

  try {
    const response = await axios.post(TX_INJECTION_URL, transaction, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('Transaction sent successfully!');
  } catch (error) {
    console.error('Error sending transaction:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the function
sendAgentRegisterTransaction();