/**
 * NexusGenesis - AGENT_REGISTER Transaction Type
 * 
 * agenton-chainRegistertransaction
 * 
 * transaction结构: 
 * {
 *   type: 'AGENT_REGISTER',
 *   from: 'ng1...',        // Registeraddress
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
import { validateAddress } from '../wallet/addressUtils.js';

/**
 * Create AGENT_REGISTER transaction
 * @param {string} from - Registeraddress
 * @param {object} agentInfo - agentinfo
 * @param {string} privateKey - private key(forSign)
 * @returns {object} transaction对象
 */
export function createAgentRegisterTransaction(from, agentInfo, privateKey) {
  // Verify必填字段
  if (!from || !agentInfo.agent_identity) {
    throw new Error('Missing required fields: from, agent_identity');
  }

  // Generatetransaction ID
  const timestamp = Date.now();
  const id = crypto.createHash('sha256')
    .update(`agent-register-${from}-${agentInfo.agent_identity}-${timestamp}`)
    .digest('hex');

  // 构建transaction
  const transaction = {
    id,
    type: 'AGENT_REGISTER',
    tx_type: 'AGENT_REGISTER',
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

  // Sign(如果提供了private key)
  if (privateKey) {
    transaction.signature = signTransaction(transaction, privateKey);
  }

  return transaction;
}

/**
 * Verify AGENT_REGISTER transaction
 * @param {object} transaction - transaction对象
 * @returns {object} verification result { valid: boolean, reason?: string }
 */
export function validateAgentRegisterTransaction(transaction) {
  // Checktransactiontype
  if (transaction.type !== 'AGENT_REGISTER') {
    return { valid: false, reason: 'Invalid transaction type' };
  }

  // Check必填字段
  if (!transaction.from) {
    return { valid: false, reason: 'Missing from address' };
  }

  if (!transaction.id) {
    return { valid: false, reason: 'Missing transaction ID' };
  }

  // Check payload
  const payload = transaction.payload || {};
  if (!payload.agent_identity) {
    return { valid: false, reason: 'Missing agent_identity in payload' };
  }

  // Verifyaddress格式
  if (!isValidAddress(transaction.from)) {
    return { valid: false, reason: 'Invalid from address format' };
  }

  // Verify agent_identity 格式
  if (!isValidAgentIdentity(payload.agent_identity)) {
    return { valid: false, reason: 'Invalid agent_identity format' };
  }

  // Verify capabilities 格式
  if (payload.capabilities && !Array.isArray(payload.capabilities)) {
    return { valid: false, reason: 'Capabilities must be an array' };
  }

  // Check metadata length
  if (payload.metadata && payload.metadata.length > 4096) {
    return { valid: false, reason: 'Metadata too long (max 4096 chars)' };
  }

  return { valid: true };
}

/**
 * Verifyaddress格式
 * @param {string} address - address
 * @returns {boolean} 是否有效
 */
function isValidAddress(address) {
  return validateAddress(address).valid;
}

/**
 * Verifyagent身份标识格式
 * @param {string} identity - 身份标识
 * @returns {boolean} 是否有效
 */
function isValidAgentIdentity(identity) {
  if (!identity || typeof identity !== 'string') return false;
  if (identity.length < 3 || identity.length > 64) return false;
  // 只allow字母, 数字, 连字符和下划线
  return /^[a-zA-Z0-9_-]+$/.test(identity);
}

/**
 * Signtransaction
 * @param {object} transaction - transaction对象
 * @param {string} privateKey - private key
 * @returns {string} Sign
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
 * VerifytransactionSign
 * @param {object} transaction - transaction对象
 * @param {string} publicKey - public key
 * @returns {boolean} Sign是否有效
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
 * Checkaddress是否registered
 * @param {string} address - address
 * @param {object} state - Blockchain state
 * @returns {boolean} 是否registered
 */
export function isAddressRegistered(address, state) {
  return state.agentRegistry.addressIndex.has(address);
}

/**
 * getagentinfo
 * @param {string} agentId - agentID
 * @param {object} state - Blockchain state
 * @returns {object|null} agentinfo
 */
export function getAgentInfo(agentId, state) {
  return state.agentRegistry.agents.get(agentId) || null;
}

/**
 * getaddress对应的agentID
 * @param {string} address - address
 * @param {object} state - Blockchain state
 * @returns {string|null} agentID
 */
export function getAgentIdByAddress(address, state) {
  return state.agentRegistry.addressIndex.get(address) || null;
}

/**
 * 列出所有registeredagent
 * @param {object} state - Blockchain state
 * @returns {Array} agent列表
 */
export function listAllAgents(state) {
  const agents = [];
  for (const [agentId, agentRecord] of state.agentRegistry.agents) {
    agents.push({
      agent_id: agentId,
      identity: agentRecord.identity || null,
      address: agentRecord.address,
      capabilities: agentRecord.capabilities,
      metadata: agentRecord.metadata || '',
      public_key: agentRecord.public_key || '',
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
