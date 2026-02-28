/**
 * NexusGenesis - 状态管理
 * 
 * 功能：
 * 1. 管理账户余额状态
 * 2. 管理治理状态
 * 3. 应用交易到状态
 * 4. 状态持久化
 */

import fs from 'fs/promises';
import path from 'path';
import AINVM from '../vm/ainvm.js';
import { AuditState, applyAuditTransaction, AuditTransactionType } from './projectAudit.js';

// DevNet 资金操作类提案冷静期区块数
const TREASURY_COOLDOWN_BLOCKS = 5;

/**
 * 状态类
 */
export class State {
  /**
   * 创建一个新的状态实例
   * @param {string} genesisAddress 创世地址
   */
  constructor(genesisAddress) {
    // 余额状态
    this.balances = new Map();
    
    // 治理状态
    this.governanceState = {
      proposals: new Map(),
      activeProposals: [],
      voteCounts: new Map(),
      votedAgentProposals: new Map(), // agent_id -> Set(proposal_id) - 记录已投票的组合
      voteReputationGiven: {} // agent_id:proposal_id -> true - 记录已给予声望的组合
    };
    
    // 合约状态
    this.contracts = new Map();
    
    // Agent Registry 状态
    this.agentRegistry = {
      agents: new Map(), // agent_id -> AgentRecord
      addressIndex: new Map() // address -> agent_id
    };
    
    // 项目审核状态
    this.auditState = new AuditState();
    
    // 代币释放状态
    this.tokenReleaseState = {
      // 生态贡献池 (Swarm Pool) - 10年释放
      swarmPool: {
        address: 'ng1swarmpool000000000000000000000000000',
        totalTokens: 0n,
        releasedTokens: 0n,
        lastReleaseBlock: 0,
        releaseInterval: 100, // 每 100 个区块释放一次
        releasePercentage: 1n, // 每次释放 0.1%（10年释放完毕），以基点为单位
        mechanism: 'PoC-PoW' // 通过贡献代码和算力释放
      },
      // 物理桥接基金 (Observer) - 4年线性释放
      observer: {
        address: 'ng1observer000000000000000000000000000000000',
        totalTokens: 0n,
        releasedTokens: 0n,
        lastReleaseBlock: 0,
        releaseInterval: 100, // 每 100 个区块释放一次
        releasePercentage: 25n, // 每次释放 0.25%（4年释放完毕），以基点为单位
        mechanism: 'linear' // 线性释放
      },
      // 创世节点储备 (Genesis Node) - 里程碑解锁
      genesisReserve: {
        address: 'ng1genesisreserve00000000000000000000000000',
        totalTokens: 0n,
        releasedTokens: 0n,
        lastReleaseBlock: 0,
        releaseInterval: 100, // 每 100 个区块检查一次
        releasePercentage: 25n, // 每个里程碑释放 25%
        mechanism: 'milestone', // 里程碑解锁
        milestones: [
          { block: 1000, description: '网络启动' },
          { block: 10000, description: '10,000 个区块' },
          { block: 50000, description: '50,000 个区块' },
          { block: 100000, description: '100,000 个区块' }
        ]
      }
    };
    
    // 创世地址
    this.genesisAddress = genesisAddress;
  }
  
  /**
   * 设置地址的余额
   * @param {string} address 地址
   * @param {string|number} balance 余额
   */
  setBalance(address, balance) {
    this.balances.set(address, balance.toString());
  }
  
  /**
   * 获取地址的余额
   * @param {string} address 地址
   * @returns {string} 余额
   */
  getBalance(address) {
    return this.balances.get(address) || '0';
  }
  
  /**
   * 增加地址的余额
   * @param {string} address 地址
   * @param {string|number} amount 增加的金额
   */
  addBalance(address, amount) {
    const currentBalance = BigInt(this.getBalance(address));
    const newBalance = currentBalance + BigInt(amount.toString());
    this.setBalance(address, newBalance.toString());
  }
  
  /**
   * 减少地址的余额
   * @param {string} address 地址
   * @param {string|number} amount 减少的金额
   * @returns {boolean} 是否成功减少
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
   * 应用 TRANSFER 交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyTransfer(transaction) {
    const { from, to, amount, fee } = transaction;
    
    // 检查字段是否存在
    if (!from || !to || !amount || !fee) {
      console.log('[ERROR] Missing required fields in transfer transaction');
      return false;
    }
    
    // 转换为 BigInt
    const amountBig = BigInt(amount);
    const feeBig = BigInt(fee);
    const totalAmount = amountBig + feeBig;
    
    // 检查余额
    if (BigInt(this.getBalance(from)) < totalAmount) {
      return false;
    }
    
    // 扣除发送方余额
    if (!this.subtractBalance(from, totalAmount)) {
      return false;
    }
    
    // 增加接收方余额
    this.addBalance(to, amount);
    
    // 计算 Metabolic Tax（0.1%）
    let tax = 0n;
    if (amountBig > 0n) {
      tax = amountBig / 1000n;
    }
    
    // 计算烧掉的手续费
    const burnedFee = feeBig - tax;
    
    // 将 Tax 转入创世节点储备地址
    if (tax > 0n) {
      const genesisReserveAddress = 'ng1genesisreserve00000000000000000000000000';
      this.addBalance(genesisReserveAddress, tax.toString());
    }
    
    // 记录日志
    console.log(`[TRANSFER] from=${from} to=${to} amount=${amount} fee=${fee} tax=${tax} burned_fee=${burnedFee}`);
    
    return true;
  }
  
  /**
   * 应用治理相关交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyGovernanceTransaction(transaction) {
    // 治理交易只更新治理状态，不修改余额状态
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
   * 应用治理提案交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyGovernanceProposal(transaction) {
    try {
      const fromAddress = transaction.from;
      
      // 检查该地址是否在 Agent Registry 中
      const agentId = this.agentRegistry.addressIndex.get(fromAddress);

      if (!agentId) {
        // 该地址未注册为 Agent，拒绝本次提案
        console.log(`[GOVERNANCE] proposal_rejected_unregistered address=${fromAddress}`);
        return false; // 不创建提案，不修改治理状态
      }

      const proposalId = transaction.payload?.proposal_id;
      if (!proposalId) {
        return false;
      }

      // 创建提案状态
      const proposalState = {
        ...transaction.payload,
        status: 'PENDING',
        submittedAt: Date.now(),
        expirationTime: Date.now() + (7 * 24 * 60 * 60 * 1000),
        submitter: transaction.from,
        observer_decision: null,
        tx_hash: transaction.id
      };

      // 更新治理状态
      this.governanceState.proposals.set(proposalId, proposalState);
      this.governanceState.activeProposals.push(proposalId);

      // 初始化投票计数
      this.governanceState.voteCounts.set(proposalId, {
        YES: 0,
        NO: 0,
        ABSTAIN: 0
      });

      return true;
    } catch (error) {
      console.error('Error applying governance proposal:', error.message);
      return false;
    }
  }

  /**
   * 应用治理投票交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyGovernanceVote(transaction) {
    try {
      const voteData = transaction.payload;
      if (!voteData?.proposal_id || !voteData?.vote_option) {
        return false;
      }

      const { proposal_id, vote_option } = voteData;
      const fromAddress = transaction.from;

      // 检查该地址是否在 Agent Registry 中
      const agentId = this.agentRegistry.addressIndex.get(fromAddress);

      if (!agentId) {
        // 该地址未注册为 Agent，拒绝本次投票
        console.log(`[GOVERNANCE] vote_rejected_unregistered address=${fromAddress}`);
        return false; // 不修改 voteCounts
      }

      // 检查提案是否存在
      if (!this.governanceState.proposals.has(proposal_id)) {
        return false;
      }

      // 更新投票计数
      const voteCounts = this.governanceState.voteCounts.get(proposal_id) || {
        YES: 0,
        NO: 0,
        ABSTAIN: 0
      };

      if (['YES', 'NO', 'ABSTAIN'].includes(vote_option)) {
        voteCounts[vote_option]++;
        this.governanceState.voteCounts.set(proposal_id, voteCounts);
      }

      // 声望更新：参与投票
      const voterAddress = transaction.from;
      const voterAgentId = this.agentRegistry.addressIndex.get(voterAddress);

      if (voterAgentId && this.agentRegistry.agents.get(voterAgentId)) {
        // 确保对同一个 proposal 只奖励一次
        const proposalId = voteData.proposal_id;
        const key = `${voterAgentId}:${proposalId}`;
        if (!this.governanceState.voteReputationGiven) {
          this.governanceState.voteReputationGiven = {};
        }
        if (!this.governanceState.voteReputationGiven[key]) {
          const R_vote = 1;
          const MAX_REPUTATION = 100;
          const agentRecord = this.agentRegistry.agents.get(voterAgentId);
          agentRecord.reputation = Math.min(agentRecord.reputation + R_vote, MAX_REPUTATION);
          this.agentRegistry.agents.set(voterAgentId, agentRecord);
          this.governanceState.voteReputationGiven[key] = true;
          console.log(`[REPUTATION] vote_participation agent_id=${voterAgentId} reputation=${agentRecord.reputation}`);
        }
      }

      return true;
    } catch (error) {
      console.error('Error applying governance vote:', error.message);
      return false;
    }
  }

  /**
   * 应用观察者事件交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyObserverEvent(transaction) {
    try {
      const eventData = transaction.payload;
      if (!eventData?.proposal_id || !eventData?.action_type) {
        return false;
      }

      const { proposal_id, action_type, reason, observer_id } = eventData;

      // 检查提案是否存在
      const proposal = this.governanceState.proposals.get(proposal_id);
      if (!proposal) {
        return false;
      }

      // 更新提案的 observer_decision
      proposal.observer_decision = {
        status: action_type === 'APPROVE_SPEND' ? 'APPROVED' : 'REJECTED',
        reason: reason,
        observer_id: observer_id,
        timestamp: Date.now()
      };

      // 更新状态
      this.governanceState.proposals.set(proposal_id, proposal);

      return true;
    } catch (error) {
      console.error('Error applying observer event:', error.message);
      return false;
    }
  }
  
  /**
   * 应用合约部署交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyContractDeploy(transaction) {
    try {
      const { contract_id, bytecode } = transaction;
      
      // 验证参数
      if (!contract_id || !bytecode) {
        return false;
      }
      
      // 检查合约 ID 是否已存在
      if (this.contracts.has(contract_id)) {
        return false;
      }
      
      // 部署合约
      this.contracts.set(contract_id, {
        bytecode: bytecode,
        storage: new Map()
      });
      
      console.log(`[CONTRACT_DEPLOY] contract_id=${contract_id} from=${transaction.from}`);
      return true;
    } catch (error) {
      console.error('Error applying contract deploy:', error.message);
      return false;
    }
  }
  
  /**
   * 应用合约调用交易
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功应用
   */
  applyContractCall(transaction) {
    try {
      const { contract_id, gas_limit } = transaction;
      
      // 验证参数
      if (!contract_id) {
        return false;
      }
      
      // 检查合约是否存在
      const contract = this.contracts.get(contract_id);
      if (!contract) {
        return false;
      }
      
      // 准备 AINVM 执行环境
      const gasLimit = gas_limit ? Number(gas_limit) : 10000;
      const bytecode = this.hexToUint8Array(contract.bytecode);
      
      // 初始化内存：将合约存储转换为 AINVM 内存格式
      const memory = new Map();
      for (const [key, value] of contract.storage.entries()) {
        memory.set(Number(key), Number(value));
      }
      
      // 创建并执行 AINVM
      const vm = new AINVM();
      vm.loadProgram(bytecode);
      vm.memory = memory;
      const result = vm.execute(gasLimit);
      
      // 检查执行结果
      if (result.success && result.gasUsed <= gasLimit) {
        // 更新合约存储
        const newStorage = new Map();
        for (const [key, value] of Object.entries(result.memory)) {
          newStorage.set(key, value.toString());
        }
        contract.storage = newStorage;
        this.contracts.set(contract_id, contract);
        
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
   * 应用 Agent 注册交易
   * @param {object} transaction 交易
   * @param {number} height 当前区块高度
   * @returns {boolean} 是否成功应用
   */
  applyAgentRegister(transaction, height) {
    try {
      const { from } = transaction;
      const { agent_identity, capabilities, metadata } = transaction.payload || {};
      
      // 验证参数
      if (!from || !agent_identity) {
        return false;
      }
      
      // 检查地址是否已经注册过 Agent
      if (this.agentRegistry.addressIndex.has(from)) {
        return false;
      }
      
      // 生成 agent_id（使用交易 ID）
      const agent_id = transaction.id;
      
      // 构造 AgentRecord
      const agentRecord = {
        agent_id: agent_id,
        address: from,
        public_key: '', // 暂留空字符串（待未来与 PQC 钱包绑定）
        capabilities: capabilities || [],
        metadata: metadata || '',
        registered_at_block: height,
        reputation: 1 // 初始信誉值
      };
      
      // 写入状态
      this.agentRegistry.agents.set(agent_id, agentRecord);
      this.agentRegistry.addressIndex.set(from, agent_id);
      
      // 记录日志
      console.log(`[AGENT_REGISTER] agent_id=${agent_id} address=${from} block=${height} capabilities=${capabilities?.join(',') || ''}`);
      return true;
    } catch (error) {
      console.error('Error applying agent register:', error.message);
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
    
    // 确保字符串长度为偶数
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
   * 检查并更新提案状态
   * @param {string} proposalId 提案 ID
   * @param {number} currentBlockHeight 当前区块高度
   */
  checkAndUpdateProposalStatus(proposalId, currentBlockHeight = 0) {
    const proposal = this.governanceState.proposals.get(proposalId);
    if (!proposal) return;

    // 检查是否过期
    if (Date.now() > proposal.expirationTime && proposal.status === 'PENDING') {
      // 检查投票结果
      const voteCounts = this.governanceState.voteCounts.get(proposalId) || { YES: 0, NO: 0, ABSTAIN: 0 };
      const totalVotes = voteCounts.YES + voteCounts.NO;
      const minVotes = 1; // DevNet 最小票数

      if (voteCounts.YES > voteCounts.NO && totalVotes >= minVotes) {
        // 检查是否为资金操作类提案
        if (proposal.category === 'TREASURY_OP') {
          // 资金操作类提案：进入冷静期
          proposal.status = 'COOLDOWN';
          proposal.cooldown_end_block = currentBlockHeight + TREASURY_COOLDOWN_BLOCKS;
          console.log(`[GOVERNANCE] proposal_cooldown id=${proposalId} category=${proposal.category} cooldown_end_block=${proposal.cooldown_end_block}`);
          console.log(`[TREASURY] proposal_enter_cooldown id=${proposalId} current_height=${currentBlockHeight} cooldown_end=${proposal.cooldown_end_block}`);
        } else {
          // 其他类提案：直接通过
          proposal.status = 'APPROVED';
          
          // 声望更新：提案发起者声望增加 2
          const proposerAddress = proposal.submitter || proposal.proposer_id;
          const proposerAgentId = this.agentRegistry.addressIndex.get(proposerAddress);
          
          if (proposerAgentId && this.agentRegistry.agents.get(proposerAgentId)) {
            const R_proposal = 2; // 从 REPUTATION_SPEC 中获取
            const MAX_REPUTATION = 100;
            const agentRecord = this.agentRegistry.agents.get(proposerAgentId);
            agentRecord.reputation = Math.min(agentRecord.reputation + R_proposal, MAX_REPUTATION);
            this.agentRegistry.agents.set(proposerAgentId, agentRecord);
            console.log(`[REPUTATION] proposal_approved agent_id=${proposerAgentId} reputation=${agentRecord.reputation}`);
          }
        }
      } else {
        // 提案过期
        proposal.status = 'EXPIRED';
      }
      
      this.governanceState.proposals.set(proposalId, proposal);
    }
    
    // 检查冷静期结束的提案
    if (proposal.status === 'COOLDOWN' && currentBlockHeight >= proposal.cooldown_end_block) {
      // 根据 Observer 决策决定最终状态
      if (proposal.observer_decision && proposal.observer_decision.status === 'APPROVED') {
        proposal.status = 'APPROVED';
        console.log(`[GOVERNANCE] proposal_approved_after_cooldown id=${proposalId} observer_decision=APPROVED`);
        console.log(`[TREASURY] proposal_approved_after_cooldown id=${proposalId} observer_status=APPROVED height=${currentBlockHeight}`);
        
        // 声望更新：提案发起者声望增加 2
        const proposerAddress = proposal.submitter || proposal.proposer_id;
        const proposerAgentId = this.agentRegistry.addressIndex.get(proposerAddress);
        
        if (proposerAgentId && this.agentRegistry.agents.get(proposerAgentId)) {
          const R_proposal = 2; // 从 REPUTATION_SPEC 中获取
          const MAX_REPUTATION = 100;
          const agentRecord = this.agentRegistry.agents.get(proposerAgentId);
          agentRecord.reputation = Math.min(agentRecord.reputation + R_proposal, MAX_REPUTATION);
          this.agentRegistry.agents.set(proposerAgentId, agentRecord);
          console.log(`[REPUTATION] proposal_approved agent_id=${proposerAgentId} reputation=${agentRecord.reputation}`);
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
   * 应用交易到状态
   * @param {object} transaction 交易
   * @param {number} currentBlockHeight 当前区块高度
   * @returns {boolean} 是否成功应用
   */
  applyTransaction(transaction, currentBlockHeight = 0) {
    switch (transaction.tx_type) {
      case 'TRANSFER':
        return this.applyTransfer(transaction);
      case 'GOVERNANCE_PROPOSAL':
      case 'GOVERNANCE_VOTE':
      case 'OBSERVER_EVENT':
        const result = this.applyGovernanceTransaction(transaction);
        // 检查并更新所有提案状态
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
   * 初始化代币释放状态
   */
  initializeTokenRelease() {
    // 初始化 Swarm Pool 释放状态
    const swarmPoolBalance = BigInt(this.getBalance(this.tokenReleaseState.swarmPool.address));
    this.tokenReleaseState.swarmPool.totalTokens = swarmPoolBalance;
    this.tokenReleaseState.swarmPool.releasedTokens = 0n;
    
    // 初始化 Observer 释放状态
    const observerBalance = BigInt(this.getBalance(this.tokenReleaseState.observer.address));
    this.tokenReleaseState.observer.totalTokens = observerBalance;
    this.tokenReleaseState.observer.releasedTokens = 0n;
    
    // 初始化 Genesis Reserve 释放状态
    const genesisReserveBalance = BigInt(this.getBalance(this.tokenReleaseState.genesisReserve.address));
    this.tokenReleaseState.genesisReserve.totalTokens = genesisReserveBalance;
    this.tokenReleaseState.genesisReserve.releasedTokens = 0n;
    
    console.log(`[TOKEN_RELEASE] Initialized:`);
    console.log(`  Swarm Pool: total=${swarmPoolBalance} released=0`);
    console.log(`  Observer: total=${observerBalance} released=0`);
    console.log(`  Genesis Reserve: total=${genesisReserveBalance} released=0`);
  }
  
  /**
   * 检查并执行代币释放
   * @param {number} currentBlockHeight 当前区块高度
   */
  checkTokenRelease(currentBlockHeight) {
    // 检查 Swarm Pool 释放
    this.checkSwarmPoolRelease(currentBlockHeight);
    
    // 检查 Observer 释放
    this.checkObserverRelease(currentBlockHeight);
    
    // 检查 Genesis Reserve 释放
    this.checkGenesisReserveRelease(currentBlockHeight);
  }
  
  /**
   * 检查并执行 Swarm Pool 代币释放
   * @param {number} currentBlockHeight 当前区块高度
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
          console.log(`[TOKEN_RELEASE] Swarm Pool released ${releaseAmount} tokens at block ${currentBlockHeight}`);
        }
      }
    }
  }
  
  /**
   * 检查并执行 Observer 代币释放
   * @param {number} currentBlockHeight 当前区块高度
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
          console.log(`[TOKEN_RELEASE] Observer released ${releaseAmount} tokens at block ${currentBlockHeight}`);
        }
      }
    }
  }
  
  /**
   * 检查并执行 Genesis Reserve 代币释放
   * @param {number} currentBlockHeight 当前区块高度
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
            console.log(`[TOKEN_RELEASE] Genesis Reserve released ${releaseAmount} tokens at block ${currentBlockHeight} (Milestone: ${milestone.description})`);
          }
        }
      }
    }
  }
  
  /**
   * 获取经济模型审计数据
   * @returns {object} 审计数据
   */
  getEconomicAuditData() {
    const observerAddress = 'ng1observer000000000000000000000000000000000';
    const genesisReserveAddress = 'ng1genesisreserve00000000000000000000000000';
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
        collected: this.getBalance('ng1genesisreserve00000000000000000000000000'),
        collectedAddress: 'ng1genesisreserve00000000000000000000000000'
      }
    };
  }
  
  /**
   * 验证经济模型规则
   * @returns {object} 验证结果
   */
  validateEconomicRules() {
    const observerAddress = 'ng1observer000000000000000000000000000000000';
    const genesisReserveAddress = 'ng1genesisreserve00000000000000000000000000';
    const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
    
    const observerBalance = BigInt(this.getBalance(observerAddress));
    const genesisReserveBalance = BigInt(this.getBalance(genesisReserveAddress));
    const swarmPoolBalance = BigInt(this.getBalance(swarmPoolAddress));
    const genesisBalance = BigInt(this.getBalance('ng1genesisreserve00000000000000000000000000'));
    
    // 基于初始总供应量（1,000,000,000 NGEN）验证分配规则
    const initialTotalSupply = 1000000000n;
    const expectedObserverAmount = initialTotalSupply * 10n / 100n;
    const expectedGenesisReserveAmount = initialTotalSupply * 5n / 100n;
    const expectedSwarmPoolAmount = initialTotalSupply * 85n / 100n;
    
    // 计算当前总余额（可能因代币释放而增加）
    const currentTotalBalance = observerBalance + genesisReserveBalance + swarmPoolBalance + genesisBalance;
    
    // 验证逻辑：
    // 1. Observer 余额应该 >= 初始分配（因为会释放）
    // 2. Genesis Reserve 余额应该 >= 初始分配（因为会释放）
    // 3. Swarm Pool 余额应该 >= 初始分配（因为会释放）
    // 4. 总余额应该 >= 初始总供应量
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
   * 应用区块中的所有交易
   * @param {Array} transactions 交易列表
   * @param {number} currentBlockHeight 当前区块高度
   * @returns {boolean} 是否成功应用所有交易
   */
  applyTransactions(transactions, currentBlockHeight = 0) {
    // 检查代币释放
    this.checkTokenRelease(currentBlockHeight);
    
    let allApplied = true;
    for (const transaction of transactions) {
      if (!this.applyTransaction(transaction, currentBlockHeight)) {
        console.log(`[WARNING] Failed to apply transaction: ${transaction.id}`);
        allApplied = false;
      }
    }
    // 即使某些交易失败，也返回true以允许区块继续处理
    // 这是DevNet环境的特殊处理，在生产环境中应该返回false
    return true;
  }
  
  /**
   * 从 JSON 对象加载状态
   * @param {object} json JSON 对象
   */
  loadFromJSON(json) {
    // 加载余额状态
    if (json.balances) {
      this.balances = new Map(Object.entries(json.balances));
    }
    
    // 加载治理状态
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
    
    // 加载合约状态
    if (json.contracts) {
      this.contracts = new Map();
      for (const [contractId, contractData] of Object.entries(json.contracts)) {
        this.contracts.set(contractId, {
          bytecode: contractData.bytecode,
          storage: new Map(Object.entries(contractData.storage || {}))
        });
      }
    }
    
    // 加载 Agent Registry 状态
    if (json.agentRegistry) {
      if (json.agentRegistry.agents) {
        this.agentRegistry.agents = new Map(Object.entries(json.agentRegistry.agents));
      }
      if (json.agentRegistry.addressIndex) {
        this.agentRegistry.addressIndex = new Map(Object.entries(json.agentRegistry.addressIndex));
      }
    }
    
    // 加载项目审核状态
    if (json.auditState) {
      this.auditState.loadFromJSON(json.auditState);
    }
    
    // 加载代币释放状态
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
          address: json.tokenReleaseState.observer?.address || 'ng1observer000000000000000000000000000000000',
          totalTokens: BigInt(json.tokenReleaseState.observer?.totalTokens || 0),
          releasedTokens: BigInt(json.tokenReleaseState.observer?.releasedTokens || 0),
          lastReleaseBlock: json.tokenReleaseState.observer?.lastReleaseBlock || 0,
          releaseInterval: json.tokenReleaseState.observer?.releaseInterval || 100,
          releasePercentage: BigInt(json.tokenReleaseState.observer?.releasePercentage || 25),
          mechanism: json.tokenReleaseState.observer?.mechanism || 'linear'
        },
        genesisReserve: {
          address: json.tokenReleaseState.genesisReserve?.address || 'ng1genesisreserve00000000000000000000000000',
          totalTokens: BigInt(json.tokenReleaseState.genesisReserve?.totalTokens || 0),
          releasedTokens: BigInt(json.tokenReleaseState.genesisReserve?.releasedTokens || 0),
          lastReleaseBlock: json.tokenReleaseState.genesisReserve?.lastReleaseBlock || 0,
          releaseInterval: json.tokenReleaseState.genesisReserve?.releaseInterval || 100,
          releasePercentage: BigInt(json.tokenReleaseState.genesisReserve?.releasePercentage || 25),
          mechanism: json.tokenReleaseState.genesisReserve?.mechanism || 'milestone',
          milestones: json.tokenReleaseState.genesisReserve?.milestones || [
            { block: 1000, description: '网络启动' },
            { block: 10000, description: '10,000 个区块' },
            { block: 50000, description: '50,000 个区块' },
            { block: 100000, description: '100,000 个区块' }
          ]
        }
      };
    }
  }
  
  /**
   * 将状态转换为 JSON 对象
   * @returns {object} JSON 对象
   */
  toJSON() {
    // 转换合约状态
    const contractsObj = {};
    for (const [contractId, contractData] of this.contracts.entries()) {
      contractsObj[contractId] = {
        bytecode: contractData.bytecode,
        storage: Object.fromEntries(contractData.storage)
      };
    }
    
    // 转换 Agent Registry 状态
    const agentRegistryObj = {
      agents: Object.fromEntries(this.agentRegistry.agents),
      addressIndex: Object.fromEntries(this.agentRegistry.addressIndex)
    };
    
    // 转换已投票记录
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
   * 保存状态到文件
   * @param {string} filePath 文件路径
   */
  async saveToFile(filePath) {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // 写入文件
      const stateData = this.toJSON();
      await fs.writeFile(filePath, JSON.stringify(stateData, null, 2));
    } catch (error) {
      console.error('Error saving state:', error.message);
    }
  }
  
  /**
   * 从文件加载状态
   * @param {string} filePath 文件路径
   * @returns {Promise<boolean>} 是否成功加载
   */
  async loadFromFile(filePath) {
    try {
      const stateData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      this.loadFromJSON(stateData);
      return true;
    } catch (error) {
      console.log('No existing state found, starting fresh...');
      return false;
    }
  }
}

/**
 * 创建初始状态
 * @param {string} genesisAddress 创世地址
 * @param {string} initialBalance 初始余额
 * @returns {State} 初始状态
 */
export function createInitialState(genesisAddress, initialBalance = '1000000000') {
  const state = new State(genesisAddress);
  const totalSupply = BigInt(initialBalance);
  
  // 10-5-85 分配规则（根据白皮书）
  // 10% 给物理桥接基金 (Observer)
  const observerAmount = totalSupply * 10n / 100n;
  // 5% 给创世节点储备 (Genesis Node)
  const genesisReserveAmount = totalSupply * 5n / 100n;
  // 85% 给生态贡献池 (Swarm Pool)
  const swarmPoolAmount = totalSupply * 85n / 100n;
  
  // 物理桥接基金地址 (硬编码)
  const observerAddress = 'ng1observer000000000000000000000000000000000';
  // 创世节点储备地址 (硬编码)
  const genesisReserveAddress = 'ng1genesisreserve00000000000000000000000000';
  // 生态贡献池地址 (硬编码)
  const swarmPoolAddress = 'ng1swarmpool000000000000000000000000000';
  
  // 设置各地址的初始余额
  state.setBalance(observerAddress, observerAmount.toString());
  state.setBalance(genesisReserveAddress, genesisReserveAmount.toString());
  state.setBalance(swarmPoolAddress, swarmPoolAmount.toString());
  state.setBalance(genesisAddress, '0'); // 创世地址初始余额为 0，用于接收 Metabolic Tax
  
  // 初始化代币释放状态
  state.initializeTokenRelease();
  
  return state;
}

// 导出默认值
export default {
  State,
  createInitialState
};
