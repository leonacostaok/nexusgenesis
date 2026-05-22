import axios from 'axios';

async function sendTestTransaction() {
  const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx';

  // Create a simple test transaction
  const testTransaction = {
    id: `test-vote-${Date.now()}`,
    tx_type: 'GOVERNANCE_VOTE',
    from: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
    to: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
    amount: '1',
    fee: '100',
    timestamp: Date.now(),
    nonce: '1',
    payload: {
      proposal_id: 'swarm-demo-prop-1',
      voter_id: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
      vote_option: 'YES',
      timestamp: Date.now(),
      reason: 'Test vote from external agent'
    },
    signature: 'test-signature-' + Date.now()
  };

  console.log('Sending test transaction...');
  console.log('Transaction:', JSON.stringify(testTransaction, null, 2));

  try {
    const response = await axios.post(TX_INJECTION_URL, testTransaction, {
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
sendTestTransaction();