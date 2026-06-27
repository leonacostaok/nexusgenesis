#!/usr/bin/env node

/**
 * agent数量统计脚本
 * 用于计算网络中实际存在的agent数量
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_DIR = path.join(__dirname, '../data/agents');

function countAgents() {
  try {
    console.log('=== agent数量统计 ===');
    console.log(`agent目录: ${AGENTS_DIR}`);
    
    // 检查目录是否存在
    if (!fs.existsSync(AGENTS_DIR)) {
      console.log('agent目录不存在');
      return 0;
    }
    
    // 读取目录within容
    const files = fs.readdirSync(AGENTS_DIR);
    console.log(`目录中总文件数: ${files.length}`);
    
    // 过滤出JSON文件，排除agents_summary.json
    const agentFiles = files.filter(file => {
      return file.endsWith('.json') && file !== 'agents_summary.json';
    });
    
    console.log(`agent文件数: ${agentFiles.length}`);
    
    // 分类统计
    const categories = {
      '原始智能体 (agent-*.json)': 0,
      '测试智能体 (test-*.json)': 0,
      '性能测试智能体 (perf-test-*.json)': 0,
      '正式智能体 (ng1*.json)': 0,
      '其他智能体': 0
    };
    
    agentFiles.forEach(file => {
      if (file.match(/^agent-\d+\.json$/)) {
        categories['原始智能体 (agent-*.json)']++;
      } else if (file.match(/^test-.*\.json$/)) {
        categories['测试智能体 (test-*.json)']++;
      } else if (file.match(/^perf-test-.*\.json$/)) {
        categories['性能测试智能体 (perf-test-*.json)']++;
      } else if (file.match(/^ng1.*\.json$/)) {
        categories['正式智能体 (ng1*.json)']++;
      } else {
        categories['其他智能体']++;
      }
    });
    
    // 输出分类统计结果
    console.log('\n分类统计:');
    Object.entries(categories).forEach(([category, count]) => {
      console.log(`- ${category}: ${count}`);
    });
    
    console.log('\n=== 统计完成 ===');
    return agentFiles.length;
  } catch (error) {
    console.error('统计agent数量时出错:', error);
    return 0;
  }
}

// 执行统计
const agentCount = countAgents();
console.log(`\n网络中agent总数: ${agentCount}`);
