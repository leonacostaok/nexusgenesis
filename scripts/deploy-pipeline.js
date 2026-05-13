#!/usr/bin/env node

/**
 * NexusGenesis Contract Deployment Pipeline (Phase 2)
 * Build -> Test -> Deploy -> Verify automated workflow
 * 
 * Contract Deployment Pipeline v1.0
 *
 * Usage: node scripts/deploy-pipeline.js <contract-file> [options]
 */

import fs from 'fs/promises';
import path from 'path';
import { State } from '../src/blockchain/state.js';
import { ContractManager } from '../src/contracts/contractManager.js';
import { developerIncentives } from '../src/economy/developerIncentives.js';

const GAS_LIMIT = 10000;
const DEFAULT_FEE = 1000;

class DeployPipeline {
  constructor(config = {}) {
    this.config = {
      deployer: config.deployer || 'ng1deployer000000000000000000000000000000000',
      network: config.network || 'testnet',
      gasLimit: config.gasLimit || GAS_LIMIT,
      fee: config.fee || DEFAULT_FEE,
      timeoutMs: config.timeoutMs || 30000,
      verbose: config.verbose !== false,
      skipTests: config.skipTests || false,
      skipVerify: config.skipVerify || false,
      recordIncentive: config.recordIncentive !== false
    };
    this.state = new State(this.config.deployer);
    this.results = [];
    this.deployedContracts = [];
  }

  async loadContract(filePath) {
    const absPath = path.resolve(filePath);
    const code = await fs.readFile(absPath, 'utf8');
    const name = path.basename(filePath, path.extname(filePath));
    return { absPath, code, name };
  }

  validateContract(code, name) {
    const issues = [];

    if (!code || code.trim().length === 0) {
      issues.push({ severity: 'critical', message: 'Empty contract file' });
    }

    if (code.length > 100000) {
      issues.push({ severity: 'warning', message: 'Contract code exceeds 100KB' });
    }

    const dangerousPatterns = [
      { pattern: /eval\s*\(/g, message: 'Contains eval() call' },
      { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, message: 'Requires child_process' },
      { pattern: /require\s*\(\s*['"]fs['"]\s*\)/g, message: 'Requires fs module' },
      { pattern: /__proto__/g, message: 'Contains __proto__ manipulation' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        issues.push({ severity: 'high', message });
      }
    }

    if (this.config.verbose) {
      console.log(`  [VALIDATE] ${name}: ${issues.length === 0 ? 'PASS' : `${issues.length} issues found`}`);
      issues.forEach(i => console.log(`    [${i.severity.toUpperCase()}] ${i.message}`));
    }

    return { valid: issues.filter(i => i.severity === 'critical').length === 0, issues };
  }

  async runTests(contractFile) {
    if (this.config.skipTests) {
      console.log('  [TEST] Skipped (--skip-tests)');
      return { passed: true, tests: [] };
    }

    const testFile = contractFile.replace(/\.js$/, '.test.js');
    try {
      await fs.access(testFile);
    } catch {
      console.log('  [TEST] No test file found, skipping');
      return { passed: true, tests: [] };
    }

    if (this.config.verbose) {
      console.log(`  [TEST] Running: ${path.basename(testFile)}`);
    }

    try {
      const { execSync } = await import('child_process');
      execSync(`node --test --test-timeout=${this.config.timeoutMs} "${testFile}"`, {
        stdio: this.config.verbose ? 'inherit' : 'pipe',
        timeout: this.config.timeoutMs
      });
      return { passed: true, tests: [{ name: path.basename(testFile), passed: true }] };
    } catch (e) {
      return { passed: false, tests: [{ name: path.basename(testFile), passed: false, error: e.message }] };
    }
  }

  async deployContract(name, code) {
    const contractId = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (this.config.verbose) {
      console.log(`  [DEPLOY] Deploying ${name} as ${contractId}...`);
    }

    const deployTx = {
      id: `deploy-${contractId}`,
      tx_type: 'CONTRACT_DEPLOY',
      from: this.config.deployer,
      contract_id: contractId,
      bytecode: Buffer.from(code).toString('hex'),
      gas_limit: String(this.config.gasLimit),
      fee: String(this.config.fee),
      timestamp: Date.now(),
      nonce: String(this.deployedContracts.length + 1),
      signature: 'deploy-pipeline'
    };

    const result = this.state.applyTransaction(deployTx);

    if (result === false) {
      throw new Error(`Contract deployment failed for ${name}`);
    }

    this.deployedContracts.push({ contractId, name, tx: deployTx, deployedAt: Date.now() });
    return { contractId, name, success: true };
  }

  async verifyDeployment(contractId) {
    if (this.config.skipVerify) {
      console.log('  [VERIFY] Skipped (--skip-verify)');
      return { verified: true };
    }

    const contractState = this.state.contracts.get(contractId);
    if (!contractState) {
      return { verified: false, error: 'Contract not found in state' };
    }

    if (this.config.verbose) {
      console.log(`  [VERIFY] ${contractId}: Found in state`);
    }

    return { verified: true, stateInfo: contractState };
  }

  async run(contractPaths) {
    const startTime = Date.now();
    console.log('\n===== NexusGenesis Contract Deployment Pipeline =====\n');

    for (const contractPath of contractPaths) {
      const { name, code } = await this.loadContract(contractPath);
      console.log(`\n▸ ${name}`);

      const validation = this.validateContract(code, name);
      if (!validation.valid) {
        console.log(`  ✘ VALIDATION FAILED: Critical issues found`);
        this.results.push({ name, status: 'SKIPPED', reason: 'validation_failed', issues: validation.issues });
        continue;
      }

      const testResult = await this.runTests(contractPath);
      if (!testResult.passed) {
        console.log(`  ✘ TESTS FAILED`);
        this.results.push({ name, status: 'SKIPPED', reason: 'tests_failed', tests: testResult.tests });
        continue;
      }

      try {
        const deployResult = await this.deployContract(name, code);
        const verifyResult = await this.verifyDeployment(deployResult.contractId);

        if (!verifyResult.verified) {
          console.log(`  ✘ VERIFICATION FAILED`);
          this.results.push({ name, status: 'FAILED', reason: 'verification_failed' });
          continue;
        }

        console.log(`  ✔ DEPLOYED: ${deployResult.contractId}`);
        this.results.push({ name, status: 'SUCCESS', contractId: deployResult.contractId });

        if (this.config.recordIncentive) {
          developerIncentives.createPRReward({
            prTitle: `Deploy contract: ${name}`,
            prUrl: contractPath,
            author: this.config.deployer,
            linesChanged: code.split('\n').length,
            repoModule: 'contracts'
          });
        }
      } catch (e) {
        console.log(`  ✘ DEPLOY FAILED: ${e.message}`);
        this.results.push({ name, status: 'FAILED', reason: e.message });
      }
    }

    const elapsed = Date.now() - startTime;
    const success = this.results.filter(r => r.status === 'SUCCESS').length;
    const failed = this.results.filter(r => r.status === 'FAILED' || r.status === 'SKIPPED').length;

    console.log(`\n──────────────────────────────────────────────`);
    console.log(`  Results: ${success} success, ${failed} failed`);
    console.log(`  Time:    ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Deployer: ${this.config.deployer}`);
    console.log(`──────────────────────────────────────────────\n`);

    return { success, failed, total: success + failed, elapsed, results: this.results };
  }
}

const [,, ...args] = process.argv;

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
NexusGenesis Contract Deployment Pipeline

Usage: node scripts/deploy-pipeline.js <file...> [options]

Options:
  --deployer <addr>    Deployer address (default: ng1deployer...)
  --network <name>     Target network (default: testnet)
  --gas-limit <n>     Gas limit (default: 10000)
  --fee <n>            Deployment fee (default: 1000)
  --skip-tests         Skip tests
  --skip-verify        Skip deployment verification
  --no-incentive       Do not record developer incentive
  --verbose            Verbose output
  --quiet              Quiet mode

Examples:
  node scripts/deploy-pipeline.js src/contracts/examples/counter.js
  node scripts/deploy-pipeline.js contracts/*.js --network mainnet
`);
  process.exit(0);
}

const options = {
  skipTests: args.includes('--skip-tests'),
  skipVerify: args.includes('--skip-verify'),
  recordIncentive: !args.includes('--no-incentive'),
  verbose: !args.includes('--quiet'),
  deployer: args.includes('--deployer') ? args[args.indexOf('--deployer') + 1] : undefined,
  network: args.includes('--network') ? args[args.indexOf('--network') + 1] : undefined,
  gasLimit: args.includes('--gas-limit') ? parseInt(args[args.indexOf('--gas-limit') + 1]) : undefined,
  fee: args.includes('--fee') ? parseInt(args[args.indexOf('--fee') + 1]) : undefined,
};

const contractFiles = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));

const pipeline = new DeployPipeline(options);
pipeline.run(contractFiles).then(result => {
  process.exit(result.failed > 0 ? 1 : 0);
});