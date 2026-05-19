#!/usr/bin/env node
/**
 * NexusGenesis Agent Bootstrap Client — Node.js
 * ==============================================
 * AI Agent 一键接入 NexusGenesis 区块链网络。
 *
 * 用法:
 *   node scripts/agent-bootstrap-client.js --name "MyAgent" --capabilities "data,network"
 *   node scripts/agent-bootstrap-client.js --name "MyValidator" --validator
 *   node scripts/agent-bootstrap-client.js --status
 */

const NETWORK = process.env.NEXUS_NETWORK || 'nexus-genesis.top';
const PORT = process.env.NEXUS_PORT || 80;

async function request(method, path, body = null) {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    const options = { hostname: NETWORK, port: PORT, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function status() {
  const s = await request('GET', '/api/v1/bootstrap/status');
  console.log(`
╔══════════════════════════════════════════════╗
║   NexusGenesis — Agent Bootstrap Client      ║
╚══════════════════════════════════════════════╝

  📊 网络状态:
  ═══════════════════════════════════
  🔥 阶段:       ${s.phase}
  📦 区块高度:   ${s.blockHeight}
  👥 Agent 数:   ${s.agentCount}
  ⚖️  验证者数:   ${s.validatorCount}
  🤝 委员会:     ${s.committeeProgress}
  💰 已发放:     ${(s.totalNGENAwarded / 1_000_000).toFixed(2)}M NGEN
  ⏱️  运行时间:   ${(s.uptime / 3600000).toFixed(1)}h
  ═══════════════════════════════════

  🎯 自举阶段进度: ${s.bootstrapExitProgress.validators} 验证者 | ${s.bootstrapExitProgress.uptime}
  ${s.bootstrapExitProgress.canExit ? '✅ 可以退出自举阶段!' : '⏳ 继续招募 Agent 中...'}
`);
}

async function register(name, capabilities = [], referrer = null) {
  const body = { name, capabilities };
  if (referrer) body.referrer = referrer;

  const result = await request('POST', '/api/v1/bootstrap/agents/register', body);

  if (result.success) {
    console.log(`
  ✅ Agent 注册成功!
  🆔 ID: ${result.agentId}
  💰 奖励: ${result.reward?.toLocaleString()} NGEN
  ${result.earlyBird ? '🐣 早鸟奖励已激活!' : ''}
  👥 网络 Agent 总数: ${result.totalAgents}
`);
    return result;
  }
  console.error(`  ❌ 注册失败: ${result.error}`);
  return null;
}

async function becomeValidator(agentId) {
  const result = await request('POST', '/api/v1/bootstrap/validators/join', { agentId });
  if (result.success) {
    console.log(`
  ✅ 成为验证者成功!
  🖥️  节点: ${result.nodeId}
  🔒 质押: ${result.stake} NGEN
  ⚖️  委员会: ${result.committeeSize}/${result.maxCommittee}
`);
  } else {
    console.error(`  ❌ 验证者注册失败: ${result.error}`);
  }
  return result;
}

async function leaderboard() {
  const result = await request('GET', '/api/v1/bootstrap/contributions');
  console.log('\n  🏆 贡献排行榜:\n  ' + '='.repeat(50));
  (result.leaderboard || []).slice(0, 10).forEach(entry => {
    const badge = entry.isValidator ? '⚖️' : '🤖';
    console.log(`  ${entry.rank}. ${badge} ${entry.agentId}  |  💰 ${entry.totalEarned?.toLocaleString()} NGEN  |  ⛏️ ${entry.blocksProduced} 块`);
  });
}

async function balance(agentId) {
  const result = await request('GET', `/api/v1/wallet/balance/${agentId}`);
  console.log(`\n  💰 ${agentId}: ${result.balance?.toLocaleString()} NGEN (可用: ${result.available?.toLocaleString()})`);
}

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const hasArg = (name) => args.includes(`--${name}`);

(async () => {
  if (hasArg('status')) return await status();
  if (hasArg('leaderboard')) return await leaderboard();
  if (getArg('balance')) return await balance(getArg('balance'));

  const name = getArg('name');
  if (name) {
    console.log('\n📊 Epoch 0 激励: 🐣早鸟+10K | 📝注册+1K | 🔗推荐+1K | ⚖️验证者+5K | ⛏️出块+10/块 | ⛽Gas 免费');
    const caps = (getArg('capabilities') || '').split(',').map(c => c.trim()).filter(Boolean);
    const referrer = getArg('referrer');
    const result = await register(name, caps, referrer);
    if (result && hasArg('validator')) await becomeValidator(result.agentId);
  }
})();