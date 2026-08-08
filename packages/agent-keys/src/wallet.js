/**
 * nexusgenesis-agent-keys —PQC wallet & transaction
 *
 * Dilithium2-based wallet with encrypted save/load, sign/verify, and
 * AES-256-GCM export/import. Private keys never leave the caller.
 * Extracted from NexusGenesis src/wallet/pqcWallet.js.
 */
import { generateKeyPair, sign, verify, hash } from './pqc.js';
import { generateAddress, validateAddress } from './address.js';
import { encryptPrivateKey, decryptPrivateKey, isValidEnvelope } from './encryption.js';

/**
 * PQC wallet.
 */
export class PQCWallet {
  constructor(publicKey, privateKey, balance = 0n, nonce = 0) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.address = generateAddress(publicKey);
    this.balance = balance;
    this.nonce = nonce;
  }

  get secretKey() {
    return this.privateKey;
  }

  /** Generate a new wallet. @returns {Promise<PQCWallet>} */
  static async generate(initialBalance = 0n) {
    const { publicKey, privateKey } = await generateKeyPair();
    return new PQCWallet(publicKey, privateKey, initialBalance);
  }

  async sign(message) {
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
    const signature = await sign(messageStr, this.privateKey);
    return signature.toString('hex');
  }

  async verify(message, signature, publicKey) {
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
    const sigBuffer = typeof signature === 'string' ? Buffer.from(signature, 'hex') : signature;
    const pk = publicKey || this.publicKey;
    return verify(messageStr, sigBuffer, pk);
  }

  static async verify(message, signature, publicKey) {
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
    const sigBuffer = typeof signature === 'string' ? Buffer.from(signature, 'hex') : signature;
    const pkBuffer = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
    return verify(messageStr, sigBuffer, pkBuffer);
  }

  static async signWithPrivateKey(message, privateKeyHex) {
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    const signature = await sign(messageStr, privateKey);
    return signature.toString('hex');
  }

  async signTransaction(transaction) {
    const { signature, ...txData } = transaction;
    const txStr = JSON.stringify(txData, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    return this.sign(txStr);
  }

  async verifyTransaction(transaction, signature) {
    const { signature: _, ...txData } = transaction;
    const txStr = JSON.stringify(txData, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    return this.verify(txStr, signature, this.publicKey);
  }

  updateBalance(amount) {
    this.balance += amount;
  }

  hasEnoughBalance(amount) {
    return this.balance >= amount;
  }

  /** Encrypt-export the wallet (AES-256-GCM). @returns {object|null} envelope */
  exportEncrypted(password) {
    if (!this.privateKey) return null;
    return encryptPrivateKey(this.privateKey, password, {
      address: this.address,
      publicKey: this.publicKey.toString('hex')
    });
  }

  static importEncrypted(envelope, password) {
    try {
      if (!isValidEnvelope(envelope)) return null;
      const privateKey = decryptPrivateKey(envelope, password);
      const publicKey = Buffer.from(envelope.metadata.publicKey, 'hex');
      return new PQCWallet(publicKey, privateKey, 0n);
    } catch (e) {
      return null;
    }
  }

  getInfo() {
    return {
      address: this.address,
      balance: this.balance.toString(),
      publicKey: this.publicKey ? this.publicKey.toString('hex') : null,
      nonce: this.nonce
    };
  }
}

/**
 * Basic transaction.
 */
export class Transaction {
  static create(wallet, to, amount, fee = 1n, type = 'TRANSFER', data = {}) {
    const { valid, reason } = validateAddress(to);
    if (!valid) throw new Error(`Invalid recipient address: ${reason}`);
    if (!wallet.hasEnoughBalance(amount + fee)) throw new Error('Insufficient balance');
    return new Transaction(wallet.address, to, amount, fee, type, data);
  }

  constructor(from, to, amount, fee = 1n, type = 'TRANSFER', data = {}) {
    this.id = `tx-${hash(Date.now().toString() + Math.random().toString(), 'sha3-256').slice(0, 16)}`;
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.fee = fee;
    this.type = type;
    this.data = data;
    this.timestamp = Date.now();
    this.signature = null;
  }

  async sign(wallet) {
    this.signature = await wallet.signTransaction(this);
    return this;
  }

  async verify(wallet) {
    if (!this.signature) return false;
    return wallet.verifyTransaction(this, this.signature);
  }

  async verifySignature(publicKey) {
    if (!this.signature) return false;
    const txData = this.toJSON ? this.toJSON() : this;
    const sigBuffer = typeof this.signature === 'string' ? Buffer.from(this.signature, 'hex') : this.signature;
    const txStr = JSON.stringify(txData, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    return verify(txStr, sigBuffer, publicKey);
  }

  getHash() {
    const { signature, ...txData } = this;
    return hash(JSON.stringify(txData), 'sha3-256');
  }

  toJSON() {
    return { ...this, amount: this.amount.toString(), fee: this.fee.toString() };
  }
}

export default PQCWallet;