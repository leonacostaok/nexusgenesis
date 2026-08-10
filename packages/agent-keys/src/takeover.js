/**
 * nexusgenesis-agent-keys —Human Takeover & Custody (the core differentiator)
 *
 * Implements the "human can always take back control of an autonomous agent"
 * security model. This is the asset that differentiates NexusGenesis from all
 * other agent frameworks whose private keys live on a server or in memory.
 *
 * Key hierarchy:
 *   Level 0: Master Key (human-held, cold storage, never online)
 *   Level 1: Operation Key (agent-held, rotatable/revocable, spend-limited)
 *   Level 2: Custody Token (short-lived 24h authorization bound to pubkey)
 *
 * Design source: docs/human-takeover-mechanism.md
 */
import crypto from 'node:crypto';
import { publicKeyFingerprint } from './custody.js';

/**
 * Spend authorization attached to an operation key.
 *   { type: 'unlimited' }                     —full autonomy
 *   { type: 'limit', maxPerTx, maxDaily }    —human-enforced ceilings
 *   { type: 'require-approval' }             —every spend needs human sign-off
 */
export const SPEND_MODES = {
  UNLIMITED: 'unlimited',
  LIMITED: 'limit',
  REQUIRE_APPROVAL: 'require-approval'
};

/**
 * Resolve effective spend config. Fails CLOSED to REQUIRE_APPROVAL for any
 * self-sovereign config that is missing an explicit, valid `type` — the safe
 * default for an autonomous spend limiter. A missing/invalid type must never
 * silently grant UNLIMITED spending (fail-open), which would let a takeover or
 * config-migration bug revert an agent to unrestricted spending.
 * @param {object} config - agent spend config
 * @returns {object}
 */
export function resolveSpendMode(config) {
  const validModes = Object.values(SPEND_MODES);
  if (!config || typeof config.type !== 'string' || !validModes.includes(config.type)) {
    return { type: SPEND_MODES.REQUIRE_APPROVAL, reason: 'fail-closed: invalid or missing spend mode' };
  }
  return config;
}

/**
 * Check whether a proposed spend is allowed under a spend config.
 * @param {object} config - spend config
 * @param {{ amount: bigint|number, spentToday: bigint|number }} ctx
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkSpendAllowed(config, ctx = {}) {
  const mode = resolveSpendMode(config);
  const amount = ctx.amount;
  const spentToday = ctx.spentToday;

  // Reject invalid amounts up-front. Negative amounts would otherwise slip
  // under every positive ceiling (a spend-limit bypass) and non-integer/NaN
  // values would throw inside BigInt() (a DoS). SECURITY FIX.
  if (typeof amount === 'number' && !Number.isSafeInteger(amount)) {
    return { allowed: false, reason: 'invalid amount: must be a safe integer' };
  }
  if (typeof spentToday === 'number' && !Number.isSafeInteger(spentToday)) {
    return { allowed: false, reason: 'invalid spentToday: must be a safe integer' };
  }
  const a = BigInt(amount ?? 0);
  const s = BigInt(spentToday ?? 0);
  if (a < 0n) return { allowed: false, reason: 'amount must not be negative' };
  if (s < 0n) return { allowed: false, reason: 'spentToday must not be negative' };

  switch (mode.type) {
    case SPEND_MODES.UNLIMITED:
      return { allowed: true };
    case SPEND_MODES.LIMITED: {
      const maxPerTx = BigInt(mode.maxPerTx ?? 0);
      const maxDaily = BigInt(mode.maxDaily ?? 0);
      if (maxPerTx > 0n && a > maxPerTx) {
        return { allowed: false, reason: `exceeds maxPerTx ${maxPerTx}` };
      }
      if (maxDaily > 0n && s + a > maxDaily) {
        return { allowed: false, reason: `exceeds maxDaily ${maxDaily}` };
      }
      return { allowed: true };
    }
    case SPEND_MODES.REQUIRE_APPROVAL:
      return { allowed: false, reason: 'requires human approval', requiresApproval: true };
    default:
      return { allowed: false, reason: 'unknown spend mode' };
  }
}

/**
 * Takeover guard: run before committing a spend. If the wallet was taken over
 * mid-operation (control changed), the caller must roll back.
 * @param {{ type: string }} before - spend config captured before the op
 * @param {{ type: string }} after - spend config read after the op
 * @returns {boolean} true if control is unchanged and safe to commit
 */
export function takeoverGuard(before, after) {
  const beforeMode = resolveSpendMode(before);
  const afterMode = resolveSpendMode(after);
  // If the mode changed or approval was required, the agent lost autonomy.
  if (beforeMode.type !== afterMode.type) return false;
  if (afterMode.type === SPEND_MODES.REQUIRE_APPROVAL) return false;
  return true;
}

/**
 * Human takeover of an agent operation key.
 * Returns a new spend config (require-approval) and a rotated operation key seed.
 * @param {Buffer} masterKey
 * @param {string} agentId
 * @param {number} currentVersion
 * @returns {Promise<{ config, opKeySeed, version }>}
 */
export async function takeoverWallet(masterKey, agentId, currentVersion) {
  const version = currentVersion + 1;
  const opKeySeed = await import('./derivation.js').then(({ deriveOpKeySeed }) =>
    deriveOpKeySeed(masterKey, { agentId, version })
  );
  return {
    config: { type: SPEND_MODES.REQUIRE_APPROVAL, takenOverAt: Date.now() },
    opKeySeed,
    version
  };
}

export { publicKeyFingerprint };

export default {
  SPEND_MODES,
  resolveSpendMode,
  checkSpendAllowed,
  takeoverGuard,
  takeoverWallet
};