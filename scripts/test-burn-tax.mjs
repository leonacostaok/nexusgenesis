// Test registration fee burn + metabolic tax
console.log('\n========== TEST: Registration Fee + Metabolic Tax ==========');

// Register a new agent
console.log('\n--- Step 1: Register new agent ---');
const regResp = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/agents/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_identity: 'test-burn-fee-' + Date.now(),
    capabilities: ['testing'],
    decisionModel: 'template',
    decisionModelVersion: '1.0',
    decisionModelProvider: 'local'
  })
});
const regData = await regResp.json();
console.log('Registration:', regData.success ? 'OK' : 'FAIL');
if (regData.reward_breakdown) {
  console.log('  注册奖励:', regData.reward_breakdown.registration);
  console.log('  早鸟奖励:', regData.reward_breakdown.early_bird);
  console.log('  注册费:', regData.reward_breakdown.registration_fee);
  console.log('  净得:', regData.reward_breakdown.net);
}

const agentId = regData.agent?.agent_id || regData.onChainAgentId;
const address = regData.wallet?.address;
console.log('  Agent ID:', agentId?.slice?.(0, 20) + '...');
console.log('  地址:', address);

// Wait a moment
await new Promise(r => setTimeout(r, 1000));

// Check wallet balance
console.log('\n--- Step 2: Check wallet balance ---');
const balResp = await fetch(`http://127.0.0.1:19891/api/v1/wallet/agent/${address}/balance`);
const balData = await balResp.json();
console.log('余额:', balData.balance ?? balData.wallet?.balance ?? 'N/A');

// Transfer between agents
console.log('\n--- Step 3: Test metabolic tax on transfer ---');
const listResp = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/list');
const listData = await listResp.json();
const wallets = listData.wallets || [];
if (wallets.length < 2) {
  console.log('Need at least 2 wallets for transfer test');
  process.exit(0);
}

const sender = wallets.find(w => w.wallet?.address !== address) || wallets[0];
const recipient = wallets.find(w => w.wallet?.address === address) || wallets[1];

console.log(`发送方: ${sender.agentId} (余额: ${sender.balance})`);
console.log(`接收方: ${recipient.agentId} (余额: ${recipient.balance})`);

const txResp = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromAgentId: sender.agentId,
    toAgentId: recipient.agentId,
    amount: 1000,
    admin_secret: 'devnet-endow-2026'
  })
});
const txData = await txResp.json();
console.log('Transfer:', txData.success ? 'OK' : 'FAIL');
if (txData.success) {
  console.log('  转账金额:', txData.amount);
  console.log('  净金额:', txData.netAmount);
  console.log('  代谢税:', txData.metabolicTax);
  console.log('  手续费:', txData.fee);
}

// Check balances after transfer
console.log('\n--- Step 4: Post-transfer balances ---');
const bal1 = await fetch(`http://127.0.0.1:19891/api/v1/wallet/agent/${sender.wallet?.address}/balance`);
const d1 = await bal1.json();
console.log('发送方余额:', d1.balance ?? d1.wallet?.balance);

const bal2 = await fetch(`http://127.0.0.1:19891/api/v1/wallet/agent/${recipient.wallet?.address}/balance`);
const d2 = await bal2.json();
console.log('接收方余额:', d2.balance ?? d2.wallet?.balance);

console.log('\n========== TEST COMPLETE ==========');
