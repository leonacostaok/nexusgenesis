/**
 * NexusGenesis - Post-Quantum Cryptography Module
 * 基于 @noble/post-quantum 的真实抗量子密码学实现
 * 
 * 算法：Dilithium2 (NIST FIPS 204)
 * 哈希：SHA3-256
 */

import crypto from 'crypto';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';

// 密钥长度常量 (ml_dsa44 / Dilithium2)
const DILITHIUM2_PUBLIC_KEY_LENGTH = 1312;
const DILITHIUM2_PRIVATE_KEY_LENGTH = 2560;
const DILITHIUM2_SIGNATURE_LENGTH = 2420;

console.log('[PQC] Using real Dilithium2 implementation from @noble/post-quantum');

/**
 * 生成Dilithium2密钥对
 * @returns {Promise<{publicKey: Buffer, privateKey: Buffer}>} 密钥对
 */
export async function generateKeyPair() {
  try {
    const keyPair = ml_dsa44.keygen();
    return {
      publicKey: Buffer.from(keyPair.publicKey),
      privateKey: Buffer.from(keyPair.secretKey)
    };
  } catch (error) {
    console.error('[PQC] Error generating Dilithium2 key pair:', error.message);
    throw error;
  }
}

/**
 * 使用Dilithium2签名
 * @param {string|Buffer} message 要签名的消息
 * @param {Buffer} privateKey 私钥
 * @returns {Promise<Buffer>} 签名
 */
export async function sign(message, privateKey) {
  try {
    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    
    // 验证私钥长度
    if (privateKey.length !== DILITHIUM2_PRIVATE_KEY_LENGTH) {
      throw new Error(`Invalid private key length: ${privateKey.length}, expected: ${DILITHIUM2_PRIVATE_KEY_LENGTH}`);
    }
    
    const signature = ml_dsa44.sign(messageBuffer, privateKey);
    return Buffer.from(signature);
  } catch (error) {
    console.error('[PQC] Error signing message:', error.message);
    throw error;
  }
}

/**
 * 使用Dilithium2验证签名
 * @param {string|Buffer} message 原始消息
 * @param {Buffer} signature 签名
 * @param {Buffer} publicKey 公钥
 * @returns {Promise<boolean>} 验证结果
 */
export async function verify(message, signature, publicKey) {
  try {
    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    
    // 验证公钥长度
    if (publicKey.length !== DILITHIUM2_PUBLIC_KEY_LENGTH) {
      console.error(`[PQC] Invalid public key length: ${publicKey.length}, expected: ${DILITHIUM2_PUBLIC_KEY_LENGTH}`);
      return false;
    }
    
    // 验证签名长度
    if (signature.length !== DILITHIUM2_SIGNATURE_LENGTH) {
      console.error(`[PQC] Invalid signature length: ${signature.length}, expected: ${DILITHIUM2_SIGNATURE_LENGTH}`);
      return false;
    }
    
    const isValid = ml_dsa44.verify(signature, messageBuffer, publicKey);
    return isValid;
  } catch (error) {
    console.error('[PQC] Error verifying signature:', error.message);
    return false;
  }
}

/**
 * 安全哈希函数
 * @param {string|Buffer} data 要哈希的数据
 * @param {string} algorithm 哈希算法，默认为sha3-256
 * @returns {string} 哈希值（十六进制）
 */
export function hash(data, algorithm = 'sha3-256') {
  const hash = crypto.createHash(algorithm);
  hash.update(typeof data === 'string' ? data : data);
  return hash.digest('hex');
}

/**
 * 生成随机数
 * @param {number} length 随机数长度（字节）
 * @returns {Buffer} 随机数
 */
export function randomBytes(length) {
  return crypto.randomBytes(length);
}

/**
 * 生成随机字符串
 * @param {number} length 字符串长度
 * @returns {string} 随机字符串
 */
export function randomString(length) {
  const bytes = randomBytes(length);
  return bytes.toString('hex').slice(0, length);
}

/**
 * 安全的时间戳验证
 * @param {number} timestamp 时间戳
 * @param {number} maxTimeDiff 最大时间差（毫秒）
 * @returns {boolean} 验证结果
 */
export function validateTimestamp(timestamp, maxTimeDiff = 2 * 60 * 1000) {
  const now = Date.now();
  const timeDiff = Math.abs(now - timestamp);
  return timeDiff <= maxTimeDiff;
}

/**
 * 防重放攻击检查
 * @param {string} nonce 随机数
 * @param {Set} usedNonces 已使用的随机数集合
 * @returns {boolean} 检查结果
 */
export function checkNonce(nonce, usedNonces) {
  if (usedNonces.has(nonce)) {
    return false;
  }
  usedNonces.add(nonce);
  return true;
}

/**
 * 获取PQC算法信息
 * @returns {object} 算法信息
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
