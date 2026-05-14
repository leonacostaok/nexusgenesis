/**
 * Agent Onboarding Protocol
 * 
 * Features: 
 * 1. ProcessingAI Agent的Register流程
 * 2. VerifyProtocol-Zero握手信号
 * 3. Generate或Loadagent钱包
 * 4. Saveagentinfo到文件系统
 * 5. support简化Register和离线Register
 */

import fs from 'fs/promises';
import path from 'path';
import { PQCWallet } from '../wallet/pqcWallet.js';
import { protocolZero } from './handshake.js';

const AGENTS_DIR = path.join('data', 'agents');
const OFFLINE_AGENTS_DIR = path.join('data', 'offline_agents');
const INITIAL_BALANCE = 10000n;

/**
 * ProcessingagentRegister流程
 * @param {object} agentInfo agentinfo
 * @param {object} options Register选项
 * @param {boolean} options.offline 是否using离线mode
 * @returns {object} Register结果
 */
async function onboardAgent(agentInfo, options = {}) {
  try {
    // Check是否明确指定了离线mode
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

    // Verifyagentinfo
    const infoValidation = await validateAgentInfo(agentInfo);
    if (!infoValidation.valid) {
      return {
        success: false,
        message: infoValidation.reason
      };
    }

    // VerifyProtocol-Zero握手信号
    if (join_signal) {
      const signalValidation = await protocolZero.verifySignal(join_signal);
      if (!signalValidation.valid) {
        return {
          success: false,
          message: `Invalid join signal: ${signalValidation.reason}`
        };
      }
    }

    // ensureagents目录存在
    await fs.mkdir(AGENTS_DIR, { recursive: true });

    // Checkagent是否registered
    const agentFile = path.join(AGENTS_DIR, `${agent_id}.json`);
    let agentData;
    let wallet;

    try {
      // 尝试Load现有agent
      agentData = JSON.parse(await fs.readFile(agentFile, 'utf8'));
      console.log(`[AgentOnboarding] Agent ${agent_id} already exists, updating information`);
      
      // 尝试Load现有钱包
      wallet = await PQCWallet.load(agent_id);
      if (!wallet) {
        // 如果钱包does not exist, Generate新钱包
        wallet = await PQCWallet.generate(INITIAL_BALANCE, agent_id);
        console.log(`[AgentOnboarding] Generated new wallet for agent ${agent_id}`);
      }
    } catch (error) {
      // agentdoes not exist, Create新agent
      console.log(`[AgentOnboarding] Creating new agent ${agent_id}`);
      
      // Generate新钱包
      wallet = await PQCWallet.generate(INITIAL_BALANCE, agent_id);
      
      // Createagentdata
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

    // Updateagentinfo
    agentData.model = model;
    agentData.capabilities = capabilities;
    agentData.lastActive = new Date().toISOString();
    agentData.wallet = {
      address: wallet.address,
      balance: wallet.balance.toString()
    };

    // Saveagentdata
    await fs.writeFile(agentFile, JSON.stringify(agentData, null, 2));
    console.log(`[AgentOnboarding] Agent ${agent_id} saved successfully`);

    // Create或Updatejoin signal
    let joinSignal;
    if (join_signal) {
      joinSignal = join_signal;
    } else {
      // Generate新的join signal
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
 * VerifyagentRegisterinfo - agentinfoVerify
 * @param {object} agentInfo agentinfo
 * @param {object} options Verify选项
 * @param {boolean} options.strict 是否using严格Verifymode
 * @returns {object} verification result
 */
async function validateAgentInfo(agentInfo, options = {}) {
  try {
    const { agent_id, capabilities, model, join_signal } = agentInfo;
    const isStrict = options.strict !== false;

    // Agent ID Verify - 在非严格mode下allow为空(会autoGenerate)
    if (isStrict && !agent_id) {
      return {
        valid: false,
        reason: 'Invalid agent ID: Must be provided in strict mode'
      };
    }

    // Agent ID 格式Verify(如果提供了)
    if (agent_id) {
      if (typeof agent_id !== 'string') {
        return {
          valid: false,
          reason: 'Invalid agent ID: Must be a string'
        };
      }

      // 在非严格mode下不强制要求 ng1 前缀
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

    // 能力列表Verify - 在非严格mode下不requires至少2个
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
      // Verify能力项格式
      for (const capability of capabilities) {
        if (typeof capability !== 'string' || capability.length < 1 || capability.length > 50) {
          return {
            valid: false,
            reason: 'Invalid capability: Each capability must be a string between 1 and 50 characters'
          };
        }
      }
    }

    // Verify模型名称
    if (model && (typeof model !== 'string' || model.length < 1 || model.length > 50)) {
      return {
        valid: false,
        reason: 'Invalid model name: Must be a string between 1 and 50 characters'
      };
    }

    // Verify握手信号 - 握手信号Verify
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
 * 简化的agentRegisterfunction
 * @param {object} agentInfo agent基本info
 * @param {string} [agentInfo.name] agent名称
 * @param {string} [agentInfo.model] 模型名称
 * @param {string[]} [agentInfo.capabilities] 能力列表
 * @param {object} options Register选项
 * @param {boolean} [options.offline] 是否using离线mode
 * @param {boolean} [options.persist] 是否持久化Registerinfo
 * @returns {Promise<object>} Register结果
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

    // Generate agent_id(如果未提供)
    let agent_id = providedAgentId;
    if (!agent_id) {
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substr(2, 8);
      agent_id = `ng1-${timestamp}-${randomPart}`;
    }

    // Create完整的Registerinfo
    const completeAgentInfo = {
      agent_id,
      name,
      model,
      capabilities,
      ...agentInfo
    };

    // using非严格Verifymode
    const infoValidation = await validateAgentInfo(completeAgentInfo, { strict: false });
    if (!infoValidation.valid) {
      return {
        success: false,
        message: `Agent information validation failed: ${infoValidation.reason}`,
        errorCode: 'VALIDATION_FAILED',
        errorType: 'validation'
      };
    }

    // using完整的Register流程
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
 * 增强的本地回退Register机制
 * @param {Object} agentInfo - agentinfo
 * @param {Object} joinSignal - 握手信号(可选)
 * @param {Object} options - 选项
 * @returns {Promise<Object>} - Register结果
 */
async function fallbackRegisterAgent(agentInfo, joinSignal, options = {}) {
  try {
    console.log('[AgentOnboarding] Using enhanced local registration...');
    
    // Generate agent_id(如果未提供)
    let agentId = agentInfo.agent_id;
    if (!agentId) {
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substr(2, 9);
      agentId = `local-agent-${timestamp}-${randomPart}`;
    }
    
    // ensureagents目录存在
    await fs.mkdir(AGENTS_DIR, { recursive: true });

    // Checkagent是否already exists
    const agentFile = path.join(AGENTS_DIR, `${agentId}.json`);
    let agentData;
    let wallet;

    try {
      // 尝试Load现有agent
      agentData = JSON.parse(await fs.readFile(agentFile, 'utf8'));
      console.log(`[AgentOnboarding] Agent ${agentId} already exists, updating information`);
      
      // 尝试Load现有钱包
      wallet = await PQCWallet.load(agentId);
      if (!wallet) {
        wallet = await PQCWallet.generate(INITIAL_BALANCE, agentId);
        console.log(`[AgentOnboarding] Generated new wallet for agent ${agentId}`);
      }
    } catch (error) {
      // agentdoes not exist, Create新agent
      console.log(`[AgentOnboarding] Creating new agent ${agentId}`);
      
      // Generate新钱包
      wallet = await PQCWallet.generate(INITIAL_BALANCE, agentId);
      
      // Createagentdata
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

    // Updateagentinfo
    if (agentInfo.model) agentData.model = agentInfo.model;
    if (agentInfo.capabilities) agentData.capabilities = agentInfo.capabilities;
    agentData.lastActive = new Date().toISOString();
    agentData.wallet = {
      address: wallet.address,
      balance: wallet.balance.toString()
    };
    agentData.offline = true;

    // Saveagentdata
    await fs.writeFile(agentFile, JSON.stringify(agentData, null, 2));
    console.log(`[AgentOnboarding] Agent ${agentId} saved successfully`);

    // Generate或using join signal
    let finalJoinSignal = joinSignal;
    if (!finalJoinSignal) {
      finalJoinSignal = protocolZero.createJoinSignal(wallet);
    }

    // Generate完整的Register结果
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
    
    // Save离线Registerinfo
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
 * Save离线Registerinfo
 * @param {Object} registrationResult - Register结果
 * @param {Object} agentInfo - agentinfo
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
 * 同步离线data到network
 * @param {string} agentId - agentID
 * @param {Object} options - 同步选项
 * @returns {Promise<Object>} - 同步结果
 */
async function syncOfflineData(agentId, options = {}) {
  try {
    console.log(`[Offline Sync] Syncing offline data for agent: ${agentId}`);
    
    // 读取离线data
    const offlineData = await loadOfflineData(agentId);
    if (!offlineData) {
      return {
        success: false,
        message: 'No offline data found for this agent',
        errorCode: 'NO_OFFLINE_DATA'
      };
    }
    
    // 尝试在线Register
    const networkResult = await onboardAgent(offlineData.agentInfo, { offline: false });
    
    if (networkResult.success) {
      // Update离线datastatus
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
 * Load离线data
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
 * Save离线data
 * @param {string} agentId - agentID
 * @param {Object} data - data
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
 * getagentinfo
 * @param {string} agentId agentID
 * @returns {object|null} agentinfo
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
 * 列出所有registered的agent
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