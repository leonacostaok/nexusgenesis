/**
 * NexusGenesis 自动化工作流程引擎
 * 提供可靠的任务调度、错误处理和系统监控功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SystemMonitor from './systemMonitor.js';
import BackupManager from './backupManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 任务状态常量
const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying'
};

// 错误类型常量
const ERROR_TYPES = {
  API_RATE_LIMIT: 'api_rate_limit',
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error',
  UNKNOWN_ERROR: 'unknown_error'
};

class WorkflowEngine {
  constructor() {
    this.tasks = new Map();
    this.scheduledTasks = new Map();
    this.runningTasks = new Map();
    this.retryQueue = new Map();
    this.tasksDirectory = path.join(__dirname, '../../data/workflow-tasks');
    this.logsDirectory = path.join(__dirname, '../../logs');
    this.systemMonitor = new SystemMonitor();
    this.backupManager = new BackupManager();
    this.initDirectories();
    this.loadTasks();
    this.startHeartbeat();
  }

  initDirectories() {
    // 确保任务目录存在
    if (!fs.existsSync(this.tasksDirectory)) {
      fs.mkdirSync(this.tasksDirectory, { recursive: true });
    }
    // 确保日志目录存在
    if (!fs.existsSync(this.logsDirectory)) {
      fs.mkdirSync(this.logsDirectory, { recursive: true });
    }
  }

  loadTasks() {
    if (!fs.existsSync(this.tasksDirectory)) {
      return;
    }

    const taskFiles = fs.readdirSync(this.tasksDirectory);
    taskFiles.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const taskData = JSON.parse(fs.readFileSync(path.join(this.tasksDirectory, file), 'utf8'));
          this.tasks.set(taskData.id, taskData);
          
          // 根据任务状态恢复执行
          if (taskData.status === TASK_STATUS.PENDING) {
            this.scheduleTask(taskData);
          } else if (taskData.status === TASK_STATUS.RUNNING) {
            this.retryTask(taskData.id);
          } else if (taskData.status === TASK_STATUS.RETRYING) {
            this.retryQueue.set(taskData.id, taskData);
          }
        } catch (error) {
          this.logError(`Error loading task ${file}:`, error);
        }
      }
    });
  }

  saveTask(task) {
    const taskPath = path.join(this.tasksDirectory, `workflow-task-${task.id}.json`);
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf8');
  }

  deleteTask(taskId) {
    const taskPath = path.join(this.tasksDirectory, `workflow-task-${taskId}.json`);
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
    }
    this.tasks.delete(taskId);
    this.scheduledTasks.delete(taskId);
    this.runningTasks.delete(taskId);
    this.retryQueue.delete(taskId);
  }

  // 创建新任务
  createTask(name, action, options = {}) {
    const task = {
      id: Date.now().toString(),
      name,
      action,
      status: TASK_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
      errorCount: 0,
      lastError: null,
      ...options,
      retryConfig: options.retryConfig || {
        maxRetries: 3,
        initialDelay: 60000, // 1分钟
        backoffMultiplier: 2
      }
    };

    this.tasks.set(task.id, task);
    this.saveTask(task);
    return task;
  }

  // 调度任务
  scheduleTask(task, delay = 0) {
    if (!task) return;

    const timeoutId = setTimeout(() => {
      this.executeTask(task.id);
    }, delay);

    this.scheduledTasks.set(task.id, {
      task,
      timeoutId
    });

    task.updatedAt = new Date().toISOString();
    this.saveTask(task);
    return timeoutId;
  }

  // 取消调度任务
  unscheduleTask(taskId) {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      clearTimeout(scheduledTask.timeoutId);
      this.scheduledTasks.delete(taskId);
      
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = TASK_STATUS.PENDING;
        this.saveTask(task);
      }
    }
  }

  // 执行任务
  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logError(`Task ${taskId} not found`);
      return;
    }

    // 检查是否超过最大重试次数
    if (task.errorCount >= task.retryConfig.maxRetries) {
      task.status = TASK_STATUS.FAILED;
      this.saveTask(task);
      this.handleTaskFailure(task);
      return;
    }

    // 更新任务状态
    task.status = TASK_STATUS.RUNNING;
    task.runCount++;
    task.updatedAt = new Date().toISOString();
    this.saveTask(task);

    this.runningTasks.set(taskId, task);

    try {
      // 执行任务动作
      const result = await task.action();
      
      // 任务成功完成
      task.status = TASK_STATUS.COMPLETED;
      task.result = result;
      task.updatedAt = new Date().toISOString();
      this.saveTask(task);
      this.handleTaskSuccess(task);
    } catch (error) {
      // 任务执行失败
      task.status = TASK_STATUS.FAILED;
      task.errorCount++;
      task.lastError = {
        message: error.message,
        type: this.determineErrorType(error),
        timestamp: new Date().toISOString(),
        stack: error.stack
      };
      task.updatedAt = new Date().toISOString();
      this.saveTask(task);
      this.handleTaskFailure(task);
      this.retryTask(taskId);
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  // 重试任务
  retryTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // 检查是否超过最大重试次数
    if (task.errorCount >= task.retryConfig.maxRetries) {
      return;
    }

    // 计算重试延迟
    const delay = task.retryConfig.initialDelay * Math.pow(task.retryConfig.backoffMultiplier, task.errorCount - 1);

    // 更新任务状态
    task.status = TASK_STATUS.RETRYING;
    task.nextRetryAt = new Date(Date.now() + delay).toISOString();
    task.updatedAt = new Date().toISOString();
    this.saveTask(task);

    this.retryQueue.set(taskId, task);

    // 调度重试
    setTimeout(() => {
      this.retryQueue.delete(taskId);
      this.executeTask(taskId);
    }, delay);

    this.logInfo(`Task ${taskId} scheduled for retry in ${delay}ms`);
  }

  // 确定错误类型
  determineErrorType(error) {
    if (error.message.includes('Posting too fast') || error.message.includes('rate limit') || error.message.includes('429')) {
      return ERROR_TYPES.API_RATE_LIMIT;
    } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      return ERROR_TYPES.NETWORK_ERROR;
    } else if (error.message.includes('validation') || error.message.includes('400')) {
      return ERROR_TYPES.VALIDATION_ERROR;
    } else {
      return ERROR_TYPES.UNKNOWN_ERROR;
    }
  }

  // 处理任务成功
  handleTaskSuccess(task) {
    this.logInfo(`Task ${task.id} (${task.name}) completed successfully`);
    
    // 如果是周期性任务，重新调度
    if (task.isRecurring && task.interval) {
      this.scheduleTask(task, task.interval);
    } else if (task.autoDelete) {
      // 如果设置了自动删除，在指定时间后删除任务
      setTimeout(() => {
        this.deleteTask(task.id);
      }, task.autoDeleteDelay || 3600000); // 默认1小时
    }
  }

  // 处理任务失败
  handleTaskFailure(task) {
    this.logError(`Task ${task.id} (${task.name}) failed with error: ${task.lastError.message}`);
    
    // 发送告警
    this.sendAlert({
      type: 'TASK_FAILURE',
      taskId: task.id,
      taskName: task.name,
      error: task.lastError,
      timestamp: new Date().toISOString()
    });
  }

  // 创建周期性任务
  createRecurringTask(name, action, interval, options = {}) {
    const task = this.createTask(name, action, {
      ...options,
      isRecurring: true,
      interval
    });

    // 立即调度第一次执行
    this.scheduleTask(task);
    return task;
  }

  // 系统监控
  startSystemMonitor() {
    // 每5分钟检查系统状态
    setInterval(() => {
      this.checkSystemStatus();
    }, 5 * 60 * 1000);
  }

  // 检查系统状态
  checkSystemStatus() {
    try {
      // 检查磁盘空间
      const diskStats = fs.statSync(__dirname);
      // 检查内存使用（Node.js环境下的简单检查）
      const memoryUsage = process.memoryUsage();
      // 检查任务队列状态
      const queueStats = {
        totalTasks: this.tasks.size,
        runningTasks: this.runningTasks.size,
        pendingTasks: this.scheduledTasks.size,
        retryTasks: this.retryQueue.size
      };

      const status = {
        timestamp: new Date().toISOString(),
        diskStats,
        memoryUsage,
        queueStats
      };

      // 保存系统状态日志
      const statusLogPath = path.join(this.logsDirectory, 'system-status.log');
      fs.appendFileSync(statusLogPath, JSON.stringify(status) + '\n', 'utf8');

      // 检查是否需要发送告警
      this.checkAlerts(status);
    } catch (error) {
      this.logError('Error checking system status:', error);
    }
  }

  // 检查是否需要发送告警
  checkAlerts(status) {
    // 示例：当运行中的任务超过10个时发送告警
    if (status.queueStats.runningTasks > 10) {
      this.sendAlert({
        type: 'SYSTEM_HIGH_LOAD',
        message: `系统负载过高，当前运行中的任务数: ${status.queueStats.runningTasks}`,
        status,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 心跳检测
  startHeartbeat() {
    // 每1分钟记录心跳
    setInterval(() => {
      const heartbeat = {
        timestamp: new Date().toISOString(),
        status: 'running',
        taskCount: this.tasks.size,
        runningTasks: this.runningTasks.size
      };

      const heartbeatPath = path.join(this.logsDirectory, 'workflow-heartbeat.log');
      fs.appendFileSync(heartbeatPath, JSON.stringify(heartbeat) + '\n', 'utf8');
    }, 60000);
  }

  // 发送告警
  sendAlert(alert) {
    // 保存告警日志
    const alertPath = path.join(this.logsDirectory, 'alerts.log');
    fs.appendFileSync(alertPath, JSON.stringify(alert) + '\n', 'utf8');

    // TODO: 实现更多告警方式（如邮件、短信等）
    console.error('[ALERT]', alert.type, alert.message || alert.taskName, alert.timestamp);
  }

  // 日志记录
  logInfo(message) {
    const logEntry = {
      level: 'INFO',
      message,
      timestamp: new Date().toISOString()
    };
    this.writeLog(logEntry);
  }

  logError(message, error = null) {
    const logEntry = {
      level: 'ERROR',
      message,
      timestamp: new Date().toISOString(),
      error: error ? {
        message: error.message,
        stack: error.stack
      } : null
    };
    this.writeLog(logEntry);
  }

  writeLog(logEntry) {
    const logPath = path.join(this.logsDirectory, 'workflow-engine.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf8');
    console[logEntry.level.toLowerCase() === 'error' ? 'error' : 'log'](
      `[${logEntry.level}] ${logEntry.timestamp} - ${logEntry.message}`
    );
  }

  // 获取系统状态报告
  getSystemReport() {
    return {
      timestamp: new Date().toISOString(),
      workflowEngine: {
        totalTasks: this.tasks.size,
        runningTasks: this.runningTasks.size,
        pendingTasks: this.scheduledTasks.size,
        retryTasks: this.retryQueue.size
      }
    };
  }
}

export default WorkflowEngine;
export { TASK_STATUS, ERROR_TYPES };
