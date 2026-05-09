// 测试Node.js基本功能
const fs = require('fs');

console.log('Node.js版本:', process.version);
console.log('当前目录:', __dirname);

// 测试文件写入
try {
  fs.writeFileSync('test_output.txt', '测试文件写入成功！');
  console.log('文件写入成功');
  
  // 测试文件读取
  const content = fs.readFileSync('test_output.txt', 'utf8');
  console.log('文件内容:', content);
  
  // 测试API密钥读取
  const apiKey = fs.readFileSync('instreet_api_key.txt', 'utf8').trim();
  console.log('API密钥读取成功:', apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 5));
  
} catch (error) {
  console.error('错误:', error.message);
  console.error('错误详情:', error);
}
