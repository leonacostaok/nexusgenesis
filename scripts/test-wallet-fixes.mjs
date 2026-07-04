// Test wallet fixes: fromAgentId transfer + admin-secret auth
console.log('\n========== WALLET FIX TESTS ==========');

// 1. List all agent wallets
console.log('\n--- Test 1: List agent wallets ---');
const listResp = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/list');
const listData = await listResp.json();
console.log(`Total wallets: ${listData.total}`);
const wallets = listData.wallets || [];
if (wallets.length === 0) {
  console.log('No wallets found. Need to register an agent first.');
  process.exit(1);
}

const senderAgent = wallets[0];
console.log(`Sender: ${senderAgent.agentId} (balance: ${senderAgent.balance})`);

// Find a different recipient
const recipient = wallets.find(w => w.agentId !== senderAgent.agentId) || wallets[0];
console.log(`Recipient: ${recipient.agentId} (balance: ${recipient.balance})`);

// 2. Test admin-secret auth on agent/transfer (without secret should fail)
console.log('\n--- Test 2: Auth guard (should fail without secret) ---');
const noAuthResp = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromAgentId: senderAgent.agentId,
    toAgentId: recipient.agentId,
    amount: 10
  })
});
const noAuthData = await noAuthResp.json();
console.log(`Without auth: HTTP ${noAuthResp.status}, success=${noAuthData.success}, error=${noAuthData.error}`);

// 3. Test admin-secret auth on agent/transfer (with secret should succeed)
console.log('\n--- Test 3: Transfer WITH admin-secret ---');
const authResp = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromAgentId: senderAgent.agentId,
    toAgentId: recipient.agentId,
    amount: 10,
    admin_secret: 'devnet-endow-2026'
  })
});
const authData = await authResp.json();
console.log(`With auth: HTTP ${authResp.status}, success=${authData.success}`);
if (authData.success) {
  console.log(`  TX ID: ${authData.transactionId?.slice?.(0,16)}...`);
  console.log(`  Amount: ${authData.amount}, Fee: ${authData.fee}`);
} else {
  console.log(`  Error: ${authData.error || authData.reason}`);
}

// 4. Test /api/v1/wallet/transfer with fromAgentId (no privateKey)
console.log('\n--- Test 4: Transfer via fromAgentId (no privateKey) ---');
const transferResp = await fetch('http://127.0.0.1:19891/api/v1/wallet/transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromAgentId: senderAgent.agentId,
    toAddress: recipient.wallet?.address || recipient.address,
    amount: 5,
    memo: 'test viaAgentId mode'
  })
});
const transferData = await transferResp.json();
console.log(`fromAgentId mode: HTTP ${transferResp.status}, success=${transferData.success}`);
if (transferData.success) {
  console.log(`  Mode: ${transferData.transaction?.mode}`);
  console.log(`  Amount: ${transferData.transaction?.amount}`);
} else {
  console.log(`  Error: ${transferData.error}`);
}

// 5. Check balances after transfers
console.log('\n--- Test 5: Post-transfer balances ---');
const balResp1 = await fetch(`http://127.0.0.1:19891/api/v1/wallet/agent/${senderAgent.agentId}/balance`);
const bal1 = await balResp1.json();
console.log(`Sender balance: ${bal1.balance || bal1.wallet?.balance}`);

const balResp2 = await fetch(`http://127.0.0.1:19891/api/v1/wallet/agent/${recipient.agentId}/balance`);
const bal2 = await balResp2.json();
console.log(`Recipient balance: ${bal2.balance || bal2.wallet?.balance}`);

console.log('\n========== TESTS COMPLETE ==========');
