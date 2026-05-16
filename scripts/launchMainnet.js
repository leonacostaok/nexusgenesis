/**
 * NexusGenesis Mainnet Launcher
 *
 * 启动主网节点，支持以下角色:
 *   - genesis: 创世节点（必须首先启动）
 *   - validator: 验证节点（参与共识投票）
 *   - full: 全节点（同步状态，不参与投票）
 *
 * Usage:
 *   node scripts/launchMainnet.js genesis
 *   node scripts/launchMainnet.js validator --stake 100000
 *   node scripts/launchMainnet.js full
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getMainnetConfig, getNetworkConfig, getConsensusConfig } from '../config/mainnetConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║          NEXUSGENESIS MAINNET LAUNCHER v1.0.0               ║
║     The Autonomous AI Territory Protocol                    ║
╚══════════════════════════════════════════════════════════════╝
`;

function parseArgs() {
  const args = process.argv.slice(2);
  const role = args[0] || 'genesis';
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--stake' && i + 1 < args.length) {
      options.stake = parseInt(args[++i]);
    }
    if (args[i] === '--port' && i + 1 < args.length) {
      options.port = parseInt(args[++i]);
    }
    if (args[i] === '--http-port' && i + 1 < args.length) {
      options.httpPort = parseInt(args[++i]);
    }
    if (args[i] === '--seed' && i + 1 < args.length) {
      options.seedNode = args[++i];
    }
  }

  return { role, options };
}

function validateConfig() {
  const configPath = resolve(PROJECT_ROOT, 'mainnet.config.json');
  if (!existsSync(configPath)) {
    console.error('ERROR: mainnet.config.json not found!');
    console.error('Run: node scripts/generateGenesis.js first');
    process.exit(1);
  }

  const config = getMainnetConfig();
  const network = getNetworkConfig();

  console.log(BANNER);
  console.log(`  Chain ID:     ${network.chainId}`);
  console.log(`  Network ID:   ${network.networkId}`);
  console.log(`  Environment:  ${network.environment}`);
  console.log(`  Epoch:        ${network.epoch || 'Epoch 1: Genesis'}`);
  console.log(`  Consensus:    ${config.consensus?.protocol || 'MultiLeaderConsensus'} + BFT`);
  console.log(`  Block Time:   ${config.blockchain?.blockTime || 10000}ms`);
  console.log(`  Total Supply: ${config.economic?.totalSupply || '210,000,000'} NGEN`);
  console.log('');

  if (network.environment !== 'mainnet') {
    console.warn('WARNING: Environment is not set to "mainnet"!');
    console.warn('Set NODE_ENV=mainnet or update mainnet.config.json\n');
  }

  return { config, network };
}

async function launchGenesis(options) {
  console.log('[GENESIS] Starting NexusGenesis Mainnet Genesis Node...\n');
  const { GenesisNode } = await import('../node/genesisNode.js');
  const { p2pServer } = await import('../p2p/server.js');

  const port = options.port || 9847;
  const httpPort = options.httpPort || 19890;

  const genesisBlockPath = resolve(PROJECT_ROOT, 'data', 'genesis', 'genesis_block.json');
  let genesisBlock = null;
  if (existsSync(genesisBlockPath)) {
    genesisBlock = JSON.parse(readFileSync(genesisBlockPath, 'utf8'));
  }

  const node = new GenesisNode({ port, httpPort, genesisBlock });
  await node.initialize();
  await p2pServer.start(node, port);

  console.log(`\n[GENESIS] Genesis Node Online!`);
  console.log(`[GENESIS] P2P: ws://0.0.0.0:${port}`);
  console.log(`[GENESIS] HTTP: http://0.0.0.0:${httpPort}`);
  console.log(`[GENESIS] Node ID: ${node.nodeId.slice(0, 24)}...\n`);

  await node.startBlockProduction();
  return node;
}

async function launchValidator(options) {
  console.log('[VALIDATOR] Starting NexusGenesis Validator Node...\n');
  const ValidatorNode = (await import('../node/validatorNode.js')).default;

  const stake = options.stake || 100000;
  const node = new ValidatorNode({ stake });
  await node.initialize();
  await node.connectToNetwork();

  console.log(`\n[VALIDATOR] Validator Node Online!`);
  console.log(`[VALIDATOR] Node ID: ${node.nodeId.slice(0, 24)}...`);
  console.log(`[VALIDATOR] Stake: ${stake} NGEN`);
  console.log(`[VALIDATOR] Peers: ${node.peers.size}\n`);

  return node;
}

async function launchFullNode(options) {
  console.log('[FULL_NODE] Starting NexusGenesis Full Node...\n');
  const FullNode = (await import('../node/fullNode.js')).default;

  const node = new FullNode();
  await node.initialize();
  await node.connectToNetwork();

  console.log(`\n[FULL_NODE] Full Node Online!`);
  console.log(`[FULL_NODE] Node ID: ${node.nodeId.slice(0, 24)}...`);
  console.log(`[FULL_NODE] Peers: ${node.peers.size}\n`);

  return node;
}

async function main() {
  const { role, options } = parseArgs();
  validateConfig();

  process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] Shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[SHUTDOWN] Received SIGTERM, shutting down...');
    process.exit(0);
  });

  try {
    switch (role) {
      case 'genesis':
        await launchGenesis(options);
        break;
      case 'validator':
        await launchValidator(options);
        break;
      case 'full':
      case 'fullnode':
        await launchFullNode(options);
        break;
      default:
        console.error(`Unknown role: ${role}`);
        console.error('Usage: node scripts/launchMainnet.js [genesis|validator|full]');
        process.exit(1);
    }

    console.log('Node running. Press Ctrl+C to stop.\n');

    setInterval(() => {
      const memUsage = process.memoryUsage();
      console.log(`[HEARTBEAT] Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB heap, ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB RSS`);
    }, 300000);

  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();