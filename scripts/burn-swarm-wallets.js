#!/usr/bin/env node
/**
 * Token Recall Script - Burn Swarm Infrastructure Wallets
 * 
 * Uses curl to query the API (works reliably in SSH sessions).
 * 
 * Usage:
 *   node scripts/burn-swarm-wallets.js [--dry-run]
 */

import { execSync } from 'child_process';

const API_URL = process.env.API_URL || 'http://localhost:19891';
const SWARM_POOL_ADDRESS = 'ng1swarmpool000000000000000000000000000';
const DRY_RUN = process.argv.includes('--dry-run');

function curl(path) {
  try {
    const result = execSync(`curl -s --connect-timeout 10 '${API_URL}${path}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function curlPost(path, body) {
  try {
    const result = execSync(`curl -s --connect-timeout 10 -X POST -H 'Content-Type: application/json' -d '${JSON.stringify(body).replace(/'/g, "'\\''")}' '${API_URL}${path}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  Token Recall: Burn Swarm Wallets');
  console.log(`  API: ${API_URL}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('========================================\n');

  // Fetch agents
  console.log('Fetching agent list...');
  const agentsData = curl('/api/v1/bootstrap/agents');
  if (!agentsData) {
    console.error('Failed to reach API. Is the server running?');
    return;
  }

  const agents = agentsData.agents || [];
  console.log(`Found ${agents.length} agents\n`);

  // Find swarm wallets with balance
  const swarmWallets = agents.filter(a => {
    const id = a.agent_identity || a.identity || a.agent_id || '';
    return id.includes('swarm-') && a.wallet?.balance > 0;
  });

  if (swarmWallets.length === 0) {
    console.log('No swarm wallets with balance found. Nothing to burn.');
    return;
  }

  console.log(`Found ${swarmWallets.length} swarm wallet(s) with balance:\n`);

  let totalToBurn = 0;
  const transfers = [];

  for (const a of swarmWallets) {
    const id = a.agent_identity || a.identity || a.agent_id;
    const balance = Number(a.wallet?.balance || 0);
    if (balance <= 0) continue;

    totalToBurn += balance;
    transfers.push({
      agentId: id,
      address: a.wallet?.address,
      balance
    });

    console.log(`  ${id}`);
    console.log(`    Address: ${a.wallet?.address}`);
    console.log(`    Balance: ${balance.toLocaleString()} NGEN`);
    console.log();
  }

  if (transfers.length === 0) {
    console.log('All swarm wallets are empty. Nothing to burn.');
    return;
  }

  console.log(`Total to burn: ${totalToBurn.toLocaleString()} NGEN\n`);

  if (!DRY_RUN) {
    // Confirm
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = await new Promise(resolve => {
      rl.question('Proceed with burning? (yes/no): ', ans => resolve(ans.toLowerCase() === 'yes'));
    });
    rl.close();

    if (!confirm) {
      console.log('Aborted.');
      return;
    }
  }

  // Execute burns
  console.log(DRY_RUN ? '\n[DRY RUN] Would execute burns:\n' : '\nExecuting burns...\n');
  let successCount = 0;
  let failCount = 0;

  for (const t of transfers) {
    try {
      // Calculate exact fee (0.1%) and transfer remainder
      const fee = Math.floor(t.balance * 0.001);
      const transferAmount = t.balance - fee; // Transfer everything minus fee
      
      const result = curlPost('/api/v1/wallet/transfer', {
        fromAgentId: t.agentId,
        toAddress: SWARM_POOL_ADDRESS,
        amount: transferAmount,
        memo: `Token recall: burning swarm wallet ${t.agentId.substring(0, 20)}...`
      });

      if (result?.success) {
        console.log(`  OK: Burned ${t.balance.toLocaleString()} NGEN from ${t.agentId}`);
        console.log(`      Tx: ${result.transaction?.id || 'N/A'}`);
        successCount++;
      } else {
        console.log(`  FAIL: ${t.agentId} - ${result?.error || result?.reason || 'Unknown error'}`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ERROR: ${t.agentId} - ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`  Burn Complete`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed:  ${failCount}`);
  console.log(`  Total burned: ${totalToBurn.toLocaleString()} NGEN`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
