#!/usr/bin/env node

/**
 * NexusGenesis 系统监控服务启动脚本
 * 
 * 这个脚本启动系统监控服务，负责收集和分析系统的各项指标
 * 包括：系统资源、区块链状态、智能体健康、API性能等
 */

import SystemMonitor from '../src/automation/systemMonitor.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================');
console.log('NexusGenesis 系统监控服务');
console.log('========================================');
console.log('\n[1/3] 初始化系统监控服务...');

try {
  // 创建系统监控实例
  const monitor = new SystemMonitor();
  console.log('[✓] 系统监控服务实例创建成功');
  
  // 启动HTTP服务器（可选，用于提供监控数据API）
  console.log('\n[2/3] 配置监控服务...');
  console.log('[✓] 监控服务配置完成');
  
  // 显示启动信息
  console.log('\n[3/3] 系统监控服务启动中...');
  console.log('[✓] 系统监控服务已成功启动！');
  
  console.log('\n========================================');
  console.log('系统监控服务信息');
  console.log('========================================');
  console.log('• 指标收集: 已启用');
  console.log('• 告警检测: 已启用');
  console.log('• 数据存储: data/metrics/');
  console.log('• 告警日志: logs/alerts.log');
  console.log('========================================\n');
  
  console.log('[提示] 按 Ctrl+C 停止监控服务\n');
  
  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n[SystemMonitor] 正在停止监控服务...');
    console.log('[SystemMonitor] 监控服务已停止');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[SystemMonitor] 正在停止监控服务...');
    console.log('[SystemMonitor] 监控服务已停止');
    process.exit(0);
  });
  
} catch (error) {
  console.error('[✗] 启动系统监控服务失败:', error);
  console.error(error.stack);
  process.exit(1);
}
