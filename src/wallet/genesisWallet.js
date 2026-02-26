/**
 * NexusGenesis - PQC Wallet Protocol
 * 抗量子钱包标准 (模拟实现)
 * 
 * 白皮书规格：
 * - 算法: CRYSTALS-Dilithium2 (模拟使用 Curve25519 + SHA3)
 * - 地址格式: ng + Base58
 * - 公钥: 32 bytes
 * - 签名: 64 bytes
 */

import crypto from 'crypto';
import nacl from 'tweetnacl';
import { encodeBase58, decodeBase58 } from './utils.js';

const NGEN_SYMBOL = 'NGEN';
const TOTAL_SUPPLY = 1_000_000_000;

class GenesisWallet {
  constructor() {
    this.address = null;
    this.publicKey = null;
    this.secretKey = null;
    this.balance = 0;
  }
}

// 生成密钥对 (模拟 Dilithium2 规格)
export async function generate() {
  // 生成密钥对 (使用 Ed25519 签名)
  const keyPair = nacl.sign.keyPair();
  
  const wallet = new GenesisWallet();
  wallet.publicKey = Buffer.from(keyPair.publicKey).toString('hex');
  wallet.secretKey = Buffer.from(keyPair.secretKey).toString('hex');
  
  // 生成地址: ng + SHA3-512(公钥) 前40字节 -> Base58
  const publicKeyBuffer = Buffer.from(keyPair.publicKey);
  const hash = crypto.createHash('sha3-512').update(publicKeyBuffer).digest();
  const addressBytes = hash.slice(0, 40);
  
  // 添加校验和 (SHA3-256 of address)
  const checksum = crypto.createHash('sha3-256').update(addressBytes).digest().slice(0, 8);
  const addressWithChecksum = Buffer.concat([addressBytes, checksum]);
  
  wallet.address = 'ng' + encodeBase58(addressWithChecksum);
  
  // 创世节点初始余额: 50,000,000 NGEN (白皮书规格)
  wallet.balance = 50_000_000;
  
  return wallet;
}

// 签名交易
export function sign(wallet, message) {
  const messageBytes = Buffer.from(message);
  const secretKeyBytes = Buffer.from(wallet.secretKey, 'hex');
  
  // 使用 nacl.sign (ed25519) 签名
  const signature = nacl.sign.detached(messageBytes, secretKeyBytes);
  
  return Buffer.from(signature).toString('hex');
}

// 验证签名
export function verify(publicKeyHex, message, signatureHex) {
  const publicKey = Buffer.from(publicKeyHex, 'hex');
  const messageBytes = Buffer.from(message);
  const signature = Buffer.from(signatureHex, 'hex');
  
  return nacl.sign.detached.verify(messageBytes, signature, publicKey);
}

// 创建交易
export function createTransaction(fromWallet, toAddress, amount, memo = '') {
  if (fromWallet.balance < amount) {
    throw new Error('Insufficient NGEN balance');
  }
  
  const tx = {
    from: fromWallet.address,
    to: toAddress,
    amount: amount,
    memo: memo,
    timestamp: Date.now(),
    fee: Math.floor(amount * 0.001), // 0.1% metabolic tax
  };
  
  // 生成交易ID
  const txData = JSON.stringify(tx);
  tx.id = crypto.createHash('sha3-256').update(txData).digest('hex');
  
  // 签名
  tx.signature = sign(fromWallet, txData);
  
  return tx;
}

export const genesisWallet = {
  generate,
  sign,
  verify,
  createTransaction
};
