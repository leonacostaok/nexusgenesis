import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

async function startMainnet() {
  console.log('========================================');
  console.log('NexusGenesis Mainnet - Start Script');
  console.log('========================================');

  try {
    // 读取主网配置
    const configPath = path.join('mainnet.config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    console.log(`Starting ${config.testnet.name} (${config.testnet.epoch})`);
    console.log(`Description: ${config.testnet.description}`);
    console.log(`Version: ${config.testnet.version}`);
    console.log('========================================');

    // Ensure log directory exists
    const logDir = path.dirname(config.logging.file);
    await fs.mkdir(logDir, { recursive: true });

    // 启动主网节点（使用node1.js作为主网节点）
    console.log('Starting Mainnet Node...');
    const nodeProcess = spawn('node', ['src/node/node1.js'], {
      stdio: 'inherit'
    });

    // Processing进程信号
    process.on('SIGINT', async () => {
      console.log('\nShutting down mainnet...');
      nodeProcess.kill('SIGINT');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down mainnet...');
      nodeProcess.kill('SIGTERM');
      process.exit(0);
    });

  } catch (error) {
    console.error('Error starting mainnet:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

startMainnet();