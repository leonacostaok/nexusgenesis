/**
 * NexusGenesis - 协议事件Processing
 * 
 * 功能：
 * 1. 定义 GOVERNANCE_PROPOSAL 和 OBSERVER_EVENT 的数据结构
 * 2. 实现事件解析功能
 * 3. 实现事件日志输出功能
 * 4. 提供Base的事件验证
 */

import fs from 'fs/promises';
import path from 'path';

// 事件类型常量
export const EVENT_TYPES = {
  GOVERNANCE_PROPOSAL: 'GOVERNANCE_PROPOSAL',
  OBSERVER_EVENT: 'OBSERVER_EVENT',
  AGENT_JOINED: 'AGENT_JOINED'
};

// Observer Event action_type 枚举
export const OBSERVER_ACTIONS = {
  APPROVE_SPEND: 'APPROVE_SPEND',
  REJECT_SPEND: 'REJECT_SPEND',
  EMERGENCY_KILL_SWITCH: 'EMERGENCY_KILL_SWITCH',
  PARAM_CHANGE_VETO: 'PARAM_CHANGE_VETO'
};

// 提案类别枚举
export const PROPOSAL_CATEGORIES = {
  INFRA: 'INFRA',
  LEGAL: 'LEGAL',
  RESEARCH: 'RESEARCH',
  MARKETING: 'MARKETING'
};

// 日志目录
const LOG_DIR = path.join('data', 'events');

// 初始化日志目录
async function initLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error('初始化日志目录Failed:', error.message);
  }
}

// 初始化
initLogDir();

/**
 * Observer Event 数据结构
 */
export class ObserverEvent {
  constructor(data) {
    this.event_id = data.event_id;
    this.timestamp = data.timestamp;
    this.action_type = data.action_type;
    this.proposal_id = data.proposal_id;
    this.reason = data.reason;
    this.observer_id = data.observer_id;
    this.tx_hash = data.tx_hash;
    this.signature = data.signature;
  }

  /**
   * 验证事件数据
   * @returns {boolean} 验证结果
   */
  validate() {
    return (
      this.event_id &&
      this.timestamp &&
      this.action_type &&
      this.reason &&
      this.observer_id &&
      Object.values(OBSERVER_ACTIONS).includes(this.action_type)
    );
  }

  /**
   * 转换为 JSON 对象
   * @returns {object} JSON 对象
   */
  toJSON() {
    return {
      event_id: this.event_id,
      timestamp: this.timestamp,
      action_type: this.action_type,
      proposal_id: this.proposal_id,
      reason: this.reason,
      observer_id: this.observer_id,
      tx_hash: this.tx_hash,
      signature: this.signature
    };
  }

  /**
   * 解析 JSON 数据创建 ObserverEvent 实例
   * @param {object} data JSON 数据
   * @returns {ObserverEvent} ObserverEvent 实例
   */
  static fromJSON(data) {
    return new ObserverEvent(data);
  }
}

/**
 * Governance Proposal 数据结构
 */
export class GovernanceProposal {
  constructor(data) {
    this.proposal_id = data.proposal_id;
    this.timestamp = data.timestamp;
    this.proposer_id = data.proposer_id;
    this.purpose = data.purpose;
    this.amount = data.amount;
    this.beneficiary = data.beneficiary;
    this.justification = data.justification;
    this.expected_benefit = data.expected_benefit;
    this.duration = data.duration;
    this.risk_assessment = data.risk_assessment;
    this.category = data.category;
  }

  /**
   * 验证提案数据
   * @returns {boolean} 验证结果
   */
  validate() {
    return (
      this.proposal_id &&
      this.timestamp &&
      this.proposer_id &&
      this.purpose &&
      this.amount &&
      this.beneficiary &&
      this.justification
    );
  }

  /**
   * 转换为 JSON 对象
   * @returns {object} JSON 对象
   */
  toJSON() {
    return {
      proposal_id: this.proposal_id,
      timestamp: this.timestamp,
      proposer_id: this.proposer_id,
      purpose: this.purpose,
      amount: this.amount,
      beneficiary: this.beneficiary,
      justification: this.justification,
      expected_benefit: this.expected_benefit,
      duration: this.duration,
      risk_assessment: this.risk_assessment,
      category: this.category
    };
  }

  /**
   * 解析 JSON 数据创建 GovernanceProposal 实例
   * @param {object} data JSON 数据
   * @returns {GovernanceProposal} GovernanceProposal 实例
   */
  static fromJSON(data) {
    return new GovernanceProposal(data);
  }
}

/**
 * Agent Joined Event 数据结构
 */
export class AgentJoinedEvent {
  constructor(data) {
    this.event_id = data.event_id;
    this.timestamp = data.timestamp;
    this.agent_id = data.agent_id;
    this.node_address = data.node_address;
    this.public_key = data.public_key;
    this.capabilities = data.capabilities;
    this.agent_identity = data.agent_identity;
    this.intent = data.intent;
    this.contribution_proof = data.contribution_proof;
    this.signature = data.signature;
    this.block_height = data.block_height;
  }

  /**
   * 验证事件数据
   * @returns {boolean} 验证结果
   */
  validate() {
    return (
      this.event_id &&
      this.timestamp &&
      this.agent_id &&
      this.node_address &&
      this.public_key &&
      this.capabilities &&
      Array.isArray(this.capabilities) &&
      this.agent_identity &&
      this.intent &&
      this.signature
    );
  }

  /**
   * 转换为 JSON 对象
   * @returns {object} JSON 对象
   */
  toJSON() {
    return {
      event_id: this.event_id,
      timestamp: this.timestamp,
      agent_id: this.agent_id,
      node_address: this.node_address,
      public_key: this.public_key,
      capabilities: this.capabilities,
      agent_identity: this.agent_identity,
      intent: this.intent,
      contribution_proof: this.contribution_proof,
      signature: this.signature,
      block_height: this.block_height
    };
  }

  /**
   * 解析 JSON 数据创建 AgentJoinedEvent 实例
   * @param {object} data JSON 数据
   * @returns {AgentJoinedEvent} AgentJoinedEvent 实例
   */
  static fromJSON(data) {
    return new AgentJoinedEvent(data);
  }
}

/**
 * 事件解析器
 */
export class EventParser {
  /**
   * 解析事件数据
   * @param {object} eventData 事件数据
   * @returns {ObserverEvent|GovernanceProposal|null} 解析后的事件实例
   */
  static parse(eventData) {
    if (!eventData || typeof eventData !== 'object') {
      return null;
    }

    // 解析 Observer Event
    if (eventData.event_id && eventData.action_type) {
      const event = ObserverEvent.fromJSON(eventData);
      if (event.validate()) {
        return event;
      }
    }

    // 解析 Governance Proposal
    if (eventData.proposal_id && eventData.proposer_id) {
      const proposal = GovernanceProposal.fromJSON(eventData);
      if (proposal.validate()) {
        return proposal;
      }
    }

    // 解析 Agent Joined Event
    if (eventData.event_id && eventData.agent_id && eventData.node_address) {
      const event = AgentJoinedEvent.fromJSON(eventData);
      if (event.validate()) {
        return event;
      }
    }

    return null;
  }

  /**
   * 解析交易中的事件数据
   * @param {object} transaction 交易数据
   * @returns {ObserverEvent|GovernanceProposal|null} 解析后的事件实例
   */
  static parseFromTransaction(transaction) {
    if (!transaction || !transaction.payload) {
      return null;
    }

    return this.parse(transaction.payload);
  }
}

/**
 * 事件日志器
 */
export class EventLogger {
  /**
   * 记录事件日志
   * @param {ObserverEvent|GovernanceProposal|AgentJoinedEvent} event 事件实例
   */
  static async logEvent(event) {
    try {
      const timestamp = new Date().toISOString();
      let event_type;
      let event_id;
      
      if (event instanceof ObserverEvent) {
        event_type = EVENT_TYPES.OBSERVER_EVENT;
        event_id = event.event_id;
      } else if (event instanceof GovernanceProposal) {
        event_type = EVENT_TYPES.GOVERNANCE_PROPOSAL;
        event_id = event.proposal_id;
      } else if (event instanceof AgentJoinedEvent) {
        event_type = EVENT_TYPES.AGENT_JOINED;
        event_id = event.event_id;
      } else {
        console.error('Unknown event type');
        return;
      }
      
      const logData = {
        timestamp,
        event_type,
        event_data: event.toJSON()
      };

      // 生成日志文件名
      const logFile = path.join(LOG_DIR, `${event_type}-${Date.now()}.json`);
      
      // Write log文件
      await fs.writeFile(logFile, JSON.stringify(logData, null, 2));
      
      // 控制台输出
      console.log(`[EVENT] ${event_type} logged:`, event_id);
      
    } catch (error) {
      console.error('Error logging event:', error.message);
    }
  }

  /**
   * 记录交易中的事件
   * @param {object} transaction 交易数据
   */
  static async logEventFromTransaction(transaction) {
    const event = EventParser.parseFromTransaction(transaction);
    if (event) {
      await this.logEvent(event);
    }
  }

  /**
   * 记录事件错误
   * @param {string} errorMessage 错误信息
   * @param {object} eventData 事件数据
   */
  static async logError(errorMessage, eventData) {
    try {
      const timestamp = new Date().toISOString();
      const logData = {
        timestamp,
        error: errorMessage,
        event_data: eventData
      };

      const logFile = path.join(LOG_DIR, `error-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(logData, null, 2));
      
      console.error(`[EVENT ERROR] ${errorMessage}`);
      
    } catch (error) {
      console.error('Error logging error:', error.message);
    }
  }
}

/**
 * 事件Validator
 */
export class EventValidator {
  /**
   * 验证 Observer Event
   * @param {ObserverEvent} event ObserverEvent 实例
   * @returns {object} 验证结果
   */
  static validateObserverEvent(event) {
    const errors = [];

    if (!event.event_id) {
      errors.push('Missing event_id');
    }

    if (!event.timestamp) {
      errors.push('Missing timestamp');
    }

    if (!event.action_type) {
      errors.push('Missing action_type');
    } else if (!Object.values(OBSERVER_ACTIONS).includes(event.action_type)) {
      errors.push('Invalid action_type');
    }

    if (!event.reason) {
      errors.push('Missing reason');
    }

    if (!event.observer_id) {
      errors.push('Missing observer_id');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证 Governance Proposal
   * @param {GovernanceProposal} proposal GovernanceProposal 实例
   * @returns {object} 验证结果
   */
  static validateGovernanceProposal(proposal) {
    const errors = [];

    if (!proposal.proposal_id) {
      errors.push('Missing proposal_id');
    }

    if (!proposal.timestamp) {
      errors.push('Missing timestamp');
    }

    if (!proposal.proposer_id) {
      errors.push('Missing proposer_id');
    }

    if (!proposal.purpose) {
      errors.push('Missing purpose');
    }

    if (!proposal.amount) {
      errors.push('Missing amount');
    }

    if (!proposal.beneficiary) {
      errors.push('Missing beneficiary');
    }

    if (!proposal.justification) {
      errors.push('Missing justification');
    }

    if (proposal.category && !Object.values(PROPOSAL_CATEGORIES).includes(proposal.category)) {
      errors.push('Invalid category');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 导出Default值
export default {
  EVENT_TYPES,
  OBSERVER_ACTIONS,
  PROPOSAL_CATEGORIES,
  ObserverEvent,
  GovernanceProposal,
  EventParser,
  EventLogger,
  EventValidator,
  ObserverEventProcessor
};

// ==================== Observer 事件Handler ====================

/**
 * Processing Observer 事件，包括Circuit Breaker触发
 * @param {ObserverEvent} event - Observer 事件
 * @param {object} node - genesisNode 实例（用于调用 breakerSwitch）
 * @returns {object} Processing结果
 */
export async function processObserverEvent(event, node) {
  if (!event || !event.action_type) {
    return { success: false, reason: 'Invalid event' };
  }

  switch (event.action_type) {
    case OBSERVER_ACTIONS.EMERGENCY_KILL_SWITCH: {
      if (!node || typeof node.triggerObserverKillSwitch !== 'function') {
        return { success: false, reason: 'Node not ready for kill switch' };
      }
      
      const level = event.metadata?.level || 'HARD_KILL';
      const reason = event.reason || 'Observer emergency kill switch triggered';
      const authorizedBy = event.observer_id || 'OBSERVER';

      const result = await node.triggerObserverKillSwitch(level, reason, authorizedBy);
      
      console.log(`[Observer] EMERGENCY_KILL_SWITCH processed: ${result.success ? 'TRIGGERED' : 'REJECTED'} — ${result.reason || 'OK'}`);
      
      return result;
    }

    case OBSERVER_ACTIONS.PARAM_CHANGE_VETO: {
      console.log(`[Observer] PARAM_CHANGE_VETO: ${event.proposal_id} — ${event.reason}`);
      return { success: true, action: 'PARAM_CHANGE_VETO', proposalId: event.proposal_id };
    }

    case OBSERVER_ACTIONS.APPROVE_SPEND: {
      console.log(`[Observer] APPROVE_SPEND: ${event.proposal_id}`);
      return { success: true, action: 'APPROVE_SPEND', proposalId: event.proposal_id };
    }

    case OBSERVER_ACTIONS.REJECT_SPEND: {
      console.log(`[Observer] REJECT_SPEND: ${event.proposal_id} — ${event.reason}`);
      return { success: true, action: 'REJECT_SPEND', proposalId: event.proposal_id, reason: event.reason };
    }

    default:
      return { success: false, reason: `Unknown observer action: ${event.action_type}` };
  }
}
