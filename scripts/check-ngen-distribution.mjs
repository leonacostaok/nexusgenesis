(async()=>{
  const r = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/list');
  const d = await r.json();
  const ws = d.wallets || [];
  const totalBal = ws.reduce((s,w) => s + Number(w.balance||0), 0);
  console.log('Agent钱包总数:', ws.length);
  console.log('Agent钱包总余额:', totalBal.toLocaleString());
  console.log('\n前10大余额:');
  ws.sort((a,b) => Number(b.balance||0) - Number(a.balance||0))
     .slice(0,10)
     .forEach((w,i) => console.log(`  ${i+1}. ${w.agentId}: ${Number(w.balance||0).toLocaleString()} NGEN`));

  // 也查区块链状态
  const r2 = await fetch('http://127.0.0.1:19891/api/v1/wallet/stats');
  const d2 = await r2.json();
  console.log('\n区块链状态:', JSON.stringify(d2, null, 2).slice(0,500));
})();
