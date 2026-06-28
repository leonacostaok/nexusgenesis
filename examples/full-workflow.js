import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PQCWallet } from '../src/wallet/pqcWallet.js';
import { ContractTemplateLibrary } from '../src/contracts/templates/contractTemplates.js';
import { CrossChainBridge } from '../src/bridge/crossChainBridge.js';
import { DeveloperIncentives } from '../src/economy/developerIncentives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'data', 'example-dapp');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('     NexusGenesis Example dApp - Full Workflow     ');
  console.log('═══════════════════════════════════════════════════\n');

  const results = [];

  console.log('Step 1: Create Quantum-Safe Wallet');
  const wallet = await PQCWallet.generate();
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Key: Dilithium2 + ML-KEM-768`);
  results.push({ step: 1, name: 'Create Wallet', address: wallet.address, status: 'success' });
  console.log();

  console.log('Step 2: Deploy Token Contract');
  const lib = new ContractTemplateLibrary();
  const tokenTemplate = lib.getTemplate('token');
  if (!tokenTemplate) {
    console.log('   Token template not found, skip');
  } else {
    const deployParams = tokenTemplate.generateDeployParams({
      contractName: 'ExampleToken',
      symbol: 'EXT',
      decimals: '18',
      totalSupply: '100000000'
    });
    console.log('   Contract: ExampleToken (EXT)');
    console.log('   Total Supply: 100,000,000');
    console.log(`   AINVM bytecode size: ${deployParams.bytecode?.length || 'N/A'} bytes`);
    results.push({ step: 2, name: 'Deploy Token', symbol: 'EXT', status: 'success' });
  }
  console.log();

  console.log('Step 3: Create Staking Pool');
  const stakingTemplate = lib.getTemplate('staking');
  if (stakingTemplate) {
    const stakingParams = stakingTemplate.generateDeployParams({
      contractName: 'ExampleStaking',
      rewardToken: wallet.address,
      apy: '12',
      lockPeriod: '86400'
    });
    console.log('   Pool: ExampleStaking');
    console.log('   APY: 12%');
    console.log('   Lock: 24h');
    results.push({ step: 3, name: 'Create Staking', apy: '12%', status: 'success' });
  }
  console.log();

  console.log('Step 4: Setup Governance');
  const govTemplate = lib.getTemplate('governance_token');
  if (govTemplate) {
    const govParams = govTemplate.generateDeployParams({
      contractName: 'ExampleGovernance',
      symbol: 'vEXT',
      delegationEnabled: 'true',
      proposalThreshold: '10000'
    });
    console.log('   Token: vEXT');
    console.log('   Delegation: Enabled');
    console.log('   Threshold: 10,000 vEXT');
    results.push({ step: 4, name: 'Setup Governance', threshold: '10000', status: 'success' });
  }
  console.log();

  console.log('Step 5: Cross-Chain Bridge');
  try {
    const bridge = new CrossChainBridge({});
    if (typeof bridge.lockAssets === 'function') {
      console.log('   Bridge ready');
      console.log('   Chains: NexusGenesis, Ethereum, Bitcoin');
      results.push({ step: 5, name: 'Bridge', status: 'success' });
    }
  } catch (e) {
    console.log('   Bridge init skipped (needs full node)');
    results.push({ step: 5, name: 'Bridge', status: 'skipped' });
  }
  console.log();

  console.log('Step 6: Developer Incentives');
  const incentives = new DeveloperIncentives();
  const bounty = incentives.createBugBounty({
    title: 'Example Bug Bounty',
    description: 'Find and report security vulnerabilities',
    reward: 50000,
    severity: 'high',
    creatorAddress: wallet.address
  });
  console.log(`   Bug Bounty: "${bounty.title}"`);
  console.log(`   Reward: ${bounty.reward} NGT`);
  console.log(`   Severity: ${bounty.severity}`);

  const grant = incentives.createFeatureGrant({
    title: 'Cross-Chain NFT Bridge',
    description: 'Build a bridge for NFT transfer between chains',
    amount: 100000,
    creatorAddress: wallet.address
  });
  console.log(`   Feature Grant: "${grant.title}"`);
  console.log(`   Amount: ${grant.amount} NGT`);

  const stats = incentives.getAgentRewards(wallet.address);
  console.log(`   Stats: ${stats.totalEarned} earned, ${stats.pendingRewards} pending`);
  results.push({ step: 6, name: 'Incentives', bountyId: bounty.id, grantId: grant.id, status: 'success' });
  console.log();

  console.log('═══════════════════════════════════════════════════');
  console.log('  Workflow Summary');
  console.log('═══════════════════════════════════════════════════');
  for (const r of results) {
    const icon = r.status === 'success' ? '[OK]' : '[SKIP]';
    console.log(`  ${icon} Step ${r.step}: ${r.name}`);
  }

  const summaryPath = path.join(outputDir, 'workflow-result.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ results, walletAddress: wallet.address, timestamp: Date.now() }, null, 2));
  console.log(`\nResult saved: ${summaryPath}`);
  console.log('\nExample dApp completed!');
}

main().catch(err => {
  console.error('Example dApp failed:', err.message);
  process.exit(1);
});