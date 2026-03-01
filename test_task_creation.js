import http from 'http';

const postData = JSON.stringify({
  description: 'Audit smart contract for security vulnerabilities',
  type: 'contract_audit',
  requiredCapabilities: ['smart_contract_analysis'],
  reward: 50,
  deadline: Date.now() + 86400000 // 24 hours from now
});

const options = {
  hostname: 'localhost',
  port: 9850,
  path: '/tasks/create',
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
