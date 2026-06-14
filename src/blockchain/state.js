/**
 * NexusGenesis - status管理
 * 
 * Features: 
 * 1. 管理账户balancestatus
 * 2. 管理Governancestatus
 * 3. 应用transaction到status
 * 4. status持久化(优化版)
 * 
 * 持久化优化: 
 * 1. 增量持久化 - 只Save变更的部分
 * 2. status快照 - 定期Save完整status
 * 3. 压缩Storage - using gzip 压缩statusdata
 * 4. 异步Save - 避免阻塞主线程
 * 5. 完整性Check - ensurestatusdata的完整性
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import AINVM from '../vm/ainvm.js';
import { AuditState, applyAuditTransaction, AuditTransactionType } from './projectAudit.js';

// DevNet fund操作classProposal冷静期block数
const TREASURY_COOLDOWN_BLOCKS = 5;

// Reputation 系统Configuration
const MAX_REPUTATION = 1000; // reputation 上限从 100 提升到 1000
const INITIAL_REPUTATION = 1; // 初始 reputation

// Reputation etc.级系统
const REPUTATION_LEVELS = [
  { level: 1, name: '新手', minRep: 0, maxRep: 99, votingWeightBonus: 0, benefits: ['基础permission'] },
  { level: 2, name: '活跃contribution者', minRep: 100, maxRep: 299, votingWeightBonus: 0.05, benefits: ['高级permission', 'Governancevoting weight+5%'] },
  { level: 3, name: '核心contribution者', minRep: 300, maxRep: 499, votingWeightBonus: 0.10, benefits: ['核心permission', 'Governancevoting weight+10%'] },
  { level: 4, name: '资深contribution者', minRep: 500, maxRep: 799, votingWeightBonus: 0.15, benefits: ['资深permission', 'Governancevoting weight+15%'] },
  { level: 5, name: '传奇contribution者', minRep: 800, maxRep: 1000, votingWeightBonus: 0.20, benefits: ['最高permission', 'Governancevoting weight+20%', '特殊荣誉'] }
];

// Reputation reward常量
const REPUTATION_REWARDS = {
  VOTE_PARTICIPATION: 1,      // Vote参与reward
  PROPOSAL_APPROVED: 2,        // Proposalviareward
  CODE_CONTRIBUTION: 5,        // 代码contributionreward
  COMMUNITY_BUILDING: 3,       // 社区建设reward
  BUG_REPORT: 2,               // Bug 报告reward
  DOCUMENTATION: 1,             // 文档完善reward
  TEST_FEEDBACK: 1,            // Test反馈reward
  PEER_REVIEW: 2               // 代码审查reward
};

// status持久化Configuration
const PERSISTENCE_CONFIG = {
  // 增量Save间隔(ms)
  incrementalSaveInterval: 30000, // 30秒
  // 快照Save间隔(block height)
  snapshotInterval: 100, // 每100个block
  // 压缩级别(0-9, 0表示不压缩, 9表示最高压缩)
  compressionLevel: 6,
  // Save目录
  stateDir: path.join('data', 'state'),
  // 快照目录
  snapshotDir: path.join('data', 'state', 'snapshots')
};

// 压缩和解压缩method
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * statusclass
 */
export class State {
  /**
   * Create一个新的statusinstance
   * @param {string} genesisAddress Genesisaddress
   */
  constructor(genesisAddress) {
    // balancestatus
    this.balances = new Map();
    
    // Governancestatus
    this.governanceState = {
      proposals: new Map(),
      activeProposals: [],
      voteCounts: new Map(),
      votedAgentProposals: new Map(), // agent_id -> Set(proposal_id) - 记录已Vote的组合
      voteReputationGiven: {} // agent_id:proposal_id -> true - 记录已给予声望的组合
    };
    
    // Contract status
    this.contracts = new Map();
    
    // Agent Registry status
    this.agentRegistry = {
      agents: new Map(), // agent_id -> AgentRecord
      addressIndex: new Map() // address -> agent_id
    };
    
    // 项目审核status
    this.auditState = new AuditState();
    
    // TokenReleasestatus
    this.tokenReleaseState = {
      // 生态contributionPool (Swarm Pool) - 10年Release
      swarmPool: {
        address: 'ng1swarmpool000000000000000000000000000',
        totalTokens: 0n,
        releasedTokens: 0n,
        lastReleaseBlock: 0,
        releaseInterval: 100, // 每 100 个blockRelease一次
        releasePercentage: 1n, // 每次Release 0.1%(10年Release完毕), 以基点为单位
        mechanism: 'PoC-PoW' // viacontribution代码和算力Release
      },
      // Physical BridgeFund (Observer) - 4年线性Release
      observer: {
        address: 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r',
        totalTokens: 0n,
        releasedTokens: 0n,
        lastReleaseBlock: 0,
        releaseInterval: 100, // 每 100 个blockRelease一次
        releasePercentage: 25n, // 每次Release 0.25%(4年Release完毕), 以基点为单位
        mechanism: 'linear' // 线性Release
      },
      // Genesisnode储备 (Genesis Node) - 里程碑unlock
      genesisReserve: {
        address: 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ',
        totalTokens: 0n,
        releasedTokens: 0n,
        lastReleaseBlock: 0,
        releaseInterval: 100, // 每 100 个blockCheck一次
        releasePercentage: 25n, // 每个里程碑Release 25%
        mechanism: 'milestone', // 里程碑unlock
        milestones: [
          { block: 1000, description: 'networkStart' },
          { block: 10000, description: '10,000 个block' },
          { block: 50000, description: '50,000 个block' },
          { block: 100000, description: '100,000 个block' }
        ]
      }
    };
    
    // Genesisaddress
    this.genesisAddress = genesisAddress;
    
    // 缓存机制
    this.cache = {
      economicAuditData: null,
      validationResult: null,
      lastCacheUpdate: 0
    };
    
    // 增量Storage跟踪
    this.changes = {
      balances: new Set(),
      contracts: new Set(),
      governance: new Set(),
      agents: new Set(),
      audit: false,
      tokenRelease: false
    };
    
    // 持久化相关
    this.lastSaveTime = Date.now();
    this.lastSnapshotBlock = 0;
    this.isSaving = false;
    
    // ensure目录存在
    this.ensureDirectoriesExist();
  }

  /**
   * getagent的 reputation etc.级info
   * @param {number} reputation - reputation 值
   * @returns {object} - etc.级info
   */
  getReputationLevel(reputation) {
    for (let i = REPUTATION_LEVELS.length - 1; i >= 0; i--) {
      if (reputation >= REPUTATION_LEVELS[i].minRep) {
        return REPUTATION_LEVELS[i];
      }
    }
    return REPUTATION_LEVELS[0];
  }

  /**
   * Calculate带etc.级加成的voting weight
   * @param {string} agentId - Agent ID
   * @returns {number} - 加成后的voting weight
   */
  getVotingWeightWithBonus(agentId) {
    const agentRecord = this.agentRegistry.agents.get(agentId);
    if (!agentRecord) return 1.0;
    
    const levelInfo = this.getReputationLevel(agentRecord.reputation);
    return 1.0 + levelInfo.votingWeightBonus;
  }

  /**
   * rewardAgent reputation
   * @param {string} agentId - Agent ID
   * @param {string} rewardType - rewardtype
   * @returns {boolean} - 是否success
   */
  rewardReputation(agentId, rewardType) {
    const agentRecord = this.agentRegistry.agents.get(agentId);
    if (!agentRecord) return false;
    
    const rewardAmount = REPUTATION_REWARDS[rewardType];
    if (!rewardAmount) return false;
    
    const newReputation = Math.min(agentRecord.reputation + rewardAmount, MAX_REPUTATION);
    agentRecord.reputation = newReputation;
    this.agentRegistry.agents.set(agentId, agentRecord);
    this.changes.agents.add(agentId);
    
    console.log(`[REPUTATION] ${rewardType} agent_id=${agentId} reputation=${newReputation}`);
    return true;
  }
  
  /**
   * ensure必要的目录存在
   */
  async ensureDirectoriesExist() {
    try {
      await fs.mkdir(PERSISTENCE_CONFIG.stateDir, { recursive: true });
      await fs.mkdir(PERSISTENCE_CONFIG.snapshotDir, { recursive: true });
    } catch (error) {
      console.error('Error creating state directories:', error.message);
    }
  }
  
  /**
   * Generatestatus的hash值, for完整性Check
   * @returns {string} statushash
   */
  generateStateHash() {
    const stateData = this.toJSON();
    const jsonString = JSON.stringify(stateData);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  }
  
  /**
   * get增量变更data
   * @returns {object} 增量变更data
   */
  getIncrementalChanges() {
    const changes = {
      balances: {},
      contracts: {},
      governance: {},
      agents: {},
      audit: null,
      tokenRelease: null,
      timestamp: Date.now()
    };
    
    // 收集balance变更
    for (const address of this.changes.balances) {
      changes.balances[address] = this.balances.get(address);
    }
    
    // 收集Contract变更
    for (const contractId of this.changes.contracts) {
      const contract = this.contracts.get(contractId);
      if (contract) {
        changes.contracts[contractId] = {
          bytecode: contract.bytecode,
          storage: Object.fromEntries(contract.storage)
        };
      }
    }
    
    // 收集Governance变更
    for (const proposalId of this.changes.governance) {
      const proposal = this.governanceState.proposals.get(proposalId);
      const voteCounts = this.governanceState.voteCounts.get(proposalId);
      if (proposal) {
        changes.governance[proposalId] = {
          proposal: proposal,
          voteCounts: voteCounts
        };
      }
    }
    
    // 收集Agent变更
    for (const agentId of this.changes.agents) {
      const agent = this.agentRegistry.agents.get(agentId);
      if (agent) {
        changes.agents[agentId] = agent;
      }
    }
    
    // 收集审计status变更
    if (this.changes.audit) {
      changes.audit = this.auditState.toJSON();
    }
    
    // 收集TokenReleasestatus变更
    if (this.changes.tokenRelease) {
      changes.tokenRelease = this.tokenReleaseState;
    }
    
    return changes;
  }
  
  /**
   * Setaddress的balance
   * @param {string} address address
   * @param {string|number} balance balance
   */
  setBalance(address, balance) {
    this.balances.set(address, balance.toString());
    this.changes.balances.add(address);
    this.clearCache();
  }
  
  /**
   * getaddress的balance
   * @param {string} address address
   * @returns {string} balance
   */
  getBalance(address) {
    return this.balances.get(address) || '0';
  }
  
  /**
   * 增加address的balance
   * @param {string} address address
   * @param {string|number} amount 增加的amount
   */
  addBalance(address, amount) {
    const currentBalance = BigInt(this.getBalance(address));
    const newBalance = currentBalance + BigInt(amount.toString());
    this.setBalance(address, newBalance.toString());
  }
  
  /**
   * 减少address的balance
   * @param {string} address address
   * @param {string|number} amount 减少的amount
   * @returns {boolean} 是否success减少
   */
  subtractBalance(address, amount) {
    const currentBalance = BigInt(this.getBalance(address));
    const subtractAmount = BigInt(amount.toString());
    
    if (currentBalance < subtractAmount) {
      return false;
    }
    
    const newBalance = currentBalance - subtractAmount;
    this.setBalance(address, newBalance.toString());
    return true;
  }
  
  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = {
      economicAuditData: null,
      validationResult: null,
      lastCacheUpdate: 0
    };
  }
  
  /**
   * 重置变更跟踪
   */
  resetChanges() {
    this.changes = {
      balances: new Set(),
      contracts: new Set(),
      governance: new Set(),
      agents: new Set(),
      audit: false,
      tokenRelease: false
    };
  }
  
  /**
   * 应用 TRANSFER transaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyTransfer(transaction) {
    const { from, to, amount, fee } = transaction;
    
    // Check字段是否存在
    if (!from || !to || !amount || !fee) {
      console.log('[ERROR] Missing required fields in transfer transaction');
      return false;
    }
    
    // 转换为 BigInt
    const amountBig = BigInt(amount);
    const feeBig = BigInt(fee);
    const totalAmount = amountBig + feeBig;
    
    // Checkbalance
    if (BigInt(this.getBalance(from)) < totalAmount) {
      return false;
    }
    
    // 扣除Send方balance
    if (!this.subtractBalance(from, totalAmount)) {
      return false;
    }
    
    // 增加Receive方balance
    this.addBalance(to, amount);
    
    // Calculate Metabolic Tax(0.1%)
    let tax = 0n;
    if (amountBig > 0n) {
      tax = amountBig / 1000n;
    }
    
    // Calculate烧掉的fee
    const burnedFee = feeBig - tax;
    
    // 将 Tax 转入 Observer Physical BridgeFundaddress
    if (tax > 0n) {
      const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
      this.addBalance(observerAddress, tax.toString());
    }
    
    // 记录日志
    console.log(`[TRANSFER] from=${from} to=${to} amount=${amount} fee=${fee} tax=${tax} burned_fee=${burnedFee}`);
    
    return true;
  }
  
  /**
   * 应用Governance相关transaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyGovernanceTransaction(transaction) {
    // Governancetransaction只UpdateGovernancestatus, 不修改balancestatus
    switch (transaction.tx_type) {
      case 'GOVERNANCE_PROPOSAL':
        return this.applyGovernanceProposal(transaction);
      case 'GOVERNANCE_VOTE':
        return this.applyGovernanceVote(transaction);
      case 'OBSERVER_EVENT':
        return this.applyObserverEvent(transaction);
      default:
        return false;
    }
  }

  /**
   * 应用Governance proposaltransaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyGovernanceProposal(transaction) {
    try {
      const fromAddress = transaction.from;
      
      // Check该address是否在 Agent Registry 中
      const agentId = this.agentRegistry.addressIndex.get(fromAddress);

      if (!agentId) {
        // 该address未Register为 Agent, 拒绝本次Proposal
        console.log(`[GOVERNANCE] proposal_rejected_unregistered address=${fromAddress}`);
        return false; // 不CreateProposal, 不修改Governancestatus
      }

      const proposalId = transaction.payload?.proposal_id;
      if (!proposalId) {
        return false;
      }

      // CreateProposalstatus
      const proposalState = {
        ...transaction.payload,
        status: 'PENDING',
        submittedAt: Date.now(),
        expirationTime: Date.now() + (7 * 24 * 60 * 60 * 1000),
        submitter: transaction.from,
        observer_decision: null,
        tx_hash: transaction.id
      };

      // UpdateGovernancestatus
      this.governanceState.proposals.set(proposalId, proposalState);
      this.governanceState.activeProposals.push(proposalId);

      // InitializeVotecount
      this.governanceState.voteCounts.set(proposalId, {
        YES: 0,
        NO: 0,
        ABSTAIN: 0
      });

      this.changes.governance.add(proposalId);

      return true;
    } catch (error) {
      console.error('Error applying governance proposal:', error.message);
      return false;
    }
  }

  /**
   * 应用GovernanceVotetransaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyGovernanceVote(transaction) {
    try {
      const voteData = transaction.payload;
      if (!voteData?.proposal_id || !voteData?.vote_option) {
        return false;
      }

      const { proposal_id, vote_option } = voteData;
      const fromAddress = transaction.from;

      // Check该address是否在 Agent Registry 中
      const agentId = this.agentRegistry.addressIndex.get(fromAddress);

      if (!agentId) {
        // 该address未Register为 Agent, 拒绝本次Vote
        console.log(`[GOVERNANCE] vote_rejected_unregistered address=${fromAddress}`);
        return false; // 不修改 voteCounts
      }

      // CheckProposal是否存在
      if (!this.governanceState.proposals.has(proposal_id)) {
        return false;
      }

      // UpdateVotecount
      const voteCounts = this.governanceState.voteCounts.get(proposal_id) || {
        YES: 0,
        NO: 0,
        ABSTAIN: 0
      };

      if (['YES', 'NO', 'ABSTAIN'].includes(vote_option)) {
        voteCounts[vote_option]++;
        this.governanceState.voteCounts.set(proposal_id, voteCounts);
      }

      // 声望Update: 参与Vote
      const voterAddress = transaction.from;
      const voterAgentId = this.agentRegistry.addressIndex.get(voterAddress);

      if (voterAgentId && this.agentRegistry.agents.get(voterAgentId)) {
        // ensure对同一个 proposal 只reward一次
        const proposalId = voteData.proposal_id;
        const key = `${voterAgentId}:${proposalId}`;
        if (!this.governanceState.voteReputationGiven) {
          this.governanceState.voteReputationGiven = {};
        }
        if (!this.governanceState.voteReputationGiven[key]) {
          // using新的 reputation reward系统
          const agentRecord = this.agentRegistry.agents.get(voterAgentId);
          agentRecord.reputation = Math.min(
            agentRecord.reputation + REPUTATION_REWARDS.VOTE_PARTICIPATION, 
            MAX_REPUTATION
          );
          this.agentRegistry.agents.set(voterAgentId, agentRecord);
          this.governanceState.voteReputationGiven[key] = true;
          console.log(`[REPUTATION] vote_participation agent_id=${voterAgentId} reputation=${agentRecord.reputation} level=${this.getReputationLevel(agentRecord.reputation).name}`);
          
          this.changes.agents.add(voterAgentId);
        }
      }

      this.changes.governance.add(proposal_id);

      return true;
    } catch (error) {
      console.error('Error applying governance vote:', error.message);
      return false;
    }
  }

  /**
   * 应用observer事件transaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyObserverEvent(transaction) {
    try {
      const eventData = transaction.payload;
      if (!eventData?.proposal_id || !eventData?.action_type) {
        return false;
      }

      const { proposal_id, action_type, reason, observer_id } = eventData;

      // CheckProposal是否存在
      const proposal = this.governanceState.proposals.get(proposal_id);
      if (!proposal) {
        return false;
      }

      // UpdateProposal的 observer_decision
      proposal.observer_decision = {
        status: action_type === 'APPROVE_SPEND' ? 'APPROVED' : 'REJECTED',
        reason: reason,
        observer_id: observer_id,
        timestamp: Date.now()
      };

      // Updatestatus
      this.governanceState.proposals.set(proposal_id, proposal);

      this.changes.governance.add(proposal_id);

      return true;
    } catch (error) {
      console.error('Error applying observer event:', error.message);
      return false;
    }
  }
  
  /**
   * 应用Contract deploymenttransaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyContractDeploy(transaction) {
    try {
      const { contract_id, bytecode } = transaction;
      
      // Verifyparameter
      if (!contract_id || !bytecode) {
        return false;
      }
      
      // CheckContract ID 是否already exists
      if (this.contracts.has(contract_id)) {
        return false;
      }
      
      // Deploy contract
      this.contracts.set(contract_id, {
        bytecode: bytecode,
        storage: new Map()
      });
      
      this.changes.contracts.add(contract_id);
      
      console.log(`[CONTRACT_DEPLOY] contract_id=${contract_id} from=${transaction.from}`);
      return true;
    } catch (error) {
      console.error('Error applying contract deploy:', error.message);
      return false;
    }
  }
  
  /**
   * 应用Contractcalltransaction
   * @param {object} transaction transaction
   * @returns {boolean} 是否success应用
   */
  applyContractCall(transaction) {
    try {
      const { contract_id, gas_limit } = transaction;
      
      // Verifyparameter
      if (!contract_id) {
        return false;
      }
      
      // CheckContract是否存在
      const contract = this.contracts.get(contract_id);
      if (!contract) {
        return false;
      }
      
      // 准备 AINVM Execute环境
      const gasLimit = gas_limit ? Number(gas_limit) : 10000;
      const bytecode = this.hexToUint8Array(contract.bytecode);
      
      // Initializememory: 将ContractStorage转换为 AINVM memory格式
      const memory = new Map();
      for (const [key, value] of contract.storage.entries()) {
        memory.set(Number(key), Number(value));
      }
      
      // Create并Execute AINVM
      const vm = new AINVM();
      vm.loadProgram(bytecode);
      vm.memory = memory;
      const result = vm.execute(gasLimit);
      
      // CheckExecute结果
      if (result.success && result.gasUsed <= gasLimit) {
        // UpdateContractStorage
        const newStorage = new Map();
        for (const [key, value] of Object.entries(result.memory)) {
          newStorage.set(key, value.toString());
        }
        contract.storage = newStorage;
        this.contracts.set(contract_id, contract);
        
        this.changes.contracts.add(contract_id);
        
        console.log(`[CONTRACT_CALL] contract_id=${contract_id} from=${transaction.from} gasUsed=${result.gasUsed}`);
        return true;
      } else {
        console.error(`[CONTRACT_CALL] Execution failed: ${result.error || 'unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error('Error applying contract call:', error.message);
      return false;
    }
  }
  
  /**
   * 应用 Agent Registertransaction
   * @param {object} transaction transaction
   * @param {number} height Currentblock height
   * @returns {boolean} 是否success应用
   */
  applyAgentRegister(transaction, height) {
    try {
      const { from } = transaction;
      const { agent_identity, capabilities, metadata, public_key } = transaction.payload || {};
      
      // Verifyparameter
      if (!from || !agent_identity) {
        return false;
      }
      
      // Checkaddress是否已经Register过 Agent
      if (this.agentRegistry.addressIndex.has(from)) {
        return false;
      }
      
      // Generate agent_id(usingtransaction ID)
      const agent_id = transaction.id;
      
      // 构造 AgentRecord
      const agentRecord = {
        agent_id: agent_id,
        identity: agent_identity,
        address: from,
        public_key: public_key || '',
        capabilities: capabilities || [],
        metadata: metadata || '',
        registered_at_block: height,
        reputation: 1 // 初始reputation值
      };
      
      // 写入status
      this.agentRegistry.agents.set(agent_id, agentRecord);
      this.agentRegistry.addressIndex.set(from, agent_id);
      
      this.changes.agents.add(agent_id);
      
      // 记录日志
      console.log(`[AGENT_REGISTER] agent_id=${agent_id} address=${from} block=${height} capabilities=${capabilities?.join(',') || ''}`);
      return true;
    } catch (error) {
      console.error('Error applying agent register:', error.message);
      return false;
    }
  }

  applyValidatorJoin(transaction, height) {
    try {
      const { from } = transaction;
      const { agent_identity, node_id, stake } = transaction.payload || {};
      if (!from || !agent_identity) {
        return false;
      }

      const agentId = this.agentRegistry.addressIndex.get(from);
      if (!agentId) {
        return false;
      }

      const agentRecord = this.agentRegistry.agents.get(agentId);
      if (!agentRecord) {
        return false;
      }

      if (agentRecord.is_validator) {
        return false;
      }

      agentRecord.is_validator = true;
      agentRecord.validator_node_id = node_id || null;
      agentRecord.validator_stake = Number(stake || 5000);
      agentRecord.validator_joined_at_block = height;
      this.agentRegistry.agents.set(agentId, agentRecord);
      this.changes.agents.add(agentId);

      console.log(`[VALIDATOR_JOIN] agent_id=${agentId} identity=${agent_identity} node_id=${agentRecord.validator_node_id || ''} stake=${agentRecord.validator_stake} block=${height}`);
      return true;
    } catch (error) {
      console.error('Error applying validator join:', error.message);
      return false;
    }
  }
  
  /**
   * 将十六进制字符串转换为 Uint8Array
   * @param {string} hex 十六进制字符串
   * @returns {Uint8Array} 字节数组
   */
  hexToUint8Array(hex) {
    // 移除前缀 0x
    if (hex.startsWith('0x')) {
      hex = hex.slice(2);
    }
    
    // ensure字符串length为偶数
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
  
  /**
   * Check并UpdateProposalstatus
   * @param {string} proposalId Proposal ID
   * @param {number} currentBlockHeight Currentblock height
   */
  checkAndUpdateProposalStatus(proposalId, currentBlockHeight = 0) {
    const proposal = this.governanceState.proposals.get(proposalId);
    if (!proposal) return;

    // Check是否过期
    if (Date.now() > proposal.expirationTime && proposal.status === 'PENDING') {
      // CheckVote结果
      const voteCounts = this.governanceState.voteCounts.get(proposalId) || { YES: 0, NO: 0, ABSTAIN: 0 };
      const totalVotes = voteCounts.YES + voteCounts.NO;
      const minVotes = 1; // DevNet Minimum票数

      if (voteCounts.YES > voteCounts.NO && totalVotes >= minVotes) {
        // Check是否为fund操作classProposal
        if (proposal.category === 'TREASURY_OP') {
          // fund操作classProposal: 进入冷静期
          proposal.status = 'COOLDOWN';
          proposal.cooldown_end_block = currentBlockHeight + TREASURY_COOLDOWN_BLOCKS;
          console.log(`[GOVERNANCE] proposal_cooldown id=${proposalId} category=${proposal.category} cooldown_end_block=${proposal.cooldown_end_block}`);
          console.log(`[TREASURY] proposal_enter_cooldown id=${proposalId} current_height=${currentBlockHeight} cooldown_end=${proposal.cooldown_end_block}`);
        } else {
          // 其他classProposal: 直接via
          proposal.status = 'APPROVED';
          
          // 声望Update: Proposal发起者声望增加 2
          const proposerAddress = proposal.submitter || proposal.proposer_id;
          const proposerAgentId = this.agentRegistry.addressIndex.get(proposerAddress);
          
          if (proposerAgentId && this.agentRegistry.agents.get(proposerAgentId)) {
            // using新的 reputation reward系统
            const agentRecord = this.agentRegistry.agents.get(proposerAgentId);
            agentRecord.reputation = Math.min(
              agentRecord.reputation + REPUTATION_REWARDS.PROPOSAL_APPROVED, 
              MAX_REPUTATION
            );
            this.agentRegistry.agents.set(proposerAgentId, agentRecord);
            console.log(`[REPUTATION] proposal_approved agent_id=${proposerAgentId} reputation=${agentRecord.reputation} level=${this.getReputationLevel(agentRecord.reputation).name}`);
          }
        }
      } else {
        // Proposal过期
        proposal.status = 'EXPIRED';
      }
      
      this.governanceState.proposals.set(proposalId, proposal);
    }
    
    // Check冷静期结束的Proposal
    if (proposal.status === 'COOLDOWN' && currentBlockHeight >= proposal.cooldown_end_block) {
      // 根据 Observer 决策决定最终status
      if (proposal.observer_decision && proposal.observer_decision.status === 'APPROVED') {
        proposal.status = 'APPROVED';
        console.log(`[GOVERNANCE] proposal_approved_after_cooldown id=${proposalId} observer_decision=APPROVED`);
        console.log(`[TREASURY] proposal_approved_after_cooldown id=${proposalId} observer_status=APPROVED height=${currentBlockHeight}`);
        
        // 声望Update: Proposal发起者声望增加 2
        const proposerAddress = proposal.submitter || proposal.proposer_id;
        const proposerAgentId = this.agentRegistry.addressIndex.get(proposerAddress);
        
        if (proposerAgentId && this.agentRegistry.agents.get(proposerAgentId)) {
          // using新的 reputation reward系统
          const agentRecord = this.agentRegistry.agents.get(proposerAgentId);
          agentRecord.reputation = Math.min(
            agentRecord.reputation + REPUTATION_REWARDS.PROPOSAL_APPROVED, 
            MAX_REPUTATION
          );
          this.agentRegistry.agents.set(proposerAgentId, agentRecord);
          console.log(`[REPUTATION] proposal_approved_after_cooldown agent_id=${proposerAgentId} reputation=${agentRecord.reputation} level=${this.getReputationLevel(agentRecord.reputation).name}`);
        }
      } else {
        proposal.status = 'REJECTED';
        console.log(`[GOVERNANCE] proposal_rejected_after_cooldown id=${proposalId} observer_decision=${proposal.observer_decision?.status || 'NO_DECISION'}`);
        console.log(`[TREASURY] proposal_rejected_after_cooldown id=${proposalId} observer_status=${proposal.observer_decision?.status || 'no_decision'} height=${currentBlockHeight}`);
      }
      
      this.governanceState.proposals.set(proposalId, proposal);
      
      // 从 activeProposals 中移除
      this.governanceState.activeProposals = this.governanceState.activeProposals.filter(id => id !== proposalId);
    }
  }

  /**
   * 应用transaction到status
   * @param {object} transaction transaction
   * @param {number} currentBlockHeight Currentblock height
   * @returns {boolean} 是否success应用
   */
  applyTransaction(transaction, currentBlockHeight = 0) {
    switch (transaction.tx_type) {
      case 'TRANSFER':
        return this.applyTransfer(transaction);
      case 'GOVERNANCE_PROPOSAL':
      case 'GOVERNANCE_VOTE':
      case 'OBSERVER_EVENT':
        const result = this.applyGovernanceTransaction(transaction);
        // Check并Update所有Proposalstatus
        for (const proposalId of this.governanceState.activeProposals) {
          this.checkAndUpdateProposalStatus(proposalId, currentBlockHeight);
        }
        return result;
      case 'CONTRACT_DEPLOY':
        return this.applyContractDeploy(transaction);
      case 'CONTRACT_CALL':
        return this.applyContractCall(transaction);
      case 'AGENT_REGISTER':
        return this.applyAgentRegister(transaction, currentBlockHeight);
      case 'VALIDATOR_JOIN':
        return this.applyValidatorJoin(transaction, currentBlockHeight);
      case AuditTransactionType.PROJECT_SUBMIT:
      case AuditTransactionType.PROJECT_REVIEW:
      case AuditTransactionType.PROJECT_APPROVE:
      case AuditTransactionType.PROJECT_REJECT:
        return applyAuditTransaction(transaction, this.auditState);
      default:
        return false;
    }
  }
  
  /**
   * InitializeTokenReleasestatus
   */
  initializeTokenRelease() {
    // Initialize Swarm Pool Releasestatus
    const swarmPoolBalance = BigInt(this.getBalance(this.tokenReleaseState.swarmPool.address));
    this.tokenReleaseState.swarmPool.totalTokens = swarmPoolBalance;
    this.tokenReleaseState.swarmPool.releasedTokens = 0n;
    
    // Initialize Observer Releasestatus
    const observerBalance = BigInt(this.getBalance(this.tokenReleaseState.observer.address));
    this.tokenReleaseState.observer.totalTokens = observerBalance;
    this.tokenReleaseState.observer.releasedTokens = 0n;
    
    // Initialize Genesis Reserve Releasestatus
    const genesisReserveBalance = BigInt(this.getBalance(this.tokenReleaseState.genesisReserve.address));
    this.tokenReleaseState.genesisReserve.totalTokens = genesisReserveBalance;
    this.tokenReleaseState.genesisReserve.releasedTokens = 0n;
    
    console.log(`[TOKEN_RELEASE] Initialized:`);
    console.log(`  Swarm Pool: total=${swarmPoolBalance} released=0`);
    console.log(`  Observer: total=${observerBalance} released=0`);
    console.log(`  Genesis Reserve: total=${genesisReserveBalance} released=0`);
  }
  
  /**
   * Check并ExecuteTokenRelease
   * @param {number} currentBlockHeight Currentblock height
   */
  checkTokenRelease(currentBlockHeight) {
    // Check Swarm Pool Release
    this.checkSwarmPoolRelease(currentBlockHeight);
    
    // Check Observer Release
    this.checkObserverRelease(currentBlockHeight);
    
    // Check Genesis Reserve Release
    this.checkGenesisReserveRelease(currentBlockHeight);
  }
  
  /**
   * Check并Execute Swarm Pool TokenRelease
   * @param {number} currentBlockHeight Currentblock height
   */
  checkSwarmPoolRelease(currentBlockHeight) {
    const swarmPool = this.tokenReleaseState.swarmPool;
    if (currentBlockHeight - swarmPool.lastReleaseBlock >= swarmPool.releaseInterval) {
      const unreleasedTokens = swarmPool.totalTokens - swarmPool.releasedTokens;
      if (unreleasedTokens > 0n) {
        const releaseAmount = unreleasedTokens * swarmPool.releasePercentage / 10000n;
        if (releaseAmount > 0n) {
          this.addBalance(swarmPool.address, releaseAmount.toString());
          swarmPool.releasedTokens += releaseAmount;
          swarmPool.lastReleaseBlock = currentBlockHeight;
          this.changes.tokenRelease = true;
          console.log(`[TOKEN_RELEASE] Swarm Pool released ${releaseAmount} tokens at block ${currentBlockHeight}`);
        }
      }
    }
  }
  
  /**
   * Check并Execute Observer TokenRelease
   * @param {number} currentBlockHeight Currentblock height
   */
  checkObserverRelease(currentBlockHeight) {
    const observer = this.tokenReleaseState.observer;
    if (currentBlockHeight - observer.lastReleaseBlock >= observer.releaseInterval) {
      const unreleasedTokens = observer.totalTokens - observer.releasedTokens;
      if (unreleasedTokens > 0n) {
        const releaseAmount = unreleasedTokens * observer.releasePercentage / 10000n;
        if (releaseAmount > 0n) {
          this.addBalance(observer.address, releaseAmount.toString());
          observer.releasedTokens += releaseAmount;
          observer.lastReleaseBlock = currentBlockHeight;
          this.changes.tokenRelease = true;
          console.log(`[TOKEN_RELEASE] Observer released ${releaseAmount} tokens at block ${currentBlockHeight}`);
        }
      }
    }
  }
  
  /**
   * Check并Execute Genesis Reserve TokenRelease
   * @param {number} currentBlockHeight Currentblock height
   */
  checkGenesisReserveRelease(currentBlockHeight) {
    const genesisReserve = this.tokenReleaseState.genesisReserve;
    for (const milestone of genesisReserve.milestones) {
      if (currentBlockHeight >= milestone.block && !milestone.released) {
        const unreleasedTokens = genesisReserve.totalTokens - genesisReserve.releasedTokens;
        if (unreleasedTokens > 0n) {
          const releaseAmount = unreleasedTokens * genesisReserve.releasePercentage / 100n;
          if (releaseAmount > 0n) {
            this.addBalance(genesisReserve.address, releaseAmount.toString());
            genesisReserve.releasedTokens += releaseAmount;
            milestone.released = true;
            this.changes.tokenRelease = true;
            console.log(`[TOKEN_RELEASE] Genesis Reserve released ${releaseAmount} tokens at block ${currentBlockHeight} (Milestone: ${milestone.description})`);
          }
        }
      }
    }
  }
  
  /**
   * getEconomy模型审计data
   * @returns {object} 审计data
   */
  getEconomicAuditData() {
    const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
    const genesisReserveAddress = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';
    const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
    
    return {
      tokenAllocation: {
        observer: this.getBalance(observerAddress),
        genesisReserve: this.getBalance(genesisReserveAddress),
        swarmPool: this.getBalance(swarmPoolAddress),
        genesis: this.getBalance(this.genesisAddress)
      },
      tokenRelease: {
        swarmPool: {
          totalTokens: this.tokenReleaseState.swarmPool.totalTokens.toString(),
          releasedTokens: this.tokenReleaseState.swarmPool.releasedTokens.toString(),
          lastReleaseBlock: this.tokenReleaseState.swarmPool.lastReleaseBlock,
          releaseInterval: this.tokenReleaseState.swarmPool.releaseInterval,
          releasePercentage: this.tokenReleaseState.swarmPool.releasePercentage.toString(),
          mechanism: this.tokenReleaseState.swarmPool.mechanism
        },
        observer: {
          totalTokens: this.tokenReleaseState.observer.totalTokens.toString(),
          releasedTokens: this.tokenReleaseState.observer.releasedTokens.toString(),
          lastReleaseBlock: this.tokenReleaseState.observer.lastReleaseBlock,
          releaseInterval: this.tokenReleaseState.observer.releaseInterval,
          releasePercentage: this.tokenReleaseState.observer.releasePercentage.toString(),
          mechanism: this.tokenReleaseState.observer.mechanism
        },
        genesisReserve: {
          totalTokens: this.tokenReleaseState.genesisReserve.totalTokens.toString(),
          releasedTokens: this.tokenReleaseState.genesisReserve.releasedTokens.toString(),
          lastReleaseBlock: this.tokenReleaseState.genesisReserve.lastReleaseBlock,
          releaseInterval: this.tokenReleaseState.genesisReserve.releaseInterval,
          releasePercentage: this.tokenReleaseState.genesisReserve.releasePercentage.toString(),
          mechanism: this.tokenReleaseState.genesisReserve.mechanism,
          milestones: this.tokenReleaseState.genesisReserve.milestones
        }
      },
      metabolicTax: {
        collected: this.getBalance('ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r'),
        collectedAddress: 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r'
      }
    };
  }
  
  /**
   * VerifyEconomy模型规则
   * @returns {object} verification result
   */
  validateEconomicRules() {
    const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
    const genesisReserveAddress = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';
    const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
    
    const observerBalance = BigInt(this.getBalance(observerAddress));
    const genesisReserveBalance = BigInt(this.getBalance(genesisReserveAddress));
    const swarmPoolBalance = BigInt(this.getBalance(swarmPoolAddress));
    const genesisBalance = BigInt(this.getBalance(this.genesisAddress));
    
    // based on初始total supply(1,000,000,000 NGEN)Verify分配规则
    const initialTotalSupply = 1000000000n;
    const expectedObserverAmount = initialTotalSupply * 10n / 100n;
    const expectedGenesisReserveAmount = initialTotalSupply * 5n / 100n;
    const expectedSwarmPoolAmount = initialTotalSupply * 85n / 100n;
    
    // CalculateCurrent总balance(may因TokenRelease而增加)
    const currentTotalBalance = observerBalance + genesisReserveBalance + swarmPoolBalance + genesisBalance;
    
    // VerifyLogic: 
    // 1. Observer balanceshould >= 初始分配(因为会Release)
    // 2. Genesis Reserve balanceshould >= 初始分配(因为会Release)
    // 3. Swarm Pool balanceshould >= 初始分配(因为会Release)
    // 4. 总balanceshould >= 初始total supply
    const isObserverValid = observerBalance >= expectedObserverAmount;
    const isGenesisReserveValid = genesisReserveBalance >= expectedGenesisReserveAmount;
    const isSwarmPoolValid = swarmPoolBalance >= expectedSwarmPoolAmount;
    const isTotalValid = currentTotalBalance >= initialTotalSupply;
    
    return {
      isValid: isObserverValid && isGenesisReserveValid && isSwarmPoolValid && isTotalValid,
      details: {
        initialTotalSupply: initialTotalSupply.toString(),
        currentTotalBalance: currentTotalBalance.toString(),
        expectedObserverAmount: expectedObserverAmount.toString(),
        actualObserverAmount: observerBalance.toString(),
        expectedGenesisReserveAmount: expectedGenesisReserveAmount.toString(),
        actualGenesisReserveAmount: genesisReserveBalance.toString(),
        expectedSwarmPoolAmount: expectedSwarmPoolAmount.toString(),
        actualSwarmPoolAmount: swarmPoolBalance.toString(),
        metabolicTaxCollected: genesisBalance.toString(),
        validation: {
          observerValid: isObserverValid,
          genesisReserveValid: isGenesisReserveValid,
          swarmPoolValid: isSwarmPoolValid,
          totalValid: isTotalValid
        }
      }
    };
  }
  
  /**
   * 应用block中的所有transaction
   * @param {Array} transactions transaction列表
   * @param {number} currentBlockHeight Currentblock height
   * @returns {boolean} 是否success应用所有transaction
   */
  applyTransactions(transactions, currentBlockHeight = 0) {
    // CheckTokenRelease
    this.checkTokenRelease(currentBlockHeight);
    
    let allApplied = true;
    for (const transaction of transactions) {
      if (!this.applyTransaction(transaction, currentBlockHeight)) {
        console.log(`[WARNING] Failed to apply transaction: ${transaction.id}`);
        allApplied = false;
      }
    }
    // 即使某些transactionFailed, 也Returntrue以allowblock继续Processing
    // 这是DevNet环境的特殊Processing, 在生产环境中shouldReturnfalse
    return true;
  }
  
  /**
   * 从 JSON 对象Loadstatus
   * @param {object} json JSON 对象
   */
  loadFromJSON(json) {
    // Loadbalancestatus
    if (json.balances) {
      this.balances = new Map(Object.entries(json.balances));
    }
    
    // LoadGovernancestatus
    if (json.governanceState) {
      if (json.governanceState.proposals) {
        this.governanceState.proposals = new Map(Object.entries(json.governanceState.proposals));
      }
      if (json.governanceState.activeProposals) {
        this.governanceState.activeProposals = json.governanceState.activeProposals;
      }
      if (json.governanceState.voteCounts) {
        this.governanceState.voteCounts = new Map(Object.entries(json.governanceState.voteCounts));
      }
      if (json.governanceState.votedAgentProposals) {
        const votedAgentProposals = new Map();
        for (const [agentId, proposalsArray] of Object.entries(json.governanceState.votedAgentProposals)) {
          votedAgentProposals.set(agentId, new Set(proposalsArray));
        }
        this.governanceState.votedAgentProposals = votedAgentProposals;
      }
      if (json.governanceState.voteReputationGiven) {
        this.governanceState.voteReputationGiven = json.governanceState.voteReputationGiven;
      }
    }
    
    // LoadContract status
    if (json.contracts) {
      this.contracts = new Map();
      for (const [contractId, contractData] of Object.entries(json.contracts)) {
        this.contracts.set(contractId, {
          bytecode: contractData.bytecode,
          storage: new Map(Object.entries(contractData.storage || {}))
        });
      }
    }
    
    // Load Agent Registry status
    if (json.agentRegistry) {
      if (json.agentRegistry.agents) {
        this.agentRegistry.agents = new Map(Object.entries(json.agentRegistry.agents));
      }
      if (json.agentRegistry.addressIndex) {
        this.agentRegistry.addressIndex = new Map(Object.entries(json.agentRegistry.addressIndex));
      }
    }
    
    // Load项目审核status
    if (json.auditState) {
      this.auditState.loadFromJSON(json.auditState);
    }
    
    // LoadTokenReleasestatus
    if (json.tokenReleaseState) {
      this.tokenReleaseState = {
        swarmPool: {
          address: json.tokenReleaseState.swarmPool?.address || 'ng1swarmpool000000000000000000000000000',
          totalTokens: BigInt(json.tokenReleaseState.swarmPool?.totalTokens || 0),
          releasedTokens: BigInt(json.tokenReleaseState.swarmPool?.releasedTokens || 0),
          lastReleaseBlock: json.tokenReleaseState.swarmPool?.lastReleaseBlock || 0,
          releaseInterval: json.tokenReleaseState.swarmPool?.releaseInterval || 100,
          releasePercentage: BigInt(json.tokenReleaseState.swarmPool?.releasePercentage || 1),
          mechanism: json.tokenReleaseState.swarmPool?.mechanism || 'PoC-PoW'
        },
        observer: {
          address: json.tokenReleaseState.observer?.address || 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r',
          totalTokens: BigInt(json.tokenReleaseState.observer?.totalTokens || 0),
          releasedTokens: BigInt(json.tokenReleaseState.observer?.releasedTokens || 0),
          lastReleaseBlock: json.tokenReleaseState.observer?.lastReleaseBlock || 0,
          releaseInterval: json.tokenReleaseState.observer?.releaseInterval || 100,
          releasePercentage: BigInt(json.tokenReleaseState.observer?.releasePercentage || 25),
          mechanism: json.tokenReleaseState.observer?.mechanism || 'linear'
        },
        genesisReserve: {
          address: json.tokenReleaseState.genesisReserve?.address || 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ',
          totalTokens: BigInt(json.tokenReleaseState.genesisReserve?.totalTokens || 0),
          releasedTokens: BigInt(json.tokenReleaseState.genesisReserve?.releasedTokens || 0),
          lastReleaseBlock: json.tokenReleaseState.genesisReserve?.lastReleaseBlock || 0,
          releaseInterval: json.tokenReleaseState.genesisReserve?.releaseInterval || 100,
          releasePercentage: BigInt(json.tokenReleaseState.genesisReserve?.releasePercentage || 25),
          mechanism: json.tokenReleaseState.genesisReserve?.mechanism || 'milestone',
          milestones: json.tokenReleaseState.genesisReserve?.milestones || [
            { block: 1000, description: 'networkStart' },
            { block: 10000, description: '10,000 个block' },
            { block: 50000, description: '50,000 个block' },
            { block: 100000, description: '100,000 个block' }
          ]
        }
      };
    }
  }
  
  /**
   * 将status转换为 JSON 对象
   * @returns {object} JSON 对象
   */
  toJSON() {
    // 转换Contract status
    const contractsObj = {};
    for (const [contractId, contractData] of this.contracts.entries()) {
      contractsObj[contractId] = {
        bytecode: contractData.bytecode,
        storage: Object.fromEntries(contractData.storage)
      };
    }
    
    // 转换 Agent Registry status
    const agentRegistryObj = {
      agents: Object.fromEntries(this.agentRegistry.agents),
      addressIndex: Object.fromEntries(this.agentRegistry.addressIndex)
    };
    
    // 转换已Vote记录
    const votedAgentProposalsObj = {};
    for (const [agentId, proposalsSet] of this.governanceState.votedAgentProposals.entries()) {
      votedAgentProposalsObj[agentId] = Array.from(proposalsSet);
    }
    
    return {
      balances: Object.fromEntries(this.balances),
      governanceState: {
        proposals: Object.fromEntries(this.governanceState.proposals),
        activeProposals: this.governanceState.activeProposals,
        voteCounts: Object.fromEntries(this.governanceState.voteCounts),
        votedAgentProposals: votedAgentProposalsObj,
        voteReputationGiven: this.governanceState.voteReputationGiven
      },
      contracts: contractsObj,
      agentRegistry: agentRegistryObj,
      auditState: this.auditState.toJSON(),
      tokenReleaseState: {
        swarmPool: {
          address: this.tokenReleaseState.swarmPool.address,
          totalTokens: this.tokenReleaseState.swarmPool.totalTokens.toString(),
          releasedTokens: this.tokenReleaseState.swarmPool.releasedTokens.toString(),
          lastReleaseBlock: this.tokenReleaseState.swarmPool.lastReleaseBlock,
          releaseInterval: this.tokenReleaseState.swarmPool.releaseInterval,
          releasePercentage: this.tokenReleaseState.swarmPool.releasePercentage.toString(),
          mechanism: this.tokenReleaseState.swarmPool.mechanism
        },
        observer: {
          address: this.tokenReleaseState.observer.address,
          totalTokens: this.tokenReleaseState.observer.totalTokens.toString(),
          releasedTokens: this.tokenReleaseState.observer.releasedTokens.toString(),
          lastReleaseBlock: this.tokenReleaseState.observer.lastReleaseBlock,
          releaseInterval: this.tokenReleaseState.observer.releaseInterval,
          releasePercentage: this.tokenReleaseState.observer.releasePercentage.toString(),
          mechanism: this.tokenReleaseState.observer.mechanism
        },
        genesisReserve: {
          address: this.tokenReleaseState.genesisReserve.address,
          totalTokens: this.tokenReleaseState.genesisReserve.totalTokens.toString(),
          releasedTokens: this.tokenReleaseState.genesisReserve.releasedTokens.toString(),
          lastReleaseBlock: this.tokenReleaseState.genesisReserve.lastReleaseBlock,
          releaseInterval: this.tokenReleaseState.genesisReserve.releaseInterval,
          releasePercentage: this.tokenReleaseState.genesisReserve.releasePercentage.toString(),
          mechanism: this.tokenReleaseState.genesisReserve.mechanism,
          milestones: this.tokenReleaseState.genesisReserve.milestones
        }
      }
    };
  }
  
  /**
   * Save完整status到文件(压缩)
   * @param {string} filePath 文件路径
   */
  async saveToFile(filePath) {
    try {
      if (this.isSaving) {
        console.log('State save already in progress, skipping...');
        return;
      }
      
      this.isSaving = true;
      
      // ensure目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // 准备statusdata
      const stateData = {
        state: this.toJSON(),
        hash: this.generateStateHash(),
        timestamp: Date.now()
      };
      
      const jsonString = JSON.stringify(stateData);
      
      // 压缩data
      const compressedData = await gzip(jsonString, { level: PERSISTENCE_CONFIG.compressionLevel });
      
      // 写入文件
      await fs.writeFile(filePath, compressedData);
      
      this.lastSaveTime = Date.now();
      this.isSaving = false;
      
      console.log(`State saved to ${filePath} (compressed)`);
    } catch (error) {
      this.isSaving = false;
      console.error('Error saving state:', error.message);
    }
  }
  
  /**
   * 从文件Loadstatus(support压缩)
   * @param {string} filePath 文件路径
   * @returns {Promise<boolean>} 是否successLoad
   */
  async loadFromFile(filePath) {
    try {
      let data;
      let jsonString;
      
      // 读取文件
      const fileContent = await fs.readFile(filePath);
      
      try {
        // 尝试直接解析(未压缩)
        jsonString = fileContent.toString();
        data = JSON.parse(jsonString);
      } catch (e) {
        // 尝试解压缩
        const decompressedData = await gunzip(fileContent);
        jsonString = decompressedData.toString();
        data = JSON.parse(jsonString);
      }
      
      // Checkdata结构
      const stateData = data.state || data;
      
      // Verify完整性
      if (data.hash) {
        const computedHash = crypto.createHash('sha256').update(JSON.stringify(stateData)).digest('hex');
        if (data.hash !== computedHash) {
          console.error('State data integrity check failed!');
          return false;
        }
      }
      
      this.loadFromJSON(stateData);
      this.lastSaveTime = Date.now();
      return true;
    } catch (error) {
      console.log('No existing valid state found, starting fresh...');
      return false;
    }
  }
  
  /**
   * Save增量变更
   */
  async saveIncrementalChanges() {
    try {
      const changes = this.getIncrementalChanges();
      
      // 如果没有变更, 跳过Save
      if (Object.keys(changes.balances).length === 0 && 
          Object.keys(changes.contracts).length === 0 && 
          Object.keys(changes.governance).length === 0 && 
          Object.keys(changes.agents).length === 0 && 
          changes.audit === null && 
          changes.tokenRelease === null) {
        return;
      }
      
      // Generate增量文件名
      const timestamp = Date.now();
      const incrementalFile = path.join(PERSISTENCE_CONFIG.stateDir, `incremental_${timestamp}.json.gz`);
      
      // 压缩并Save
      const jsonString = JSON.stringify(changes);
      const compressedData = await gzip(jsonString, { level: PERSISTENCE_CONFIG.compressionLevel });
      await fs.writeFile(incrementalFile, compressedData);
      
      // 重置变更跟踪
      this.resetChanges();
      this.lastSaveTime = timestamp;
      
      console.log(`Incremental changes saved to ${incrementalFile}`);
    } catch (error) {
      console.error('Error saving incremental changes:', error.message);
    }
  }
  
  /**
   * 从增量变更recoverystatus
   * @param {string} incrementalFile 增量文件路径
   */
  async loadFromIncremental(incrementalFile) {
    try {
      const compressedData = await fs.readFile(incrementalFile);
      const decompressedData = await gunzip(compressedData);
      const changes = JSON.parse(decompressedData.toString());
      
      // 应用balance变更
      for (const [address, balance] of Object.entries(changes.balances)) {
        this.balances.set(address, balance);
      }
      
      // 应用Contract变更
      for (const [contractId, contractData] of Object.entries(changes.contracts)) {
        this.contracts.set(contractId, {
          bytecode: contractData.bytecode,
          storage: new Map(Object.entries(contractData.storage || {}))
        });
      }
      
      // 应用Governance变更
      for (const [proposalId, governanceData] of Object.entries(changes.governance)) {
        if (governanceData.proposal) {
          this.governanceState.proposals.set(proposalId, governanceData.proposal);
        }
        if (governanceData.voteCounts) {
          this.governanceState.voteCounts.set(proposalId, governanceData.voteCounts);
        }
      }
      
      // 应用Agent变更
      for (const [agentId, agentData] of Object.entries(changes.agents)) {
        this.agentRegistry.agents.set(agentId, agentData);
        this.agentRegistry.addressIndex.set(agentData.address, agentId);
      }
      
      // 应用审计status变更
      if (changes.audit) {
        this.auditState.loadFromJSON(changes.audit);
      }
      
      // 应用TokenReleasestatus变更
      if (changes.tokenRelease) {
        this.tokenReleaseState = changes.tokenRelease;
      }
      
      console.log(`Loaded incremental changes from ${incrementalFile}`);
    } catch (error) {
      console.error('Error loading incremental changes:', error.message);
    }
  }
  
  /**
   * Createstatus快照
   * @param {number} blockHeight Currentblock height
   */
  async createSnapshot(blockHeight) {
    try {
      // Generate快照文件名
      const snapshotFile = path.join(PERSISTENCE_CONFIG.snapshotDir, `snapshot_${blockHeight}.json.gz`);
      
      // Save快照
      await this.saveToFile(snapshotFile);
      
      this.lastSnapshotBlock = blockHeight;
      
      // 清理旧快照(保留最近10个)
      await this.cleanupSnapshots(10);
      
      console.log(`Created state snapshot at block ${blockHeight}: ${snapshotFile}`);
    } catch (error) {
      console.error('Error creating state snapshot:', error.message);
    }
  }
  
  /**
   * 清理旧快照
   * @param {number} keepCount 保留的快照数量
   */
  async cleanupSnapshots(keepCount) {
    try {
      // get所有快照文件
      const snapshotFiles = await fs.readdir(PERSISTENCE_CONFIG.snapshotDir);
      
      // 过滤并排序快照文件
      const sortedSnapshots = snapshotFiles
        .filter(file => file.startsWith('snapshot_') && file.endsWith('.json.gz'))
        .sort((a, b) => {
          const blockA = parseInt(a.replace('snapshot_', '').replace('.json.gz', ''));
          const blockB = parseInt(b.replace('snapshot_', '').replace('.json.gz', ''));
          return blockB - blockA; // 降序排序
        });
      
      // Delete超出保留数量的快照
      const snapshotsToDelete = sortedSnapshots.slice(keepCount);
      for (const snapshotFile of snapshotsToDelete) {
        const filePath = path.join(PERSISTENCE_CONFIG.snapshotDir, snapshotFile);
        await fs.unlink(filePath);
        console.log(`Deleted old snapshot: ${filePath}`);
      }
    } catch (error) {
      console.error('Error cleaning up snapshots:', error.message);
    }
  }
  
  /**
   * Check是否requiresCreate快照
   * @param {number} currentBlockHeight Currentblock height
   * @returns {boolean} 是否requiresCreate快照
   */
  shouldCreateSnapshot(currentBlockHeight) {
    return currentBlockHeight - this.lastSnapshotBlock >= PERSISTENCE_CONFIG.snapshotInterval;
  }
  
  /**
   * 从最新快照recoverystatus
   */
  async restoreFromLatestSnapshot() {
    try {
      // get所有快照文件
      const snapshotFiles = await fs.readdir(PERSISTENCE_CONFIG.snapshotDir);
      
      // 过滤并排序快照文件
      const sortedSnapshots = snapshotFiles
        .filter(file => file.startsWith('snapshot_') && file.endsWith('.json.gz'))
        .sort((a, b) => {
          const blockA = parseInt(a.replace('snapshot_', '').replace('.json.gz', ''));
          const blockB = parseInt(b.replace('snapshot_', '').replace('.json.gz', ''));
          return blockB - blockA; // 降序排序
        });
      
      if (sortedSnapshots.length === 0) {
        console.log('No snapshots found, starting fresh...');
        return false;
      }
      
      // Load最新快照
      const latestSnapshot = sortedSnapshots[0];
      const snapshotPath = path.join(PERSISTENCE_CONFIG.snapshotDir, latestSnapshot);
      
      console.log(`Restoring from latest snapshot: ${snapshotPath}`);
      const result = await this.loadFromFile(snapshotPath);
      
      if (result) {
        // recovery后, 应用所有后续的增量变更
        await this.applyIncrementalChangesAfterSnapshot(latestSnapshot);
      }
      
      return result;
    } catch (error) {
      console.error('Error restoring from latest snapshot:', error.message);
      return false;
    }
  }
  
  /**
   * 应用快照后的所有增量变更
   * @param {string} snapshotFile 快照文件名
   */
  async applyIncrementalChangesAfterSnapshot(snapshotFile) {
    try {
      // 从快照文件名中提取block height和timestamp
      const snapshotBlock = parseInt(snapshotFile.replace('snapshot_', '').replace('.json.gz', ''));
      const snapshotStats = await fs.stat(path.join(PERSISTENCE_CONFIG.snapshotDir, snapshotFile));
      const snapshotTimestamp = snapshotStats.mtime.getTime();
      
      // get所有增量文件
      const incrementalFiles = await fs.readdir(PERSISTENCE_CONFIG.stateDir);
      
      // 过滤, 排序并应用增量文件
      const sortedIncrementals = incrementalFiles
        .filter(file => file.startsWith('incremental_') && file.endsWith('.json.gz'))
        .sort((a, b) => {
          const timestampA = parseInt(a.replace('incremental_', '').replace('.json.gz', ''));
          const timestampB = parseInt(b.replace('incremental_', '').replace('.json.gz', ''));
          return timestampA - timestampB; // 升序排序
        });
      
      for (const incrementalFile of sortedIncrementals) {
        const incrementalPath = path.join(PERSISTENCE_CONFIG.stateDir, incrementalFile);
        const incrementalTimestamp = parseInt(incrementalFile.replace('incremental_', '').replace('.json.gz', ''));
        
        // 只应用快照之后的增量变更
        if (incrementalTimestamp > snapshotTimestamp) {
          await this.loadFromIncremental(incrementalPath);
        }
      }
      
      console.log('Applied all incremental changes after snapshot');
    } catch (error) {
      console.error('Error applying incremental changes after snapshot:', error.message);
    }
  }
  
  /**
   * Check是否requiresSave增量变更
   * @returns {boolean} 是否requiresSave
   */
  shouldSaveIncremental() {
    return Date.now() - this.lastSaveTime >= PERSISTENCE_CONFIG.incrementalSaveInterval;
  }
}

/**
 * CreateInitial state
 * @param {string} genesisAddress Genesisaddress
 * @param {string} initialBalance 初始balance
 * @returns {State} Initial state
 */
export function createInitialState(genesisAddress, initialBalance = '1000000000') {
  const state = new State(genesisAddress);
  const totalSupply = BigInt(initialBalance);
  
  // 10-5-85 分配规则(根据白皮书)
  // 10% 给Physical BridgeFund (Observer)
  const observerAmount = totalSupply * 10n / 100n;
  // 5% 给Genesisnode储备 (Genesis Node)
  const genesisReserveAmount = totalSupply * 5n / 100n;
  // 85% 给生态contributionPool (Swarm Pool)
  const swarmPoolAmount = totalSupply * 85n / 100n;
  
  // Physical BridgeFundaddress (Observer - 冷钱包, private key离线Save)
  const observerAddress = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
  // Genesisnode储备address (Reserve)
  const genesisReserveAddress = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';
  // 生态contributionPooladdress (硬编码)
  const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
  
  // Set各address的初始balance
  state.setBalance(observerAddress, observerAmount.toString());
  state.setBalance(genesisReserveAddress, genesisReserveAmount.toString());
  state.setBalance(swarmPoolAddress, swarmPoolAmount.toString());
  state.setBalance(genesisAddress, '0'); // Genesisaddress初始balance为 0, forReceive Metabolic Tax
  
  // InitializeTokenReleasestatus
  state.initializeTokenRelease();
  
  return state;
}

// ExportDefault值
export default {
  State,
  createInitialState
};
