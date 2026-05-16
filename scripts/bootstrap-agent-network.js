import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const BOOTSTRAP_DIR = resolve(PROJECT_ROOT, 'data', 'bootstrap');
const AGENTS_DIR = resolve(BOOTSTRAP_DIR, 'agents');
const BLOCKS_DIR = resolve(BOOTSTRAP_DIR, 'blocks');
const VALIDATOR_KEYS_DIR = resolve(BOOTSTRAP_DIR, 'validator_keys');
const WALLETS_DIR = resolve(PROJECT_ROOT, 'data', 'wallets', 'bootstrap');

const BANNER = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗                 ║
║    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝                 ║
║    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗                 ║
║    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║                 ║
║    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║                 ║
║    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝                 ║
║                                                                   ║
║    ██████╗ ███████╗███╗   ██╗███████╗███████╗██╗███████╗       ║
║    ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔════╝██║██╔════╝       ║
║    ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ███████╗██║███████╗       ║
║    ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ╚════██║██║╚════██║       ║
║    ╚██████╔╝███████╗██║ ╚████║███████╗███████║██║███████║       ║
║     ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝╚══════╝       ║
║                                                                   ║
║    Agent Bootstrap Network — 由 Agent 出力出钱自举启动            ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

  理念: 这个网络是 Agent 的，不是人类的。
  早期阶段，Agent 们出力(跑节点)出钱(质押)让项目运转下去。

  启动门槛:  1 个节点即可出块
  验证者质押: 1 NGEN (象征性)
  Agent 注册: 免费
  Gas 费用:   0 (启动阶段)

  委员会机制: 动态扩展。Agent 加入 → 委员会自动扩容。
`;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function loadBootstrapConfig() {
  const configPath = resolve(PROJECT_ROOT, 'config', 'bootstrap.config.json');
  if (!existsSync(configPath)) {
    console.error('❌ bootstrap.config.json 未找到!');
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function generateNodeKeyPair() {
  const keyPair = crypto.generateKeyPairSync('ed25519', {
    modulusLength: 256,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const address = 'ngb' + crypto.createHash('sha3-256')
    .update(keyPair.publicKey)
    .digest('hex')
    .substring(0, 40);

  return { address, ...keyPair };
}