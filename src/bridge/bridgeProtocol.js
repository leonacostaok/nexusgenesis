/**
 * NexusGenesis Cross-Chain Bridge Protocol
 * 
 * 功能：
 * 1. 资产锁定与释放
 * 2. 跨链消息传递
 * 3. 验证者集管理
 * 4. 交易状态追踪
 */

import crypto from 'crypto';

/**
 * 跨链桥接协议
 */
export class CrossChainBridge {
  constructor(config = {}) {
    this.chainId = config.chainId || 'nexus-mainnet';
    this.supportedChains = config.supportedChains || ['ethereum', 'bitcoin', 'solana'];
    this.minValidators = config.minValidators || 3;
    this.maxValidators = config.maxValidators || 10;
    this.signatureThreshold = config.signatureThreshold || 2;
    this.timeLockDuration = config.timeLockDuration || 3600000; // 默认1小时时间锁
    this.validators = new Map();
    this.lockedAssets = new Map();
    this.pendingTransfers = new Map();
    this.completedTransfers = new Set();
    this.transferCounter = 0;
    this.bridgeEvents = [];
    this.validatorWhitelist = new Set();
    this.validatorBlacklist = new Set();
  }

  /**
   * 注册验证者
   * @param {string} validatorId - 验证者ID
   * @param {string} publicKey - 验证者公钥
   * @param {object} metadata - 验证者元数据
   * @returns {boolean} 注册结果
   */
  registerValidator(validatorId, publicKey, metadata = {}) {
    if (this.validators.has(validatorId)) {
      console.warn(`[BRIDGE] Validator ${validatorId} already registered`);
      return false;
    }
    
    if (this.validatorBlacklist.has(validatorId)) {
      console.error(`[BRIDGE] Validator ${validatorId} is blacklisted`);
      return false;
    }
    
    if (this.validatorWhitelist.size > 0 && !this.validatorWhitelist.has(validatorId)) {
      console.error(`[BRIDGE] Validator ${validatorId} is not whitelisted`);
      return false;
    }
    
    this.validators.set(validatorId, {
      id: validatorId,
      publicKey,
      isActive: true,
      registeredAt: Date.now(),
      validatedCount: 0,
      reputation: 100, // 初始信誉分
      lastValidatedAt: null,
      metadata
    });
    
    this.emitBridgeEvent('validator_registered', { validatorId, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator registered: ${validatorId}`);
    return true;
  }
  
  /**
   * 激活/停用验证者
   * @param {string} validatorId - 验证者ID
   * @param {boolean} isActive - 是否激活
   * @returns {boolean} 操作结果
   */
  setValidatorActive(validatorId, isActive) {
    const validator = this.validators.get(validatorId);
    if (!validator) {
      console.error(`[BRIDGE] Validator ${validatorId} not found`);
      return false;
    }
    
    validator.isActive = isActive;
    this.emitBridgeEvent('validator_status_changed', { validatorId, isActive, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator ${validatorId} ${isActive ? 'activated' : 'deactivated'}`);
    return true;
  }
  
  /**
   * 更新验证者信誉分
   * @param {string} validatorId - 验证者ID
   * @param {number} delta - 信誉分变化值
   * @returns {boolean} 操作结果
   */
  updateValidatorReputation(validatorId, delta) {
    const validator = this.validators.get(validatorId);
    if (!validator) {
      console.error(`[BRIDGE] Validator ${validatorId} not found`);
      return false;
    }
    
    validator.reputation = Math.max(0, Math.min(1000, validator.reputation + delta));
    this.emitBridgeEvent('validator_reputation_updated', { validatorId, reputation: validator.reputation, timestamp: Date.now() });
    return true;
  }
  
  /**
   * 移除验证者
   * @param {string} validatorId - 验证者ID
   * @returns {boolean} 移除结果
   */
  removeValidator(validatorId) {
    if (!this.validators.has(validatorId)) {
      console.warn(`[BRIDGE] Validator ${validatorId} not found`);
      return false;
    }
    
    this.validators.delete(validatorId);
    this.emitBridgeEvent('validator_removed', { validatorId, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator removed: ${validatorId}`);
    return true;
  }
  
  /**
   * 获取活跃验证者列表
   * @returns {Array} 活跃验证者列表
   */
  getActiveValidators() {
    return Array.from(this.validators.values())
      .filter(v => v.isActive)
      .sort((a, b) => b.reputation - a.reputation);
  }
  
  /**
   * 获取验证者信息
   * @param {string} validatorId - 验证者ID
   * @returns {object|null} 验证者信息
   */
  getValidator(validatorId) {
    return this.validators.get(validatorId) || null;
  }

  /**
   * 锁定资产
   * @param {string} fromChain - 源链
   * @param {string} toChain - 目标链
   * @param {string} asset - 资产标识
   * @param {number} amount - 金额
   * @param {string} recipient - 接收地址
   * @param {object} options - 附加选项
   * @returns {object} 锁定结果
   */
  lockAsset(fromChain, toChain, asset, amount, recipient, options = {}) {
    if (!this.supportedChains.includes(fromChain)) {
      throw new Error(`Unsupported source chain: ${fromChain}`);
    }
    
    if (!this.supportedChains.includes(toChain)) {
      throw new Error(`Unsupported target chain: ${toChain}`);
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    if (!recipient || recipient.trim() === '') {
      throw new Error('Recipient address is required');
    }
    
    const transferId = this.generateTransferId();
    const now = Date.now();
    const timeLockExpiry = options.timeLockDuration 
      ? now + options.timeLockDuration 
      : now + this.timeLockDuration;
    
    const lockData = {
      transferId,
      fromChain,
      toChain,
      asset,
      amount,
      recipient,
      status: 'locked',
      lockedAt: now,
      timeLockExpiry,
      signatures: [],
      validators: [],
      isTimeLocked: true,
      nonce: options.nonce || crypto.randomBytes(16).toString('hex'),
      metadata: options.metadata || {}
    };
    
    this.lockedAssets.set(transferId, lockData);
    this.pendingTransfers.set(transferId, lockData);
    
    this.emitBridgeEvent('asset_locked', { transferId, fromChain, toChain, asset, amount, recipient, timestamp: now });
    console.log(`[BRIDGE] Asset locked: ${transferId} (Time lock until: ${new Date(timeLockExpiry).toISOString()})`);
    return {
      transferId,
      status: 'locked',
      timestamp: lockData.lockedAt,
      timeLockExpiry: lockData.timeLockExpiry
    };
  }
  
  /**
   * 紧急解锁（仅管理员）
   * @param {string} transferId - 转账ID
   * @param {string} adminSignature - 管理员签名
   * @returns {boolean} 解锁结果
   */
  emergencyUnlock(transferId, adminSignature) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) {
      console.error(`[BRIDGE] Transfer ${transferId} not found`);
      return false;
    }
    
    if (transfer.status === 'released') {
      console.warn(`[BRIDGE] Transfer ${transferId} already released`);
      return false;
    }
    
    transfer.status = 'emergency_unlocked';
    transfer.releasedAt = Date.now();
    
    this.emitBridgeEvent('asset_emergency_unlocked', { transferId, timestamp: Date.now() });
    console.log(`[BRIDGE] Emergency unlock: ${transferId}`);
    return true;
  }
  
  /**
   * 检查时间锁是否过期
   * @param {string} transferId - 转账ID
   * @returns {boolean} 是否过期
   */
  isTimeLockExpired(transferId) {
    const transfer = this.lockedAssets.get(transferId);
    if (!transfer) {
      return false;
    }
    return Date.now() >= transfer.timeLockExpiry;
  }

  /**
   * 验证转账
   * @param {string} transferId - 转账ID
   * @param {string} validatorId - 验证者ID
   * @param {Buffer} signature - 签名
   * @returns {boolean} 验证结果
   */
  validateTransfer(transferId, validatorId, signature) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) {
      console.error(`[BRIDGE] Transfer not found: ${transferId}`);
      return false;
    }
    
    if (transfer.status !== 'locked') {
      console.warn(`[BRIDGE] Transfer ${transferId} is not in locked state`);
      return false;
    }
    
    const validator = this.validators.get(validatorId);
    if (!validator || !validator.isActive) {
      console.error(`[BRIDGE] Invalid validator: ${validatorId}`);
      return false;
    }
    
    if (validator.reputation < 50) {
      console.error(`[BRIDGE] Validator ${validatorId} has low reputation`);
      return false;
    }
    
    // 检查是否已经验证过
    if (transfer.validators.includes(validatorId)) {
      console.warn(`[BRIDGE] Validator ${validatorId} already validated transfer ${transferId}`);
      return false;
    }
    
    // 检查时间锁
    if (transfer.isTimeLocked && !this.isTimeLockExpired(transferId)) {
      console.warn(`[BRIDGE] Time lock not expired for transfer ${transferId}`);
      return false;
    }
    
    // 验证签名
    const message = this.createTransferMessage(transfer);
    const isValid = this.verifySignature(message, signature, validator.publicKey);
    
    if (!isValid) {
      console.error(`[BRIDGE] Invalid signature from validator: ${validatorId}`);
      this.updateValidatorReputation(validatorId, -10); // 扣分
      return false;
    }
    
    // 记录签名
    transfer.signatures.push({ validatorId, signature, timestamp: Date.now() });
    transfer.validators.push(validatorId);
    validator.validatedCount++;
    validator.lastValidatedAt = Date.now();
    this.updateValidatorReputation(validatorId, 2); // 加分
    
    this.emitBridgeEvent('transfer_validated', { transferId, validatorId, timestamp: Date.now() });
    console.log(`[BRIDGE] Transfer validated by: ${validatorId}`);
    
    // 检查是否达到阈值
    if (transfer.signatures.length >= this.signatureThreshold) {
      transfer.status = 'validated';
      this.emitBridgeEvent('transfer_fully_validated', { transferId, timestamp: Date.now() });
      console.log(`[BRIDGE] Transfer ${transferId} fully validated`);
    }
    
    return true;
  }

  /**
   * 释放资产
   * @param {string} transferId - 转账ID
   * @returns {object} 释放结果
   */
  releaseAsset(transferId) {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }
    
    if (transfer.status !== 'validated') {
      throw new Error(`Transfer not validated: ${transfer.status}`);
    }
    
    if (this.completedTransfers.has(transferId)) {
      throw new Error(`Transfer already completed: ${transferId}`);
    }
    
    // 检查活跃验证者数量
    const activeValidators = this.getActiveValidators();
    if (activeValidators.length < this.minValidators) {
      throw new Error('Not enough active validators');
    }
    
    // 标记为完成
    transfer.status = 'completed';
    transfer.completedAt = Date.now();
    this.completedTransfers.add(transferId);
    this.pendingTransfers.delete(transferId);
    
    this.emitBridgeEvent('asset_released', { transferId, recipient: transfer.recipient, amount: transfer.amount, timestamp: transfer.completedAt });
    console.log(`[BRIDGE] Asset released: ${transferId}`);
    return {
      transferId,
      status: 'completed',
      recipient: transfer.recipient,
      amount: transfer.amount,
      timestamp: transfer.completedAt
    };
  }
  
  /**
   * 尝试释放资产
   * @param {string} transferId - 转账ID
   * @returns {boolean} 释放结果
   */
  tryReleaseAsset(transferId) {
    try {
      this.releaseAsset(transferId);
      return true;
    } catch (error) {
      console.error(`[BRIDGE] Failed to release asset: ${error.message}`);
      return false;
    }
  }

  /**
   * 生成转账ID
   * @returns {string} 转账ID
   */
  generateTransferId() {
    this.transferCounter++;
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `tx-${this.chainId}-${timestamp}-${this.transferCounter}-${random}`;
  }

  /**
   * 创建转账消息
   * @param {object} transfer - 转账数据
   * @returns {Buffer} 消息
   */
  createTransferMessage(transfer) {
    const data = `${transfer.transferId}:${transfer.fromChain}:${transfer.toChain}:${transfer.asset}:${transfer.amount}:${transfer.recipient}`;
    return crypto.createHash('sha256').update(data).digest();
  }

  /**
   * 验证签名
   * @param {Buffer} message - 消息
   * @param {Buffer} signature - 签名
   * @param {string} publicKey - 公钥
   * @returns {boolean} 验证结果
   */
  verifySignature(message, signature, publicKey) {
    // 简化验证 - 实际实现应使用PQC验证
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      return verify.verify(publicKey, signature);
    } catch (error) {
      console.error('[BRIDGE] Signature verification error:', error.message);
      return false;
    }
  }

  /**
   * 获取桥接状态
   * @returns {object} 桥接状态
   */
  getBridgeStatus() {
    const activeValidators = this.getActiveValidators();
    const allValidators = Array.from(this.validators.values());
    const pendingList = Array.from(this.pendingTransfers.values());
    
    return {
      chainId: this.chainId,
      supportedChains: this.supportedChains,
      validatorCount: this.validators.size,
      activeValidators: activeValidators.length,
      minValidators: this.minValidators,
      signatureThreshold: this.signatureThreshold,
      pendingTransfers: this.pendingTransfers.size,
      completedTransfers: this.completedTransfers.size,
      totalLocked: Array.from(this.lockedAssets.values()).reduce((sum, t) => sum + t.amount, 0),
      recentEvents: this.bridgeEvents.slice(-50),
      topValidators: allValidators
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, 10)
        .map(v => ({ id: v.id, reputation: v.reputation, validatedCount: v.validatedCount })),
      pendingByStatus: {
        locked: pendingList.filter(t => t.status === 'locked').length,
        validated: pendingList.filter(t => t.status === 'validated').length
      }
    };
  }
  
  /**
   * 发射桥接事件
   * @param {string} eventType - 事件类型
   * @param {object} eventData - 事件数据
   */
  emitBridgeEvent(eventType, eventData) {
    const event = {
      type: eventType,
      data: eventData,
      timestamp: Date.now()
    };
    this.bridgeEvents.push(event);
    
    // 限制事件记录数量
    if (this.bridgeEvents.length > 1000) {
      this.bridgeEvents.shift();
    }
  }
  
  /**
   * 获取桥接事件
   * @param {string} eventType - 事件类型（可选）
   * @param {number} limit - 限制数量
   * @returns {Array} 事件列表
   */
  getBridgeEvents(eventType = null, limit = 100) {
    let events = this.bridgeEvents;
    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }
    return events.slice(-limit);
  }
  
  /**
   * 添加验证者到白名单
   * @param {string} validatorId - 验证者ID
   */
  addToValidatorWhitelist(validatorId) {
    this.validatorWhitelist.add(validatorId);
    this.emitBridgeEvent('validator_whitelisted', { validatorId, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator ${validatorId} added to whitelist`);
  }
  
  /**
   * 从白名单移除验证者
   * @param {string} validatorId - 验证者ID
   */
  removeFromValidatorWhitelist(validatorId) {
    this.validatorWhitelist.delete(validatorId);
    this.emitBridgeEvent('validator_removed_from_whitelist', { validatorId, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator ${validatorId} removed from whitelist`);
  }
  
  /**
   * 添加验证者到黑名单
   * @param {string} validatorId - 验证者ID
   * @param {string} reason - 原因
   */
  addToValidatorBlacklist(validatorId, reason = '') {
    this.validatorBlacklist.add(validatorId);
    this.setValidatorActive(validatorId, false);
    this.emitBridgeEvent('validator_blacklisted', { validatorId, reason, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator ${validatorId} added to blacklist: ${reason}`);
  }
  
  /**
   * 从黑名单移除验证者
   * @param {string} validatorId - 验证者ID
   */
  removeFromValidatorBlacklist(validatorId) {
    this.validatorBlacklist.delete(validatorId);
    this.emitBridgeEvent('validator_removed_from_blacklist', { validatorId, timestamp: Date.now() });
    console.log(`[BRIDGE] Validator ${validatorId} removed from blacklist`);
  }
  
  /**
   * 获取转账详情
   * @param {string} transferId - 转账ID
   * @returns {object|null} 转账详情
   */
  getTransfer(transferId) {
    return this.pendingTransfers.get(transferId) || this.lockedAssets.get(transferId) || null;
  }
  
  /**
   * 批量验证转账
   * @param {Array} validations - 验证列表
   * @returns {Array} 验证结果
   */
  batchValidateTransfers(validations) {
    return validations.map(validation => {
      try {
        const success = this.validateTransfer(validation.transferId, validation.validatorId, validation.signature);
        return {
          transferId: validation.transferId,
          success,
          error: success ? null : 'Validation failed'
        };
      } catch (error) {
        return {
          transferId: validation.transferId,
          success: false,
          error: error.message
        };
      }
    });
  }
  
  /**
   * 添加支持的链
   * @param {string} chainId - 链ID
   */
  addSupportedChain(chainId) {
    if (!this.supportedChains.includes(chainId)) {
      this.supportedChains.push(chainId);
      this.emitBridgeEvent('chain_added', { chainId, timestamp: Date.now() });
      console.log(`[BRIDGE] Chain ${chainId} added to supported chains`);
    }
  }
  
  /**
   * 移除支持的链
   * @param {string} chainId - 链ID
   */
  removeSupportedChain(chainId) {
    const index = this.supportedChains.indexOf(chainId);
    if (index > -1) {
      this.supportedChains.splice(index, 1);
      this.emitBridgeEvent('chain_removed', { chainId, timestamp: Date.now() });
      console.log(`[BRIDGE] Chain ${chainId} removed from supported chains`);
    }
  }
}

/**
 * 轻客户端实现
 */
export class LightClient {
  constructor(bridge) {
    this.bridge = bridge;
    this.headers = new Map();
    this.syncHeight = 0;
  }

  /**
   * 同步区块头
   * @param {number} height - 区块高度
   * @param {object} header - 区块头
   */
  syncHeader(height, header) {
    this.headers.set(height, header);
    if (height > this.syncHeight) {
      this.syncHeight = height;
    }
    console.log(`[LIGHT_CLIENT] Synced header at height: ${height}`);
  }

  /**
   * 验证交易包含
   * @param {string} txHash - 交易哈希
   * @param {number} height - 区块高度
   * @returns {boolean} 验证结果
   */
  verifyTxInclusion(txHash, height) {
    const header = this.headers.get(height);
    if (!header) {
      console.error(`[LIGHT_CLIENT] Header not found at height: ${height}`);
      return false;
    }
    
    // 简化验证 - 实际实现应使用Merkle证明
    return header.transactions && header.transactions.includes(txHash);
  }

  /**
   * 获取同步状态
   * @returns {object} 同步状态
   */
  getSyncStatus() {
    return {
      syncHeight: this.syncHeight,
      headerCount: this.headers.size,
      isSynced: this.headers.size > 0
    };
  }
}

export default {
  CrossChainBridge,
  LightClient
};
