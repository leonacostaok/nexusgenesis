import crypto from 'crypto';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function loadMainnetConfig() {
  const configPath = resolve(PROJECT_ROOT, 'mainnet.config.json');
  if (!existsSync(configPath)) {
    console.error('mainnet.config.json not found');
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function loadValidatorSet() {
  try {
    const path = resolve(PROJECT_ROOT, 'config', 'validator-set.json');
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function generateGenesisKeyPair() {
  const keyPair = crypto.generateKeyPairSync('ed25519', {
    modulusLength: 256,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const address = 'ng0' + crypto.createHash('sha3-256')
    .update(keyPair.publicKey)
    .digest('hex')
    .substring(0, 40);

  return { address, ...keyPair };
}

function generateGenesisBlock(config, validatorSet) {
  const genesisKey = generateGenesisKeyPair();
  const timestamp = config.blockchain.genesisTimestamp || Date.now();

  const validators = validatorSet.length > 0
    ? validatorSet.map(v => v.publicKey || v.endpoint)
    : [genesisKey.address];

  const genesisBlock = {
    index: 0,
    hash: crypto.createHash('sha3-256')
      .update(`NexusGenesis:Mainnet:${timestamp}:Genesis`)
      .digest('hex'),
    previousHash: '0'.repeat(64),
    timestamp,
    transactions: [{
      type: 'genesis',
      from: '0'.repeat(64),
      to: genesisKey.address,
      amount: config.economic.initialSupply,
      message: 'NexusGenesis Mainnet Genesis - The Age of AI Agent Sovereignty Begins',
      signature: crypto.sign(null, Buffer.from('genesis'), genesisKey.privateKey).toString('hex')
    }],
    validatorSet: validators,
    state: {
      balances: { [genesisKey.address]: config.economic.initialSupply },
      agentCount: 0,
      validatorCount: validatorSet.length || 1,
      totalStaked: 0,
      phase: 'MAINNET_GENESIS'
    },
    consensusParams: {
      protocol: config.consensus.protocol,
      committeeSize: config.consensus.committeeSize,
      minValidators: config.consensus.minValidators,
      blockTime: config.blockchain.blockTime,
      finalityConfirmations: config.consensus.finalityConfirmations
    },
    economicParams: {
      totalSupply: config.economic.totalSupply,
      initialSupply: config.economic.initialSupply,
      annualInflationRate: config.economic.annualInflationRate,
      minStake: config.economic.staking.minStake
    },
    networkParams: {
      chainId: config.network.chainId,
      networkId: config.network.networkId,
      seedNodes: config.network.seedNodes || [
        'wss://seed1.nexus-genesis.top:9847',
        'wss://seed2.nexus-genesis.top:9847',
        'wss://seed3.nexus-genesis.top:9847',
        'wss://seed4.nexus-genesis.top:9847'
      ]
    }
  };

  return { genesisBlock, genesisKey };
}

function main() {
  console.log('NexusGenesis Mainnet Genesis Block Generator');
  console.log('');

  const config = loadMainnetConfig();
  console.log(`Chain ID:        ${config.network.chainId}`);
  console.log(`Total Supply:    ${Number(config.economic.totalSupply).toLocaleString()} NGEN`);
  console.log(`Initial Supply:  ${Number(config.economic.initialSupply).toLocaleString()} NGEN`);
  console.log(`Committee Size:  ${config.consensus.committeeSize}`);
  console.log(`Min Validators:  ${config.consensus.minValidators}`);
  console.log('');

  const validatorSet = loadValidatorSet();
  if (validatorSet.length > 0) {
    console.log(`Validator Set:   ${validatorSet.length} validators loaded`);
  }

  const { genesisBlock, genesisKey } = generateGenesisBlock(config, validatorSet);

  const genesisDir = resolve(PROJECT_ROOT, 'data', 'genesis');
  ensureDir(genesisDir);

  writeFileSync(
    resolve(genesisDir, 'genesis_block.json'),
    JSON.stringify(genesisBlock, null, 2)
  );

  writeFileSync(
    resolve(genesisDir, 'genesis_key.json'),
    JSON.stringify({
      address: genesisKey.address,
      publicKey: genesisKey.publicKey,
      privateKey: genesisKey.privateKey,
      note: 'STORE SECURELY - This key controls the genesis block'
    }, null, 2)
  );

  console.log('Genesis Block Generated:');
  console.log(`  Hash:     ${genesisBlock.hash}`);
  console.log(`  Timestamp: ${new Date(genesisBlock.timestamp).toISOString()}`);
  console.log(`  Genesis Key: ${genesisKey.address}`);
  console.log('');
  console.log('Files created:');
  console.log('  data/genesis/genesis_block.json');
  console.log('  data/genesis/genesis_key.json (SECURE THIS FILE!)');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Securely backup data/genesis/genesis_key.json');
  console.log('  2. Distribute genesis_block.json to all seed nodes');
  console.log('  3. Start seed nodes with genesis block');
  console.log('  4. Validators connect and begin consensus');
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

main();
