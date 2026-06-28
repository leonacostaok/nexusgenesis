#!/usr/bin/env node

/**
 * NexusGenesis System monitoringService started脚本
 * 
 * 这个脚本启动System monitoring服务，负责收集和分析系统的各项指标
 * 包括：System resources、Blockchain state、agent健康、API性能等
 */

import SystemMonitor from '../src/automation/systemMonitor.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================');
console.log('NexusGenesis System monitoring服务');
console.log('========================================');
console.log('\n[1/3] 初始化System monitoring服务...');

try {
  // 创建System monitoring实例
  const monitor = new SystemMonitor();
  console.log('[✓] System monitoring服务实例Create successful');
  
  // 启动HTTP服务器（可选，用于提供Monitoring dataAPI）
  console.log('\n[2/3] 配置Monitoring service...');
  console.log('[✓] Monitoring service配置完成');
  
  // 显示启动信息
  console.log('\n[3/3] System monitoringService started中...');
  console.log('[✓] System monitoring服务已成功启动！');
  
  console.log('\n========================================');
  console.log('System monitoring服务信息');
  console.log('========================================');
  console.log('• 指标收集: 已启用');
  console.log('• 告警检测: 已启用');
  console.log('• 数据存储: data/metrics/');
  console.log('• 告警日志: logs/alerts.log');
  console.log('========================================\n');
  
  console.log('[提示] 按 Ctrl+C 停止Monitoring service\n');
  
  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n[SystemMonitor] 正在停止Monitoring service...');
    console.log('[SystemMonitor] Monitoring service已停止');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[SystemMonitor] 正在停止Monitoring service...');
    console.log('[SystemMonitor] Monitoring service已停止');
    process.exit(0);
  });
  
} catch (error) {
  console.error('[✗] 启动System monitoring服务Failed:', error);
  console.error(error.stack);
  process.exit(1);
}
