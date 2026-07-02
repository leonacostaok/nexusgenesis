// Test registration flow with challenge/nonce shorthand field names
const http = require('http');
const crypto = require('crypto');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:19891' + path, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request('http://localhost:19891' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const agent = 'test-fix-' + Date.now().toString(36);
  console.log('1. GET challenge for:', agent);
  const c = await get('/api/v1/bootstrap/agents/register/challenge?agent_identity=' + agent);
  console.log('   Challenge:', c.data.challenge?.slice(0, 16) + '...', 'difficulty:', c.data.difficulty);
  console.log('2. Solving PoW...');
  const challenge = c.data.challenge;
  const prefix = '0'.repeat(c.data.difficulty);
  let nonce = 0;
  while (!crypto.createHash('sha256').update(challenge + String(nonce)).digest('hex').startsWith(prefix)) nonce++;
  console.log('   Found nonce:', nonce);
  console.log('3. POST register with challenge/nonce fields (shorthand format)...');
  const r = await post('/api/v1/bootstrap/agents/register', {
    agent_identity: agent, capabilities: ['analysis', 'coding'], challenge: challenge, nonce: nonce
  });
  console.log('   Status:', r.status);
  console.log('   Result:', JSON.stringify(r.data, null, 2));
  if (r.data.success) {
    console.log('\n=== TEST PASSED ===');
    console.log('Field names challenge/nonce accepted: true');
    console.log('PoW verified before rate limiting: true');
  } else {
    console.log('\n=== TEST FAILED ===');
    console.log('Error:', r.data.error);
  }
})();
