/**
 * nexusgenesis-agent-sdk —keys module
 *
 * High-level agent identity + key security, built on nexusgenesis-agent-keys.
 * Every agent gets a PQC key pair; private keys never leave the caller; a
 * human can always take over an autonomous agent.
 *
 * This is the differentiation layer: private keys are never held on a server.
 */
import {
  generateKeyPair,
  sign,
  verify,
  generateAddress,
  validateAddress,
  PQCWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  deriveOpKeySeed,
  generateMasterKey,
  KEY_MODELS,
  issueCustodyToken,
  verifyCustodyToken,
  checkSpendAllowed,
  takeoverGuard,
  takeoverWallet,
  SPEND_MODES
} from 'nexusgenesis-agent-keys';

/**
 * Generate a brand-new autonomous agent identity.
 * Returns public material (safe to register) + an encrypted private-key
 * envelope the caller keeps locally. The private key must never be sent out.
 * @param {object} options { password, metadata }
 * @returns {Promise<{ agentId, address, publicKeyHex, envelope, keyModel }>}
 */
export async function createAgentIdentity(options = {}) {
  const { password, metadata = {} } = options;
  if (!password || typeof password !== 'string' || password.length < 8) {
    // SECURITY FIX: a hard-coded default password made every self-sovereign
    // identity recoverable by anyone who knows the default. A real password is
    // now required; the caller owns the envelope's confidentiality.
    throw new Error('createAgentIdentity requires a password of at least 8 characters');
  }
  const { publicKey, privateKey } = await generateKeyPair();
  const address = generateAddress(publicKey);
  const envelope = encryptPrivateKey(privateKey, password, {
    address,
    publicKey: publicKey.toString('hex'),
    keyModel: KEY_MODELS.SELF_SOVEREIGN
  });
  return {
    address,
    publicKeyHex: publicKey.toString('hex'),
    envelope,
    keyModel: KEY_MODELS.SELF_SOVEREIGN,
    metadata
  };
}

/**
 * Recover an agent identity from its encrypted envelope.
 * @param {object} envelope from createAgentIdentity / exportEncrypted
 * @param {string} password
 * @returns {import('nexusgenesis-agent-keys').PQCWallet | null}
 */
export function recoverAgentIdentity(envelope, password) {
  return PQCWallet.importEncrypted(envelope, password);
}

/**
 * Sign an arbitrary payload with a wallet.
 * @param {object} wallet
 * @param {string|object} message
 * @returns {Promise<string>} hex signature
 */
export async function signAsAgent(wallet, message) {
  return wallet.sign(message);
}

export {
  generateKeyPair,
  sign,
  verify,
  generateAddress,
  validateAddress,
  PQCWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  deriveOpKeySeed,
  generateMasterKey,
  KEY_MODELS,
  issueCustodyToken,
  verifyCustodyToken,
  checkSpendAllowed,
  takeoverGuard,
  takeoverWallet,
  SPEND_MODES
};

export default {
  createAgentIdentity,
  recoverAgentIdentity,
  signAsAgent,
  generateKeyPair,
  generateAddress,
  validateAddress,
  encryptPrivateKey,
  decryptPrivateKey,
  KEY_MODELS,
  SPEND_MODES
};