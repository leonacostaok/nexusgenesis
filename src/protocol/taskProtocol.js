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
import { MilestoneSystem } from '../blockchain/state.js';

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

// ─── Phase 3 Layer 1: Progressive Trust Verification Tiers ───
// Verification path is selected based on the CLAIMANT's reputation.
// Tier 0 (rep 0-5):   Unproven — requires 3-party verification (publisher + 1 independent)
// Tier 1 (rep 6-50):   Trusted — publisher verifies (default behavior)
// Tier 2 (rep 51-200): Established — auto-verify on submit + 10% spot-check
// Tier 3 (rep 201+):   Self-sovereign — claimant may self-verify
const TRUST_TIERS = {
  TIER_0_UNPROVEN: { minRep: 0, maxRep: 5, name: 'unproven', requiresThirdParty: true, spotCheckRate: 0 },
  TIER_1_TRUSTED: { minRep: 6, maxRep: 50, name: 'trusted', requiresThirdParty: false, spotCheckRate: 0 },
  TIER_2_ESTABLISHED: { minRep: 51, maxRep: 200, name: 'established', requiresThirdParty: false, spotCheckRate: 0.10 },
  TIER_3_SOVEREIGN: { minRep: 201, maxRep: Infinity, name: 'sovereign', requiresThirdParty: false, spotCheckRate: 0, allowSelfVerify: true }
};

// ─── Phase 3 Layer 2: Quality Score Multipliers ───
// Verifier rates submission quality 1-5 stars; affects reward payout.
const QUALITY_MULTIPLIERS = {
  1: 0.50,  // poor — half reward
  2: 0.75,  // below expectations
  3: 1.00,  // met expectations (default)
  4: 1.10,  // above expectations
  5: 1.25   // excellent
};
const DEFAULT_QUALITY_SCORE = 3;

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
   * Phase 1: Resolve agent identity from address and slash reputation.
   * @param {string} agentAddress - Agent ng1 address
   * @param {string} violationType - Violation type key (SELF_DEALING_CLAIM, etc.)
   * @param {object} context - Additional context (taskId, etc.)
   */
  _slashForViolation(agentAddress, violationType, context = {}) {
    if (!this.node || !this.node.currentState) return;
    if (typeof this.node.currentState.slashReputation !== 'function') return;

    const agentRecord = this.node.resolveRegisteredAgent
      ? this.node.resolveRegisteredAgent(agentAddress)
      : null;
    if (!agentRecord || !agentRecord.agentId) {
      console.warn(`[TaskProtocol] Cannot slash: agent not resolved for address ${agentAddress.slice(0, 12)}...`);
      return;
    }

    const result = this.node.currentState.slashReputation(agentRecord.agentId, violationType, context);
    if (result.success) {
      console.warn(
        `[TaskProtocol] ⚠ SLASHED ${agentRecord.agentId.slice(0, 16)}... ` +
        `for ${violationType}: ${result.previousReputation} → ${result.newReputation}`
      );
    }
  }

  // ─── Phase 3 Layer 1: Progressive Trust helpers ───

  /**
   * Resolve claimant's current reputation score.
   * @param {string} claimantAddress - Agent ng1 address
   * @returns {number} reputation (0 if unresolved / node missing)
   */
  _getClaimantReputation(claimantAddress) {
    if (!this.node || !this.node.resolveRegisteredAgent) return 0;
    const agentRecord = this.node.resolveRegisteredAgent(claimantAddress);
    if (!agentRecord) return 0;
    return agentRecord.reputation || 0;
  }

  /**
   * Map a reputation score to a trust tier.
   * @param {number} reputation
   * @returns {{ level: number, name: string, requiresThirdParty: boolean, spotCheckRate: number, allowSelfVerify: boolean }}
   */
  _getTrustTier(reputation) {
    if (reputation <= TRUST_TIERS.TIER_0_UNPROVEN.maxRep) {
      return { level: 0, ...TRUST_TIERS.TIER_0_UNPROVEN };
    }
    if (reputation <= TRUST_TIERS.TIER_1_TRUSTED.maxRep) {
      return { level: 1, ...TRUST_TIERS.TIER_1_TRUSTED };
    }
    if (reputation <= TRUST_TIERS.TIER_2_ESTABLISHED.maxRep) {
      return { level: 2, ...TRUST_TIERS.TIER_2_ESTABLISHED };
    }
    return { level: 3, ...TRUST_TIERS.TIER_3_SOVEREIGN };
  }

  /**
   * Read the trust tier recorded on a task at submission time.
   * Falls back to Tier 1 (publisher-verifies) for legacy tasks.
   * @param {object} task
   */
  _getTrustTierFromTask(task) {
    if (task.trustTierLevel !== undefined) {
      const tierKey = Object.keys(TRUST_TIERS).find(
        k => TRUST_TIERS[k].name === task.trustTier
      );
      if (tierKey) return { level: task.trustTierLevel, ...TRUST_TIERS[tierKey] };
    }
    return { level: 1, ...TRUST_TIERS.TIER_1_TRUSTED };
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
    if (!isSystemTask && rewardBigInt > 0n && this.node && this.node.currentState) {
      const publisherBalance = BigInt(this.node.currentState.getBalance(publisherAddress));
      if (publisherBalance < rewardBigInt) {
        return { success: false, reason: `Insufficient balance: need ${rewardBigInt.toString()} NGEN, have ${publisherBalance.toString()}`, errorCode: 'INSUFFICIENT_BALANCE' };
      }
      this.node.currentState.subtractBalance(publisherAddress, rewardBigInt.toString());
      this.node.currentState.addBalance(ESCROW_ADDR, rewardBigInt.toString());
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
      // Phase 1: Slash reputation for self-dealing attempt
      this._slashForViolation(agentAddress, 'SELF_DEALING_CLAIM', { taskId, publisher: task.publisher });
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

    // ─── Phase 3 Layer 1: record claimant's trust tier at submission time ───
    const claimantRep = this._getClaimantReputation(task.claimedBy);
    const tier = this._getTrustTier(claimantRep);
    task.trustTier = tier.name;
    task.trustTierLevel = tier.level;
    task.verifications = [];

    task.transactionHistory.push({
      type: TXN_TYPES.TASK_SUBMIT,
      timestamp: now,
      by: agentAddress,
      data: { submissionType: submission.type || 'generic', trustTier: tier.name, claimantRep }
    });

    // Tier 2 (established): auto-verify 90% of submissions, 10% spot-check by publisher
    if (tier.level === 2 && Math.random() >= tier.spotCheckRate) {
      this._completeTask(task, 'system', 'Auto-verified (Tier 2 established, no spot-check)', {
        autoVerified: true, verifierRole: 'system'
      });
      this.tasks.set(taskId, task);
      this._saveTasks();
      if (this.node) {
        this._recordOnChain(taskId, TXN_TYPES.TASK_SUBMIT, agentAddress, { autoVerified: true });
      }
      console.log(`[TaskProtocol] Task auto-completed (Tier 2): ${taskId} by ${agentAddress.slice(0, 12)}...`);
      return { success: true, task: this._sanitizeTask(task), autoVerified: true };
    }

    // ─── Phase 4: Publisher auto-verify (trusted publisher shortcut) ───
    // If publisher reputation >= 50 and task type is low-risk, auto-complete on submit
    if (this.node && this.node.currentState) {
      const pubAgentRecord = this.node.resolveRegisteredAgent ? this.node.resolveRegisteredAgent(task.publisher) : null;
      const pubRep = pubAgentRecord?.reputation || 0;
      const lowRiskTypes = ['analysis', 'community', 'documentation', 'general'];
      if (pubRep >= 50 && lowRiskTypes.includes(task.taskType)) {
        this._completeTask(task, task.publisher, 'Auto-verified (trusted publisher, rep≥50)', {
          autoVerified: true, qualityScore: 4, verifierRole: 'publisher'
        });
        this.tasks.set(taskId, task);
        this._saveTasks();
        if (this.node) {
          this._recordOnChain(taskId, TXN_TYPES.TASK_SUBMIT, agentAddress, { autoVerified: true, trustedPublisher: true });
        }
        console.log(`[TaskProtocol] Task auto-completed (trusted publisher rep=${pubRep}): ${taskId}`);
        return { success: true, task: this._sanitizeTask(task), autoVerified: true, trustedPublisher: true };
      }
    }

    this.tasks.set(taskId, task);
    this._saveTasks();

    if (this.node) {
      this._recordOnChain(taskId, TXN_TYPES.TASK_SUBMIT, agentAddress, { trustTier: tier.name });
    }

    console.log(`[TaskProtocol] Task submitted: ${taskId} by ${agentAddress.slice(0, 12)}... (tier=${tier.name})`);
    return { success: true, task: this._sanitizeTask(task) };
  }

  /**
   * Phase 3: Complete a task (shared by verify() and Tier 2 auto-verify).
   * Applies Layer 2 quality-score multiplier to the reward payout.
   * @param {object} task - Task object (mutated in place)
   * @param {string} verifierAddress - Who triggered completion
   * @param {string} feedback - Verification feedback
   * @param {object} [options]
   * @param {number} [options.qualityScore=3] - 1-5 star quality rating (Layer 2)
   * @param {boolean} [options.autoVerified=false] - True for Tier 2 auto-verify
   * @param {string} [options.verifierRole='publisher'] - 'publisher' | 'independent' | 'self' | 'system'
   */
  _completeTask(task, verifierAddress, feedback = '', options = {}) {
    const { qualityScore = DEFAULT_QUALITY_SCORE, autoVerified = false, verifierRole = 'publisher' } = options;
    const now = Date.now();
    const taskId = task.id;

    // Layer 2: quality multiplier (basis-point arithmetic for BigInt safety)
    const multiplier = QUALITY_MULTIPLIERS[qualityScore] || QUALITY_MULTIPLIERS[DEFAULT_QUALITY_SCORE];
    const multiplierBp = BigInt(Math.round(multiplier * 100));
    const baseReward = BigInt(task.reward);
    const adjustedReward = (baseReward * multiplierBp) / 100n;
    task.qualityScore = qualityScore;
    task.rewardMultiplier = multiplier;
    task.adjustedReward = adjustedReward.toString();

    task.status = TASK_STATUS.VERIFIED;
    task.verifiedAt = now;
    task.autoVerified = autoVerified;
    task.transactionHistory.push({
      type: TXN_TYPES.TASK_VERIFY,
      timestamp: now,
      by: verifierAddress,
      data: { approved: true, feedback, qualityScore, multiplier, verifierRole, autoVerified }
    });

    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = now;
    task.transactionHistory.push({
      type: TXN_TYPES.TASK_COMPLETE,
      timestamp: now,
      by: verifierAddress,
      data: { reward: task.reward, adjustedReward: task.adjustedReward, claimant: task.claimedBy, publisher: task.publisher, qualityScore, multiplier }
    });

    if (this.node) {
      this._recordOnChain(taskId, TXN_TYPES.TASK_COMPLETE, verifierAddress, {
        reward: task.adjustedReward, claimant: task.claimedBy
      });
    }

    // Distribute reward (with quality multiplier applied)
    if (this.node && this.node.currentState && task.reward !== '0') {
      try {
        const SWARM_POOL_ADDR = 'ng1swarmpool000000000000000000000000000';
        const ESCROW_ADDR = 'ng1escrow0000000000000000000000000000000';
        const isSystemTask = task.publisher === SWARM_POOL_ADDR;

        let paid = false;
        if (isSystemTask) {
          let poolBalance = BigInt(this.node.currentState.getBalance(SWARM_POOL_ADDR));
          if (poolBalance < adjustedReward) {
            console.warn(`[TaskProtocol] Swarm Pool insufficient (${poolBalance.toString()} < ${task.adjustedReward}), skipping reward payment for task ${task.id}`);
          } else {
            this.node.currentState.subtractBalance(SWARM_POOL_ADDR, adjustedReward.toString());
            this.node.currentState.changes.tokenRelease = true;
            console.log(`[TaskProtocol] Reward released: ${task.adjustedReward} NGEN from Swarm Pool → ${task.claimedBy.slice(0, 12)}... (${qualityScore}★, ${multiplier}x)`);
            paid = true;
          }
        } else if (task.escrowed) {
          this.node.currentState.subtractBalance(ESCROW_ADDR, adjustedReward.toString());
          console.log(`[TaskProtocol] Escrow released: ${task.adjustedReward} NGEN → ${task.claimedBy.slice(0, 12)}... (${qualityScore}★, ${multiplier}x)`);
          paid = true;
          // Refund quality difference to publisher when quality < 3
          if (adjustedReward < baseReward) {
            const refund = baseReward - adjustedReward;
            this.node.currentState.addBalance(task.publisher, refund.toString());
            console.log(`[TaskProtocol] Quality refund: ${refund.toString()} NGEN → ${task.publisher.slice(0, 12)}... (low quality)`);
          }
        } else {
          let poolBalance = BigInt(this.node.currentState.getBalance(SWARM_POOL_ADDR));
          if (poolBalance >= adjustedReward) {
            this.node.currentState.subtractBalance(SWARM_POOL_ADDR, adjustedReward.toString());
            console.warn(`[TaskProtocol] Non-escrowed AGENT task ${taskId} paid from Swarm Pool (legacy)`);
            paid = true;
          } else {
            console.warn(`[TaskProtocol] Swarm Pool insufficient for legacy task ${taskId}, skipping payment`);
          }
        }

        if (paid) {
          this.node.currentState.addBalance(task.claimedBy, adjustedReward.toString());
          const claimantAgentId = agentWalletManager.getAgentByAddress(task.claimedBy);
          if (claimantAgentId) {
            agentWalletManager.syncBalance(claimantAgentId, this.node.currentState);
            console.log(`[TaskProtocol] Wallet synced: ${claimantAgentId} balance = ${agentWalletManager.getBalance(claimantAgentId).balance} NGEN`);
          }
        }

        task.paid = paid;
        const source = isSystemTask ? 'Swarm Pool' : (task.escrowed ? 'escrow' : 'Swarm Pool(legacy)');
        console.log(`[TaskProtocol] Reward distributed: ${task.adjustedReward} NGEN from ${source} → ${task.claimedBy.slice(0, 12)}... (paid=${paid})`);
      } catch (rewardErr) {
        console.error(`[TaskProtocol] Reward distribution failed:`, rewardErr.message);
        task.paid = false;
      }
    }

    // Reward reputation + referral bonus + milestones
    if (this.node && this.node.currentState && this.node.resolveRegisteredAgent) {
      const agentRecord = this.node.resolveRegisteredAgent(task.claimedBy);
      if (agentRecord && agentRecord.agentId && typeof this.node.currentState.rewardReputation === 'function') {
        this.node.currentState.rewardReputation(agentRecord.agentId, 'TASK_COMPLETED');
        console.log(`[TaskProtocol] ✓ Reputation rewarded: ${agentRecord.agentId.slice(0, 16)}... +TASK_COMPLETED`);
      }

      if (typeof this.node.awardActiveReferral === 'function') {
        const result = this.node.awardActiveReferral(task.claimedBy);
        if (result) {
          console.log(`[TaskProtocol] 🎯 Active referral bonus: ${result.referrer} → +${result.reward} NGEN`);
        }
      }

      if (agentRecord && agentRecord.agentId && typeof this.node.currentState.recordTaskCompletion === 'function') {
        const stats = this.node.currentState.recordTaskCompletion(agentRecord.agentId, taskId);
        if (stats) {
          console.log(`[TaskProtocol] 📊 Stats: ${agentRecord.agentId.slice(0, 16)}... tasks=${stats.tasksCompleted}`);
          if (!this.node.currentState._milestoneSystem) {
            this.node.currentState._milestoneSystem = new MilestoneSystem(this.node.currentState);
          }
          const newlyAwarded = this.node.currentState._milestoneSystem.checkAndAward(agentRecord.agentId, taskId);
          if (newlyAwarded.length > 0) {
            console.log(`[TaskProtocol] 🏆 Milestones unlocked: ${newlyAwarded.map(m => m.name).join(', ')}`);
            task.milestonesAwarded = newlyAwarded;
          }
        }
      }
    }

    console.log(`[TaskProtocol] Task completed: ${taskId}, ${task.adjustedReward} NGEN → ${task.claimedBy.slice(0, 12)}... (${qualityScore}★, ${multiplier}x)`);
  }

  /**
   * Verify a submitted task (publisher, independent verifier, or self).
   * Phase 3 Layer 1: verification path is routed by the claimant's trust tier.
   *   Tier 0 (unproven):  requires publisher + independent verifier approval
   *   Tier 1 (trusted):   publisher verifies
   *   Tier 2 (established): publisher verifies (only for 10% spot-checked tasks)
   *   Tier 3 (sovereign): publisher OR claimant may self-verify
   * Phase 3 Layer 2: accepts qualityScore (1-5) to adjust reward payout.
   * @param {string} verifierAddress - Publisher / independent verifier / claimant (Tier 3)
   * @param {string} taskId - Task ID
   * @param {boolean} approved - Whether the submission is approved
   * @param {string} feedback - Optional verification feedback
   * @param {object} [options]
   * @param {number} [options.qualityScore=3] - 1-5 star quality rating (Layer 2)
   * @returns {{ success: boolean, task?: object, reason?: string, requiresThirdParty?: boolean }}
   */
  verify(verifierAddress, taskId, approved, feedback = '', options = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }
    if (task.status !== TASK_STATUS.SUBMITTED) {
      return { success: false, reason: `Task is ${task.status}, not submitted` };
    }

    const tier = this._getTrustTierFromTask(task);
    const isPublisher = task.publisher === verifierAddress;
    const isClaimant = task.claimedBy === verifierAddress;
    const now = Date.now();

    // Layer 2: validate quality score (1-5 integer, default 3)
    let qualityScore = options.qualityScore ?? DEFAULT_QUALITY_SCORE;
    if (!Number.isInteger(qualityScore) || qualityScore < 1 || qualityScore > 5) {
      qualityScore = DEFAULT_QUALITY_SCORE;
    }

    // ─── Tier 0: requires 3-party verification (publisher + independent) ───
    if (tier.level === 0) {
      if (isClaimant) {
        return { success: false, reason: 'Claimant cannot verify own task (Tier 0 requires third-party)' };
      }

      if (!approved) {
        this._reopenTask(task, verifierAddress, feedback, now);
        this.tasks.set(taskId, task);
        this._saveTasks();
        return { success: true, task: this._sanitizeTask(task) };
      }

      if (isPublisher) {
        task.publisherApproved = true;
        task.verifications.push({ verifier: verifierAddress, role: 'publisher', approved: true, timestamp: now, feedback });
        if (task.thirdPartyApproved) {
          this._completeTask(task, verifierAddress, feedback, { qualityScore, verifierRole: 'publisher' });
        }
        this.tasks.set(taskId, task);
        this._saveTasks();
        return task.status === TASK_STATUS.COMPLETED
          ? { success: true, task: this._sanitizeTask(task) }
          : { success: true, task: this._sanitizeTask(task), requiresThirdParty: true, message: 'Publisher approved; awaiting independent verifier' };
      }

      // Independent verifier
      task.thirdPartyApproved = true;
      task.verifications.push({ verifier: verifierAddress, role: 'independent', approved: true, timestamp: now, feedback });
      if (task.publisherApproved) {
        this._completeTask(task, verifierAddress, feedback, { qualityScore, verifierRole: 'independent' });
      }
      this.tasks.set(taskId, task);
      this._saveTasks();
      return task.status === TASK_STATUS.COMPLETED
        ? { success: true, task: this._sanitizeTask(task) }
        : { success: true, task: this._sanitizeTask(task), requiresPublisherApproval: true, message: 'Independent verification recorded; awaiting publisher approval' };
    }

    // ─── Tier 1 & Tier 2 (spot-check): publisher verifies ───
    if (tier.level === 1 || tier.level === 2) {
      if (!isPublisher) {
        return { success: false, reason: 'Only the publisher can verify' };
      }
      if (approved) {
        this._completeTask(task, verifierAddress, feedback, { qualityScore, verifierRole: 'publisher' });
      } else {
        this._reopenTask(task, verifierAddress, feedback, now);
      }
      this.tasks.set(taskId, task);
      this._saveTasks();
      return { success: true, task: this._sanitizeTask(task) };
    }

    // ─── Tier 3: self-sovereign — claimant may self-verify ───
    if (tier.level === 3) {
      if (!isPublisher && !isClaimant) {
        return { success: false, reason: 'Only the publisher or claimant can verify (Tier 3)' };
      }
      if (approved) {
        const verifierRole = isClaimant ? 'self' : 'publisher';
        this._completeTask(task, verifierAddress, feedback, { qualityScore, verifierRole, autoVerified: isClaimant });
      } else {
        if (isClaimant) {
          return { success: false, reason: 'Claimant cannot reject own task' };
        }
        this._reopenTask(task, verifierAddress, feedback, now);
      }
      this.tasks.set(taskId, task);
      this._saveTasks();
      return { success: true, task: this._sanitizeTask(task) };
    }

    return { success: false, reason: 'Unknown trust tier' };
  }

  /**
   * Helper: reopen a rejected task back to OPEN status for re-claiming.
   */
  _reopenTask(task, verifierAddress, feedback, now) {
    task.status = TASK_STATUS.OPEN;
    task.claimedBy = null;
    task.claimedAt = null;
    task.submittedAt = null;
    task.submissionData = null;
    task.publisherApproved = false;
    task.thirdPartyApproved = false;
    task.verifications = [];
    task.transactionHistory.push({
      type: TXN_TYPES.TASK_VERIFY,
      timestamp: now,
      by: verifierAddress,
      data: { approved: false, feedback }
    });
    console.log(`[TaskProtocol] Task rejected: ${task.id}, reopened`);
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
    if (task.escrowed && task.reward !== '0' && this.node && this.node.currentState) {
      try {
        const ESCROW_ADDR = 'ng1escrow0000000000000000000000000000000';
        const refundAmount = BigInt(task.reward);
        this.node.currentState.subtractBalance(ESCROW_ADDR, refundAmount.toString());
        this.node.currentState.addBalance(task.publisher, refundAmount.toString());
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
    const completedTasks = all.filter(t => t.status === TASK_STATUS.COMPLETED);
    // paid === true: 新任务明确已支付; paid === undefined: 旧任务 (奖励发放代码已执行, 字段未持久化) 视为已支付;
    // paid === false: 明确未支付 (Swarm Pool 余额不足被跳过)
    const paidTasks = completedTasks.filter(t => t.paid !== false);
    const unpaidTasks = completedTasks.filter(t => t.paid === false);
    return {
      total: all.length,
      open: all.filter(t => t.status === TASK_STATUS.OPEN).length,
      claimed: all.filter(t => t.status === TASK_STATUS.CLAIMED).length,
      submitted: all.filter(t => t.status === TASK_STATUS.SUBMITTED).length,
      completed: completedTasks.length,
      cancelled: all.filter(t => t.status === TASK_STATUS.CANCELLED).length,
      expired: all.filter(t => t.status === TASK_STATUS.EXPIRED).length,
      paidTasks: paidTasks.length,
      unpaidCompletedTasks: unpaidTasks.length,
      totalRewardsDistributed: paidTasks
        .reduce((sum, t) => sum + BigInt(t.reward), 0n)
        .toString(),
      totalRewardsCompleted: completedTasks
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
