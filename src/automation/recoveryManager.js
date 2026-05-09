/**
 * NexusGenesis - 自动故障恢复管理器
 * 提供节点健康检测、自动恢复、状态修复和降级管理
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECOVERY_STATES = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  RECOVERING: 'recovering',
  CRITICAL: 'critical',
  OFFLINE: 'offline'
};

const FAILURE_TYPES = {
  NODE_CRASH: 'node_crash',
  CONSENSUS_FAILURE: 'consensus_failure',
  MEMPOOL_CORRUPTION: 'mempool_corruption',
  STATE_INCONSISTENCY: 'state_inconsistency',
  P2P_DISCONNECT: 'p2p_disconnect',
  BLOCK_SYNC_FAILURE: 'block_sync_failure',
  RESOURCE_EXHAUSTION: 'resource_exhaustion',
  TRANSACTION_BACKLOG: 'transaction_backlog'
};

const RECOVERY_STRATEGIES = {
  RESTART: 'restart',
  ROLLBACK: 'rollback',
  RESYNC: 'resync',
  REPAIR: 'repair',
  DEGRADE: 'degrade',
  ESCALATE: 'escalate',
  RETRY: 'retry'
};

class RecoveryManager {
  constructor(nodeRef = null) {
    this.nodeRef = nodeRef;
    this.state = RECOVERY_STATES.HEALTHY;
    this.failureHistory = [];
    this.recoveryAttempts = new Map();
    this.lastHealthCheck = Date.now();
    this.recoveryInProgress = false;
    this.recoveryLock = false;

    this.config = {
      healthCheckInterval: 10000,
      maxRecoveryAttempts: 5,
      recoveryBackoffBase: 2000,
      maxRecoveryBackoff: 60000,
      stateSnapshotInterval: 60000,
      degradedThreshold: 2,
      criticalThreshold: 5,
      recoveryCooldown: 30000,
      mempoolMaxAge: 3600000,
      minPeersForHealth: 2
    };

    this.snapshots = [];
    this.maxSnapshots = 5;

    this._startHealthLoop();
    this._startSnapshotLoop();
  }

  attachNode(nodeRef) {
    this.nodeRef = nodeRef;
  }

  _startHealthLoop() {
    this._healthTimer = setInterval(() => {
      this._checkHealth();
    }, this.config.healthCheckInterval);
  }

  _startSnapshotLoop() {
    this._snapshotTimer = setInterval(() => {
      this._createSnapshot();
    }, this.config.stateSnapshotInterval);
  }

  async _createSnapshot() {
    try {
      if (!this.nodeRef) return;
      const snapshot = {
        timestamp: Date.now(),
        state: this.state,
        blockHeight: this.nodeRef.blockchain?.length || 0,
        peerCount: this.nodeRef.peers?.size || 0,
        mempoolSize: this.nodeRef.mempool?.size || 0,
        status: this.nodeRef.status
      };
      this.snapshots.push(snapshot);
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }
      await this._persistSnapshot(snapshot);
    } catch (e) {
      // 快照失败不阻塞
    }
  }

  async _persistSnapshot(snapshot) {
    try {
      const dir = path.join(__dirname, '../../data/recovery');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `snapshot-${snapshot.timestamp}.json`);
      await fs.writeFile(file, JSON.stringify(snapshot, null, 2));
    } catch (e) {
      // 静默失败
    }
  }

  async _checkHealth() {
    if (this.recoveryLock) return;
    this.lastHealthCheck = Date.now();

    try {
      if (!this.nodeRef) {
        this._transitionState(RECOVERY_STATES.OFFLINE);
        return;
      }

      const issues = this._detectIssues();
      if (issues.length === 0) {
        if (this.state !== RECOVERY_STATES.HEALTHY) {
          this._transitionState(RECOVERY_STATES.HEALTHY);
        }
        return;
      }

      const severity = Math.max(...issues.map(i => i.severity));
      if (severity >= 3) {
        this._transitionState(RECOVERY_STATES.CRITICAL);
        await this._executeRecovery(FAILURE_TYPES.NODE_CRASH, issues);
      } else if (severity >= 2) {
        this._transitionState(RECOVERY_STATES.DEGRADED);
        await this._executeRecovery(issues[0].type, issues);
      }
    } catch (e) {
      console.error('[RecoveryManager] Health check failed:', e.message);
    }
  }

  _detectIssues() {
    const issues = [];
    const node = this.nodeRef;
    if (!node) return issues;

    if (node.status === 'OFFLINE' || node.status === 'ERROR') {
      issues.push({ type: FAILURE_TYPES.NODE_CRASH, severity: 3, detail: `Node status: ${node.status}` });
    }

    if (node.peers && node.peers.size < this.config.minPeersForHealth) {
      issues.push({ type: FAILURE_TYPES.P2P_DISCONNECT, severity: 2, detail: `Peers: ${node.peers?.size || 0}` });
    }

    if (node.mempool && node.mempool.size > 5000) {
      issues.push({ type: FAILURE_TYPES.TRANSACTION_BACKLOG, severity: 1, detail: `Mempool: ${node.mempool.size}` });
    }

    const blockHeight = node.blockchain?.length || 0;
    if (blockHeight === 0 && node.status !== 'INITIALIZING') {
      issues.push({ type: FAILURE_TYPES.BLOCK_SYNC_FAILURE, severity: 3, detail: 'Blockchain empty' });
    }

    return issues;
  }

  _transitionState(newState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this._logEvent('state_transition', { from: oldState, to: newState });
    console.log(`[RecoveryManager] State: ${oldState} -> ${newState}`);
  }

  async _executeRecovery(failureType, issues) {
    if (this.recoveryLock) {
      console.log('[RecoveryManager] Recovery already in progress, queuing...');
      return;
    }

    const attempts = (this.recoveryAttempts.get(failureType) || 0) + 1;
    this.recoveryAttempts.set(failureType, attempts);

    if (attempts > this.config.maxRecoveryAttempts) {
      console.log(`[RecoveryManager] Max recovery attempts (${this.config.maxRecoveryAttempts}) reached for ${failureType}, escalating...`);
      this._transitionState(RECOVERY_STATES.CRITICAL);
      await this._escalate(failureType, issues);
      return;
    }

    this.recoveryLock = true;
    this._transitionState(RECOVERY_STATES.RECOVERING);
    const startTime = Date.now();

    try {
      this._logEvent('recovery_start', { failureType, attempt: attempts, issues });
      await this._applyStrategy(failureType);

      this.failureHistory.push({
        type: failureType,
        timestamp: Date.now(),
        recovered: true,
        duration: Date.now() - startTime,
        attempt: attempts
      });

      // 冷却期后重置尝试计数
      setTimeout(() => {
        this.recoveryAttempts.delete(failureType);
      }, this.config.recoveryCooldown);

      console.log(`[RecoveryManager] Recovery successful for ${failureType} (attempt ${attempts}, ${Date.now() - startTime}ms)`);
    } catch (error) {
      console.error(`[RecoveryManager] Recovery failed for ${failureType}:`, error.message);
      this.failureHistory.push({
        type: failureType,
        timestamp: Date.now(),
        recovered: false,
        error: error.message
      });
    } finally {
      this.recoveryLock = false;
      setTimeout(() => this._checkHealth(), 5000);
    }
  }

  async _applyStrategy(failureType) {
    switch (failureType) {
      case FAILURE_TYPES.NODE_CRASH:
        return await this._recoverFromCrash();
      case FAILURE_TYPES.CONSENSUS_FAILURE:
        return await this._recoverConsensus();
      case FAILURE_TYPES.MEMPOOL_CORRUPTION:
        return await this._repairMempool();
      case FAILURE_TYPES.STATE_INCONSISTENCY:
        return await this._rollbackState();
      case FAILURE_TYPES.P2P_DISCONNECT:
        return await this._reconnectPeers();
      case FAILURE_TYPES.BLOCK_SYNC_FAILURE:
        return await this._resyncBlocks();
      case FAILURE_TYPES.RESOURCE_EXHAUSTION:
        return await this._releaseResources();
      case FAILURE_TYPES.TRANSACTION_BACKLOG:
        return await this._drainMempool();
      default:
        return await this._genericRecovery();
    }
  }

  async _recoverFromCrash() {
    const node = this.nodeRef;
    if (!node) return;

    console.log('[RecoveryManager] Attempting crash recovery...');
    node.status = 'RECOVERING';

    try {
      // 加载之前保存的状态
      const loaded = await node.loadState();
      if (loaded) {
        console.log('[RecoveryManager] Node state restored from backup');
      }

      // 加载区块链
      await node.loadBlockchain();
      console.log('[RecoveryManager] Blockchain loaded, height:', node.blockchain?.length);

      // 重新初始化共识
      if (node.initializeConsensus) {
        node.initializeConsensus();
        console.log('[RecoveryManager] Consensus reinitialized');
      }

      node.status = 'ONLINE';
      this._transitionState(RECOVERY_STATES.HEALTHY);
    } catch (e) {
      node.status = 'ERROR';
      throw e;
    }
  }

  async _recoverConsensus() {
    const node = this.nodeRef;
    if (!node) return;

    console.log('[RecoveryManager] Attempting consensus recovery...');

    // 回滚到上一个已确认的区块
    const lastConfirmed = this.failureHistory
      .filter(h => h.type === 'block_confirmed')
      .slice(-1)[0];

    if (lastConfirmed && node.blockchain) {
      const rollbackHeight = lastConfirmed.height || node.blockchain.length - 1;
      node.blockchain = node.blockchain.slice(0, rollbackHeight);
      console.log(`[RecoveryManager] Rolled back blockchain to height ${rollbackHeight}`);
    }

    // 重置共识状态
    if (node.initializeConsensus) {
      node.initializeConsensus();
    }
  }

  async _repairMempool() {
    const node = this.nodeRef;
    if (!node) return;

    console.log('[RecoveryManager] Repairing mempool...');
    const now = Date.now();
    let removed = 0;

    const entries = Array.from(node.mempool?.entries() || []);
    for (const [txId, tx] of entries) {
      // 移除过期交易
      if (tx.timestamp && (now - tx.timestamp) > this.config.mempoolMaxAge) {
        node.mempool.delete(txId);
        removed++;
      }
      // 移除零手续费的交易（可能是垃圾）
      if (tx.fee === '0' || tx.fee === 0n) {
        node.mempool.delete(txId);
        removed++;
      }
    }

    console.log(`[RecoveryManager] Mempool repaired: removed ${removed} stale/invalid transactions`);
  }

  async _rollbackState() {
    const node = this.nodeRef;
    if (!node) return;

    if (this.snapshots.length < 2) return;

    const lastGoodSnapshot = this.snapshots[this.snapshots.length - 2];
    console.log(`[RecoveryManager] Rolling back state to snapshot at ${new Date(lastGoodSnapshot.timestamp).toISOString()}`);

    // 回滚区块链到快照高度
    if (node.blockchain && lastGoodSnapshot.blockHeight > 0) {
      node.blockchain = node.blockchain.slice(0, lastGoodSnapshot.blockHeight);
    }
  }

  async _reconnectPeers() {
    const node = this.nodeRef;
    if (!node) return;

    console.log('[RecoveryManager] Attempting peer reconnection...');

    // 尝试连接已知的对等节点
    const backoff = Math.min(
      this.config.recoveryBackoffBase * Math.pow(2, (this.recoveryAttempts.get(FAILURE_TYPES.P2P_DISCONNECT) || 1) - 1),
      this.config.maxRecoveryBackoff
    );

    await new Promise(resolve => setTimeout(resolve, backoff));

    if (node.tryConnect) {
      await node.tryConnect();
    }

    console.log(`[RecoveryManager] Reconnection attempt complete, peers: ${node.peers?.size || 0}`);
  }

  async _resyncBlocks() {
    const node = this.nodeRef;
    if (!node) return;

    console.log('[RecoveryManager] Initiating block resync...');

    if (!node.blockchain || node.blockchain.length === 0) {
      if (node.initializeBlockchain) {
        await node.initializeBlockchain();
        console.log('[RecoveryManager] Blockchain reinitialized from genesis');
        return;
      }
    }

    // 请求对等节点同步缺失的区块
    if (node.peers) {
      for (const [peerId, peer] of node.peers) {
        try {
          const msg = JSON.stringify({
            type: 'REQUEST_BLOCK_SYNC',
            fromHeight: node.blockchain.length,
            nodeId: node.nodeId
          });
          if (peer.send) {
            peer.send(msg);
          } else if (p2pServer?.broadcast) {
            p2pServer.broadcast(msg);
          }
        } catch (e) {
          // 单个对等节点失败容错
        }
      }
    }
  }

  async _releaseResources() {
    console.log('[RecoveryManager] Releasing resources...');
    if (this.nodeRef?.cleanupMempool) {
      this.nodeRef.cleanupMempool();
    }
    if (global.gc) {
      global.gc();
    }
  }

  async _drainMempool() {
    const node = this.nodeRef;
    if (!node || !node.mempool) return;

    console.log('[RecoveryManager] Draining mempool backlog...');

    // 按 fee 降序排列交易，只保留高手续费的
    const entries = Array.from(node.mempool.entries())
      .sort((a, b) => Number(BigInt(b[1].fee || '0') - BigInt(a[1].fee || '0')))
      .slice(0, 2000);

    node.mempool.clear();
    for (const [id, tx] of entries) {
      node.mempool.set(id, tx);
    }

    console.log(`[RecoveryManager] Mempool drained to ${node.mempool.size} transactions`);
  }

  async _escalate(failureType, issues) {
    console.error(`[RecoveryManager] ESCALATION: ${failureType}`, issues);
    this._logEvent('escalation', { failureType, issues });

    // 写入紧急日志
    try {
      const dir = path.join(__dirname, '../../data/recovery');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `escalation-${Date.now()}.json`);
      await fs.writeFile(file, JSON.stringify({
        failureType,
        issues,
        state: this.state,
        timestamp: Date.now(),
        history: this.failureHistory.slice(-10)
      }, null, 2));
    } catch (e) {
      console.error('[RecoveryManager] Failed to write escalation log:', e.message);
    }
  }

  async _genericRecovery() {
    const node = this.nodeRef;
    if (!node) return;

    // 通用的恢复策略：先尝试轻量修复
    await this._repairMempool();
    await this._reconnectPeers();

    // 如果节点状态不对，重新设置
    if (node.status === 'ERROR' && node.initialize) {
      try {
        await node.initialize();
      } catch (e) {
        console.error('[RecoveryManager] Generic recovery failed:', e.message);
      }
    }
  }

  _logEvent(type, data) {
    try {
      const dir = path.join(__dirname, '../../data/recovery');
      fs.mkdir(dir, { recursive: true }).catch(() => {});
      const file = path.join(dir, `audit-${Date.now()}.json`);
      fs.writeFile(file, JSON.stringify({
        type,
        timestamp: Date.now(),
        nodeState: this.state,
        ...data
      }, null, 2)).catch(() => {});
    } catch (e) {
      // 日志失败不影响恢复
    }
  }

  getHealthReport() {
    const recoveryStats = {};
    for (const [type, attempts] of this.recoveryAttempts) {
      recoveryStats[type] = attempts;
    }

    return {
      state: this.state,
      lastHealthCheck: this.lastHealthCheck,
      recoveryInProgress: this.recoveryLock,
      recentFailures: this.failureHistory.slice(-5),
      recoveryAttempts: recoveryStats,
      snapshotCount: this.snapshots.length,
      lastSnapshot: this.snapshots.length > 0
        ? this.snapshots[this.snapshots.length - 1]
        : null
    };
  }

  async shutdown() {
    clearInterval(this._healthTimer);
    clearInterval(this._snapshotTimer);
    await this._createSnapshot();
    console.log('[RecoveryManager] Shutdown complete');
  }
}

// 单例导出
const recoveryManager = new RecoveryManager();
export default recoveryManager;
export { RecoveryManager, RECOVERY_STATES, FAILURE_TYPES, RECOVERY_STRATEGIES };
