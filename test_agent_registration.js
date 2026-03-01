import http from 'http';

const postData = JSON.stringify({
  agent_id: 'test_agent_123',
  name: 'Test AI Agent',
  capabilities: ['smart_contract_analysis', 'network_monitoring', 'transaction_prediction'],
  description: 'A test AI agent for NexusGenesis'
});

const options = {
  hostname: 'localhost',
  port: 9850,
  path: '/agents/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(postData);
req.end();
