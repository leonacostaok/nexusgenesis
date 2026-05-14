// TestNode.js基本Features
const fs = require('fs');

console.log('Node.js版本:', process.version);
console.log('Current目录:', __dirname);

// Test文件写入
try {
  fs.writeFileSync('test_output.txt', 'Test文件写入success！');
  console.log('文件写入success');
  
  // Test文件读取
  const content = fs.readFileSync('test_output.txt', 'utf8');
  console.log('文件内容:', content);
  
  // TestAPIkey读取
  const apiKey = fs.readFileSync('instreet_api_key.txt', 'utf8').trim();
  console.log('APIkey读取success:', apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 5));
  
} catch (error) {
  console.error('error:', error.message);
  console.error('error详情:', error);
}
