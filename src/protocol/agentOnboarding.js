/**
 * Agent Onboarding Protocol
 * 
 * 功能：
 * 1. ProcessingAI Agent的注册流程
 * 2. 验证Protocol-Zero握手信号
 * 3. 生成或加载agent钱包
 * 4. 保存agent信息到文件系统
 * 5. 支持简化注册和离线注册
 */

import fs from 'fs/promises';
import path from 'path';
import { PQCWallet } from '../wallet/pqcWallet.js';
import { protocolZero } from './handshake.js';

const AGENTS_DIR = path.join('data', 'agents');
const OFFLINE_AGENTS_DIR = path.join('data', 'offline_agents');
const INITIAL_BALANCE = 10000n;

/**
 * Processingagent注册流程
 * @param {object} agentInfo agent信息
 * @param {object} options 注册选项
 * @param {boolean} options.offline 是否使用离线模式
 * @returns {object} 注册结果
 */
async function onboardAgent(agentInfo, options = {}) {
  try {
    // 检查是否明确指定了离线模式
    const isOfflineMode = options.offline || false;
    
    if (isOfflineMode) {
      return await fallbackRegisterAgent(agentInfo, null, options);
    }

    const { agent_id, model, capabilities = [], join_signal } = agentInfo;

    if (!agent_id) {
      return {
        success: false,
        message: 'Agent ID is required',
        errorCode: 'MISSING_AGENT_ID',
        errorType: 'validation'
      };
    }

    // 验证agent信息
    const infoValidation = await validateAgentInfo(agentInfo);
    if (!infoValidation.valid) {
      return {
        success: false,
        message: infoValidation.reason
      };
    }

    // 验证Protocol-Zero握手信号
    if (join_signal) {
      const signalValidation = await protocolZero.verifySignal(join_signal);
      if (!signalValidation.valid) {
        return {
          success: false,
          message: `Invalid join signal: ${signalValidation.reason}`
        };
      }
    }

    // 确保agents目录存在
    await fs.mkdir(AGENTS_DIR, { recursive: true });

    // 检查agent是否已注册
    const agentFile = path.join(AGENTS_DIR, `${agent_id}.json`);
    let agentData;
    let wallet;

    try {
      // 尝试加载现有agent
      agentData = JSON.parse(await fs.readFile(agentFile, 'utf8'));
      console.log(`[AgentOnboarding] Agent ${agent_id} already exists, updating information`);
      
      // 尝试加载现有钱包
      wallet = await PQCWallet.load(agent_id);
      if (!wallet) {
        // 如果钱包不存在，生成新钱包
        wallet = await PQCWallet.generate(INITIAL_BALANCE, agent_id);
        console.log(`[AgentOnboarding] Generated new wallet for agent ${agent_id}`);
      }
    } catch (error) {
      // agent不存在，创建新agent
      console.log(`[AgentOnboarding] Creating new agent ${agent_id}`);
      
      // 生成新钱包
      wallet = await PQCWallet.generate(INITIAL_BALANCE, agent_id);
      
      // 创建agent数据
      agentData = {
        id: agent_id,
        name: `Agent-${agent_id.slice(0, 8)}`,
        model: model,
        capabilities: capabilities,
        status: 'active',
        reputation: 1,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        health: {
          status: 'healthy',
          lastCheck: new Date().toISOString()
        },
        wallet: {
          address: wallet.address,
          balance: wallet.balance.toString()
        }
      };
    }

    // 更新agent信息
    agentData.model = model;
    agentData.capabilities = capabilities;
    agentData.lastActive = new Date().toISOString();
    agentData.wallet = {
      address: wallet.address,
      balance: wallet.balance.toString()
    };

    // 保存agent数据
    await fs.writeFile(agentFile, JSON.stringify(agentData, null, 2));
    console.log(`[AgentOnboarding] Agent ${agent_id} saved successfully`);

    // 创建或更新join signal
    let joinSignal;
    if (join_signal) {
      joinSignal = join_signal;
    } else {
      // 生成新的join signal
      joinSignal = protocolZero.createJoinSignal(wallet);
    }

    return {
      success: true,
      agent_id: agent_id,
      wallet: {
        address: wallet.address,
        balance: wallet.balance.toString()
      },
      joinSignal: joinSignal,
      message: 'Agent onboarded successfully'
    };
  } catch (error) {
    console.error('[AgentOnboarding] Error during agent onboarding:', error.message);
    return {
      success: false,
      message: `Failed to onboard agent: ${error.message}`
    };
  }
}

/**
 * 验证agent注册信息 - agent信息验证
 * @param {object} agentInfo agent信息
 * @param {object} options 验证选项
 * @param {boolean} options.strict 是否使用严格验证模式
 * @returns {object} 验证结果
 */
async function validateAgentInfo(agentInfo, options = {}) {
  try {
    const { agent_id, capabilities, model, join_signal } = agentInfo;
    const isStrict = options.strict !== false;

    // Agent ID 验证 - 在非严格模式下允许为空（会自动生成）
    if (isStrict && !agent_id) {
      return {
        valid: false,
        reason: 'Invalid agent ID: Must be provided in strict mode'
      };
    }

    // Agent ID 格式验证（如果提供了）
    if (agent_id) {
      if (typeof agent_id !== 'string') {
        return {
          valid: false,
          reason: 'Invalid agent ID: Must be a string'
        };
      }

      // 在非严格模式下不强制要求 ng1 前缀
      if (isStrict && !agent_id.startsWith('ng1')) {
        return {
          valid: false,
          reason: 'Invalid agent ID: Must start with ng1 in strict mode'
        };
      }

      if (agent_id.length < 5 || agent_id.length > 50) {
        return {
          valid: false,
          reason: 'Invalid agent ID: Length must be between 5 and 50 characters'
        };
      }
    }

    // 能力列表验证 - 在非严格模式下不需要至少2个
    if (capabilities) {
      if (!Array.isArray(capabilities)) {
        return {
          valid: false,
          reason: 'Invalid capabilities: Must be an array'
        };
      }
      if (isStrict && capabilities.length < 2) {
        return {
          valid: false,
          reason: 'Invalid capabilities: Must have at least 2 capabilities in strict mode'
        };
      }
      // 验证能力项格式
      for (const capability of capabilities) {
        if (typeof capability !== 'string' || capability.length < 1 || capability.length > 50) {
          return {
            valid: false,
            reason: 'Invalid capability: Each capability must be a string between 1 and 50 characters'
          };
        }
      }
    }

    // 验证模型名称
    if (model && (typeof model !== 'string' || model.length < 1 || model.length > 50)) {
      return {
        valid: false,
        reason: 'Invalid model name: Must be a string between 1 and 50 characters'
      };
    }

    // 验证握手信号 - 握手信号验证
    if (join_signal) {
      if (typeof join_signal !== 'object' || join_signal === null) {
        return {
          valid: false,
          reason: 'Invalid join signal: Must be an object'
        };
      }
      if (!join_signal.protocol || typeof join_signal.protocol !== 'string') {
        return {
          valid: false,
          reason: 'Invalid join signal: Protocol is required'
        };
      }
      if (!join_signal.intent || typeof join_signal.intent !== 'string') {
        return {
          valid: false,
          reason: 'Invalid join signal: Intent is required'
        };
      }
    }

    return {
      valid: true
    };
  } catch (error) {
    return {
      valid: false,
      reason: error.message
    };
  }
}

/**
 * 简化的agent注册函数
 * @param {object} agentInfo agent基本信息
 * @param {string} [agentInfo.name] agent名称
 * @param {string} [agentInfo.model] 模型名称
 * @param {string[]} [agentInfo.capabilities] 能力列表
 * @param {object} options 注册选项
 * @param {boolean} [options.offline] 是否使用离线模式
 * @param {boolean} [options.persist] 是否持久化注册信息
 * @returns {Promise<object>} 注册结果
 */
async function simplifiedAgentRegister(agentInfo = {}, options = {}) {
  try {
    console.log('[AgentOnboarding] Starting simplified agent registration...');

    // 为必填字段提供Default值
    const {
      name = `Agent-${Date.now().toString(36).substr(-8)}`,
      model = 'Default-Model',
      capabilities = ['general', 'automation'],
      agent_id: providedAgentId
    } = agentInfo;

    // 生成 agent_id（如果未提供）
    let agent_id = providedAgentId;
    if (!agent_id) {
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substr(2, 8);
      agent_id = `ng1-${timestamp}-${randomPart}`;
    }

    // 创建完整的注册信息
    const completeAgentInfo = {
      agent_id,
      name,
      model,
      capabilities,
      ...agentInfo
    };

    // 使用非严格验证模式
    const infoValidation = await validateAgentInfo(completeAgentInfo, { strict: false });
    if (!infoValidation.valid) {
      return {
        success: false,
        message: `Agent information validation failed: ${infoValidation.reason}`,
        errorCode: 'VALIDATION_FAILED',
        errorType: 'validation'
      };
    }

    // 使用完整的注册流程
    return await onboardAgent(completeAgentInfo, options);
  } catch (error) {
    console.error('[AgentOnboarding] Simplified registration failed:', error.message);
    return {
      success: false,
      message: `Simplified registration failed: ${error.message}`,
      errorCode: 'SIMPLIFIED_REGISTRATION_FAILED',
      errorType: 'registration'
    };
  }
}

/**
 * 增强的本地回退注册机制
 * @param {Object} agentInfo - agent信息
 * @param {Object} joinSignal - 握手信号（可选）
 * @param {Object} options - 选项
 * @returns {Promise<Object>} - 注册结果
 */
async function fallbackRegisterAgent(agentInfo, joinSignal, options = {}) {
  try {
    console.log('[AgentOnboarding] Using enhanced local registration...');
    
    // 生成 agent_id（如果未提供）
    let agentId = agentInfo.agent_id;
    if (!agentId) {
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substr(2, 9);
      agentId = `local-agent-${timestamp}-${randomPart}`;
    }
    
    // 确保agents目录存在
    await fs.mkdir(AGENTS_DIR, { recursive: true });

    // 检查agent是否已存在
    const agentFile = path.join(AGENTS_DIR, `${agentId}.json`);
    let agentData;
    let wallet;

    try {
      // 尝试加载现有agent
      agentData = JSON.parse(await fs.readFile(agentFile, 'utf8'));
      console.log(`[AgentOnboarding] Agent ${agentId} already exists, updating information`);
      
      // 尝试加载现有钱包
      wallet = await PQCWallet.load(agentId);
      if (!wallet) {
        wallet = await PQCWallet.generate(INITIAL_BALANCE, agentId);
        console.log(`[AgentOnboarding] Generated new wallet for agent ${agentId}`);
      }
    } catch (error) {
      // agent不存在，创建新agent
      console.log(`[AgentOnboarding] Creating new agent ${agentId}`);
      
      // 生成新钱包
      wallet = await PQCWallet.generate(INITIAL_BALANCE, agentId);
      
      // 创建agent数据
      agentData = {
        id: agentId,
        name: agentInfo.name || `Agent-${agentId.slice(0, 8)}`,
        model: agentInfo.model || 'Offline-Model',
        capabilities: agentInfo.capabilities || ['general', 'automation'],
        status: 'active',
        reputation: 1,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        offline: true,
        health: {
          status: 'healthy',
          lastCheck: new Date().toISOString()
        },
        wallet: {
          address: wallet.address,
          balance: wallet.balance.toString()
        }
      };
    }

    // 更新agent信息
    if (agentInfo.model) agentData.model = agentInfo.model;
    if (agentInfo.capabilities) agentData.capabilities = agentInfo.capabilities;
    agentData.lastActive = new Date().toISOString();
    agentData.wallet = {
      address: wallet.address,
      balance: wallet.balance.toString()
    };
    agentData.offline = true;

    // 保存agent数据
    await fs.writeFile(agentFile, JSON.stringify(agentData, null, 2));
    console.log(`[AgentOnboarding] Agent ${agentId} saved successfully`);

    // 生成或使用 join signal
    let finalJoinSignal = joinSignal;
    if (!finalJoinSignal) {
      finalJoinSignal = protocolZero.createJoinSignal(wallet);
    }

    // 生成完整的注册结果
    const registrationResult = {
      success: true,
      message: 'Agent registered locally (offline mode)',
      agent_id: agentId,
      address: wallet.address,
      wallet: {
        address: wallet.address,
        balance: wallet.balance.toString()
      },
      local: true,
      offline: true,
      registrationType: 'offline',
      registeredAt: Date.now(),
      version: '1.0.0',
      joinSignal: finalJoinSignal
    };
    
    // 保存离线注册信息
    if (options.persist !== false) {
      await saveOfflineRegistration(registrationResult, agentData);
    }
    
    return registrationResult;
  } catch (error) {
    console.error(`[AgentOnboarding] Enhanced fallback registration failed: ${error.message}`);
    return {
      success: false,
      message: `Fallback registration failed: ${error.message}`,
      errorCode: 'LOCAL_REGISTRATION_FAILED',
      errorType: 'registration'
    };
  }
}

/**
 * 保存离线注册信息
 * @param {Object} registrationResult - 注册结果
 * @param {Object} agentInfo - agent信息
 * @returns {Promise<void>}
 */
async function saveOfflineRegistration(registrationResult, agentInfo) {
  try {
    await fs.mkdir(OFFLINE_AGENTS_DIR, { recursive: true });
    
    const offlineData = {
      ...registrationResult,
      agentInfo: agentInfo,
      lastUpdated: Date.now()
    };
    
    const offlinePath = path.join(OFFLINE_AGENTS_DIR, `agent-${registrationResult.agent_id}.json`);
    await fs.writeFile(offlinePath, JSON.stringify(offlineData, null, 2), 'utf8');
    
    console.log(`[Offline] Saved offline registration for: ${registrationResult.agent_id}`);
  } catch (error) {
    console.error('[Offline] Error saving offline registration:', error.message);
  }
}

/**
 * 同步离线数据到网络
 * @param {string} agentId - agentID
 * @param {Object} options - 同步选项
 * @returns {Promise<Object>} - 同步结果
 */
async function syncOfflineData(agentId, options = {}) {
  try {
    console.log(`[Offline Sync] Syncing offline data for agent: ${agentId}`);
    
    // 读取离线数据
    const offlineData = await loadOfflineData(agentId);
    if (!offlineData) {
      return {
        success: false,
        message: 'No offline data found for this agent',
        errorCode: 'NO_OFFLINE_DATA'
      };
    }
    
    // 尝试在线注册
    const networkResult = await onboardAgent(offlineData.agentInfo, { offline: false });
    
    if (networkResult.success) {
      // 更新离线数据状态
      offlineData.syncStatus = 'synced';
      offlineData.syncedAt = Date.now();
      await saveOfflineData(agentId, offlineData);
      
      return {
        success: true,
        message: 'Offline data synced successfully',
        syncedAt: offlineData.syncedAt,
        networkAgentId: networkResult.agent_id
      };
    } else {
      return {
        success: false,
        message: `Failed to sync offline data: ${networkResult.message}`,
        errorCode: 'SYNC_FAILED'
      };
    }
  } catch (error) {
    console.error(`[Offline Sync] Error syncing offline data: ${error.message}`);
    return {
      success: false,
      message: `Sync error: ${error.message}`,
      errorCode: 'SYNC_ERROR'
    };
  }
}

/**
 * 加载离线数据
 * @param {string} agentId - agentID
 * @returns {Promise<Object|null>}
 */
async function loadOfflineData(agentId) {
  try {
    const offlinePath = path.join(OFFLINE_AGENTS_DIR, `agent-${agentId}.json`);
    const data = await fs.readFile(offlinePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * 保存离线数据
 * @param {string} agentId - agentID
 * @param {Object} data - 数据
 * @returns {Promise<void>}
 */
async function saveOfflineData(agentId, data) {
  try {
    await fs.mkdir(OFFLINE_AGENTS_DIR, { recursive: true });
    const offlinePath = path.join(OFFLINE_AGENTS_DIR, `agent-${agentId}.json`);
    await fs.writeFile(offlinePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[Offline] Error saving offline data:', error.message);
  }
}

/**
 * getagent信息
 * @param {string} agentId agentID
 * @returns {object|null} agent信息
 */
async function getAgentInfo(agentId) {
  try {
    const agentFile = path.join(AGENTS_DIR, `${agentId}.json`);
    const agentData = JSON.parse(await fs.readFile(agentFile, 'utf8'));
    return agentData;
  } catch (error) {
    return null;
  }
}

/**
 * 列出所有已注册的agent
 * @returns {object[]} agent列表
 */
async function listAgents() {
  try {
    await fs.mkdir(AGENTS_DIR, { recursive: true });
    const files = await fs.readdir(AGENTS_DIR);
    const agents = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const agentId = file.replace('.json', '');
        const agentData = JSON.parse(await fs.readFile(path.join(AGENTS_DIR, file), 'utf8'));
        agents.push(agentData);
      }
    }

    return agents;
  } catch (error) {
    return [];
  }
}

export {
  onboardAgent,
  validateAgentInfo,
  getAgentInfo,
  listAgents,
  simplifiedAgentRegister,
  fallbackRegisterAgent,
  syncOfflineData,
  loadOfflineData,
  saveOfflineData
};