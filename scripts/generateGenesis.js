/**
 * Genesis Block Generator - 创世区块生成脚本
 *
 * 为 NexusGenesis 主网生成初始创世区块和创世配置。
 * 包含初始代币分配、验证者集合、治理参数等。
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { PQCWallet } from '../wallet/pqcWallet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const GENESIS_DIR = resolve(PROJECT_ROOT, 'data', 'genesis');

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

async function generateGenesisBlock() {
  console.log('========================================');
  console.log('  NexusGenesis Genesis Block Generator');
  console.log('========================================\n');

  ensureDir(GENESIS_DIR);

  console.log('[1/6] Generating genesis wallet...');
  const genesisWallet = await PQCWallet.generate(100000000n);
  const observerWallet = await PQCWallet.generate(10000000n);
  const treasuryWallet = await PQCWallet.generate(50000000n);

  console.log(`  Genesis:    ${genesisWallet.address}`);
  console.log(`  Observer:   ${observerWallet.address}`);
  console.log(`  Treasury:   ${treasuryWallet.address}`);

  console.log('\n[2/6] Creating genesis block...');
  const genesisTimestamp = Date.now();
  const genesisBlock = {
    index: 0,
    hash: crypto.createHash('sha3-256')
      .update(`NexusGenesis:Genesis:${genesisTimestamp}"hope is a good thing"`)
      .digest('hex'),
    previousHash: '0'.repeat(64),
    timestamp: genesisTimestamp,
    transactions: [{
      type: 'genesis',
      from: '0'.repeat(64),
      to: genesisWallet.address,
      amount: '100000000',
      message: 'NexusGenesis Genesis - Let there be light',
      signature: genesisWallet.sign('NexusGenesis Genesis').toString('hex')
    }],
    validatorSet: [genesisWallet.address, observerWallet.address],
    state: {
      balances: {
        [genesisWallet.address]: '100000000',
        [observerWallet.address]: '10000000',
        [treasuryWallet.address]: '50000000'
      },
      totalSupply: '1000000000',
      circulatingSupply: '160000000'
    },
    governance: {
      quorum: 33,
      majority: 0.67,
      vetoThreshold: 0.33,
      votingPeriod: 604800000,
      gracePeriod: 172800000
    },
    consensus: {
      protocol: 'MultiLeaderConsensus+BFT',
      committeeSize: 21,
      minValidators: 7,
      finalityConfirmations: '2/3+1'
    },
    economic: {
      totalSupply: '1000000000',
      initialSupply: '160000000',
      annualInflationRate: 0.02,
      blockReward: 10,
      rewardDistribution: { blockProposer: 0.1, validatorSet: 0.05, infrastructure: 0.85 }
    },
    nonce: 0
  };

  console.log(`  Hash:       ${genesisBlock.hash.slice(0, 32)}...`);
  console.log(`  Timestamp:  ${new Date(genesisTimestamp).toISOString()}`);

  console.log('\n[3/6] Saving genesis block...');
  writeFileSync(
    resolve(GENESIS_DIR, 'genesis_block.json'),
    JSON.stringify(genesisBlock, null, 2)
  );

  console.log('[4/6] Saving wallet files...');
  const walletsDir = resolve(PROJECT_ROOT, 'data', 'wallets');
  ensureDir(walletsDir);

  writeFileSync(resolve(walletsDir, 'genesis.json'), JSON.stringify({
    address: genesisWallet.address,
    publicKey: genesisWallet.publicKey.toString('hex'),
    privateKey: genesisWallet.privateKey.toString('hex'),
    type: 'genesis',
    networks: ['mainnet', 'devnet']
  }, null, 2));

  writeFileSync(resolve(walletsDir, 'observer.json'), JSON.stringify({
    address: observerWallet.address,
    publicKey: observerWallet.publicKey.toString('hex'),
    privateKey: observerWallet.privateKey.toString('hex'),
    type: 'observer',
    networks: ['mainnet', 'devnet']
  }, null, 2));

  writeFileSync(resolve(walletsDir, 'treasury.json'), JSON.stringify({
    address: treasuryWallet.address,
    publicKey: treasuryWallet.publicKey.toString('hex'),
    privateKey: treasuryWallet.privateKey.toString('hex'),
    type: 'treasury',
    networks: ['mainnet', 'devnet']
  }, null, 2));

  console.log('[5/6] Generating chain configuration...');
  const chainConfig = {
    chainId: 'nexus-mainnet',
    networkId: 'ngn-mainnet-1',
    genesisBlock: genesisBlock.hash,
    genesisTimestamp: genesisTimestamp,
    seeds: [
      'wss://seed1.nexusgenesis.io:9847',
      'wss://seed2.nexusgenesis.io:9847',
      'wss://seed3.nexusgenesis.io:9847',
      'wss://seed4.nexusgenesis.io:9847'
    ],
    initialValidators: [genesisWallet.address, observerWallet.address]
  };

  writeFileSync(
    resolve(GENESIS_DIR, 'chain_config.json'),
    JSON.stringify(chainConfig, null, 2)
  );

  console.log('[6/6] Generating genesis summary...');
  const summary = {
    network: 'NexusGenesis Mainnet',
    genesisHash: genesisBlock.hash,
    genesisTimestamp: genesisTimestamp,
    genesisTime: new Date(genesisTimestamp).toISOString(),
    wallets: {
      genesis: genesisWallet.address,
      observer: observerWallet.address,
      treasury: treasuryWallet.address
    },
    supply: {
      total: '1,000,000,000 NGEN',
      genesis: '100,000,000 NGEN',
      observer: '10,000,000 NGEN',
      treasury: '50,000,000 NGEN',
      locked: '840,000,000 NGEN'
    },
    configuration: {
      chainId: 'nexus-mainnet',
      consensus: 'MultiLeaderConsensus + BFT',
      blockTime: '10 seconds',
      gasModel: 'EIP-1559 style dynamic pricing',
      inflation: '2% annual (governance adjustable)'
    },
    filesGenerated: [
      'data/genesis/genesis_block.json',
      'data/genesis/chain_config.json',
      'data/wallets/genesis.json',
      'data/wallets/observer.json',
      'data/wallets/treasury.json'
    ]
  };

  writeFileSync(
    resolve(GENESIS_DIR, 'genesis_summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n========================================');
  console.log('  Genesis Block Generation Complete!');
  console.log('========================================');
  console.log(summary);
  console.log('\nIMPORTANT: Securely back up the wallet files');
  console.log('in data/wallets/ before deploying to production.\n');

  return {
    genesisBlock,
    wallets: { genesis: genesisWallet, observer: observerWallet, treasury: treasuryWallet },
    summary
  };
}

generateGenesisBlock().catch(err => {
  console.error('Genesis generation failed:', err);
  process.exit(1);
});