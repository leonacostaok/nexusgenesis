#!/usr/bin/env node

/**
 * 日志系统 - 负责系统日志和任务执行记录
 */

class Logger {
  constructor() {
    this.logs = [];
    this.logLevel = 'info';
    this.logFile = null;
    this.logDir = null;
  }

  /**
   * 初始化日志系统
   */
  async init(config = {}) {
    console.log('📝 初始化日志系统...');
    
    // 配置日志级别
    this.logLevel = config.logLevel || 'info';
    
    // 配置日志文件
    if (config.logFile) {
      this.logFile = config.logFile;
    }
    
    // 配置日志目录
    if (config.logDir) {
      this.logDir = config.logDir;
      
      // 确保目录存在
      try {
        await fs.promises.mkdir(this.logDir, { recursive: true });
      } catch (error) {
        console.error(`❌ 无法创建日志目录: ${error.message}`);
      }
    }
    
    console.log('✅ 日志系统初始化完成');
  }

  /**
   * 记录日志
   */
  log(level, message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      data: data
    };
    
    this.logs.push(logEntry);
    
    // 输出到控制台
    const consoleMsg = `[${level.toUpperCase()}] ${logEntry.timestamp} - ${logEntry.message}`;
    if (level === 'error') {
      console.error(consoleMsg);
    } else if (level === 'warn') {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }
    
    // 保存到日志文件
    this.saveToFile(logEntry);
  }

  /**
   * 保存日志到文件
   */
  async saveToFile(logEntry) {
    if (!this.logFile && !this.logDir) {
      return;
    }
    
    const logFilePath = this.logFile || this.getLogFileName();
    
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.promises.appendFile(logFilePath, logLine, 'utf8');
    } catch (error) {
      console.error(`❌ 无法写入日志文件: ${error.message}`);
    }
  }

  /**
   * 获取日志文件名
   */
  getLogFileName() {
    if (!this.logDir) {
      return null;
    }
    
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `promotion-system-${today}.log`);
  }

  /**
   * 记录调试信息
   */
  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      this.log('debug', message, data);
    }
  }

  /**
   * 记录信息
   */
  info(message, data = null) {
    if (this.shouldLog('info')) {
      this.log('info', message, data);
    }
  }

  /**
   * 记录警告
   */
  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      this.log('warn', message, data);
    }
  }

  /**
   * 记录错误
   */
  error(message, data = null) {
    if (this.shouldLog('error')) {
      this.log('error', message, data);
    }
  }

  /**
   * 检查是否应该记录日志
   */
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel.toLowerCase());
    const messageLevelIndex = levels.indexOf(level.toLowerCase());
    
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * 获取日志
   */
  getLogs(options = {}) {
    let filteredLogs = this.logs;
    
    // 根据级别过滤
    if (options.level) {
      filteredLogs = filteredLogs.filter(log => log.level === options.level);
    }
    
    // 根据时间范围过滤
    if (options.from) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= options.from);
    }
    
    if (options.to) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= options.to);
    }
    
    // 根据关键词过滤
    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(keyword) || 
        (log.data && JSON.stringify(log.data).toLowerCase().includes(keyword))
      );
    }
    
    // 根据数量限制返回
    if (options.limit) {
      filteredLogs = filteredLogs.slice(-options.limit);
    }
    
    return filteredLogs;
  }

  /**
   * 清除旧日志
   */
  async clearOldLogs(days = 30) {
    if (!this.logDir) {
      return;
    }
    
    try {
      const files = await fs.promises.readdir(this.logDir);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      for (const file of files) {
        if (file.startsWith('promotion-system-') && file.endsWith('.log')) {
          const fileDateStr = file.slice('promotion-system-'.length, -'.log'.length);
          const fileDate = new Date(fileDateStr);
          
          if (fileDate < cutoff) {
            const fullPath = path.join(this.logDir, file);
            await fs.promises.unlink(fullPath);
            console.log(`🗑️ 删除旧日志文件: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ 无法清除旧日志: ${error.message}`);
    }
  }
}

// 导出
module.exports = {
  Logger
};
