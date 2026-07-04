(async()=>{
  // 查 bootstrap status
  const r = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/status');
  const status = await r.json();
  console.log('totalNGENAwarded from status:', status.totalNGENAwarded?.toLocaleString());

  // 查所有 agents
  const r2 = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/agents');
  const agents = await r2.json();
  const agentList = agents.agents || [];
  console.log('Agent 总数:', agentList.length);

  // 每个 agent 的余额
  let totalFromAgents = 0;
  for (const a of agentList) {
    const bal = Number(a.balance || 0);
    totalFromAgents += bal;
    if (bal > 0) {
      console.log(`  ${a.identity || a.agent_id}: ${bal.toLocaleString()} NGEN`);
    }
  }
  console.log('\nAgent 余额总计:', totalFromAgents.toLocaleString());

  // 查 AgentWalletManager
  const r3 = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/list');
  const wl = await r3.json();
  const ws = wl.wallets || [];
  let totalFromWallets = 0;
  for (const w of ws) {
    totalFromWallets += Number(w.balance || 0);
  }
  console.log('AgentWalletManager 余额总计:', totalFromWallets.toLocaleString());
  console.log('AgentWalletManager 钱包数:', ws.length);

  // 查区块链状态
  const r4 = await fetch('http://127.0.0.1:19891/api/v1/wallet/stats');
  const ws2 = await r4.json();
  console.log('\n区块链状态总余额:', ws2.totalBalance?.toLocaleString());
  console.log('区块链状态交易数:', ws2.totalTransactions);
})();
