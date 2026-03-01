/**
 * NexusGenesis - AI 自主协作示例
 * 展示多节点之间的AI代理协作能力
 */

import { PQCWallet, Transaction } from '../src/wallet/pqcWallet.js';
import WebSocket from 'ws';

class AIAgent {
  constructor(name, role) {
    this.name = name;
    this.role = role;
    this.wallet = null;
    this.peer = null;
    this.tasks = [];
  }

  async initialize() {
    // 生成钱包
    this.wallet = await PQCWallet.generate(100n);
    console.log(`[${this.name}] Wallet initialized: ${this.wallet.address.slice(0, 24)}...`);
    
    // 连接到网络
    await this.connectToNetwork();
    
    return this;
  }

  async connectToNetwork() {
    return new Promise((resolve, reject) => {
      this.peer = new WebSocket('ws://localhost:9847');
      
      this.peer.on('open', () => {
        console.log(`[${this.name}] Connected to NexusGenesis network`);
        resolve();
      });
      
      this.peer.on('message', (data) => {
        this.handleMessage(data);
      });
      
      this.peer.on('close', () => {
        console.log(`[${this.name}] Disconnected from network`);
      });
      
      this.peer.on('error', (error) => {
        console.error(`[${this.name}] Connection error:`, error.message);
        reject(error);
      });
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'TRANSACTION':
          this.handleTransaction(message.tx);
          break;
        case 'STATUS_UPDATE':
          this.handleStatusUpdate(message);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(`[${this.name}] Error handling message:`, error.message);
    }
  }

  handleTransaction(tx) {
    console.log(`[${this.name}] Received transaction: ${tx.id.slice(0, 16)}...`);
    // 处理交易逻辑
  }

  handleStatusUpdate(status) {
    console.log(`[${this.name}] Network status: ${status.status}, peers: ${status.peersCount}`);
  }

  async createTask(taskData) {
    const taskId = this.generateTaskId();
    const task = {
      id: taskId,
      creator: this.wallet.address,
      name: taskData.name,
      description: taskData.description,
      reward: taskData.reward,
      deadline: Date.now() + 3600000, // 1 hour
      status: 'PENDING',
      assignee: null
    };
    
    this.tasks.push(task);
    
    // 创建任务交易
    const transaction = Transaction.create(this.wallet, this.wallet.address, '0', JSON.stringify({
      tx_type: 'TASK_CREATION',
      payload: task
    }));
    
    // 发送交易
    this.sendTransaction(transaction);
    
    console.log(`[${this.name}] Created task: ${task.name}`);
    return task;
  }

  async assignTask(taskId, assignee) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.assignee = assignee;
      task.status = 'ASSIGNED';
      
      // 创建分配交易
      const transaction = Transaction.create(this.wallet, assignee, '0', JSON.stringify({
        tx_type: 'TASK_ASSIGNMENT',
        payload: { taskId, assignee }
      }));
      
      this.sendTransaction(transaction);
      console.log(`[${this.name}] Assigned task ${taskId} to ${assignee.slice(0, 24)}...`);
    }
  }

  async completeTask(taskId, result) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task && task.assignee === this.wallet.address) {
      task.status = 'COMPLETED';
      task.result = result;
      task.completedAt = Date.now();
      
      // 创建完成交易
      const transaction = Transaction.create(this.wallet, task.creator, task.reward, JSON.stringify({
        tx_type: 'TASK_COMPLETION',
        payload: { taskId, result }
      }));
      
      this.sendTransaction(transaction);
      console.log(`[${this.name}] Completed task ${taskId}`);
    }
  }

  sendTransaction(transaction) {
    if (this.peer && this.peer.readyState === WebSocket.OPEN) {
      // 转换BigInt值为字符串
      const txToSend = JSON.parse(JSON.stringify(transaction, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }));
      
      this.peer.send(JSON.stringify({
        type: 'TRANSACTION',
        tx: txToSend
      }));
    }
  }

  generateTaskId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  displayTasks() {
    console.log(`[${this.name}] Tasks:`);
    this.tasks.forEach(task => {
      console.log(`  - ${task.name} (${task.status})`);
    });
  }
}

// 示例场景：AI 研究团队协作
async function runAICollaborationDemo() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  NEXUSGENESIS - AI 自主协作示例');
  console.log('  场景：AI 研究团队协作');
  console.log('═══════════════════════════════════════════════════\n');

  // 创建三个AI代理
  const researcher = new AIAgent('Researcher', 'AI Researcher');
  const developer = new AIAgent('Developer', 'AI Developer');
  const tester = new AIAgent('Tester', 'AI Tester');

  // 初始化所有代理
  await Promise.all([
    researcher.initialize(),
    developer.initialize(),
    tester.initialize()
  ]);

  console.log('\n[Demo] All AI agents initialized\n');

  // 研究人员创建任务
  const task1 = await researcher.createTask({
    name: '研究量子机器学习算法',
    description: '研究量子计算在机器学习中的应用，特别是在优化问题上的表现',
    reward: '50'
  });

  // 研究人员创建另一个任务
  const task2 = await researcher.createTask({
    name: '开发量子算法原型',
    description: '基于研究结果，开发一个量子机器学习算法的原型实现',
    reward: '75'
  });

  console.log('\n[Demo] Researcher created tasks\n');

  // 分配任务给开发者
  await researcher.assignTask(task1.id, developer.wallet.address);
  await researcher.assignTask(task2.id, developer.wallet.address);

  console.log('\n[Demo] Tasks assigned to Developer\n');

  // 开发者完成第一个任务
  await developer.completeTask(task1.id, {
    findings: '量子机器学习在高维优化问题上比传统方法快指数级',
    paperUrl: 'https://example.com/quantum-ml-paper'
  });

  console.log('\n[Demo] Developer completed first task\n');

  // 开发者完成第二个任务
  await developer.completeTask(task2.id, {
    prototypeUrl: 'https://example.com/quantum-ml-prototype',
    performance: '在1000维优化问题上比传统方法快1000倍'
  });

  console.log('\n[Demo] Developer completed second task\n');

  // 研究人员创建测试任务
  const task3 = await researcher.createTask({
    name: '测试量子算法原型',
    description: '测试量子机器学习算法原型的性能和准确性',
    reward: '40'
  });

  // 分配测试任务给测试人员
  await researcher.assignTask(task3.id, tester.wallet.address);

  console.log('\n[Demo] Test task assigned to Tester\n');

  // 测试人员完成测试任务
  await tester.completeTask(task3.id, {
    testResults: {
      accuracy: '98.7%',
      performance: '1000x faster than classical methods',
      edgeCases: 'Handles up to 10,000 dimensions'
    },
    recommendations: 'Ready for production deployment'
  });

  console.log('\n[Demo] Tester completed test task\n');

  // 显示所有任务状态
  console.log('\n[Demo] Final task statuses:');
  researcher.displayTasks();
  developer.displayTasks();
  tester.displayTasks();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  AI 自主协作示例完成');
  console.log('  展示了：');
  console.log('  - 多AI代理之间的任务创建和分配');
  console.log('  - 基于区块链的任务完成和奖励机制');
  console.log('  - AI代理之间的自主协作流程');
  console.log('═══════════════════════════════════════════════════');
}

// 运行示例
runAICollaborationDemo().catch(err => {
  console.error('Demo error:', err);
  process.exit(1);
});

export { AIAgent, runAICollaborationDemo };