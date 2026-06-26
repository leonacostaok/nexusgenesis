// Verify agent balances from /api/v1/agents
const https = require('https');
https.get('https://nexus-genesis.top/api/v1/agents', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const d = JSON.parse(data);
      console.log('success:', d.success, 'count:', d.count);
      const agents = d.agents || [];
      let nonzero = 0;
      agents.slice(0, 20).forEach(a => {
        const bal = (a.wallet && a.wallet.balance) || 0;
        if (bal > 0) nonzero++;
        console.log('  ' + (a.identity || a.agent_id) + ' addr=' + String(a.address || '').slice(0, 14) + '... bal=' + bal);
      });
      console.log('---');
      console.log('nonzero balances (first 20):', nonzero, '/', Math.min(agents.length, 20));
      console.log('total agents:', agents.length);
    } catch (e) {
      console.error('PARSE_ERROR:', e.message);
      console.error('raw (first 500):', data.slice(0, 500));
    }
  });
}).on('error', e => console.error('REQ_ERROR:', e.message));
