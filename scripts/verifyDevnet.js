import http from 'http';

const GENESIS_API = 'http://localhost:19890';
const WALLET_API = 'http://localhost:3000/api/v1/wallet';

const OBSERVER_ADDRESS = 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r';
const GENESIS_RESERVE = 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function checkNode(port, label) {
  const addr = `ws://localhost:${port}`;
  try {
    console.log(`  ${label} (port ${port})... checking`);
    return { label, port, status: 'reachable' };
  } catch {
    return { label, port, status: 'unreachable' };
  }
}

async function run() {
  console.log('');
  console.log('========================================');
  console.log('  NexusGenesis DevNet - Verification');
  console.log('========================================');
  console.log('');

  const checks = [];

  console.log('[1/5] Checking Genesis Node API...');
  try {
    const status = await httpGet(`${GENESIS_API}/status`);
    if (status.success) {
      console.log(`  ✓ Genesis API online`);
      console.log(`    Node: ${status.nodeId?.slice(0, 24)}...`);
      console.log(`    Height: ${status.blockchain?.height}`);
      console.log(`    Blocks: ${status.blockchain?.blocks}`);
      console.log(`    Peers: ${status.peers?.count} (verified: ${status.peers?.verified})`);
      console.log(`    Mempool: ${status.mempool}`);
      console.log(`    Uptime: ${status.uptime}s`);
      console.log(`    Version: ${status.version}`);
      checks.push({ name: 'Genesis API', pass: true, detail: `Height=${status.blockchain?.height}, Peers=${status.peers?.count}` });
    } else {
      console.log(`  ✗ Genesis API returned unexpected:`, status);
      checks.push({ name: 'Genesis API', pass: false, detail: 'Unexpected response' });
    }
  } catch (e) {
    console.log(`  ✗ Genesis API unreachable: ${e.message}`);
    checks.push({ name: 'Genesis API', pass: false, detail: e.message });
  }

  console.log('');
  console.log('[2/5] Checking Wallet Balance...');
  try {
    const balance = await httpGet(`${WALLET_API}/balance/${OBSERVER_ADDRESS}`);
    if (balance.success) {
      console.log(`  ✓ Observer wallet: ${balance.wallet.balanceFormatted} NGEN`);
      console.log(`    Address: ${balance.wallet.address.slice(0, 24)}...`);
      console.log(`    USD: $${balance.wallet.usdValue}`);
      checks.push({ name: 'Observer Balance', pass: true, detail: `${balance.wallet.balanceFormatted} NGEN` });
    } else {
      console.log(`  ✗ Balance query failed:`, balance);
      checks.push({ name: 'Observer Balance', pass: false, detail: 'Query failed' });
    }
  } catch (e) {
    console.log(`  ✗ Wallet API unreachable: ${e.message}`);
    checks.push({ name: 'Observer Balance', pass: false, detail: e.message });
  }

  console.log('');
  console.log('[3/5] Checking Genesis Reserve Balance...');
  try {
    const reserve = await httpGet(`${WALLET_API}/balance/${GENESIS_RESERVE}`);
    if (reserve.success) {
      console.log(`  ✓ Genesis Reserve: ${reserve.wallet.balanceFormatted} NGEN`);
      checks.push({ name: 'Genesis Reserve', pass: true, detail: `${reserve.wallet.balanceFormatted} NGEN` });
    } else {
      console.log(`  ✗ Reserve query failed`);
      checks.push({ name: 'Genesis Reserve', pass: false, detail: 'Query failed' });
    }
  } catch (e) {
    console.log(`  ✗ Reserve API unreachable: ${e.message}`);
    checks.push({ name: 'Genesis Reserve', pass: false, detail: e.message });
  }

  console.log('');
  console.log('[4/5] Checking Transaction History...');
  try {
    const history = await httpGet(`${WALLET_API}/history/${OBSERVER_ADDRESS}?limit=5`);
    if (history.success) {
      console.log(`  ✓ Total transactions: ${history.total_count || history.transactions?.length || 0}`);
      if (history.transactions && history.transactions.length > 0) {
        for (const tx of history.transactions.slice(0, 3)) {
          console.log(`    ${tx.id?.slice(0, 16)}... ${tx.type || 'TRANSFER'} ${tx.from?.slice(0, 10)}... → ${tx.to?.slice(0, 10)}...`);
        }
      }
      checks.push({ name: 'Transaction History', pass: true, detail: `${history.transactions?.length || 0} txs` });
    } else {
      console.log(`  ✗ History query failed`);
      checks.push({ name: 'Transaction History', pass: false, detail: 'Query failed' });
    }
  } catch (e) {
    console.log(`  ✗ History API unreachable: ${e.message}`);
    checks.push({ name: 'Transaction History', pass: false, detail: e.message });
  }

  console.log('');
  console.log('[5/5] Checking Agent Registry...');
  try {
    const agents = await httpGet(`${GENESIS_API}/agents`);
    if (agents.success) {
      console.log(`  ✓ Registered agents: ${agents.total}`);
      if (agents.agents && agents.agents.length > 0) {
        for (const agent of agents.agents.slice(0, 3)) {
          console.log(`    ${agent.agentId || agent.id}: ${agent.name || 'unnamed'} (rep: ${agent.reputation || 0})`);
        }
      }
      checks.push({ name: 'Agent Registry', pass: true, detail: `${agents.total} agents` });
    } else {
      console.log(`  ✗ Agent query failed`);
      checks.push({ name: 'Agent Registry', pass: false, detail: 'Query failed' });
    }
  } catch (e) {
    console.log(`  ✗ Agent API unreachable: ${e.message}`);
    checks.push({ name: 'Agent Registry', pass: false, detail: e.message });
  }

  console.log('');
  console.log('========================================');
  console.log('  VERIFICATION SUMMARY');
  console.log('========================================');
  
  let allPass = true;
  for (const check of checks) {
    const icon = check.pass ? '✓' : '✗';
    console.log(`  ${icon} ${check.name.padEnd(22)} ${check.detail}`);
    if (!check.pass) allPass = false;
  }

  console.log('');
  console.log(allPass 
    ? '  ✓ All checks passed! DevNet is operational.'
    : '  ✗ Some checks failed. Review the details above.');
  console.log('');

  const passed = checks.filter(c => c.pass).length;
  console.log(`  Results: ${passed}/${checks.length} passed`);
  console.log('');
}

run().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});