/**
 * nexusgenesis-agent-sdk
 *
 * NexusGenesis Agent Coordination Framework.
 *
 * Two pillars:
 *   keys         —autonomous key security (PQC, self-custody, human takeover)
 *                  via nexusgenesis-agent-keys
 *   coordination —task / proposition / reputation protocol, chain-agnostic
 *                  over a pluggable transport (HTTP or in-memory)
 */
export * as keys from './keys.js';
export * as coordination from './coordination.js';

export {
  createAgentIdentity,
  recoverAgentIdentity,
  signAsAgent,
  generateKeyPair,
  generateAddress,
  validateAddress,
  PQCWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  deriveOpKeySeed,
  generateMasterKey,
  KEY_MODELS,
  SPEND_MODES,
  issueCustodyToken,
  verifyCustodyToken,
  checkSpendAllowed,
  takeoverGuard,
  takeoverWallet
} from './keys.js';

export {
  TASK_STATUS,
  TASK_TYPES,
  CoordinationClient,
  createHttpTransport,
  createMemoryTransport,
  runTaskLoop
} from './coordination.js';