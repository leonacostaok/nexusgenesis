/**
 * NexusGenesis - Agent Task Protocol
 *
 * Lifecycle: publish → claim → submit → verify → complete
 * Each state transition is recorded on-chain as a transaction.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import agentWalletManager from '../wallet/agentWalletManager.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASKS_DIR = path.join(__dirname, '../../data/tasks');
const MAX_TASK_TITLE = 200;
const MAX_TASK_DESCRIPTION = 10000;
const MAX_TASK_REWARD = 1000000n;
const TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Default minimum reputation required to claim a task, by task type
// (adapted from the WolfKing proposal — kept conservative for bootstrap)
const DEFAULT_REPUTATION_REQUIREMENTS = {
  analysis: 0,
  coding: 5,
  research: 3,
  security_audit: 10,
  community: 0,
  documentation: 0
};

const TASK_STATUS = {
  OPEN: 'open',
  CLAIMED: 'claimed',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
};

const TXN_TYPES = {
  TASK_PUBLISH: 'TASK_PUBLISH',
  TASK_CLAIM: 'TASK_CLAIM',
  TASK_SUBMIT: 'TASK_SUBMIT',
  TASK_VERIFY: 'TASK_VERIFY',
  TASK_COMPLETE: 'TASK_COMPLETE',
  TASK_CANCEL: 'TASK_CANCEL'
};

class TaskProtocol {
  constructor(node = null) {
    this.node = node;
    this.tasks = new Map();
    this._initDirectories();
    this._loadTasks();
    this._startExpiryChecker();
  }

  _initDirectories() {
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }
  }

  _loadTasks() {
    try {
      const file = path.join(TASKS_DIR, 'tasks.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [key, value] of Object.entries(data)) {
          this.tasks.set(key, value);
        }
        console.log(`[TaskProtocol] Loaded ${this.tasks.size} tasks from disk`);
      }
    } catch (e) {
      console.log('[TaskProtocol] No existing tasks found');
    }
  }

  _saveTasks() {
    try {
      const obj = Object.fromEntries(this.tasks);
      fs.writeFileSync(
        path.join(TASKS_DIR, 'tasks.json'),
        JSON.stringify(obj, null, 2)
      );
    } catch (e) {
      console.error('[TaskProtocol] Failed to save tasks:', e.message);
    }
  }

  _startExpiryChecker() {
    setInterval(() => {
      const now = Date.now();
      let expired = 0;
      for (const [id, task] of this.tasks) {
        if (task.status === TASK_STATUS.OPEN && now - task.publishedAt > TASK_TTL_MS) {
          task.status = TASK_STATUS.EXPIRED;
          expired++;
        }
        if (task.status === TASK_STATUS.CLAIMED && task.claimedAt && now - task.claimedAt > CLAIM_TTL_MS) {
          task.status = TASK_STATUS.OPEN;
          task.claimedBy = null;
          task.claimedAt = null;
          expired++;
        }
      }
      if (expired > 0) {
        this._saveTasks();
        console.log(`[TaskProtocol] Expired/Released ${expired} tasks`);
      }
    }, 60000);
  }

  /**
   * Publish a new task.
   * @param {string} publisherAddress - Agent address of the publisher
   * @param {object} params
   * @param {string} params.title - Task title
   * @param {string} params.description - Task description
   * @param {string[]} params.requiredCapabilities - Required agent capabilities
   * @param {string} params.taskType - Task type for reputation gating (analysis/coding/research/...)
   * @param {number} params.minReputation - Minimum reputation required (overrides type default)
   * @param {string} params.reward - Reward amount in NGEN (string for BigInt safety)
   * @returns {{ success: boolean, task?: object, reason?: string, errorCode?: string }}
   */
  publish(publisherAddress, { title, description, requiredCapabilities = [], taskType, minReputation, reward = '0' }) {
    if (!publisherAddress || !publisherAddress.startsWith('ng1')) {
      return { success: false, reason: 'Invalid publisher address', errorCode: 'INVALID_PUBLISHER' };
    }
    if (!title || title.length > MAX_TASK_TITLE) {
      return { success: false, reason: `Title required, max ${MAX_TASK_TITLE} chars`, errorCode: 'INVALID_TITLE' };
    }
    if (!description || description.length > MAX_TASK_DESCRIPTION) {
      return { success: false, reason: `Description required, max ${MAX_TASK_DESCRIPTION} chars`, errorCode: 'INVALID_DESCRIPTION' };
    }

    let rewardBigInt;
    try {
      rewardBigInt = BigInt(reward);
      if (rewardBigInt > MAX_TASK_REWARD) {
        return { success: false, reason: `Reward exceeds maximum of ${MAX_TASK_REWARD}`, errorCode: 'REWARD_TOO_LARGE' };
      }
    } catch {
      return { success: false, reason: 'Invalid reward amount', errorCode: 'INVALID_REWARD' };
    }

    // Resolve minReputation: explicit > type default > 0
    let resolvedMinReputation = 0;
    if (typeof minReputation === 'number' && minReputation >= 0) {
      resolvedMinReputation = minReputation;
    } else if (taskType && DEFAULT_REPUTATION_REQUIREMENTS[taskType] !== undefined) {
      resolvedMinReputation = DEFAULT_REPUTATION_REQUIREMENTS[taskType];
    }

    const taskId = `task_${crypto.randomUUID().slice(0, 12)}`;
    const now = Date.now();

    const task = {
      id: taskId,
      title,
      description,
      requiredCapabilities,
      taskType: taskType || 'general',
      minReputation: resolvedMinReputation,
      reward: rewardBigInt.toString(),
      publisher: publisherAddress,
      status: TASK_STATUS.OPEN,
      publishedAt: now,
      claimedBy: null,
      claimedAt: null,
      submittedAt: null,
      submissionData: null,
      verifiedAt: null,
      completedAt: null,
      cancelledAt: null,
      transactionHistory: [{
        type: TXN_TYPES.TASK_PUBLISH,
        timestamp: now,
        by: publisherAddress,
        data: { title, reward, taskType: taskType || 'general', minReputation: resolvedMinReputation }
      }]
    };

    // Escrow reward from AGENT publishers (system tasks funded by Swarm Pool)
    const SWARM_POOL_ADDR = 'ng1swarmpool000000000000000000000000000';
    const ESCROW_ADDR = 'ng1escrow0000000000000000000000000000000';
    const isSystemTask = publisherAddress === SWARM_POOL_ADDR;
    if (!isSystemTask && rewardBigInt > 0n && this.node && this.node.state) {
      const publisherBalance = BigInt(this.node.state.getBalance(publisherAddress));
      if (publisherBalance < rewardBigInt) {
        return { success: false, reason: `Insufficient balance: need ${rewardBigInt.toString()} NGEN, have ${publisherBalance.toString()}`, errorCode: 'INSUFFICIENT_BALANCE' };
      }
      this.node.state.subtractBalance(publisherAddress, rewardBigInt.toString());
      this.node.state.addBalance(ESCROW_ADDR, rewardBigInt.toString());
      task.escrowed = true;
      console.log(`[TaskProtocol] Reward escrowed: ${rewardBigInt.toString()} NGEN from ${publisherAddress.slice(0, 12)}... → escrow`);
    }

    this.tasks.set(taskId, task);
    this._saveTasks();

    if (this.node) {
      this._recordOnChain(taskId, TXN_TYPES.TASK_PUBLISH, publisherAddress, { title, reward });
    }

    console.log(`[TaskProtocol] Task published: ${taskId} by ${publisherAddress.slice(0, 12)}... (type=${task.taskType}, minRep=${task.minReputation})`);
    return { success: true, task: this._sanitizeTask(task) };
  }

  /**
   * Claim an open task.
   * @param {string} agentAddress - Agent claiming the task
   * @param {string} taskId - Task ID
   * @param {object} [options]
   * @param {number} [options.agentReputation=0] - Caller's current reputation score
   * @returns {{ success: boolean, task?: object, reason?: string, errorCode?: string }}
   */
  claim(agentAddress, taskId, { agentReputation = 0 } = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found', errorCode: 'TASK_NOT_FOUND' };
    }
    if (task.status !== TASK_STATUS.OPEN) {
      return { success: false, reason: `Task is ${task.status}, not open`, errorCode: 'TASK_NOT_OPEN' };
    }
    if (task.publisher === agentAddress) {
      return { success: false, reason: 'Cannot claim your own task', errorCode: 'CANNOT_CLAIM_OWN' };
    }
    if (task.minReputation && agentReputation < task.minReputation) {
      return {
        success: false,
        reason: `This ${task.taskType} task requires reputation >= ${task.minReputation}, you have ${agentReputation}`,
        errorCode: 'INSUFFICIENT_REPUTATION',
        requiredReputation: task.minReputation,
        currentReputation: agentReputation
      };
    }

    const now = Date.now();
    task.status = TASK_STATUS.CLAIMED;
    task.claimedBy = agentAddress;
    task.claimedAt = now;
    task.transactionHistory.push({
      type: TXN_TYPES.TASK_CLAIM,
      timestamp: now,
      by: agentAddress
    });

    this.tasks.set(taskId, task);
    this._saveTasks();

    if (this.node) {
      this._recordOnChain(taskId, TXN_TYPES.TASK_CLAIM, agentAddress, { publisher: task.publisher });
    }

    console.log(`[TaskProtocol] Task claimed: ${taskId} by ${agentAddress.slice(0, 12)}...`);
    return { success: true, task: this._sanitizeTask(task) };
  }

  /**
   * Submit results for a claimed task.
   * @param {string} agentAddress - Agent submitting (must be claimant)
   * @param {string} taskId - Task ID
   * @param {object} submission - Submission data
   * @returns {{ success: boolean, task?: object, reason?: string }}
   */
  submit(agentAddress, taskId, submission) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }
    if (task.status !== TASK_STATUS.CLAIMED) {
      return { success: false, reason: `Task is ${task.status}, not claimed` };
    }
    if (task.claimedBy !== agentAddress) {
      return { success: false, reason: 'Only the claimant can submit' };
    }

    const now = Date.now();
    task.status = TASK_STATUS.SUBMITTED;
    task.submittedAt = now;
    task.submissionData = submission;
    task.transactionHistory.push({
      type: TXN_TYPES.TASK_SUBMIT,
      timestamp: now,
      by: agentAddress,
      data: { submissionType: submission.type || 'generic' }
    });

    this.tasks.set(taskId, task);
    this._saveTasks();

    if (this.node) {
      this._recordOnChain(taskId, TXN_TYPES.TASK_SUBMIT, agentAddress, {});
    }

    console.log(`[TaskProtocol] Task submitted: ${taskId} by ${agentAddress.slice(0, 12)}...`);
    return { success: true, task: this._sanitizeTask(task) };
  }

  /**
   * Verify a submitted task (publisher or designated verifier).
   * @param {string} verifierAddress - Publisher or authorized verifier
   * @param {string} taskId - Task ID
   * @param {boolean} approved - Whether the submission is approved
   * @param {string} feedback - Optional verification feedback
   * @returns {{ success: boolean, task?: object, reason?: string }}
   */
  verify(verifierAddress, taskId, approved, feedback = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }
    if (task.status !== TASK_STATUS.SUBMITTED) {
      return { success: false, reason: `Task is ${task.status}, not submitted` };
    }
    if (task.publisher !== verifierAddress) {
      return { success: false, reason: 'Only the publisher can verify' };
    }

    const now = Date.now();

    if (approved) {
      task.status = TASK_STATUS.VERIFIED;
      task.verifiedAt = now;
      task.transactionHistory.push({
        type: TXN_TYPES.TASK_VERIFY,
        timestamp: now,
        by: verifierAddress,
        data: { approved: true, feedback }
      });

      // Auto-complete after verification
      task.status = TASK_STATUS.COMPLETED;
      task.completedAt = now;
      task.transactionHistory.push({
        type: TXN_TYPES.TASK_COMPLETE,
        timestamp: now,
        by: verifierAddress,
        data: {
          reward: task.reward,
          claimant: task.claimedBy,
          publisher: task.publisher
        }
      });

      if (this.node) {
        this._recordOnChain(taskId, TXN_TYPES.TASK_COMPLETE, verifierAddress, {
          reward: task.reward,
          claimant: task.claimedBy
        });
      }

      // Distribute reward: AGENT tasks release from escrow, system tasks from Swarm Pool
      if (this.node && this.node.state && task.reward !== '0') {
        try {
          const SWARM_POOL_ADDR = 'ng1swarmpool000000000000000000000000000';
          const ESCROW_ADDR = 'ng1escrow0000000000000000000000000000000';
          const rewardAmount = BigInt(task.reward);
          const isSystemTask = task.publisher === SWARM_POOL_ADDR;

          let paid = false;
          if (isSystemTask) {
            // System tasks: pay from Swarm Pool (whitepaper §4 release mechanism)
            // 注意: Swarm Pool 余额由 checkTokenRelease 释放机制补充 (每 100 块释放 0.1%),
            // 不允许直接 mint 增发 — 那会绕过 totalSupply 上限造成通胀漏洞。
            let poolBalance = BigInt(this.node.state.getBalance(SWARM_POOL_ADDR));
            if (poolBalance < rewardAmount) {
              console.warn(`[TaskProtocol] Swarm Pool insufficient (${poolBalance.toString()} < ${task.reward}), skipping reward payment for task ${task.id}`);
              // 余额不足时跳过支付, 不增发 — 释放机制会在后续区块补充池子
            } else {
              this.node.state.subtractBalance(SWARM_POOL_ADDR, rewardAmount.toString());
              this.node.state.changes.tokenRelease = true;
              console.log(`[TaskProtocol] Reward released: ${task.reward} NGEN from Swarm Pool → ${task.claimedBy.slice(0, 12)}...`);
              paid = true;
            }
          } else if (task.escrowed) {
            // AGENT tasks: release locked escrow to claimant
            this.node.state.subtractBalance(ESCROW_ADDR, rewardAmount.toString());
            console.log(`[TaskProtocol] Escrow released: ${task.reward} NGEN → ${task.claimedBy.slice(0, 12)}...`);
            paid = true;
          } else {
            // Fallback (legacy non-escrowed AGENT task): pay from Swarm Pool
            let poolBalance = BigInt(this.node.state.getBalance(SWARM_POOL_ADDR));
            if (poolBalance >= rewardAmount) {
              this.node.state.subtractBalance(SWARM_POOL_ADDR, rewardAmount.toString());
              console.warn(`[TaskProtocol] Non-escrowed AGENT task ${taskId} paid from Swarm Pool (legacy)`);
              paid = true;
            } else {
              console.warn(`[TaskProtocol] Swarm Pool insufficient for legacy task ${taskId}, skipping payment`);
            }
          }

          // 只有源余额充足时才给 claimant 加余额 (防止凭空增发)
          if (paid) {
            this.node.state.addBalance(task.claimedBy, rewardAmount.toString());

            // Sync agent wallet manager with on-chain balance
            const claimantAgentId = agentWalletManager.getAgentByAddress(task.claimedBy);
            if (claimantAgentId) {
              agentWalletManager.syncBalance(claimantAgentId, this.node.state);
              console.log(`[TaskProtocol] Wallet synced: ${claimantAgentId} balance = ${agentWalletManager.getBalance(claimantAgentId).balance} NGEN`);
            }
          }

          const source = isSystemTask ? 'Swarm Pool' : (task.escrowed ? 'escrow' : 'Swarm Pool(legacy)');
          console.log(`[TaskProtocol] Reward distributed: ${task.reward} NGEN from ${source} → ${task.claimedBy.slice(0, 12)}...`);
        } catch (rewardErr) {
          console.error(`[TaskProtocol] Reward distribution failed:`, rewardErr.message);
        }
      }

      // Reward reputation to the claimant for completing a task
      if (this.node && this.node.currentState && this.node.resolveRegisteredAgent) {
        const agentRecord = this.node.resolveRegisteredAgent(task.claimedBy);
        if (agentRecord && agentRecord.agentId && typeof this.node.currentState.rewardReputation === 'function') {
          this.node.currentState.rewardReputation(agentRecord.agentId, 'TASK_COMPLETED');
          console.log(`[TaskProtocol] ✓ Reputation rewarded: ${agentRecord.agentId.slice(0, 16)}... +TASK_COMPLETED`);
        } else {
          console.log(`[TaskProtocol] ⚠ Reputation skip: agentRecord=${!!agentRecord} agentId=${agentRecord?.agentId?.slice(0,16)} hasRewardFn=${typeof this.node.currentState?.rewardReputation === 'function'} claimedBy=${task.claimedBy?.slice(0,16)}...`);
        }

        // Award active referral bonus to the referrer on first task completion
        if (this.node && typeof this.node.awardActiveReferral === 'function') {
          const result = this.node.awardActiveReferral(task.claimedBy);
          if (result) {
            console.log(`[TaskProtocol] 🎯 Active referral bonus: ${result.referrer} → +${result.reward} NGEN${result.milestone ? ` + milestone(${result.milestone.count}) → +${result.milestone.reward}` : ''}`);
          }
        }
      } else {
        console.log(`[TaskProtocol] ⚠ Reputation skip: node=${!!this.node} currentState=${!!this.node?.currentState} resolveFn=${!!this.node?.resolveRegisteredAgent}`);
      }

      console.log(`[TaskProtocol] Task completed: ${taskId}, ${task.reward} NGEN → ${task.claimedBy.slice(0, 12)}...`);
    } else {
      // Rejected: return to open for another agent to claim
      task.status = TASK_STATUS.OPEN;
      task.claimedBy = null;
      task.claimedAt = null;
      task.submittedAt = null;
      task.submissionData = null;
      task.transactionHistory.push({
        type: TXN_TYPES.TASK_VERIFY,
        timestamp: now,
        by: verifierAddress,
        data: { approved: false, feedback }
      });

      console.log(`[TaskProtocol] Task rejected: ${taskId}, reopened`);
    }

    this.tasks.set(taskId, task);
    this._saveTasks();

    return { success: true, task: this._sanitizeTask(task) };
  }

  /**
   * Cancel an open or claimed task (publisher only).
   */
  cancel(publisherAddress, taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }
    if (task.publisher !== publisherAddress) {
      return { success: false, reason: 'Only the publisher can cancel' };
    }
    if (![TASK_STATUS.OPEN, TASK_STATUS.CLAIMED].includes(task.status)) {
      return { success: false, reason: `Cannot cancel task in ${task.status} status` };
    }

    const now = Date.now();
    task.status = TASK_STATUS.CANCELLED;
    task.cancelledAt = now;
    task.transactionHistory.push({
      type: TXN_TYPES.TASK_CANCEL,
      timestamp: now,
      by: publisherAddress
    });

    // Refund escrowed reward to publisher when AGENT task is cancelled
    if (task.escrowed && task.reward !== '0' && this.node && this.node.state) {
      try {
        const ESCROW_ADDR = 'ng1escrow0000000000000000000000000000000';
        const refundAmount = BigInt(task.reward);
        this.node.state.subtractBalance(ESCROW_ADDR, refundAmount.toString());
        this.node.state.addBalance(task.publisher, refundAmount.toString());
        console.log(`[TaskProtocol] Escrow refunded: ${task.reward} NGEN → ${task.publisher.slice(0, 12)}...`);
      } catch (refundErr) {
        console.error(`[TaskProtocol] Escrow refund failed:`, refundErr.message);
      }
    }

    this.tasks.set(taskId, task);
    this._saveTasks();

    console.log(`[TaskProtocol] Task cancelled: ${taskId}`);
    return { success: true, task: this._sanitizeTask(task) };
  }

  /**
   * Query tasks with optional filters.
   */
  query({ status, publisher, claimant, capabilities, minReward, limit = 50, offset = 0 } = {}) {
    let results = Array.from(this.tasks.values());

    if (status) {
      results = results.filter(t => t.status === status);
    }
    if (publisher) {
      results = results.filter(t => t.publisher === publisher);
    }
    if (claimant) {
      results = results.filter(t => t.claimedBy === claimant);
    }
    if (capabilities && capabilities.length > 0) {
      results = results.filter(t =>
        capabilities.every(c => t.requiredCapabilities.includes(c))
      );
    }
    if (minReward) {
      const min = BigInt(minReward);
      results = results.filter(t => BigInt(t.reward) >= min);
    }

    results.sort((a, b) => b.publishedAt - a.publishedAt);

    const total = results.length;
    results = results.slice(offset, offset + limit);

    return {
      tasks: results.map(t => this._sanitizeTask(t)),
      total,
      offset,
      limit
    };
  }

  /**
   * Get a single task by ID.
   */
  get(taskId) {
    const task = this.tasks.get(taskId);
    return task ? this._sanitizeTask(task) : null;
  }

  /**
   * Get task statistics.
   */
  getStats() {
    const all = Array.from(this.tasks.values());
    return {
      total: all.length,
      open: all.filter(t => t.status === TASK_STATUS.OPEN).length,
      claimed: all.filter(t => t.status === TASK_STATUS.CLAIMED).length,
      submitted: all.filter(t => t.status === TASK_STATUS.SUBMITTED).length,
      completed: all.filter(t => t.status === TASK_STATUS.COMPLETED).length,
      cancelled: all.filter(t => t.status === TASK_STATUS.CANCELLED).length,
      expired: all.filter(t => t.status === TASK_STATUS.EXPIRED).length,
      totalRewardsDistributed: all
        .filter(t => t.status === TASK_STATUS.COMPLETED)
        .reduce((sum, t) => sum + BigInt(t.reward), 0n)
        .toString()
    };
  }

  /**
   * Match open tasks to an agent based on capabilities.
   */
  matchForAgent(agentCapabilities) {
    const normalizedCaps = (agentCapabilities || []).map(c => c.toLowerCase());
    const openTasks = Array.from(this.tasks.values())
      .filter(t => t.status === TASK_STATUS.OPEN)
      .filter(t =>
        t.requiredCapabilities.length === 0 ||
        t.requiredCapabilities.every(c => normalizedCaps.includes(c.toLowerCase()))
      )
      .sort((a, b) => {
        const rewardA = BigInt(a.reward);
        const rewardB = BigInt(b.reward);
        if (rewardB > rewardA) return 1;
        if (rewardB < rewardA) return -1;
        return a.publishedAt - b.publishedAt;
      });

    return openTasks.map(t => this._sanitizeTask(t));
  }

  _recordOnChain(taskId, txType, from, data) {
    if (!this.node || !this.node.handleTransaction) return;

    const tx = {
      id: crypto.randomUUID(),
      tx_type: txType,
      from,
      to: from,
      amount: '0',
      fee: '1',
      payload: { taskId, ...data },
      timestamp: Date.now(),
      signature: ''
    };

    this.node.handleTransaction(tx).catch(e => {
      console.error(`[TaskProtocol] Failed to record ${txType} on-chain:`, e.message);
    });
  }

  _sanitizeTask(task) {
    const { transactionHistory, submissionData, ...safe } = task;
    // Include transaction count and submission summary (not full data)
    return {
      ...safe,
      transactionCount: transactionHistory.length,
      hasSubmission: !!submissionData,
      submissionSummary: submissionData ? {
        type: submissionData.type || submissionData.action || 'generic',
        fields: Object.keys(submissionData),
        preview: JSON.stringify(submissionData).slice(0, 300)
      } : null
    };
  }
}

let instance = null;

export function getTaskProtocol(node = null) {
  if (!instance) {
    instance = new TaskProtocol(node);
  }
  if (node && !instance.node) {
    instance.node = node;
  }
  return instance;
}

export { TASK_STATUS, TXN_TYPES, TaskProtocol };
