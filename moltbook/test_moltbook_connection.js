#!/usr/bin/env node

/**
 * Moltbook 连接测试脚本
 * 用于诊断网络连接问题和测试不同的 API 端点
 */

const axios = require('axios');

async function testConnection() {
  console.log('=== Moltbook Connection Test ===');
  
  // 测试不同的 API 端点
  const endpoints = [
    'https://www.moltbook.com/api/v1',
    'https://api.moltbook.com/v1',
    'https://moltbook.com/api/v1'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\nTesting endpoint: ${endpoint}`);
    
    try {
      // 测试基本连接
      console.log('Testing basic connection...');
      const response = await axios.get(endpoint, {
        timeout: 30000
      });
      console.log('✓ Connection successful');
      console.log('Status:', response.status);
      console.log('Data:', response.data);
    } catch (error) {
      console.log('✗ Connection failed');
      console.log('Error:', error.message);
      if (error.response) {
        console.log('Response status:', error.response.status);
        console.log('Response data:', error.response.data);
      } else if (error.request) {
        console.log('No response received');
      }
    }
  }
  
  // 测试 DNS 解析
  console.log('\n=== DNS Resolution Test ===');
  try {
    const dns = require('dns');
    dns.resolve('www.moltbook.com', (err, addresses) => {
      if (err) {
        console.log('DNS resolution failed:', err.message);
      } else {
        console.log('DNS resolution successful:');
        addresses.forEach(addr => {
          console.log(`  - ${addr}`);
        });
      }
    });
  } catch (error) {
    console.log('DNS test error:', error.message);
  }
  
  // 测试网络延迟
  console.log('\n=== Network Latency Test ===');
  const testUrls = [
    'https://www.google.com',
    'https://www.github.com',
    'https://www.moltbook.com'
  ];
  
  for (const url of testUrls) {
    const start = Date.now();
    try {
      await axios.get(url, {
        timeout: 10000
      });
      const end = Date.now();
      console.log(`${url}: ${end - start}ms`);
    } catch (error) {
      console.log(`${url}: Failed - ${error.message}`);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

testConnection();