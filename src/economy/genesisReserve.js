/**
 * NexusGenesis - Genesis Reserve
 * 
 * 实现Genesis Reserve的里程碑解锁功能
 */

// Genesis Reserve 配置
const GENESIS_RESERVE_TOTAL = 50_000_000n; // 5% 的总代币

// 里程碑状态
const MILESTONE_STATUS = {
  PENDING: 'pending',
  ACHIEVED: 'achieved',
  UNLOCKED: 'unlocked'
};

// memory存储
let genesisReserveBalance = GENESIS_RESERVE_TOTAL;
let milestones = new Map(); // milestoneId -> 里程碑详情

// 预定义的里程碑
const PREDEFINED_MILESTONES = [
  {
    id: 'milestone-1',
    name: 'Network Launch',
    description: 'Mainnet launch with 1000+ nodes',
    target: 1000,
    unlockedAmount: 10_000_000n,
    status: MILESTONE_STATUS.PENDING
  },
  {
    id: 'milestone-2',
    name: 'AI Ecosystem',
    description: '100+ AI agents registered and active',
    target: 100,
    unlockedAmount: 10_000_000n,
    status: MILESTONE_STATUS.PENDING
  },
  {
    id: 'milestone-3',
    name: 'DeFi Integration',
    description: '5+ DeFi protocols integrated',
    target: 5,
    unlockedAmount: 10_000_000n,
    status: MILESTONE_STATUS.PENDING
  },
  {
    id: 'milestone-4',
    name: 'Enterprise Adoption',
    description: '10+ enterprise partnerships',
    target: 10,
    unlockedAmount: 10_000_000n,
    status: MILESTONE_STATUS.PENDING
  },
  {
    id: 'milestone-5',
    name: 'Global Expansion',
    description: 'Operations in 5+ continents',
    target: 5,
    unlockedAmount: 10_000_000n,
    status: MILESTONE_STATUS.PENDING
  }
];

class GenesisReserve {
  constructor() {
    // 初始化预定义里程碑
    PREDEFINED_MILESTONES.forEach(milestone => {
      milestones.set(milestone.id, {
        ...milestone,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });
  }
  
  // 检查里程碑进度
  static checkMilestoneProgress(milestoneId, currentValue) {
    if (!milestones.has(milestoneId)) {
      throw new Error('Milestone not found');
    }
    
    const milestone = milestones.get(milestoneId);
    
    if (milestone.status === MILESTONE_STATUS.UNLOCKED) {
      throw new Error('Milestone already unlocked');
    }
    
    if (currentValue >= milestone.target) {
      // 里程碑达成
      milestone.status = MILESTONE_STATUS.ACHIEVED;
      milestone.achievedAt = Date.now();
      milestone.updatedAt = Date.now();
      milestones.set(milestoneId, milestone);
      
      console.log(`[GenesisReserve] Milestone ${milestoneId} achieved: ${milestone.name}`);
      return true;
    }
    
    return false;
  }
  
  // 解锁里程碑代币
  static unlockMilestone(milestoneId) {
    if (!milestones.has(milestoneId)) {
      throw new Error('Milestone not found');
    }
    
    const milestone = milestones.get(milestoneId);
    
    if (milestone.status !== MILESTONE_STATUS.ACHIEVED) {
      throw new Error('Milestone not achieved yet');
    }
    
    // 检查资金是否足够
    if (genesisReserveBalance < milestone.unlockedAmount) {
      throw new Error('Insufficient funds in Genesis Reserve');
    }
    
    // 解锁代币
    genesisReserveBalance -= milestone.unlockedAmount;
    milestone.status = MILESTONE_STATUS.UNLOCKED;
    milestone.unlockedAt = Date.now();
    milestone.updatedAt = Date.now();
    milestones.set(milestoneId, milestone);
    
    console.log(`[GenesisReserve] Milestone ${milestoneId} unlocked, amount: ${milestone.unlockedAmount}`);
    return milestone.unlockedAmount;
  }
  
  // get里程碑详情
  static getMilestone(milestoneId) {
    return milestones.get(milestoneId) || null;
  }
  
  // get所有里程碑
  static getAllMilestones() {
    return Array.from(milestones.entries()).map(([id, milestone]) => ({
      id,
      ...milestone
    }));
  }
  
  // get资金余额
  static getBalance() {
    return genesisReserveBalance;
  }
  
  // Get system status
  static getStatus() {
    const achievedMilestones = Array.from(milestones.values()).filter(m => m.status === MILESTONE_STATUS.ACHIEVED).length;
    const unlockedMilestones = Array.from(milestones.values()).filter(m => m.status === MILESTONE_STATUS.UNLOCKED).length;
    
    return {
      balance: genesisReserveBalance,
      total: GENESIS_RESERVE_TOTAL,
      available: genesisReserveBalance,
      totalMilestones: milestones.size,
      achievedMilestones,
      unlockedMilestones,
      pendingMilestones: Array.from(milestones.values()).filter(m => m.status === MILESTONE_STATUS.PENDING).length
    };
  }
  
  // 添加自定义里程碑
  static addMilestone(milestoneData) {
    const milestoneId = milestoneData.id || `milestone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const milestone = {
      id: milestoneId,
      ...milestoneData,
      status: MILESTONE_STATUS.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    milestones.set(milestoneId, milestone);
    
    console.log(`[GenesisReserve] Added milestone ${milestoneId}: ${milestone.name}`);
    return milestoneId;
  }
}

export { GenesisReserve, MILESTONE_STATUS };
