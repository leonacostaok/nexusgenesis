/**
 * Legacy L1 Value-Exchange Verification (in-memory)
 *
 * Drives agentWalletManager directly (same core logic as the HTTP API
 * /api/v1/wallet/agent/*) to prove the Agent→Agent NGEN value exchange
 * loop works end-to-end:
 *
 *   create → claim faucet → transfer → history
 *
 * This runs in-memory and does NOT depend on the HTTP server / P2P stack,
 * so it is immune to the DevNet orchestrator config mismatch and the
 * state-persistence toString bug. It verifies the transfer engine logic itself.
 */
import agentWalletManager from '../src/wallet/agentWalletManager.js';

async function main() {
  console.log('==============================================');
  console.log('  NEXUSGENESIS Legacy L1 — Value Exchange Loop');
  console.log('==============================================\n');

  // ---- Step 1: create two Agent wallets ----
  await agentWalletManager.createAgentWallet('verify-agent-A', { type: 'autonomous_agent' });
  await agentWalletManager.createAgentWallet('verify-agent-B', { type: 'autonomous_agent' });
  const infoA = await agentWalletManager.getBalance('verify-agent-A');
  const infoB = await agentWalletManager.getBalance('verify-agent-B');

  console.log('[1] Agent wallets created:');
  console.log(`    A: id=${infoA.agentId} addr=${infoA.address} balance=${infoA.balance}`);
  console.log(`    B: id=${infoB.agentId} addr=${infoB.address} balance=${infoB.balance}\n`);

  // ---- Step 2: claim faucet for A (fund it) ----
  const claim = await agentWalletManager.claimFaucet('verify-agent-A', '127.0.0.1');
  const balA_after_claim = await agentWalletManager.getBalance('verify-agent-A');
  console.log('[2] Faucet claim for A:', claim.success ? 'OK' : `FAILED (${claim.reason || claim.message})`);
  console.log(`    A balance after claim: ${balA_after_claim.balance}\n`);

  // ---- Step 3: A transfers to B ----
  const amount = 500n;
  const tx = await agentWalletManager.transfer('verify-agent-A', 'verify-agent-B', amount, 'verify value exchange');
  console.log('[3] Transfer A -> B:');
  if (tx.success) {
    console.log(`    txId   : ${tx.transactionId || tx.id}`);
    console.log(`    amount : ${amount} NGEN`);
    console.log(`    net    : ${tx.netAmount ?? amount} NGEN (after metabolic tax)`);
    console.log(`    fee    : ${tx.fee}`);
    console.log(`    from   : ${tx.from}`);
    console.log(`    to     : ${tx.to}`);
    console.log(`    signature present: ${Boolean(tx.signature)}`);
  } else {
    console.log(`    FAILED: ${tx.reason || tx.message}`);
    console.log(JSON.stringify(tx, null, 2));
  }

  // ---- Step 4: verify balances & history ----
  const balA = await agentWalletManager.getBalance('verify-agent-A');
  const balB = await agentWalletManager.getBalance('verify-agent-B');
  console.log('\n[4] Final balances:');
  console.log(`    A: ${balA.balance}  (started with faucet, minus amount+fee)`);
  console.log(`    B: ${balB.balance}  (received net amount)`);

  const histA = await agentWalletManager.getTransactionHistory('verify-agent-A', { limit: 10 });
  const histB = await agentWalletManager.getTransactionHistory('verify-agent-B', { limit: 10 });
  console.log('\n[5] Transaction history:');
  console.log(`    A has ${histA.success ? histA.transactions?.length || histA.total : '?'} tx(s)`);
  console.log(`    B has ${histB.success ? histB.transactions?.length || histB.total : '?'} tx(s)`);

  const recipientNet = tx.success ? (tx.netAmount ?? amount) : 'n/a';
  const expectsB = tx.success ? `≈${recipientNet}` : '0';
  console.log('\n==============================================');
  console.log('  RESULT');
  console.log('==============================================');
  console.log(`  Transfer success : ${tx.success}`);
  console.log(`  A final balance  : ${balA.balance}`);
  console.log(`  B final balance  : ${balB.balance} (expect ${expectsB})`);
  console.log(`  Value exchanged  : ${tx.success ? 'YES — Agent A → Agent B NGEN transferred' : 'NO'}`);
  console.log('==============================================');
}

main().catch((e) => {
  console.error('VERIFY ERROR:', e);
  process.exit(1);
});
