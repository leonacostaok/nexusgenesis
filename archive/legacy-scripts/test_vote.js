import axios from 'axios';

async function testVote() {
  const TX_INJECTION_URL = 'http://127.0.0.1:19890/tx';
  
  const voteTransaction = {
    id: `test-vote-${Date.now()}`,
    tx_type: 'GOVERNANCE_VOTE',
    from: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
    to: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
    amount: '1',
    fee: '100',
    timestamp: Date.now(),
    nonce: '1',
    payload: {
      proposal_id: 'prop-2024-12-01-002',
      voter_id: 'ng11M8EKBv9sePtd8ogPLVQvbakfFvJ5oiuiB',
      vote_option: 'YES',
      timestamp: Date.now(),
      reason: 'Test vote' 
    },
    signature: 'test-signature-' + Date.now()
  };
  
  console.log('Sending vote transaction...');
  console.log('Transaction:', JSON.stringify(voteTransaction, null, 2));
  
  try {
    const response = await axios.post(TX_INJECTION_URL, voteTransaction, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('Vote sent successfully!');
  } catch (error) {
    console.error('Error sending vote:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testVote();