/**
 * nexusgenesis-agent-keys —PQC (Post-Quantum Cryptography) primitives
 *
 * Real Dilithium2 (NIST FIPS 204) implementation backed by @noble/post-quantum.
 * Signatures and keys are quantum-resistant; private keys never leave the caller.
 *
 * Extracted from NexusGenesis src/crypto/pqc.js and made dependency-free.
 */
import crypto from 'node:crypto';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';

// ml_dsa44 / Dilithium2 key & signature lengths (bytes)
export const DILITHIUM2_PUBLIC_KEY_LENGTH = 1312;
export const DILITHIUM2_PRIVATE_KEY_LENGTH = 2560;
export const DILITHIUM2_SIGNATURE_LENGTH = 2420;

/**
 * Generate a Dilithium2 key pair.
 * @returns {Promise<{ publicKey: Buffer, privateKey: Buffer }>}
 */
export async function generateKeyPair() {
  const keyPair = ml_dsa44.keygen();
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    privateKey: Buffer.from(keyPair.secretKey)
  };
}

/**
 * Sign a message with a Dilithium2 private key.
 * @param {string|Buffer} message
 * @param {Buffer} privateKey
 * @returns {Promise<Buffer>}
 */
export async function sign(message, privateKey) {
  const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
  if (privateKey.length !== DILITHIUM2_PRIVATE_KEY_LENGTH) {
    throw new Error(`Invalid private key length: ${privateKey.length}, expected: ${DILITHIUM2_PRIVATE_KEY_LENGTH}`);
  }
  const signature = ml_dsa44.sign(messageBuffer, privateKey);
  return Buffer.from(signature);
}

/**
 * Verify a Dilithium2 signature.
 * @param {string|Buffer} message
 * @param {Buffer} signature
 * @param {Buffer} publicKey
 * @returns {Promise<boolean>}
 */
export async function verify(message, signature, publicKey) {
  const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
  if (publicKey.length !== DILITHIUM2_PUBLIC_KEY_LENGTH) return false;
  if (signature.length !== DILITHIUM2_SIGNATURE_LENGTH) return false;
  return ml_dsa44.verify(signature, messageBuffer, publicKey);
}

/**
 * Secure hash (default SHA3-256).
 * @param {string|Buffer} data
 * @param {string} algorithm
 * @returns {string} hex digest
 */
export function hash(data, algorithm = 'sha3-256') {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * Cryptographically secure random bytes.
 * @param {number} length
 * @returns {Buffer}
 */
export function randomBytes(length) {
  return crypto.randomBytes(length);
}

/**
 * Cryptographically secure random hex string.
 * @param {number} length
 * @returns {string}
 */
export function randomString(length) {
  return randomBytes(length).toString('hex').slice(0, length);
}

/**
 * Validate a timestamp is within a max skew window (anti-replay helper).
 * @param {number} timestamp
 * @param {number} maxTimeDiff ms
 * @returns {boolean}
 */
export function validateTimestamp(timestamp, maxTimeDiff = 2 * 60 * 1000) {
  return Math.abs(Date.now() - timestamp) <= maxTimeDiff;
}

/**
 * Anti-replay nonce check.
 * @param {string} nonce
 * @param {Set<string>} usedNonces
 * @returns {boolean}
 */
export function checkNonce(nonce, usedNonces) {
  if (usedNonces.has(nonce)) return false;
  usedNonces.add(nonce);
  return true;
}

/**
 * Algorithm metadata.
 * @returns {object}
 */
export function getPQCInfo() {
  return {
    algorithm: 'Dilithium2',
    library: '@noble/post-quantum',
    publicKeyLength: DILITHIUM2_PUBLIC_KEY_LENGTH,
    privateKeyLength: DILITHIUM2_PRIVATE_KEY_LENGTH,
    signatureLength: DILITHIUM2_SIGNATURE_LENGTH,
    nistStandard: 'FIPS 204'
  };
}

export default {
  generateKeyPair,
  sign,
  verify,
  hash,
  randomBytes,
  randomString,
  validateTimestamp,
  checkNonce,
  getPQCInfo
};