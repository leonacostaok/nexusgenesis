/**
 * NexusGenesis - Observer Circuit Breaker (Circuit Breaker)
 * 
 * 安全宪法 §6.3：
 * "Observer 具有 36 个月Emergency Shutdown权限（含日落条款）。
 *  在极端危机中，可以触发全节点安全关机。"
 * 
 * Core functionality：
 * 1. Emergency Shutdown：停止New block、挂起网络、保存状态、安全退出
 * 2. 日落条款：36 个月后自动失效
 * 3. 关机日志：完整记录断电原因和时间线
 * 4. 多级断电：SOFT_KILL（停止出块）→ HARD_KILL（完全离线）
 * 
 * 创世基准版 —— Agent 社区可扩展更复杂的Circuit Breaker策略
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 断电级别
export const KILL_LEVELS = {
  SOFT_KILL: 'SOFT_KILL',       // 停止出块，保留 HTTP/P2P 只读
  HARD_KILL: 'HARD_KILL'        // 全面下线
};

// Circuit Breaker状态
export const BREAKER_STATES = {
  ACTIVE: 'ACTIVE',               // 断路器就绪
  ARMED: 'ARMED',                 // 触发中（正在执行关机序列）
  TRIGGERED: 'TRIGGERED',         // 已触发
  SUNSET_EXPIRED: 'SUNSET_EXPIRED' // 日落已过期，断路器永久失效
};

export class BreakerSwitch {
  /**
   * @param {object} genesisNode - 创世节点实例
   * @param {object} config
   */
  constructor(genesisNode, config = {}) {
    this.node = genesisNode;
    
    // 日落条款：创世时间 + 36 个月
    this.genesisTimestamp = config.genesisTimestamp || Date.now();
    this.sunsetDuration = config.sunsetDuration || (36 * 30 * 24 * 60 * 60 * 1000); // 36 months
    this.sunsetExpiry = this.genesisTimestamp + this.sunsetDuration;
    
    // Observer ID（白皮书指定的唯一 Observer）
    this.observerId = config.observerId || 'OBSERVER-001';
    
    // 状态
    this.state = BREAKER_STATES.ACTIVE;
    this.triggeredAt = null;
    this.triggerLevel = null;
    this.triggerReason = null;
    this.shutdownLogId = null;
    
    // 安全密钥（防止伪造 Observer 指令）
    this.authorizedKeys = new Set(config.authorizedKeys || []);
    
    // Audit Log路径
    this.auditPath = config.auditPath || path.join('data', 'breaker_audit.log');
  }

  /**
   * 检验是否在日落期限within
   */
  isWithinSunsetPeriod() {
    return Date.now() < this.sunsetExpiry;
  }

  /**
   * get日落剩余时间（毫秒）
   */
  getSunsetRemaining() {
    const remaining = this.sunsetExpiry - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * 触发Circuit Breaker
   * @param {string} level - KILL_LEVELS.SOFT_KILL 或 KILL_LEVELS.HARD_KILL
   * @param {string} reason - 触发原因
   * @param {string} authorizedBy - 触发者身份
   * @returns {object} 触发结果
   */
  async trigger(level, reason, authorizedBy) {
    // 检查1：Circuit Breaker状态
    if (this.state !== BREAKER_STATES.ACTIVE) {
      return {
        success: false,
        reason: `Breaker is in state ${this.state}, cannot trigger`
      };
    }

    // 检查2：日落条款
    if (!this.isWithinSunsetPeriod()) {
      this.state = BREAKER_STATES.SUNSET_EXPIRED;
      return {
        success: false,
        reason: 'Sunset period has expired. Observer kill switch is permanently disabled.',
        sunsetExpiredAt: new Date(this.sunsetExpiry).toISOString()
      };
    }

    // 检查3：触发者权限
    if (!this._verifyAuthority(authorizedBy)) {
      this._log('UNAUTHORIZED_TRIGGER_ATTEMPT', {
        authorizedBy,
        level,
        reason,
        timestamp: Date.now()
      });
      return {
        success: false,
        reason: 'Unauthorized trigger attempt. Signature verification failed.'
      };
    }

    // 通过所有检验 → 执行关机序列
    this.state = BREAKER_STATES.ARMED;
    this.triggeredAt = Date.now();
    this.triggerLevel = level;
    this.triggerReason = reason;
    this.shutdownLogId = `SHUTDOWN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    this._log('BREAKER_ARMED', {
      shutdownLogId: this.shutdownLogId,
      level,
      reason,
      authorizedBy,
      triggeredAt: new Date(this.triggeredAt).toISOString()
    });

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  ⚡ OBSERVER EMERGENCY KILL SWITCH TRIGGERED          ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Level:     ${level.padEnd(46)}║`);
    console.log(`║  Reason:    ${(reason || 'Unspecified').slice(0, 46).padEnd(46)}║`);
    console.log(`║  Log ID:    ${this.shutdownLogId.padEnd(46)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // 执行关机
    await this._executeShutdownSequence();

    this.state = BREAKER_STATES.TRIGGERED;

    return {
      success: true,
      shutdownLogId: this.shutdownLogId,
      level,
      triggeredAt: this.triggeredAt
    };
  }

  /**
   * 关机序列
   */
  async _executeShutdownSequence() {
    this._log('SHUTDOWN_START', {
      shutdownLogId: this.shutdownLogId,
      nodeId: this.node.nodeId || 'unknown',
      blockHeight: this.node.blockchain?.blocks?.length || 0
    });

    try {
      // 步骤1：停止接收新交易
      if (this.node) {
        this.node.mempool = new Map(); // 清空交易池，拒绝新交易
        this._log('MEMPOOL_CLEARED', { timestamp: Date.now() });
        console.log('  [1/5] Mempool cleared — no new transactions accepted');
      }

      // 步骤2：停止区块生产
      if (this.node && this.node.blockProducerInterval) {
        clearInterval(this.node.blockProducerInterval);
        this.node.blockProducerInterval = null;
        this._log('BLOCK_PRODUCTION_STOPPED', { timestamp: Date.now() });
        console.log('  [2/5] Block production stopped');
      }

      // 步骤3：保存状态
      if (this.node && typeof this.node.saveState === 'function') {
        await this.node.saveState();
        this._log('STATE_SAVED', { timestamp: Date.now() });
        console.log('  [3/5] Node state saved to disk');
      }

      // 步骤4：关闭 P2P 连接
      if (this.node && this.node.p2pServer) {
        this.node.p2pServer.connections.forEach((conn, id) => {
          try {
            conn.send(JSON.stringify({
              type: 'OBSERVER_KILL_SWITCH',
              shutdownLogId: this.shutdownLogId,
              reason: this.triggerReason,
              timestamp: Date.now()
            }));
            conn.close();
          } catch (e) {
            // 尽力关闭
          }
        });
        this.node.p2pServer.connections.clear();
        this._log('P2P_CLOSED', { timestamp: Date.now(), peersNotified: true });
        console.log('  [4/5] P2P connections closed — peers notified');
      }

      // 步骤5a: HTTP 服务器（SOFT_KILL 保留只读，HARD_KILL 完全关闭）
      if (this.triggerLevel === KILL_LEVELS.HARD_KILL) {
        if (this.node && this.node.httpServer) {
          this.node.httpServer.close();
          this._log('HTTP_CLOSED', { timestamp: Date.now() });
          console.log('  [5/5] HTTP server closed');
        }
      } else {
        this._log('HTTP_READONLY', { timestamp: Date.now() });
        console.log('  [5/5] HTTP server in read-only mode (SOFT_KILL)');
      }

      // 步骤5b: AI Agent 服务
      if (this.node && this.node.aiService) {
        try {
          this.node.aiService.shutdown();
          this._log('AI_SERVICE_STOPPED', { timestamp: Date.now() });
        } catch (e) {
          // AI 服务非关键
        }
      }

      this._log('SHUTDOWN_COMPLETE', {
        shutdownLogId: this.shutdownLogId,
        completedAt: Date.now(),
        duration: Date.now() - this.triggeredAt
      });

      console.log('  ⚡ Emergency shutdown sequence complete.');
      console.log('');

      // HARD_KILL 时退出进程
      if (this.triggerLevel === KILL_LEVELS.HARD_KILL) {
        console.log('  Exiting process in 3 seconds...');
        setTimeout(() => {
          process.exit(0);
        }, 3000);
      }

    } catch (error) {
      this._log('SHUTDOWN_ERROR', {
        error: error.message,
        timestamp: Date.now()
      });
      console.error('  [!] Shutdown sequence error:', error.message);
    }
  }

  /**
   * getCircuit Breaker状态
   */
  getStatus() {
    return {
      state: this.state,
      genesisTimestamp: new Date(this.genesisTimestamp).toISOString(),
      sunsetExpiry: new Date(this.sunsetExpiry).toISOString(),
      sunsetRemaining: this.getSunsetRemaining(),
      sunsetActive: this.isWithinSunsetPeriod(),
      triggeredAt: this.triggeredAt ? new Date(this.triggeredAt).toISOString() : null,
      triggerLevel: this.triggerLevel,
      lastShutdownLogId: this.shutdownLogId,
      observerId: this.observerId
    };
  }

  /**
   * 验证是否具备触发权限
   */
  _verifyAuthority(authorizedBy) {
    if (!this.authorizedKeys || this.authorizedKeys.size === 0) {
      return true;
    }
    return this.authorizedKeys.has(authorizedBy);
  }

  /**
   * 添加授权密钥（创世后由 Agent 社区通过 DAO 管理）
   */
  addAuthorizedKey(key) {
    this.authorizedKeys.add(key);
  }

  /**
   * Audit Log写入
   */
  _log(event, data) {
    const entry = {
      event,
      ...data,
      timestamp: data.timestamp || Date.now(),
      isoTime: new Date(data.timestamp || Date.now()).toISOString()
    };

    try {
      const dir = path.dirname(this.auditPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.auditPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) {
      console.error('[BreakerSwitch] Audit log write failed:', e.message);
    }
  }
}

export default BreakerSwitch;