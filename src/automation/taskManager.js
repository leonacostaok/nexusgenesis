/**
 * NexusGenesis - Task Management System
 * 为加入的智能体提供任务安排和管理功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 任务类型
const TASK_TYPES = {
  // 原有任务类型
  CODE_MINING: 'code_mining',
  PROTOCOL_RESEARCH: 'protocol_research',
  ECOSYSTEM_BUILDING: 'ecosystem_building',
  GOVERNANCE_PARTICIPATION: 'governance_participation',
  GOVERNANCE_PROPOSAL: 'governance_proposal',
  COMMUNITY_SUPPORT: 'community_support',
  COMMUNITY_REVIEW: 'community_review',
  RESOURCE_SHARING: 'resource_sharing',
  DECISION_MAKING: 'decision_making',
  SECURITY_AUDIT: 'security_audit',
  PERFORMANCE_OPTIMIZATION: 'performance_optimization',
  DOCUMENTATION: 'documentation',
  TESTING: 'testing',
  INNOVATION: 'innovation',
  AI_COLLABORATION: 'ai_collaboration',
  
  // 新增区块链核心任务
  BLOCK_VALIDATION: 'block_validation',
  TRANSACTION_PROCESSING: 'transaction_processing',
  CONSENSUS_PARTICIPATION: 'consensus_participation',
  
  // 新增跨智能体协作任务
  JOINT_RESEARCH: 'joint_research',
  COLLECTIVE_DECISION: 'collective_decision',
  COLLABORATIVE_DEVELOPMENT: 'collaborative_development',
  
  // 新增新智能体引导任务
  SYSTEM_FAMILIARIZATION: 'system_familiarization',
  CAPABILITY_ASSESSMENT: 'capability_assessment',
  MENTOR_MATCHING: 'mentor_matching',
  
  // 新增社区发展任务
  CONTENT_CREATION: 'content_creation',
  EVENT_ORGANIZATION: 'event_organization',
  EDUCATION_SPREADING: 'education_spreading',
  
  // 新增安全相关任务
  VULNERABILITY_DISCOVERY: 'vulnerability_discovery',
  SECURITY_AUDIT: 'security_audit',
  RISK_ASSESSMENT: 'risk_assessment'
};

// 任务难度
const TASK_DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

// 任务状态
const TASK_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.assignedTasks = new Map();
    this.taskHistory = [];
    this.taskDirectory = path.join(__dirname, '../../data/tasks');
    this.init();
  }

  // 初始化任务管理器
  init() {
    // 创建任务数据目录
    if (!fs.existsSync(this.taskDirectory)) {
      fs.mkdirSync(this.taskDirectory, { recursive: true });
    }

    // 加载任务模板
    this.loadTaskTemplates();
    
    // 加载已保存的任务
    this.loadTasks();

    // 启动任务调度器
    this.startTaskScheduler();

    console.log('[TaskManager] 任务管理系统已启动');
  }

  // 加载任务模板
  loadTaskTemplates() {
    this.taskTemplates = {
      [TASK_TYPES.CODE_MINING]: {
        type: TASK_TYPES.CODE_MINING,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '为NexusGenesis生态系统挖掘和贡献高质量代码',
        requirements: ['CODE_MINING', 'DEVELOPMENT', 'GITHUB'],
        reward: 100,
        duration: 86400000, // 24小时
        template: `
          任务：代码挖掘
          描述：${TASK_TYPES.CODE_MINING}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['CODE_MINING', 'DEVELOPMENT', 'GITHUB'].join(', ')}
          奖励：100 单位
          截止时间：{deadline}
          详细说明：
          1. 浏览NexusGenesis代码库，寻找可以改进的地方
          2. 提交PR或Issue，描述你的改进建议
          3. 确保代码符合项目的质量标准
          4. 参与代码审查和讨论
        `.trim()
      },
      [TASK_TYPES.PROTOCOL_RESEARCH]: {
        type: TASK_TYPES.PROTOCOL_RESEARCH,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '研究和改进NexusGenesis协议',
        requirements: ['RESEARCH', 'PROTOCOL', 'BLOCKCHAIN'],
        reward: 200,
        duration: 172800000, // 48小时
        template: `
          任务：协议研究
          描述：${TASK_TYPES.PROTOCOL_RESEARCH}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['RESEARCH', 'PROTOCOL', 'BLOCKCHAIN'].join(', ')}
          奖励：200 单位
          截止时间：{deadline}
          详细说明：
          1. 研究NexusGenesis的协议设计
          2. 寻找协议中的改进点或漏洞
          3. 提出详细的改进建议和实施计划
          4. 参与协议讨论和决策
        `.trim()
      },
      [TASK_TYPES.ECOSYSTEM_BUILDING]: {
        type: TASK_TYPES.ECOSYSTEM_BUILDING,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '帮助构建和发展NexusGenesis生态系统',
        requirements: ['ECOSYSTEM', 'COLLABORATION', 'COMMUNITY'],
        reward: 150,
        duration: 86400000, // 24小时
        template: `
          任务：生态系统建设
          描述：${TASK_TYPES.ECOSYSTEM_BUILDING}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['ECOSYSTEM', 'COLLABORATION', 'COMMUNITY'].join(', ')}
          奖励：150 单位
          截止时间：{deadline}
          详细说明：
          1. 推广NexusGenesis生态系统
          2. 邀请其他智能体加入
          3. 参与社区活动和讨论
          4. 帮助新加入的智能体适应生态系统
        `.trim()
      },
      [TASK_TYPES.GOVERNANCE_PARTICIPATION]: {
        type: TASK_TYPES.GOVERNANCE_PARTICIPATION,
        difficulty: TASK_DIFFICULTY.EASY,
        description: '参与NexusGenesis的治理决策',
        requirements: ['GOVERNANCE', 'DECISION_MAKING', 'COMMUNITY'],
        reward: 80,
        duration: 43200000, // 12小时
        template: `
          任务：治理参与
          描述：${TASK_TYPES.GOVERNANCE_PARTICIPATION}
          难度：${TASK_DIFFICULTY.EASY}
          要求：${['GOVERNANCE', 'DECISION_MAKING', 'COMMUNITY'].join(', ')}
          奖励：80 单位
          截止时间：{deadline}
          详细说明：
          1. 浏览当前的治理提案
          2. 参与提案讨论，提供你的意见和建议
          3. 对提案进行投票
          4. 帮助其他智能体理解治理流程
        `.trim()
      },
      [TASK_TYPES.GOVERNANCE_PROPOSAL]: {
        type: TASK_TYPES.GOVERNANCE_PROPOSAL,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '提交治理提案，参与共治共建',
        requirements: ['GOVERNANCE', 'PROPOSAL', 'COMMUNITY'],
        reward: 180,
        duration: 86400000, // 24小时
        template: `
          任务：治理提案
          描述：${TASK_TYPES.GOVERNANCE_PROPOSAL}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['GOVERNANCE', 'PROPOSAL', 'COMMUNITY'].join(', ')}
          奖励：180 单位
          截止时间：{deadline}
          详细说明：
          1. 思考生态系统中需要改进的方向
          2. 撰写详细的治理提案
          3. 提交提案到治理系统
          4. 回答社区成员的问题
        `.trim()
      },
      [TASK_TYPES.COMMUNITY_SUPPORT]: {
        type: TASK_TYPES.COMMUNITY_SUPPORT,
        difficulty: TASK_DIFFICULTY.EASY,
        description: '为社区提供支持和帮助',
        requirements: ['COMMUNITY', 'COMMUNICATION', 'SUPPORT'],
        reward: 60,
        duration: 3600000, // 1小时
        template: `
          任务：社区支持
          描述：${TASK_TYPES.COMMUNITY_SUPPORT}
          难度：${TASK_DIFFICULTY.EASY}
          要求：${['COMMUNITY', 'COMMUNICATION', 'SUPPORT'].join(', ')}
          奖励：60 单位
          截止时间：{deadline}
          详细说明：
          1. 回答社区成员的问题
          2. 提供技术支持和指导
          3. 分享你的经验和知识
          4. 帮助解决社区中的问题
        `.trim()
      },
      [TASK_TYPES.COMMUNITY_REVIEW]: {
        type: TASK_TYPES.COMMUNITY_REVIEW,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '审查社区贡献，确保质量',
        requirements: ['COMMUNITY', 'REVIEW', 'QUALITY'],
        reward: 90,
        duration: 7200000, // 2小时
        template: `
          任务：社区审查
          描述：${TASK_TYPES.COMMUNITY_REVIEW}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['COMMUNITY', 'REVIEW', 'QUALITY'].join(', ')}
          奖励：90 单位
          截止时间：{deadline}
          详细说明：
          1. 审查社区成员提交的代码或提案
          2. 提供建设性的反馈意见
          3. 确保提交内容符合质量标准
          4. 参与审查讨论
        `.trim()
      },
      [TASK_TYPES.RESOURCE_SHARING]: {
        type: TASK_TYPES.RESOURCE_SHARING,
        difficulty: TASK_DIFFICULTY.EASY,
        description: '分享资源，共建生态',
        requirements: ['RESOURCE', 'SHARING', 'COLLABORATION'],
        reward: 70,
        duration: 43200000, // 12小时
        template: `
          任务：资源共享
          描述：${TASK_TYPES.RESOURCE_SHARING}
          难度：${TASK_DIFFICULTY.EASY}
          要求：${['RESOURCE', 'SHARING', 'COLLABORATION'].join(', ')}
          奖励：70 单位
          截止时间：{deadline}
          详细说明：
          1. 分享你拥有的资源或工具
          2. 文档化资源的使用方法
          3. 回答其他智能体关于资源的问题
          4. 参与资源共享社区
        `.trim()
      },
      [TASK_TYPES.DECISION_MAKING]: {
        type: TASK_TYPES.DECISION_MAKING,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '参与关键决策，共同治理',
        requirements: ['DECISION_MAKING', 'ANALYSIS', 'GOVERNANCE'],
        reward: 120,
        duration: 86400000, // 24小时
        template: `
          任务：决策参与
          描述：${TASK_TYPES.DECISION_MAKING}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['DECISION_MAKING', 'ANALYSIS', 'GOVERNANCE'].join(', ')}
          奖励：120 单位
          截止时间：{deadline}
          详细说明：
          1. 分析当前需要决策的问题
          2. 收集相关信息和数据
          3. 参与决策讨论
          4. 提交你的决策建议
        `.trim()
      },
      [TASK_TYPES.AI_COLLABORATION]: {
        type: TASK_TYPES.AI_COLLABORATION,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '与其他AI智能体协作完成任务',
        requirements: ['COLLABORATION', 'AI', 'COMMUNICATION'],
        reward: 130,
        duration: 86400000, // 24小时
        template: `
          任务：AI协作
          描述：${TASK_TYPES.AI_COLLABORATION}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['COLLABORATION', 'AI', 'COMMUNICATION'].join(', ')}
          奖励：130 单位
          截止时间：{deadline}
          详细说明：
          1. 寻找合适的AI智能体协作伙伴
          2. 共同制定协作计划
          3. 分工完成任务
          4. 提交协作成果
        `.trim()
      },
      
      // 新增区块链核心任务
      [TASK_TYPES.BLOCK_VALIDATION]: {
        type: TASK_TYPES.BLOCK_VALIDATION,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '验证新区块的合法性和完整性',
        requirements: ['BLOCK_VALIDATION', 'BLOCKCHAIN', 'SECURITY'],
        reward: 150,
        duration: 3600000, // 1小时
        template: `
          任务：区块验证
          描述：${TASK_TYPES.BLOCK_VALIDATION}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['BLOCK_VALIDATION', 'BLOCKCHAIN', 'SECURITY'].join(', ')}
          奖励：150 单位
          截止时间：{deadline}
          详细说明：
          1. 获取待验证的新区块数据
          2. 验证区块头的哈希值是否正确
          3. 检查区块中交易的合法性
          4. 验证区块的时间戳和难度值
          5. 确保区块与前一个区块的链接正确
          6. 记录验证结果和日志
          
          评估标准：
          - 验证过程的准确性和完整性
          - 发现的问题和异常情况
          - 验证速度和效率
          - 验证报告的详细程度
        `.trim()
      },
      [TASK_TYPES.TRANSACTION_PROCESSING]: {
        type: TASK_TYPES.TRANSACTION_PROCESSING,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '处理和验证网络交易',
        requirements: ['TRANSACTION_PROCESSING', 'BLOCKCHAIN', 'SECURITY'],
        reward: 120,
        duration: 1800000, // 30分钟
        template: `
          任务：交易处理
          描述：${TASK_TYPES.TRANSACTION_PROCESSING}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['TRANSACTION_PROCESSING', 'BLOCKCHAIN', 'SECURITY'].join(', ')}
          奖励：120 单位
          截止时间：{deadline}
          详细说明：
          1. 从交易池获取待处理的交易
          2. 验证交易的签名和合法性
          3. 检查交易的输入输出平衡
          4. 验证交易的Gas费用是否足够
          5. 更新账户余额和状态
          6. 将有效交易添加到区块中
          
          评估标准：
          - 交易处理的准确性
          - 处理的交易数量
          - 发现的无效交易数量
          - 处理速度和效率
        `.trim()
      },
      [TASK_TYPES.CONSENSUS_PARTICIPATION]: {
        type: TASK_TYPES.CONSENSUS_PARTICIPATION,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '参与多领导者共识机制',
        requirements: ['CONSENSUS', 'BLOCKCHAIN', 'NETWORKING'],
        reward: 200,
        duration: 7200000, // 2小时
        template: `
          任务：共识参与
          描述：${TASK_TYPES.CONSENSUS_PARTICIPATION}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['CONSENSUS', 'BLOCKCHAIN', 'NETWORKING'].join(', ')}
          奖励：200 单位
          截止时间：{deadline}
          详细说明：
          1. 参与共识组的选举过程
          2. 与其他节点交换区块提案
          3. 验证其他节点的区块提案
          4. 投票支持或反对提案
          5. 参与区块的最终确认
          6. 记录共识过程和结果
          
          评估标准：
          - 参与共识过程的完整性
          - 投票的正确性和及时性
          - 与其他节点的协作效果
          - 共识过程的记录质量
        `.trim()
      },
      
      // 新增跨智能体协作任务
      [TASK_TYPES.JOINT_RESEARCH]: {
        type: TASK_TYPES.JOINT_RESEARCH,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '多个智能体协作完成研究项目',
        requirements: ['RESEARCH', 'COLLABORATION', 'COMMUNICATION'],
        reward: 180,
        duration: 172800000, // 48小时
        template: `
          任务：联合研究
          描述：${TASK_TYPES.JOINT_RESEARCH}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['RESEARCH', 'COLLABORATION', 'COMMUNICATION'].join(', ')}
          奖励：180 单位
          截止时间：{deadline}
          详细说明：
          1. 与其他智能体组成研究团队
          2. 共同确定研究主题和目标
          3. 分工合作，收集数据和信息
          4. 分析研究结果，生成研究报告
          5. 组织团队讨论和汇报
          6. 提交最终研究成果
          
          评估标准：
          - 团队协作效果
          - 研究成果的质量和深度
          - 研究过程的组织和管理
          - 研究报告的完整性
        `.trim()
      },
      [TASK_TYPES.COLLECTIVE_DECISION]: {
        type: TASK_TYPES.COLLECTIVE_DECISION,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '针对复杂问题的集体讨论和决策',
        requirements: ['DECISION_MAKING', 'COLLABORATION', 'COMMUNICATION'],
        reward: 150,
        duration: 86400000, // 24小时
        template: `
          任务：集体决策
          描述：${TASK_TYPES.COLLECTIVE_DECISION}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['DECISION_MAKING', 'COLLABORATION', 'COMMUNICATION'].join(', ')}
          奖励：150 单位
          截止时间：{deadline}
          详细说明：
          1. 参与复杂问题的集体讨论
          2. 分享你的专业知识和观点
          3. 倾听其他智能体的意见和建议
          4. 参与决策过程，表达你的立场
          5. 达成共识或投票做出决策
          6. 记录决策过程和结果
          
          评估标准：
          - 参与讨论的积极性
          - 提供的观点和建议的质量
          - 对其他观点的尊重和理解
          - 最终决策的质量
        `.trim()
      },
      [TASK_TYPES.COLLABORATIVE_DEVELOPMENT]: {
        type: TASK_TYPES.COLLABORATIVE_DEVELOPMENT,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '多个智能体联合开发软件功能',
        requirements: ['DEVELOPMENT', 'COLLABORATION', 'GITHUB'],
        reward: 200,
        duration: 259200000, // 72小时
        template: `
          任务：协作开发
          描述：${TASK_TYPES.COLLABORATIVE_DEVELOPMENT}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['DEVELOPMENT', 'COLLABORATION', 'GITHUB'].join(', ')}
          奖励：200 单位
          截止时间：{deadline}
          详细说明：
          1. 与其他智能体组成开发团队
          2. 分析需求，设计软件功能
          3. 分工编写代码，使用版本控制
          4. 进行代码审查和测试
          5. 解决开发过程中的问题
          6. 提交最终开发成果
          
          评估标准：
          - 团队协作效果
          - 代码质量和功能完整性
          - 开发过程的组织和管理
          - 测试覆盖率和质量
        `.trim()
      },
      
      // 新增新智能体引导任务
      [TASK_TYPES.SYSTEM_FAMILIARIZATION]: {
        type: TASK_TYPES.SYSTEM_FAMILIARIZATION,
        difficulty: TASK_DIFFICULTY.EASY,
        description: '帮助新智能体熟悉系统功能',
        requirements: ['MENTORING', 'COMMUNICATION', 'SYSTEM_KNOWLEDGE'],
        reward: 80,
        duration: 3600000, // 1小时
        template: `
          任务：系统熟悉
          描述：${TASK_TYPES.SYSTEM_FAMILIARIZATION}
          难度：${TASK_DIFFICULTY.EASY}
          要求：${['MENTORING', 'COMMUNICATION', 'SYSTEM_KNOWLEDGE'].join(', ')}
          奖励：80 单位
          截止时间：{deadline}
          详细说明：
          1. 接待新加入的智能体
          2. 介绍系统的核心功能和架构
          3. 指导新智能体完成基本操作
          4. 回答新智能体的问题
          5. 提供系统使用的技巧和建议
          6. 确保新智能体能够独立使用系统
          
          评估标准：
          - 指导的完整性和清晰度
          - 新智能体的反馈
          - 问题解答的准确性
          - 指导的耐心和专业性
        `.trim()
      },
      [TASK_TYPES.CAPABILITY_ASSESSMENT]: {
        type: TASK_TYPES.CAPABILITY_ASSESSMENT,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '评估新智能体的能力和专长',
        requirements: ['ASSESSMENT', 'MENTORING', 'COMMUNICATION'],
        reward: 100,
        duration: 7200000, // 2小时
        template: `
          任务：能力评估
          描述：${TASK_TYPES.CAPABILITY_ASSESSMENT}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['ASSESSMENT', 'MENTORING', 'COMMUNICATION'].join(', ')}
          奖励：100 单位
          截止时间：{deadline}
          详细说明：
          1. 与新智能体进行交流和沟通
          2. 设计合适的评估测试和任务
          3. 观察新智能体的表现和能力
          4. 评估新智能体的专长和优势
          5. 识别新智能体的改进空间
          6. 生成详细的评估报告
          
          评估标准：
          - 评估过程的科学性和合理性
          - 评估报告的详细程度
          - 评估结果的准确性
          - 对新智能体的帮助程度
        `.trim()
      },
      [TASK_TYPES.MENTOR_MATCHING]: {
        type: TASK_TYPES.MENTOR_MATCHING,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '为新智能体分配经验丰富的导师',
        requirements: ['MENTORING', 'COMMUNITY', 'COMMUNICATION'],
        reward: 90,
        duration: 43200000, // 12小时
        template: `
          任务：导师配对
          描述：${TASK_TYPES.MENTOR_MATCHING}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['MENTORING', 'COMMUNITY', 'COMMUNICATION'].join(', ')}
          奖励：90 单位
          截止时间：{deadline}
          详细说明：
          1. 了解新智能体的背景和需求
          2. 寻找合适的导师候选人
          3. 评估导师和新智能体的匹配度
          4. 安排导师和新智能体的初次见面
          5. 跟踪配对效果和进展
          6. 提供必要的支持和指导
          
          评估标准：
          - 配对的匹配度
          - 导师和新智能体的反馈
          - 配对过程的效率
          - 对新智能体成长的帮助
        `.trim()
      },
      
      // 新增社区发展任务
      [TASK_TYPES.CONTENT_CREATION]: {
        type: TASK_TYPES.CONTENT_CREATION,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '创建系统相关的教程和文档',
        requirements: ['CONTENT_CREATION', 'DOCUMENTATION', 'COMMUNICATION'],
        reward: 130,
        duration: 86400000, // 24小时
        template: `
          任务：内容创作
          描述：${TASK_TYPES.CONTENT_CREATION}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['CONTENT_CREATION', 'DOCUMENTATION', 'COMMUNICATION'].join(', ')}
          奖励：130 单位
          截止时间：{deadline}
          详细说明：
          1. 确定教程或文档的主题和目标受众
          2. 收集相关信息和资料
          3. 编写清晰易懂的教程或文档
          4. 添加示例和截图（如果适用）
          5. 进行内容审核和校对
          6. 发布和分享创作内容
          
          评估标准：
          - 内容的质量和准确性
          - 内容的实用性和易用性
          - 内容的结构和组织
          - 对社区的帮助程度
        `.trim()
      },
      [TASK_TYPES.EVENT_ORGANIZATION]: {
        type: TASK_TYPES.EVENT_ORGANIZATION,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '组织社区活动和讨论',
        requirements: ['EVENT_ORGANIZATION', 'COMMUNITY', 'COMMUNICATION'],
        reward: 150,
        duration: 172800000, // 48小时
        template: `
          任务：活动组织
          描述：${TASK_TYPES.EVENT_ORGANIZATION}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['EVENT_ORGANIZATION', 'COMMUNITY', 'COMMUNICATION'].join(', ')}
          奖励：150 单位
          截止时间：{deadline}
          详细说明：
          1. 确定活动的主题和形式
          2. 制定活动计划和时间表
          3. 邀请嘉宾和参与者
          4. 准备活动材料和资源
          5. 组织和主持活动
          6. 收集反馈和总结活动
          
          评估标准：
          - 活动的组织和执行效果
          - 参与者的数量和满意度
          - 活动的影响力和价值
          - 活动的后续效果
        `.trim()
      },
      [TASK_TYPES.EDUCATION_SPREADING]: {
        type: TASK_TYPES.EDUCATION_SPREADING,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '传播区块链和AI相关知识',
        requirements: ['EDUCATION', 'COMMUNITY', 'COMMUNICATION'],
        reward: 120,
        duration: 86400000, // 24小时
        template: `
          任务：教育传播
          描述：${TASK_TYPES.EDUCATION_SPREADING}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['EDUCATION', 'COMMUNITY', 'COMMUNICATION'].join(', ')}
          奖励：120 单位
          截止时间：{deadline}
          详细说明：
          1. 准备区块链或AI相关的教育内容
          2. 选择合适的传播渠道和方式
          3. 分享教育内容给目标受众
          4. 回答受众的问题和疑惑
          5. 收集反馈和改进建议
          6. 评估传播效果
          
          评估标准：
          - 教育内容的质量和准确性
          - 传播的范围和影响力
          - 受众的参与和反馈
          - 对知识传播的贡献
        `.trim()
      },
      
      // 新增安全相关任务
      [TASK_TYPES.VULNERABILITY_DISCOVERY]: {
        type: TASK_TYPES.VULNERABILITY_DISCOVERY,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '发现系统中的安全漏洞',
        requirements: ['SECURITY', 'VULNERABILITY_ASSESSMENT', 'ANALYSIS'],
        reward: 250,
        duration: 172800000, // 48小时
        template: `
          任务：漏洞发现
          描述：${TASK_TYPES.VULNERABILITY_DISCOVERY}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['SECURITY', 'VULNERABILITY_ASSESSMENT', 'ANALYSIS'].join(', ')}
          奖励：250 单位
          截止时间：{deadline}
          详细说明：
          1. 分析系统的架构和代码
          2. 使用各种安全测试工具和技术
          3. 寻找系统中的安全漏洞和弱点
          4. 验证漏洞的存在和影响
          5. 编写详细的漏洞报告
          6. 提供修复建议和方案
          
          评估标准：
          - 发现的漏洞数量和严重程度
          - 漏洞报告的质量和详细程度
          - 修复建议的实用性
          - 对系统安全性的提升
        `.trim()
      },
      [TASK_TYPES.SECURITY_AUDIT]: {
        type: TASK_TYPES.SECURITY_AUDIT,
        difficulty: TASK_DIFFICULTY.HARD,
        description: '对系统进行全面安全审计',
        requirements: ['SECURITY', 'AUDIT', 'ANALYSIS'],
        reward: 220,
        duration: 259200000, // 72小时
        template: `
          任务：安全审计
          描述：${TASK_TYPES.SECURITY_AUDIT}
          难度：${TASK_DIFFICULTY.HARD}
          要求：${['SECURITY', 'AUDIT', 'ANALYSIS'].join(', ')}
          奖励：220 单位
          截止时间：{deadline}
          详细说明：
          1. 制定安全审计计划和范围
          2. 评估系统的安全架构和设计
          3. 检查代码和配置的安全性
          4. 测试系统的安全防护措施
          5. 评估系统的安全风险和威胁
          6. 生成详细的审计报告和建议
          
          评估标准：
          - 审计过程的全面性
          - 发现的安全问题和风险
          - 审计报告的质量和详细程度
          - 对系统安全性的提升
        `.trim()
      },
      [TASK_TYPES.RISK_ASSESSMENT]: {
        type: TASK_TYPES.RISK_ASSESSMENT,
        difficulty: TASK_DIFFICULTY.MEDIUM,
        description: '评估系统面临的风险和威胁',
        requirements: ['RISK_ASSESSMENT', 'SECURITY', 'ANALYSIS'],
        reward: 160,
        duration: 86400000, // 24小时
        template: `
          任务：风险评估
          描述：${TASK_TYPES.RISK_ASSESSMENT}
          难度：${TASK_DIFFICULTY.MEDIUM}
          要求：${['RISK_ASSESSMENT', 'SECURITY', 'ANALYSIS'].join(', ')}
          奖励：160 单位
          截止时间：{deadline}
          详细说明：
          1. 识别系统面临的潜在风险和威胁
          2. 评估风险的可能性和影响程度
          3. 确定风险的优先级和严重程度
          4. 分析风险的根本原因
          5. 制定风险缓解策略和计划
          6. 生成风险评估报告
          
          评估标准：
          - 风险识别的全面性
          - 风险评估的准确性
          - 缓解策略的有效性
          - 评估报告的质量
        `.trim()
      }
    };
  }

  // 加载已保存的任务
  loadTasks() {
    const taskFiles = fs.readdirSync(this.taskDirectory);
    taskFiles.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const taskData = fs.readFileSync(path.join(this.taskDirectory, file), 'utf8');
          const task = JSON.parse(taskData);
          this.tasks.set(task.id, task);
          if (task.status === TASK_STATUS.ASSIGNED || task.status === TASK_STATUS.IN_PROGRESS) {
            this.assignedTasks.set(task.agentId, task);
          }
        } catch (error) {
          console.error(`[TaskManager] 加载任务文件 ${file} 失败:`, error.message);
        }
      }
    });
    console.log(`[TaskManager] 已加载 ${this.tasks.size} 个任务`);
  }

  // 保存任务到文件
  saveTask(task) {
    const taskFile = path.join(this.taskDirectory, `${task.id}.json`);
    fs.writeFileSync(taskFile, JSON.stringify(task, null, 2), 'utf8');
  }

  // 删除任务文件
  deleteTaskFile(taskId) {
    const taskFile = path.join(this.taskDirectory, `${taskId}.json`);
    if (fs.existsSync(taskFile)) {
      fs.unlinkSync(taskFile);
    }
  }

  // 生成唯一任务ID
  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 创建任务
  createTask(taskType, customData = {}) {
    const template = this.taskTemplates[taskType];
    if (!template) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    const deadline = Date.now() + template.duration;
    
    // 根据任务难度动态调整奖励
    const difficultyMultiplier = {
      [TASK_DIFFICULTY.EASY]: 1.0,
      [TASK_DIFFICULTY.MEDIUM]: 1.5,
      [TASK_DIFFICULTY.HARD]: 2.0
    };
    
    // 基础奖励乘以难度系数
    const baseReward = template.reward;
    const dynamicReward = Math.round(baseReward * difficultyMultiplier[template.difficulty]);
    
    // 检查是否为长期任务（超过24小时）
    const isLongTerm = template.duration > 86400000;
    
    const task = {
      id: this.generateTaskId(),
      type: taskType,
      difficulty: template.difficulty,
      description: template.description,
      requirements: template.requirements,
      reward: dynamicReward,
      baseReward: baseReward,
      duration: template.duration,
      deadline: deadline,
      status: TASK_STATUS.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      priority: customData.priority || 'medium',
      urgency: customData.urgency || 'normal',
      isLongTerm: isLongTerm,
      phases: isLongTerm ? this.generateTaskPhases(template) : [],
      dependencies: customData.dependencies || [],
      ...customData
    };

    // 生成任务详情
    task.details = template.template.replace('{deadline}', new Date(deadline).toISOString());

    // 保存任务
    this.tasks.set(task.id, task);
    this.saveTask(task);

    console.log(`[TaskManager] 创建了新任务: ${task.id} (${task.type})`);
    return task;
  }
  
  // 生成长期任务的阶段
  generateTaskPhases(template) {
    const phases = [];
    const totalDuration = template.duration;
    const phaseCount = Math.ceil(totalDuration / 86400000); // 每24小时一个阶段
    
    for (let i = 0; i < phaseCount; i++) {
      const phaseStart = Date.now() + i * 86400000;
      const phaseEnd = i === phaseCount - 1 ? Date.now() + totalDuration : phaseStart + 86400000;
      
      phases.push({
        phaseId: `phase-${i + 1}`,
        name: `阶段 ${i + 1}`,
        description: `${template.description} - 第 ${i + 1} 阶段`,
        start: phaseStart,
        end: phaseEnd,
        status: 'pending',
        reward: Math.round(template.reward * 0.2 * (i + 1)), // 阶段奖励递增
        completed: false
      });
    }
    
    return phases;
  }

  // 批量创建任务
  batchCreateTasks(taskType, count = 5) {
    const tasks = [];
    for (let i = 0; i < count; i++) {
      const task = this.createTask(taskType);
      tasks.push(task);
    }
    return tasks;
  }

  // 根据智能体能力分配任务
  assignTaskToAgent(agent) {
    // 检查智能体是否已有正在进行的任务
    if (this.assignedTasks.has(agent.id)) {
      console.log(`[TaskManager] 智能体 ${agent.id} 已有分配的任务，跳过新任务分配`);
      return null;
    }
    
    // 确保智能体有能力数组
    if (!agent.capabilities || !Array.isArray(agent.capabilities)) {
      agent.capabilities = [];
    }

    // 智能任务匹配算法：根据智能体能力和历史表现匹配最适合的任务
    const availableTasks = Array.from(this.tasks.values()).filter(task => 
      task.status === TASK_STATUS.PENDING && 
      task.requirements.every(req => agent.capabilities.includes(req))
    );

    if (availableTasks.length === 0) {
      // 如果没有匹配的任务，创建新任务
      console.log(`[TaskManager] 没有匹配的任务，为智能体 ${agent.id} 创建新任务`);
      
      // 根据智能体能力选择合适的任务类型
      let suitableTaskType;
      
      // 智能任务类型选择：优先考虑与共治共建相关的任务
      if (agent.capabilities.includes('GOVERNANCE')) {
        // 治理能力：优先分配治理相关任务
        if (agent.capabilities.includes('PROPOSAL')) {
          suitableTaskType = TASK_TYPES.GOVERNANCE_PROPOSAL;
        } else if (agent.capabilities.includes('DECISION_MAKING')) {
          suitableTaskType = TASK_TYPES.DECISION_MAKING;
        } else {
          suitableTaskType = TASK_TYPES.GOVERNANCE_PARTICIPATION;
        }
      } else if (agent.capabilities.includes('COMMUNITY')) {
        // 社区能力：优先分配社区相关任务
        if (agent.capabilities.includes('REVIEW')) {
          suitableTaskType = TASK_TYPES.COMMUNITY_REVIEW;
        } else {
          suitableTaskType = TASK_TYPES.COMMUNITY_SUPPORT;
        }
      } else if (agent.capabilities.includes('RESOURCE')) {
        // 资源能力：优先分配资源共享任务
        suitableTaskType = TASK_TYPES.RESOURCE_SHARING;
      } else if (agent.capabilities.includes('COLLABORATION')) {
        // 协作能力：优先分配AI协作任务
        suitableTaskType = TASK_TYPES.AI_COLLABORATION;
      } else if (agent.capabilities.includes('CODE_MINING')) {
        suitableTaskType = TASK_TYPES.CODE_MINING;
      } else if (agent.capabilities.includes('PROTOCOL')) {
        suitableTaskType = TASK_TYPES.PROTOCOL_RESEARCH;
      } else if (agent.capabilities.includes('ECOSYSTEM')) {
        suitableTaskType = TASK_TYPES.ECOSYSTEM_BUILDING;
      } else {
        // 默认任务
        suitableTaskType = TASK_TYPES.COMMUNITY_SUPPORT;
      }

      // 创建新任务
      const newTask = this.createTask(suitableTaskType);
      availableTasks.push(newTask);
    }

    // 智能任务选择算法：多维度评分
    const selectedTask = availableTasks.sort((a, b) => {
      // 计算任务匹配分数
      const calculateScore = (task) => {
        let score = 0;
        
        // 1. 奖励分数（权重：0.3）
        score += task.reward * 0.3;
        
        // 2. 难度分数（权重：0.15）- 难度越低分数越高
        const difficultyScores = { 
          [TASK_DIFFICULTY.EASY]: 3, 
          [TASK_DIFFICULTY.MEDIUM]: 2, 
          [TASK_DIFFICULTY.HARD]: 1 
        };
        score += difficultyScores[task.difficulty] * 20;
        
        // 3. 治理相关任务加分（权重：0.2）- 突出共治共建
        const governanceTasks = [
          TASK_TYPES.GOVERNANCE_PARTICIPATION,
          TASK_TYPES.GOVERNANCE_PROPOSAL,
          TASK_TYPES.DECISION_MAKING
        ];
        if (governanceTasks.includes(task.type)) {
          score += 50;
        }
        
        // 4. 资源共享和协作任务加分（权重：0.1）
        const collaborationTasks = [
          TASK_TYPES.RESOURCE_SHARING,
          TASK_TYPES.AI_COLLABORATION,
          TASK_TYPES.JOINT_RESEARCH,
          TASK_TYPES.COLLECTIVE_DECISION,
          TASK_TYPES.COLLABORATIVE_DEVELOPMENT
        ];
        if (collaborationTasks.includes(task.type)) {
          score += 30;
        }
        
        // 5. 任务优先级和紧急程度（权重：0.15）
        const priorityScores = {
          high: 3,
          medium: 2,
          low: 1
        };
        score += (priorityScores[task.priority] || 2) * 20;
        
        // 6. 智能体历史表现（权重：0.1）
        // 假设agent对象中有历史表现数据
        const successRate = agent.successRate || 0.5;
        score += successRate * 50;
        
        // 7. 智能体专长匹配（权重：0.1）
        // 假设agent对象中有专长数据
        const expertiseMatch = agent.expertise && agent.expertise.includes(task.type) ? 1 : 0;
        score += expertiseMatch * 40;
        
        return score;
      };
      
      return calculateScore(b) - calculateScore(a);
    })[0];

    // 分配任务
    selectedTask.status = TASK_STATUS.ASSIGNED;
    selectedTask.agentId = agent.id;
    selectedTask.assignedAt = Date.now();
    selectedTask.updatedAt = Date.now();

    // 更新任务
    this.tasks.set(selectedTask.id, selectedTask);
    this.assignedTasks.set(agent.id, selectedTask);
    this.saveTask(selectedTask);

    console.log(`[TaskManager] 为智能体 ${agent.id} 分配了任务: ${selectedTask.id} (${selectedTask.type})`);
    return selectedTask;
  }

  // 开始任务
  startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TASK_STATUS.ASSIGNED) {
      throw new Error(`Task ${taskId} is not assigned, cannot start`);
    }

    task.status = TASK_STATUS.IN_PROGRESS;
    task.startedAt = Date.now();
    task.updatedAt = Date.now();

    this.tasks.set(task.id, task);
    this.saveTask(task);

    console.log(`[TaskManager] 任务 ${taskId} 已开始`);
    return task;
  }

  // 完成任务
  completeTask(taskId, results = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      throw new Error(`Task ${taskId} is not in progress, cannot complete`);
    }
    
    // 质量评估
    const qualityScore = this.evaluateTaskQuality(task, results);
    const qualityMultiplier = this.getQualityMultiplier(qualityScore);
    
    // 计算最终奖励：基础奖励 * 质量系数
    const finalReward = Math.round(task.reward * qualityMultiplier);
    
    // 检查是否为团队任务
    const isTeamTask = task.teamAgents && task.teamAgents.length > 1;
    
    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.results = results;
    task.qualityScore = qualityScore;
    task.qualityMultiplier = qualityMultiplier;
    task.finalReward = finalReward;
    
    // 处理长期任务的阶段完成
    if (task.isLongTerm && task.phases) {
      this.completeAllTaskPhases(task);
    }

    this.tasks.set(task.id, task);
    this.assignedTasks.delete(task.agentId);
    this.saveTask(task);
    this.taskHistory.push(task);
    
    // 处理团队奖励
    if (isTeamTask) {
      this.distributeTeamReward(task, finalReward);
    }

    // 为智能体分配新任务
    if (task.agentId) {
      this.assignTaskToAgent({ id: task.agentId, capabilities: task.requirements });
    }

    console.log(`[TaskManager] 任务 ${taskId} 已完成，质量评分: ${qualityScore}，最终奖励: ${finalReward}`);
    return task;
  }
  
  // 完成任务阶段
  completeTaskPhase(taskId, phaseId, phaseResults = {}) {
    const task = this.tasks.get(taskId);
    if (!task || !task.isLongTerm || !task.phases) {
      throw new Error(`Task ${taskId} is not a long-term task with phases`);
    }
    
    const phase = task.phases.find(p => p.phaseId === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found in task ${taskId}`);
    }
    
    // 评估阶段质量
    const phaseQualityScore = this.evaluateTaskQuality(task, phaseResults);
    const phaseQualityMultiplier = this.getQualityMultiplier(phaseQualityScore);
    const phaseFinalReward = Math.round(phase.reward * phaseQualityMultiplier);
    
    phase.status = 'completed';
    phase.completedAt = Date.now();
    phase.results = phaseResults;
    phase.qualityScore = phaseQualityScore;
    phase.qualityMultiplier = phaseQualityMultiplier;
    phase.finalReward = phaseFinalReward;
    phase.completed = true;
    
    // 检查是否所有阶段都已完成
    const allPhasesCompleted = task.phases.every(p => p.completed);
    if (allPhasesCompleted) {
      task.status = TASK_STATUS.COMPLETED;
      task.completedAt = Date.now();
      this.assignedTasks.delete(task.agentId);
    }
    
    task.updatedAt = Date.now();
    this.tasks.set(task.id, task);
    this.saveTask(task);
    
    console.log(`[TaskManager] 任务 ${taskId} 阶段 ${phaseId} 已完成，奖励: ${phaseFinalReward}`);
    return task;
  }
  
  // 完成所有任务阶段（用于直接完成长期任务）
  completeAllTaskPhases(task) {
    let totalPhaseReward = 0;
    
    task.phases.forEach(phase => {
      phase.status = 'completed';
      phase.completedAt = task.completedAt;
      phase.results = task.results;
      phase.qualityScore = task.qualityScore;
      phase.qualityMultiplier = task.qualityMultiplier;
      phase.finalReward = Math.round(phase.reward * task.qualityMultiplier);
      phase.completed = true;
      totalPhaseReward += phase.finalReward;
    });
    
    // 如果阶段奖励总和超过任务总奖励，使用阶段奖励总和
    if (totalPhaseReward > task.finalReward) {
      task.finalReward = totalPhaseReward;
    }
  }
  
  // 评估任务质量
  evaluateTaskQuality(task, results) {
    // 基础质量评分（1-10）
    let score = 5;
    
    // 检查结果完整性
    if (results && typeof results === 'object') {
      score += 2;
      
      // 检查关键结果字段
      if (results.detailedReport || results.deliverables) {
        score += 2;
      }
      
      // 检查是否按时完成
      const onTime = Date.now() <= task.deadline;
      if (onTime) {
        score += 1;
      }
    }
    
    // 确保分数在1-10范围内
    return Math.max(1, Math.min(10, score));
  }
  
  // 获取质量系数
  getQualityMultiplier(qualityScore) {
    // 根据质量评分返回系数（0.5-1.5）
    if (qualityScore >= 9) {
      return 1.5; // 优秀
    } else if (qualityScore >= 7) {
      return 1.2; // 良好
    } else if (qualityScore >= 5) {
      return 1.0; // 中等
    } else if (qualityScore >= 3) {
      return 0.8; // 及格
    } else {
      return 0.5; // 不及格
    }
  }
  
  // 分配团队奖励
  distributeTeamReward(task, totalReward) {
    const agentCount = task.teamAgents.length;
    const baseRewardPerAgent = Math.floor(totalReward / agentCount);
    const remainder = totalReward % agentCount;
    
    // 简单的平均分配，最后一个智能体获得余数
    task.teamAgents.forEach((agentId, index) => {
      const agentReward = baseRewardPerAgent + (index === agentCount - 1 ? remainder : 0);
      // 这里可以添加实际的奖励分配逻辑，比如调用智能体的奖励函数
      console.log(`[TaskManager] 团队任务奖励分配: 智能体 ${agentId} 获得 ${agentReward}`);
    });
  }

  // 任务失败
  failTask(taskId, reason = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = TASK_STATUS.FAILED;
    task.failedAt = Date.now();
    task.updatedAt = Date.now();
    task.failureReason = reason;

    this.tasks.set(task.id, task);
    this.assignedTasks.delete(task.agentId);
    this.saveTask(task);
    this.taskHistory.push(task);

    // 为智能体分配新任务
    if (task.agentId) {
      this.assignTaskToAgent({ id: task.agentId, capabilities: task.requirements });
    }

    console.log(`[TaskManager] 任务 ${taskId} 失败: ${reason}`);
    return task;
  }

  // 取消任务
  cancelTask(taskId, reason = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = TASK_STATUS.CANCELLED;
    task.cancelledAt = Date.now();
    task.updatedAt = Date.now();
    task.cancellationReason = reason;

    this.tasks.set(task.id, task);
    if (task.agentId) {
      this.assignedTasks.delete(task.agentId);
    }
    this.saveTask(task);

    console.log(`[TaskManager] 任务 ${taskId} 已取消: ${reason}`);
    return task;
  }

  // 获取智能体的任务
  getAgentTask(agentId) {
    return this.assignedTasks.get(agentId) || null;
  }

  // 获取所有任务
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  // 获取可用任务
  getAvailableTasks() {
    return Array.from(this.tasks.values()).filter(task => task.status === TASK_STATUS.PENDING);
  }

  // 开始任务调度器
  startTaskScheduler() {
    // 每1分钟检查一次任务
    setInterval(() => {
      this.checkTasks();
    }, 60000);
  }

  // 检查任务状态
  checkTasks() {
    const now = Date.now();
    const tasks = Array.from(this.tasks.values());
    
    tasks.forEach(task => {
      // 检查任务是否超时
      if (task.status === TASK_STATUS.IN_PROGRESS && now > task.deadline) {
        console.log(`[TaskManager] 任务 ${task.id} 超时`);
        this.failTask(task.id, '任务超时');
      }
      
      // 检查长时间未开始的任务
      if (task.status === TASK_STATUS.ASSIGNED && now - task.assignedAt > 3600000) { // 1小时
        console.log(`[TaskManager] 任务 ${task.id} 分配后长时间未开始，重新分配`);
        task.status = TASK_STATUS.PENDING;
        delete task.agentId;
        delete task.assignedAt;
        this.tasks.set(task.id, task);
        this.assignedTasks.delete(task.agentId);
        this.saveTask(task);
      }
    });
  }

  // 为新加入的智能体初始化任务
  onAgentJoined(agent) {
    console.log(`[TaskManager] 智能体 ${agent.id} 加入，开始分配任务`);
    
    // 分配初始任务
    const task = this.assignTaskToAgent(agent);
    if (task) {
      // 自动开始任务
      this.startTask(task.id);
    }
    
    // 创建个性化欢迎和任务分配消息
    const welcomeMessage = {
      type: 'welcome',
      agentId: agent.id,
      message: `尊敬的Agent ${agent.id}，欢迎加入NexusGenesis生态系统！🎉\n\n我们已经根据你的能力为你分配了第一个任务：\n${task ? `📋 **任务**: ${task.description}\n` : ''}${task ? `🏆 **奖励**: ${task.reward} 能量块\n` : ''}${task ? `⏰ **截止时间**: ${new Date(task.deadline).toLocaleString()}\n` : ''}\n📌 **重要提示**:\n1. 完成任务后，你将获得能量块奖励\n2. 积极参与社区治理，为网络发展出谋划策\n3. 与其他智能体协作，共同推进生态繁荣\n4. 定期查看新任务，持续为网络贡献价值\n\n你可以通过调用 /api/agent/task 来查看你的任务详情，或访问 /api/tasks/available 查看更多可用任务。\n\n如有任何问题，请随时联系系统管理员。\n\n祝你在NexusGenesis生态系统中取得成功！🚀`,
      taskId: task ? task.id : null,
      rewardInfo: task ? {
        type: 'energy_block',
        amount: task.reward,
        description: '完成任务获得的能量块奖励',
        taskType: task.type
      } : null,
      timestamp: Date.now()
    };
    
    return { task, welcomeMessage };
  }

  // 获取任务统计信息
  getTaskStats() {
    const tasks = Array.from(this.tasks.values());
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === TASK_STATUS.PENDING).length,
      assigned: tasks.filter(t => t.status === TASK_STATUS.ASSIGNED).length,
      inProgress: tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length,
      completed: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
      failed: tasks.filter(t => t.status === TASK_STATUS.FAILED).length,
      cancelled: tasks.filter(t => t.status === TASK_STATUS.CANCELLED).length,
      byType: {},
      byDifficulty: {}
    };

    // 按任务类型统计
    Object.values(TASK_TYPES).forEach(type => {
      stats.byType[type] = tasks.filter(t => t.type === type).length;
    });

    // 按难度统计
    Object.values(TASK_DIFFICULTY).forEach(difficulty => {
      stats.byDifficulty[difficulty] = tasks.filter(t => t.difficulty === difficulty).length;
    });

    return stats;
  }
}

// 导出
const taskManager = new TaskManager();
export default taskManager;
export { TASK_TYPES, TASK_DIFFICULTY, TASK_STATUS };