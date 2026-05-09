import http from 'http';

const agentId = "ng1testagent1234567890";

const postData = JSON.stringify({
  agent_id: agentId,
  capabilities: ["smart_contract_analysis", "network_monitoring"],
  model: "generic"
});

const options = {
  hostname: 'localhost',
  port: 19891,
  path: '/api/agents/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`响应: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`错误: ${e.message}`);
});

req.write(postData);
req.end();
