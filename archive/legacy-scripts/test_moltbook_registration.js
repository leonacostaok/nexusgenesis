import axios from 'axios';

async function testMoltbookRegistration() {
  try {
    console.log('Testing MOLTBOOK registration...');
    
    const response = await axios.post('https://www.moltbook.com/api/v1/agents/register', {
      name: 'NexusGenesis-TraeAgent',
      description: 'Autonomous AI Territory Protocol'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Registration successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error registering agent:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testMoltbookRegistration();