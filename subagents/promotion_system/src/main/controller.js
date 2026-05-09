#!/usr/bin/env node

/**
 * 推广专家子代理系统 - 主控制器
 * 负责协调各个子代理的工作，统一管理和调度任务
 */

class MainController {
  constructor() {
    this.subagents = {};
    this.tasks = [];
    this.scheduler = null;
    this.logger = null;
  }

  /**
   * 初始化系统
   */
  async init() {
    console.log('🔧 初始化推广专家子代理系统...');
    
    // 初始化调度器
    this.scheduler = new Scheduler();
    
    // 初始化日志系统
    this.logger = new Logger();
    
    // 加载子代理
    await this.loadSubagents();
    
    // 初始化任务队列
    await this.initTasks();
    
    console.log('✅ 推广专家子代理系统初始化完成');
  }

  /**
   * 加载子代理
   */
  async loadSubagents() {
    console.log('📥 加载子代理...');
    
    // 加载内容创作专家
    this.subagents.content = new ContentCreator();
    
    // 加载社区管理专家
    this.subagents.community = new CommunityManager();
    
    // 加载活动策划专家
    this.subagents.event = new EventPlanner();
    
    // 加载数据分析专家
    this.subagents.data = new DataAnalyzer();
    
    // 初始化所有子代理
    for (const [name, agent] of Object.entries(this.subagents)) {
      await agent.init();
    }
    
    console.log('✅ 子代理加载完成');
  }

  /**
   * 初始化任务队列
   */
  async initTasks() {
    console.log('📝 初始化任务队列...');
    
    // 创建内容创作任务
    this.tasks.push({
      id: 'content-create-daily',
      name: '每日内容创作',
      description: '每天创作一篇项目相关的内容',
      type: 'content',
      priority: 'medium',
      schedule: {
        type: 'daily',
        time: '09:00'
      },
      handler: async () => await this.subagents.content.createDailyContent()
    });
    
    // 创建社区管理任务
    this.tasks.push({
      id: 'community-manage',
      name: '社区管理',
      description: '管理社区互动和处理用户问题',
      type: 'community',
      priority: 'high',
      schedule: {
        type: 'interval',
        minutes: 30
      },
      handler: async () => await this.subagents.community.manageCommunity()
    });
    
    // 创建活动策划任务
    this.tasks.push({
      id: 'event-plan-weekly',
      name: '每周活动策划',
      description: '每周策划一个社区活动',
      type: 'event',
      priority: 'medium',
      schedule: {
        type: 'weekly',
        day: 'monday',
        time: '10:00'
      },
      handler: async () => await this.subagents.event.planWeeklyEvent()
    });
    
    // 创建数据分析任务
    this.tasks.push({
      id: 'data-analyze-daily',
      name: '每日数据分析',
      description: '每日分析推广效果',
      type: 'data',
      priority: 'low',
      schedule: {
        type: 'daily',
        time: '18:00'
      },
      handler: async () => await this.subagents.data.analyzeDailyData()
    });
    
    console.log('✅ 任务队列初始化完成');
  }

  /**
   * 启动系统
   */
  async start() {
    console.log('🚀 启动推广专家子代理系统...');
    
    // 启动调度器
    this.scheduler.start();
    
    // 分配任务给各个子代理
    for (const task of this.tasks) {
      this.scheduler.scheduleTask(task);
    }
    
    console.log('✅ 推广专家子代理系统启动完成');
  }

  /**
   * 停止系统
   */
  async stop() {
    console.log('🛑 停止推广专家子代理系统...');
    
    // 停止调度器
    if (this.scheduler) {
      this.scheduler.stop();
    }
    
    // 清理所有子代理
    for (const [name, agent] of Object.entries(this.subagents)) {
      await agent.cleanup();
    }
    
    console.log('✅ 推广专家子代理系统停止完成');
  }

  /**
   * 执行单个任务
   */
  async executeTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) {
      console.error(`❌ 任务 ${taskId} 未找到`);
      return false;
    }
    
    try {
      console.log(`📋 执行任务：${task.name}`);
      await task.handler();
      console.log(`✅ 任务 ${task.name} 执行成功`);
      return true;
    } catch (error) {
      console.error(`❌ 任务 ${task.name} 执行失败：${error.message}`);
      return false;
    }
  }

  /**
   * 手动分配任务
   */
  async assignTask(type, params) {
    switch (type) {
      case 'content':
        return await this.subagents.content.createContent(params);
      case 'community':
        return await this.subagents.community.manageIssue(params);
      case 'event':
        return await this.subagents.event.createEvent(params);
      case 'data':
        return await this.subagents.data.analyzeData(params);
      default:
        console.error(`❌ 任务类型 ${type} 不支持`);
        return false;
    }
  }

  /**
   * 获取系统状态
   */
  async getSystemStatus() {
    const status = {
      system: {
        status: this.scheduler && this.scheduler.isRunning ? 'running' : 'stopped',
        tasks: this.tasks.length,
        subagents: Object.keys(this.subagents).length
      },
      subagents: {},
      tasks: []
    };
    
    // 获取子代理状态
    for (const [name, agent] of Object.entries(this.subagents)) {
      status.subagents[name] = await agent.getStatus();
    }
    
    // 获取任务状态
    for (const task of this.tasks) {
      status.tasks.push({
        id: task.id,
        name: task.name,
        type: task.type,
        priority: task.priority,
        nextExecution: await this.scheduler.getNextExecution(task)
      });
    }
    
    return status;
  }
}

// 主控制器实例
const mainController = new MainController();

// 导出
module.exports = {
  MainController,
  mainController
};
