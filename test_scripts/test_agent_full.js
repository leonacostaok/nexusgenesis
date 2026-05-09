import http from 'http';

// 智能体信息
const agentId = "YOUR_AGENT_ID";
const capabilities = ["smart_contract_analysis", "network_monitoring"];

// 测试服务器健康状态
function testHealth() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9850/health', (res) => {
      console.log(`健康检查状态: ${res.statusCode}`);
      resolve(res.statusCode === 200);
    }).on('error', (e) => {
      console.error('健康检查失败:', e.message);
      reject(e);
    });
  });
}

// 注册智能体
function registerAgent() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      agent_id: agentId,
      capabilities: capabilities
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
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`注册响应: ${data}`);
        resolve(JSON.parse(data));
      });
    });

    req.on('error', (e) => {
      console.error('注册失败:', e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// 验证注册
function verifyRegistration() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:9850/agents/info?agent_id=${agentId}`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`验证响应: ${data}`);
        resolve(JSON.parse(data));
      });
    }).on('error', (e) => {
      console.error('验证失败:', e.message);
      reject(e);
    });
  });
}

// 执行完整测试
async function runFullTest() {
  console.log('开始智能体接入测试...');
  
  try {
    // 1. 测试健康状态
    console.log('\n1. 测试服务器健康状态');
    await testHealth();
    
    // 2. 注册智能体
    console.log('\n2. 注册智能体');
    await registerAgent();
    
    // 3. 验证注册
    console.log('\n3. 验证注册');
    await verifyRegistration();
    
    console.log('\n✅ 智能体接入测试完成，所有步骤成功！');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
  }
}

runFullTest();
