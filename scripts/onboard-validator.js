/**
 * NexusGenesis Validator Onboarding Tool
 *
 * 用法:
 *   node scripts/onboard-validator.js --stake 100000 --name "MyValidator" --region "asia-east"
 *
 * 功能:
 *   1. 生成 PQC 验证者钱包
 *   2. 验证最低质押要求 (100K NGEN)
 *   3. 生成节点配置文件
 *   4. 输出注册指令
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const VALIDATORS_DIR = resolve(PROJECT_ROOT, 'data', 'validators');

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    stake: 100000,
    name: `Validator-${crypto.randomBytes(4).toString('hex')}`,
    region: 'unknown',
    port: 9848
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stake' && args[i + 1]) {
      config.stake = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--name' && args[i + 1]) {
      config.name = args[i + 1];
      i++;
    } else if (args[i] === '--region' && args[i + 1]) {
      config.region = args[i + 1];
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      config.port = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--endpoint' && args[i + 1]) {
      config.endpoint = args[i + 1];
      i++;
    }
  }

  return config;
}

async function onboardValidator(config) {
  console.log('========================================');
  console.log('  NexusGenesis Validator Onboarding');
  console.log('========================================\n');

  const MIN_STAKE = 100000;

  ensureDir(VALIDATORS_DIR);

  console.log('[1/5] Validating stake requirement...');
  if (config.stake < MIN_STAKE) {
    console.error(`❌ Minimum stake: ${MIN_STAKE} NGEN. Provided: ${config.stake} NGEN`);
    process.exit(1);
  }
  console.log(`  ✅ Stake: ${config.stake} NGEN (minimum met)\n`);

  console.log('[2/5] Loading PQC wallet module...');
  let PQCWallet;
  try {
    const walletModule = await import('../src/wallet/pqcWallet.js');
    PQCWallet = walletModule.PQCWallet;
  } catch (err) {
    console.error(`  ❌ Failed to load wallet module: ${err.message}`);
    process.exit(1);
  }
  console.log('  ✅ Wallet module loaded\n');

  console.log('[3/5] Generating PQC validator wallet...');
  const stakeBigInt = BigInt(config.stake);
  const wallet = await PQCWallet.generate(stakeBigInt, config.name);
  console.log(`  Address:    ${wallet.address}`);
  console.log(`  Balance:    ${wallet.balance.toString()} NGEN`);
  console.log('  ✅ Wallet generated\n');

  console.log('[4/5] Creating validator configuration...');
  const validatorId = `validator-${crypto.randomBytes(8).toString('hex')}`;
  const nodeId = crypto.createHash('sha3-256')
    .update(`${validatorId}:${wallet.address}:${Date.now()}`)
    .digest('hex');

  const validatorConfig = {
    validatorId,
    nodeId,
    name: config.name,
    publicKey: wallet.publicKey.toString('hex'),
    address: wallet.address,
    stake: config.stake,
    region: config.region,
    endpoint: config.endpoint || `wss://${config.name.toLowerCase().replace(/\s+/g, '-')}.nexusgenesis.io:${config.port}`,
    port: config.port,
    registeredAt: new Date().toISOString(),
    status: 'pending',
    metadata: {
      region: config.region,
      stakingAmount: config.stake,
      walletBalance: wallet.balance.toString()
    }
  };

  const configPath = resolve(VALIDATORS_DIR, `${validatorId}.json`);
  writeFileSync(configPath, JSON.stringify(validatorConfig, null, 2));
  console.log(`  ✅ Config saved: ${configPath}\n`);

  console.log('[5/5] Generating docker-compose override...');
  const dockerOverride = generateDockerOverride(config, validatorId, wallet);

  const overridePath = resolve(PROJECT_ROOT, `docker-compose.${validatorId}.yml`);
  writeFileSync(overridePath, dockerOverride);
  console.log(`  ✅ Override saved: ${overridePath}\n`);

  console.log('========================================');
  console.log('  Validator Onboarding Complete!');
  console.log('========================================\n');
  console.log('Next Steps:');
  console.log('  1. Back up your wallet securely');
  console.log('  2. Submit your public key for genesis registration');
  console.log('  3. Set up your server and deploy:');
  console.log(`     docker-compose -f docker-compose.prod.yml -f docker-compose.${validatorId}.yml up -d\n`);
  console.log('Validator Info:');
  console.log(`  ID:       ${validatorId}`);
  console.log(`  Node ID:  ${nodeId.slice(0, 32)}...`);
  console.log(`  Address:  ${wallet.address}`);
  console.log(`  Stake:    ${config.stake} NGEN`);
  console.log(`  Region:   ${config.region}\n`);

  return { validatorConfig, wallet };
}

function generateDockerOverride(config, validatorId, wallet) {
  return `version: '3.8'

# Docker Compose override for ${config.name} (${validatorId})
# Usage: docker-compose -f docker-compose.prod.yml -f docker-compose.${validatorId}.yml up -d

services:
  ${validatorId}:
    image: nexusgenesis:mainnet
    container_name: nexus-${validatorId}
    restart: unless-stopped
    networks:
      - nexusgenesis-net
    environment:
      - NODE_ENV=mainnet
      - NODE_ROLE=validator
      - NODE_ID=${wallet.nodeId || ''}
      - NODE_PORT=${config.port}
      - HTTP_PORT=${{19890 + parseInt(config.port) - 9847}}
      - CHAIN_ID=nexus-mainnet
      - SEED_NODES=wss://seed1.nexusgenesis.io:9847,wss://seed2.nexusgenesis.io:9847,wss://seed3.nexusgenesis.io:9847,wss://seed4.nexusgenesis.io:9847
      - VALIDATOR_STAKE=${config.stake}
      - VALIDATOR_NAME=${config.name}
      - VALIDATOR_REGION=${config.region}
      - VALIDATOR_PUBLIC_KEY=${wallet.publicKey?.toString('hex') || ''}
    ports:
      - "${config.port}:${config.port}"
      - "${{19890 + parseInt(config.port) - 9847}}:${{19890 + parseInt(config.port) - 9847}}"
    volumes:
      - ${validatorId}-data:/app/data
      - ${validatorId}-logs:/app/logs
      - ./mainnet.config.json:/app/mainnet.config.json:ro
      - ./certs:/app/certs:ro
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:${{19890 + parseInt(config.port) - 9847}}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 16G
        reservations:
          cpus: '2'
          memory: 8G

networks:
  nexusgenesis-net:
    external: true

volumes:
  ${validatorId}-data:
  ${validatorId}-logs:
`;
}

onboardValidator(parseArgs()).catch(err => {
  console.error('Validator onboarding failed:', err);
  process.exit(1);
});