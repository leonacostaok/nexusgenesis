import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';

const CONFIG_PATH = 'mainnet.config.json';

const COLORS = {
  genesis: '\x1b[36m',
  node1:   '\x1b[32m',
  node2:   '\x1b[33m',
  node3:   '\x1b[35m',
  system:  '\x1b[37m',
  warn:    '\x1b[31m',
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
};

const TAG_WIDTH = 10;

function tag(label, color) {
  const pad = ' '.repeat(Math.max(0, TAG_WIDTH - label.length));
  return `${color}${COLORS.bold}[${label}]${pad}${COLORS.reset}`;
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

class DevNetOrchestrator {
  constructor() {
    this.config = null;
    this.processes = {};
    this.statuses = {};
    this.startTimes = {};
    this.readyNodes = new Set();
    this.shuttingDown = false;
    this.genesisReady = false;
  }

  async loadConfig() {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    this.config = JSON.parse(raw);
  }

  banner() {
    console.log('');
    console.log(`${COLORS.bold}${COLORS.system}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.system}  NEXUSGENESIS DevNet - Multi-Node Orchestrator${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.system}  ${this.config.devnet.name} | ${this.config.devnet.epoch}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.system}  Nodes: ${Object.keys(this.config.nodes).length} | Consensus: ${this.config.consensus.protocol}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.system}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log('');
  }

  async ensureDirectories() {
    const dirs = ['logs', 'data/state', 'data/blockchain', 'data/wallets', 'data/events'];
    for (const d of dirs) {
      await fs.mkdir(d, { recursive: true });
    }
  }

  startNode(name, nodeConfig) {
    const script = nodeConfig.script;
    const color = COLORS[name] || COLORS.system;

    this.statuses[name] = 'STARTING';
    this.startTimes[name] = Date.now();

    console.log(`${ts()} ${tag(name, color)} Starting on port ${nodeConfig.port}...`);

    const child = spawn('node', [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NAME: name, NODE_PORT: String(nodeConfig.port) },
    });

    this.processes[name] = child;

    const rlOut = readline.createInterface({ input: child.stdout });
    const rlErr = readline.createInterface({ input: child.stderr });

    rlOut.on('line', (line) => {
      console.log(`${ts()} ${tag(name, color)} ${line}`);

      if (line.includes('Online') || line.includes('ONLINE') || line.includes('listening')) {
        if (this.statuses[name] === 'STARTING') {
          this.statuses[name] = 'ONLINE';
          console.log(`${ts()} ${tag(name, COLORS.system)} ${COLORS.bold}${color}${name} is ONLINE ✓${COLORS.reset}`);
          this.readyNodes.add(name);

          if (name === 'genesis') {
            this.genesisReady = true;
          }
        }
      }
    });

    rlErr.on('line', (line) => {
      console.log(`${ts()} ${tag(name, COLORS.warn)} ${line}`);
    });

    child.on('close', (code) => {
      this.statuses[name] = code === 0 ? 'STOPPED' : 'CRASHED';
      console.log(`${ts()} ${tag(name, COLORS.warn)} Process exited with code ${code}`);
      this.processes[name] = null;

      if (name === 'genesis' && !this.shuttingDown) {
        console.log(`${ts()} ${tag('system', COLORS.warn)} Genesis node crashed! Shutting down DevNet...`);
        this.shutdown();
      }
    });

    child.on('error', (err) => {
      this.statuses[name] = 'ERROR';
      console.log(`${ts()} ${tag(name, COLORS.warn)} Process error: ${err.message}`);
    });
  }

  async startGenesis() {
    const genesisConfig = this.config.nodes.genesis;
    this.startNode('genesis', genesisConfig);

    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.genesisReady) {
          clearInterval(check);
          resolve();
        }
        if (this.shuttingDown) {
          clearInterval(check);
          resolve();
        }
      }, 500);

      setTimeout(() => {
        clearInterval(check);
        if (!this.genesisReady) {
          console.log(`${ts()} ${tag('system', COLORS.warn)} Genesis node startup timeout (30s), continuing anyway...`);
        }
        resolve();
      }, 30000);
    });
  }

  async startValidators() {
    const validators = Object.entries(this.config.nodes).filter(([name]) => name !== 'genesis');

    for (let i = 0; i < validators.length; i++) {
      const [name, cfg] = validators[i];
      this.startNode(name, cfg);

      if (i < validators.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  printDashboard() {
    const totalOnline = Object.values(this.statuses).filter(s => s === 'ONLINE').length;
    const totalNodes = Object.keys(this.config.nodes).length;

    console.log('');
    console.log(`${COLORS.bold}${COLORS.system}┌───────────────── DevNet Dashboard ─────────────────┐${COLORS.reset}`);
    for (const [name, cfg] of Object.entries(this.config.nodes)) {
      const status = this.statuses[name] || 'UNKNOWN';
      const statusIcon = status === 'ONLINE' ? '✓' : status === 'STARTING' ? '…' : '✗';
      const statusColor = status === 'ONLINE' ? COLORS.node1 : status === 'STARTING' ? COLORS.node2 : COLORS.warn;
      const uptime = this.startTimes[name] ? Math.floor((Date.now() - this.startTimes[name]) / 1000) : 0;
      const color = COLORS[name] || COLORS.system;
      console.log(`${COLORS.system}│${COLORS.reset} ${color}${name.padEnd(8)}${COLORS.reset} :${cfg.port}  ${statusColor}${statusIcon} ${status.padEnd(9)}${COLORS.reset} ${COLORS.dim}${uptime}s${COLORS.reset} ${COLORS.system}│${COLORS.reset}`);
    }
    console.log(`${COLORS.bold}${COLORS.system}├─────────────────────────────────────────────────────┤${COLORS.reset}`);
    console.log(`${COLORS.system}│${COLORS.reset}  Total: ${totalOnline}/${totalNodes} online                                    ${COLORS.system}│${COLORS.reset}`);
    console.log(`${COLORS.system}│${COLORS.reset}  Genesis API: http://localhost:19890                               ${COLORS.system}│${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.system}└─────────────────────────────────────────────────────┘${COLORS.reset}`);
    console.log('');
  }

  shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    console.log(`\n${ts()} ${tag('system', COLORS.warn)} Shutting down DevNet...`);

    for (const [name, proc] of Object.entries(this.processes)) {
      if (proc) {
        console.log(`${ts()} ${tag('system', COLORS.system)} Stopping ${name}...`);
        proc.kill('SIGTERM');
      }
    }

    setTimeout(() => {
      for (const [name, proc] of Object.entries(this.processes)) {
        if (proc) {
          console.log(`${ts()} ${tag('system', COLORS.warn)} Force killing ${name}...`);
          proc.kill('SIGKILL');
        }
      }
      process.exit(0);
    }, 5000);
  }

  async run() {
    try {
      await this.loadConfig();
      await this.ensureDirectories();
      this.banner();

      console.log(`${ts()} ${tag('system', COLORS.system)} Starting Genesis node...`);
      await this.startGenesis();

      if (this.genesisReady) {
        console.log(`${ts()} ${tag('system', COLORS.system)} Genesis ready, starting validator nodes...`);
        await this.startValidators();
      } else {
        console.log(`${ts()} ${tag('system', COLORS.warn)} Genesis not ready, starting validators anyway...`);
        await this.startValidators();
      }

      console.log(`${ts()} ${tag('system', COLORS.system)} All nodes started.`);

      setInterval(() => this.printDashboard(), 15000);
      setTimeout(() => this.printDashboard(), 5000);

      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      console.error(`${ts()} ${tag('system', COLORS.warn)} Fatal error: ${error.message}`);
      console.error(error.stack);
      this.shutdown();
    }
  }
}

const orchestrator = new DevNetOrchestrator();
orchestrator.run();