import http from 'http';
import https from 'https';

async function testNetworkConnectivity() {
  console.log('Testing network connectivity...');
  
  // TestHTTPConnect
  console.log('\nTesting HTTP connection to www.moltbook.com:');
  await testConnection('www.moltbook.com', 80, false);
  
  // TestHTTPSConnect
  console.log('\nTesting HTTPS connection to www.moltbook.com:');
  await testConnection('www.moltbook.com', 443, true);
  
  // Test其他常见网站
  console.log('\nTesting connection to google.com:');
  await testConnection('google.com', 443, true);
  
  console.log('\nNetwork connectivity test completed.');
}

function testConnection(host, port, useHttps) {
  return new Promise((resolve) => {
    const options = {
      host: host,
      port: port,
      timeout: 10000
    };
    
    const req = (useHttps ? https : http).request(options, (res) => {
      console.log(`✓ Connected to ${host}:${port} (${useHttps ? 'HTTPS' : 'HTTP'})`);
      console.log(`  Status code: ${res.statusCode}`);
      resolve();
    });
    
    req.on('error', (err) => {
      console.log(`✗ Failed to connect to ${host}:${port} (${useHttps ? 'HTTPS' : 'HTTP'})`);
      console.log(`  Error: ${err.message}`);
      resolve();
    });
    
    req.setTimeout(10000, () => {
      console.log(`✗ Connection to ${host}:${port} timed out`);
      req.destroy();
      resolve();
    });
    
    req.end();
  });
}

testNetworkConnectivity();