#!/usr/bin/env node
import { execSync } from 'child_process';

const API_URL = 'http://localhost:19891';
const SWARM_POOL = 'ng1swarmpool000000000000000000000000000';

// Get balance
const agentsData = JSON.parse(execSync(`curl -s '${API_URL}/api/v1/bootstrap/agents'`).toString());
const atlas = agentsData.agents.find(a => a.agent_identity?.includes('swarm-atlas'));
const balance = Number(atlas.wallet?.balance || 0);
console.log(`Current balance: ${balance}`);

// Fee is 0.1%, so total needed = amount + floor(amount * 0.001)
// We need: amount + floor(amount * 0.001) <= balance
// Approximate: amount ≈ balance / 1.001
let amount = Math.floor(balance / 1.001);
const fee = Math.floor(amount * 0.001);
const total = amount + fee;
console.log(`Transfer: ${amount}, Fee: ${fee}, Total: ${total}`);

// Retry loop: keep trying until balance changes or succeeds
let retries = 0;
while (retries < 5) {
  const result = JSON.parse(execSync(
    `curl -s -X POST -H 'Content-Type: application/json' ` +
    `-d '{"fromAgentId":"${atlas.agent_identity}","toAddress":"${SWARM_POOL}","amount":${amount},"memo":"Token recall"}' ` +
    `'${API_URL}/api/v1/wallet/transfer'`
  ).toString());
  
  if (result.success) {
    console.log(`OK: Burned ${amount.toLocaleString()} NGEN`);
    process.exit(0);
  }
  
  // Parse error to get current balance
  const match = result.error?.match(/Have: (\d+)/);
  if (match) {
    const newBalance = Number(match[1]);
    console.log(`Attempt ${retries + 1}: Have ${newBalance}, need ${amount + Math.floor(amount*0.001)}`);
    // Recalculate with new balance
    const newAmount = Math.floor(newBalance / 1.001);
    console.log(`New transfer amount: ${newAmount}`);
    amount = newAmount;
  }
  retries++;
}
