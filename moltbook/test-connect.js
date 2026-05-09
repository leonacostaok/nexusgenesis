const { connect } = require('./scripts/moltbook');

async function testConnect() {
  console.log('尝试连接 MOLTBOOK...');
  // 注意：这里需要提供有效的 apiKey
  const result = await connect('test-api-key');
  console.log('连接结果:', result);
}

testConnect();