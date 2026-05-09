#!/usr/bin/env node

/**
 * 任务调度器 - 负责任务的调度和执行
 */

class Scheduler {
  constructor() {
    this.tasks = [];
    this.intervals = new Map();
    this.timeouts = new Map();
    this.isRunning = false;
  }

  /**
   * 启动调度器
   */
  start() {
    console.log('⏰ 启动任务调度器...');
    this.isRunning = true;
    
    // 启动所有任务
    this.tasks.forEach(task => {
      this.scheduleTask(task);
    });
    
    console.log('✅ 任务调度器启动完成');
  }

  /**
   * 停止调度器
   */
  stop() {
    console.log('⏹️ 停止任务调度器...');
    this.isRunning = false;
    
    // 清除所有定时器
    for (const [taskId, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }
    
    for (const [taskId, timeout] of this.timeouts.entries()) {
      clearTimeout(timeout);
    }
    
    this.intervals.clear();
    this.timeouts.clear();
    
    console.log('✅ 任务调度器停止完成');
  }

  /**
   * 调度任务
   */
  scheduleTask(task) {
    if (!this.isRunning) {
      console.warn(`⚠️ 调度器未运行，任务 ${task.id} 未调度`);
      return;
    }
    
    // 检查任务是否已调度
    if (this.intervals.has(task.id) || this.timeouts.has(task.id)) {
      console.warn(`⚠️ 任务 ${task.id} 已调度，跳过重复调度`);
      return;
    }
    
    // 根据任务类型调度
    switch (task.schedule.type) {
      case 'daily':
        this.scheduleDailyTask(task);
        break;
      case 'weekly':
        this.scheduleWeeklyTask(task);
        break;
      case 'interval':
        this.scheduleIntervalTask(task);
        break;
      case 'once':
        this.scheduleOnceTask(task);
        break;
      default:
        console.error(`❌ 不支持的任务类型：${task.schedule.type}`);
    }
  }

  /**
   * 调度每日任务
   */
  scheduleDailyTask(task) {
    const [hours, minutes] = task.schedule.time.split(':').map(Number);
    const now = new Date();
    const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const delay = nextRun - now;
    
    const timeout = setTimeout(async () => {
      await this.executeTask(task);
      this.scheduleDailyTask(task); // 调度下一次
    }, delay);
    
    this.timeouts.set(task.id, timeout);
    console.log(`📅 每日任务 ${task.id} 调度在 ${nextRun.toLocaleString()}`);
  }

  /**
   * 调度每周任务
   */
  scheduleWeeklyTask(task) {
    const [hours, minutes] = task.schedule.time.split(':').map(Number);
    const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(task.schedule.day.toLowerCase());
    
    const now = new Date();
    const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    
    const daysUntil = (dayIndex - now.getDay() + 7) % 7;
    nextRun.setDate(nextRun.getDate() + daysUntil);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 7);
    }
    
    const delay = nextRun - now;
    
    const timeout = setTimeout(async () => {
      await this.executeTask(task);
      this.scheduleWeeklyTask(task); // 调度下一次
    }, delay);
    
    this.timeouts.set(task.id, timeout);
    console.log(`📅 每周任务 ${task.id} 调度在 ${nextRun.toLocaleString()}`);
  }

  /**
   * 调度间隔任务
   */
  scheduleIntervalTask(task) {
    const interval = setInterval(async () => {
      await this.executeTask(task);
    }, task.schedule.minutes * 60 * 1000);
    
    this.intervals.set(task.id, interval);
    console.log(`🔄 间隔任务 ${task.id} 调度在每 ${task.schedule.minutes} 分钟`);
  }

  /**
   * 调度一次性任务
   */
  scheduleOnceTask(task) {
    if (task.schedule.time) {
      // 定时执行
      const [hours, minutes] = task.schedule.time.split(':').map(Number);
      const now = new Date();
      const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
      
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      
      const delay = nextRun - now;
      
      const timeout = setTimeout(async () => {
        await this.executeTask(task);
      }, delay);
      
      this.timeouts.set(task.id, timeout);
      console.log(`📅 一次性任务 ${task.id} 调度在 ${nextRun.toLocaleString()}`);
    } else {
      // 立即执行
      this.executeTask(task);
    }
  }

  /**
   * 执行任务
   */
  async executeTask(task) {
    console.log(`🚀 执行任务：${task.name}`);
    
    try {
      await task.handler();
      console.log(`✅ 任务 ${task.name} 执行成功`);
    } catch (error) {
      console.error(`❌ 任务 ${task.name} 执行失败：${error.message}`);
    }
  }

  /**
   * 获取任务下一次执行时间
   */
  getNextExecution(task) {
    const now = new Date();
    
    switch (task.schedule.type) {
      case 'daily':
        const [hours, minutes] = task.schedule.time.split(':').map(Number);
        const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
        if (nextDay <= now) {
          nextDay.setDate(nextDay.getDate() + 1);
        }
        return nextDay;
        
      case 'weekly':
        const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(task.schedule.day.toLowerCase());
        const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate(), task.schedule.time.split(':')[0], task.schedule.time.split(':')[1], 0, 0);
        const daysUntil = (dayIndex - now.getDay() + 7) % 7;
        nextWeek.setDate(nextWeek.getDate() + daysUntil);
        if (nextWeek <= now) {
          nextWeek.setDate(nextWeek.getDate() + 7);
        }
        return nextWeek;
        
      case 'interval':
        return new Date(now.getTime() + task.schedule.minutes * 60 * 1000);
        
      case 'once':
        return task.schedule.time ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), task.schedule.time.split(':')[0], task.schedule.time.split(':')[1], 0, 0) : null;
        
      default:
        return null;
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId) {
    if (this.intervals.has(taskId)) {
      clearInterval(this.intervals.get(taskId));
      this.intervals.delete(taskId);
    }
    
    if (this.timeouts.has(taskId)) {
      clearTimeout(this.timeouts.get(taskId));
      this.timeouts.delete(taskId);
    }
    
    const index = this.tasks.findIndex(task => task.id === taskId);
    if (index !== -1) {
      this.tasks.splice(index, 1);
    }
    
    console.log(`❌ 任务 ${taskId} 已取消`);
  }
}

// 导出
module.exports = {
  Scheduler
};
