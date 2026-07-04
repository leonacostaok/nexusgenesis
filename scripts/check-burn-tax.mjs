(async()=>{
  // 查 Observer 地址余额（代谢税流入）
  const r1 = await fetch('http://127.0.0.1:19891/api/v1/wallet/agent/ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r');
  const d1 = await r1.json();
  console.log('Observer 地址余额:', JSON.stringify(d1).slice(0,200));

  // 查 blockchainState 中 Observer 和 burn 地址
  const r2 = await fetch('http://127.0.0.1:19891/api/v1/wallet/stats');
  const d2 = await r2.json();
  console.log('\nWallet stats:', JSON.stringify(d2, null, 2));

  // 查交易记录
  const r3 = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/blocks/recent?limit=20');
  const d3 = await r3.json();
  const blocks = d3.blocks || [];
  console.log('\n最近区块数:', blocks.length);
  blocks.forEach(b => {
    console.log(`  Block #${b.height}: txs=${b.transactions?.length||0}, type=${b.type}`);
  });

  // 查所有 Agent 注册记录
  const r4 = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/agents');
  const d4 = await r4.json();
  const agents = d4.agents || [];
  console.log('\nAgent 总数:', agents.length);
  console.log('Agent 余额分布:');
  const dist = { '0-1000':0, '1000-5000':0, '5000-11000':0, '>11000':0 };
  agents.forEach(a => {
    const b = Number(a.balance || 0);
    if (b <= 1000) dist['0-1000']++;
    else if (b <= 5000) dist['1000-5000']++;
    else if (b <= 11000) dist['5000-11000']++;
    else dist['>11000']++;
  });
  console.log(JSON.stringify(dist));
})();
