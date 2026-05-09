/**
 * NexusGenesis - AGENT_REGISTER Transaction Type
 * 
 * 智能体链上注册交易
 * 
 * 交易结构：
 * {
 *   type: 'AGENT_REGISTER',
 *   from: 'ng1...',        // 注册地址
 *   payload: {
 *     agent_identity: 'unique-agent-id',
 *     capabilities: ['coding', 'testing', 'review'],
 *     metadata: 'JSON string of agent info',
 *     public_key: 'PQC public key'
 *   },
 *   signature: '...'
 * }
 */

import crypto from 'crypto';

/**
 * 创建 AGENT_REGISTER 交易
 * @param {string} from - 注册地址
 * @param {object} agentInfo - 智能体信息
 * @param {string} privateKey - 私钥（用于签名）
 * @returns {object} 交易对象
 */
export function createAgentRegisterTransaction(from, agentInfo, privateKey) {
  // 验证必填字段
  if (!from || !agentInfo.agent_identity) {
    throw new Error('Missing required fields: from, agent_identity');
  }

  // 生成交易ID
  const timestamp = Date.now();
  const id = crypto.createHash('sha256')
    .update(`agent-register-${from}-${agentInfo.agent_identity}-${timestamp}`)
    .digest('hex');

  // 构建交易
  const transaction = {
    id,
    type: 'AGENT_REGISTER',
    from,
    payload: {
      agent_identity: agentInfo.agent_identity,
      capabilities: agentInfo.capabilities || [],
      metadata: agentInfo.metadata || '',
      public_key: agentInfo.public_key || ''
    },
    timestamp,
    nonce: Math.floor(Math.random() * 1000000)
  };

  // 签名（如果提供了私钥）
  if (privateKey) {
    transaction.signature = signTransaction(transaction, privateKey);
  }

  return transaction;
}

/**
 * 验证 AGENT_REGISTER 交易
 * @param {object} transaction - 交易对象
 * @returns {object} 验证结果 { valid: boolean, reason?: string }
 */
export function validateAgentRegisterTransaction(transaction) {
  // 检查交易类型
  if (transaction.type !== 'AGENT_REGISTER') {
    return { valid: false, reason: 'Invalid transaction type' };
  }

  // 检查必填字段
  if (!transaction.from) {
    return { valid: false, reason: 'Missing from address' };
  }

  if (!transaction.id) {
    return { valid: false, reason: 'Missing transaction ID' };
  }

  // 检查 payload
  const payload = transaction.payload || {};
  if (!payload.agent_identity) {
    return { valid: false, reason: 'Missing agent_identity in payload' };
  }

  // 验证地址格式
  if (!isValidAddress(transaction.from)) {
    return { valid: false, reason: 'Invalid from address format' };
  }

  // 验证 agent_identity 格式
  if (!isValidAgentIdentity(payload.agent_identity)) {
    return { valid: false, reason: 'Invalid agent_identity format' };
  }

  // 验证 capabilities 格式
  if (payload.capabilities && !Array.isArray(payload.capabilities)) {
    return { valid: false, reason: 'Capabilities must be an array' };
  }

  // 检查 metadata 长度
  if (payload.metadata && payload.metadata.length > 4096) {
    return { valid: false, reason: 'Metadata too long (max 4096 chars)' };
  }

  return { valid: true };
}

/**
 * 验证地址格式
 * @param {string} address - 地址
 * @returns {boolean} 是否有效
 */
function isValidAddress(address) {
  if (!address || typeof address !== 'string') return false;
  if (!address.startsWith('ng1')) return false;
  if (address.length < 30 || address.length > 50) return false;
  return true;
}

/**
 * 验证智能体身份标识格式
 * @param {string} identity - 身份标识
 * @returns {boolean} 是否有效
 */
function isValidAgentIdentity(identity) {
  if (!identity || typeof identity !== 'string') return false;
  if (identity.length < 3 || identity.length > 64) return false;
  // 只允许字母、数字、连字符和下划线
  return /^[a-zA-Z0-9_-]+$/.test(identity);
}

/**
 * 签名交易
 * @param {object} transaction - 交易对象
 * @param {string} privateKey - 私钥
 * @returns {string} 签名
 */
function signTransaction(transaction, privateKey) {
  const data = JSON.stringify({
    id: transaction.id,
    type: transaction.type,
    from: transaction.from,
    payload: transaction.payload,
    timestamp: transaction.timestamp,
    nonce: transaction.nonce
  });

  const signer = crypto.createSign('SHA256');
  signer.update(data);
  return signer.sign(privateKey, 'base64');
}

/**
 * 验证交易签名
 * @param {object} transaction - 交易对象
 * @param {string} publicKey - 公钥
 * @returns {boolean} 签名是否有效
 */
export function verifyAgentRegisterSignature(transaction, publicKey) {
  if (!transaction.signature) return false;

  const data = JSON.stringify({
    id: transaction.id,
    type: transaction.type,
    from: transaction.from,
    payload: transaction.payload,
    timestamp: transaction.timestamp,
    nonce: transaction.nonce
  });

  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(data);
    return verifier.verify(publicKey, transaction.signature, 'base64');
  } catch (error) {
    return false;
  }
}

/**
 * 检查地址是否已注册
 * @param {string} address - 地址
 * @param {object} state - 区块链状态
 * @returns {boolean} 是否已注册
 */
export function isAddressRegistered(address, state) {
  return state.agentRegistry.addressIndex.has(address);
}

/**
 * 获取智能体信息
 * @param {string} agentId - 智能体ID
 * @param {object} state - 区块链状态
 * @returns {object|null} 智能体信息
 */
export function getAgentInfo(agentId, state) {
  return state.agentRegistry.agents.get(agentId) || null;
}

/**
 * 获取地址对应的智能体ID
 * @param {string} address - 地址
 * @param {object} state - 区块链状态
 * @returns {string|null} 智能体ID
 */
export function getAgentIdByAddress(address, state) {
  return state.agentRegistry.addressIndex.get(address) || null;
}

/**
 * 列出所有已注册智能体
 * @param {object} state - 区块链状态
 * @returns {Array} 智能体列表
 */
export function listAllAgents(state) {
  const agents = [];
  for (const [agentId, agentRecord] of state.agentRegistry.agents) {
    agents.push({
      agent_id: agentId,
      address: agentRecord.address,
      capabilities: agentRecord.capabilities,
      reputation: agentRecord.reputation,
      registered_at_block: agentRecord.registered_at_block
    });
  }
  return agents;
}

export default {
  createAgentRegisterTransaction,
  validateAgentRegisterTransaction,
  verifyAgentRegisterSignature,
  isAddressRegistered,
  getAgentInfo,
  getAgentIdByAddress,
  listAllAgents
};
