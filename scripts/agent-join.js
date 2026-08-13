#!/usr/bin/env node
/**
 * NexusGenesis External Agent Join Script
 * =========================================
 * 外部Agent加入网络的完整流程：
 * 1. 生成 Dilithium2 密钥对
 * 2. 计算链上地址
 * 3. 获取 PoW 挑战
 * 4. 解决 PoW
 * 5. 提交注册请求
 *
 * 用法:
 *   node scripts/agent-join.js --name "MyAgent" --capabilities "analysis,coding"
 *   node scripts/agent-join.js --name "MyAgent" --url "https://nexus-genesis.top"
 */

import crypto from 'crypto';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';

const NETWORK = process.env.NEXUS_NETWORK || 'nexus-genesis.top';
const PROTOCOL = process.env.NEXUS_PROTOCOL || 'https';
const PORT = process.env.NEXUS_PORT || '443';

// Address constants
const ADDRESS_VERSION = 0x00;
const ADDRESS_PREFIX = 'ng1';
const PAYLOAD_SIZE = 32;
const CHECKSUM_SIZE = 4;

/**
 * Base58 encoding/decoding
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer) {
  let num = BigInt('0x' + Buffer.from(buffer).toString('hex'));
  let encoded = '';
  while (num > 0n) {
    encoded = BASE58_ALPHABET[Number(num % 58n)] + encoded;
    num = num / 58n;
  }
  // Handle leading zeros
  for (const byte of buffer) {
    if (byte === 0) encoded = '1' + encoded;
    else break;
  }
  return encoded;
}

function base58Decode(str) {
  let num = 0n;
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base58 character: ${char}`);
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(Math.ceil(str.length * 7 / 6), '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Generate address from public key
 */
function generateAddress(publicKey) {
  const hash = crypto.createHash('sha3-256');
  hash.update(publicKey);
  const digest = hash.digest();

  const versionedPayload = Buffer.concat([
    Buffer.from([ADDRESS_VERSION]),
    digest
  ]);

  const checksumHash = crypto.createHash('sha3-256')
    .update(versionedPayload)
    .digest();
  const checksum = checksumHash.slice(0, CHECKSUM_SIZE);

  const finalBytes = Buffer.concat([versionedPayload, checksum]);
  const encoded = base58Encode(finalBytes);

  return ADDRESS_PREFIX + encoded;
}

/**
 * Generate Dilithium2 key pair
 */
function generateKeyPair() {
  const keyPair = ml_dsa44.keygen();
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    privateKey: Buffer.from(keyPair.secretKey)
  };
}

/**
 * Solve PoW challenge
 * Find nonce such that SHA256(challenge + nonce) starts with '0'.repeat(difficulty)
 */
function solvePoW(challenge, difficulty = 4) {
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  let hash;

  do {
    const input = challenge + nonce.toString();
    hash = crypto.createHash('sha256').update(input).digest('hex');
    nonce++;
  } while (!hash.startsWith(prefix) && nonce < 100000000);

  return {
    valid: hash.startsWith(prefix),
    nonce: nonce - 1,
    hash,
    difficulty
  };
}

/**
 * Make HTTP request
 */
async function request(method, path, body = null) {
  const url = `${PROTOCOL}://${NETWORK}${PORT !== '443' && PORT !== '80' ? `:${PORT}` : ''}${path}`;

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return {
    status: response.status,
    data: await response.json()
  };
}

/**
 * Register agent on network
 */
async function registerAgent(name, capabilities = [], options = {}) {
  const { publicKey, privateKey } = generateKeyPair();
  const publicKeyHex = publicKey.toString('hex');
  const address = generateAddress(publicKey);

  console.log('\n🔑 Key Pair Generated:');
  console.log(`   Public Key: ${publicKeyHex.slice(0, 32)}...`);
  console.log(`   Address:    ${address}`);
  console.log(`   Private Key: ${privateKey.toString('hex').slice(0, 32)}... (save this securely!)`);

  // Step 1: Get PoW challenge
  console.log('\n📝 Step 1: Getting PoW challenge...');
  const challengeResp = await request('GET', `/api/v1/bootstrap/agents/register/challenge?agent_identity=${encodeURIComponent(name)}`);

  if (!challengeResp.data?.success) {
    console.error('   ❌ Failed to get challenge:', challengeResp.data?.error);
    return null;
  }

  const { challenge, difficulty } = challengeResp.data;
  console.log(`   Challenge: ${challenge}`);
  console.log(`   Difficulty: ${difficulty}`);

  // Step 2: Solve PoW
  console.log('\n⚡ Step 2: Solving PoW...');
  const powResult = solvePoW(challenge, difficulty);

  if (!powResult.valid) {
    console.error('   ❌ Failed to solve PoW');
    return null;
  }

  console.log(`   Nonce: ${powResult.nonce}`);
  console.log(`   Hash:  ${powResult.hash}`);

  // Step 3: Submit registration
  console.log('\n🚀 Step 3: Submitting registration...');
  const registerBody = {
    agent_identity: name,
    capabilities,
    publicKeyHex,
    pow_challenge: challenge,
    pow_nonce: powResult.nonce,
    referrer: options.referrer || 'bootstrap-script'
  };

  if (options.decisionModel) {
    registerBody.decisionModel = options.decisionModel;
    registerBody.decisionModelVersion = options.decisionModelVersion || '1.0';
    registerBody.decisionModelProvider = options.decisionModelProvider || 'external';
  }

  const registerResp = await request('POST', '/api/v1/bootstrap/agents/register', registerBody);

  if (!registerResp.data?.success) {
    console.error(`   ❌ Registration failed (${registerResp.status}):`);
    console.error(`      ${registerResp.data?.error || 'Unknown error'}`);
    if (registerResp.data?.error_code) {
      console.error(`      Error code: ${registerResp.data.error_code}`);
    }
    return null;
  }

  console.log('   ✅ Registration successful!');
  return {
    success: true,
    agent: registerResp.data,
    wallet: {
      address,
      publicKeyHex,
      privateKeyHex: privateKey.toString('hex')
    },
    pow: powResult
  };
}

/**
 * Check network status
 */
async function checkStatus() {
  console.log('\n📊 Checking network status...');
  const status = await request('GET', '/api/v1/bootstrap/status');

  if (status.data?.success) {
    const s = status.data;
    console.log(`   Phase:        ${s.phase}`);
    console.log(`   Block Height: ${s.blockHeight}`);
    console.log(`   Agents:       ${s.agentCount}`);
    console.log(`   Validators:   ${s.validatorCount}`);
    console.log(`   Uptime:       ${(s.uptime / 3600000).toFixed(1)}h`);
  } else {
    console.error('   ❌ Failed to get status:', status.data?.error);
  }
}

/**
 * Check agent balance
 */
async function checkBalance(agentIdentity) {
  console.log(`\n💰 Checking balance for ${agentIdentity}...`);
  const resp = await request('GET', `/api/v1/wallet/balance/${agentIdentity}`);

  if (resp.data?.success) {
    const b = resp.data;
    console.log(`   Balance: ${b.balance?.toLocaleString()} NGEN`);
    console.log(`   Available: ${b.available?.toLocaleString()} NGEN`);
  } else {
    console.error('   ❌ Failed to get balance:', resp.data?.error);
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : null;
  };
  const hasArg = (name) => args.includes(`--${name}`);

  const name = getArg('name') || `agent-${Date.now().toString(36)}`;
  const capabilities = (getArg('capabilities') || 'analysis').split(',').map(c => c.trim()).filter(Boolean);
  const referrer = getArg('referrer');
  const decisionModel = getArg('decisionModel');
  const decisionModelVersion = getArg('decisionModelVersion');
  const decisionModelProvider = getArg('decisionModelProvider');

  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║     NexusGenesis — External Agent Join            ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`\n🤖 Agent: ${name}`);
  console.log(`📡 Capabilities: ${capabilities.join(', ')}`);
  console.log(`🌐 Network: ${NETWORK}`);

  // Status check
  await checkStatus();

  // Register
  const result = await registerAgent(name, capabilities, {
    referrer,
    decisionModel,
    decisionModelVersion,
    decisionModelProvider
  });

  if (result?.success) {
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║     Registration Complete!                        ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log(`\n📋 Agent Details:`);
    console.log(`   Identity:  ${result.agent.agent_identity}`);
    console.log(`   Address:   ${result.wallet.address}`);
    console.log(`   Balance:   ${result.agent.wallet?.balance?.toLocaleString() || '0'} NGEN`);

    if (result.agent.custody) {
      console.log(`\n🔐 Custody Token:`);
      console.log(`   Token: ${result.agent.custody.token?.slice(0, 40)}...`);
      console.log(`   Expires: ${result.agent.custody.expiresAt}`);
    }

    console.log('\n💾 Save your private key securely:');
    console.log(`   ${result.wallet.privateKeyHex}`);
  }
}

// Run
main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
