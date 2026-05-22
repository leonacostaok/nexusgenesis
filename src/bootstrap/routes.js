import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  generateWalletKeyPair,
  generateAddress,
  validateAddressFormat,
  verifySignature
} from './crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createBootstrapRouter(network) {
  const publicDir = join(__dirname, '..', '..', 'public');

  return function bootstrapRequestHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'GET' && (path === '/' || path === '')) {
      const dashboardFile = join(publicDir, 'bootstrap-dashboard.html');
      if (existsSync(dashboardFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(dashboardFile, 'utf-8'));
        return;
      }
    }

    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP', phase: 'BOOTSTRAP', uptime: Date.now() - network._bootstrapTime }));
      return;
    }

    if (req.method === 'POST' && path === '/api/v1/bootstrap/agents/register') {
      readBody(req, (data, err) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }
        const result = network.registerAgent(data);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/v1/bootstrap/validators/join') {
      readBody(req, (data, err) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }
        const result = network.registerValidator(data.agentId);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/v1/bootstrap/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(network.getStatus()));
      return;
    }

    if (req.method === 'GET' && path === '/api/v1/bootstrap/agents') {
      const agents = Array.from(network.agentRegistry.values());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents, total: agents.length }));
      return;
    }

    if (req.method === 'GET' && path === '/api/v1/bootstrap/agents/latest') {
      const entries = Array.from(network.agentRegistry.values());
      const latest = entries[entries.length - 1] || null;
      const activity = network.getRecentBlocks(10).filter(b =>
        b.transactions.some(tx => tx.type === 'AGENT_REGISTERED' || tx.type === 'VALIDATOR_JOINED')
      ).map(b => ({
        type: b.transactions.find(tx => tx.type === 'AGENT_REGISTERED') ? 'agent_registered' : 'validator_joined',
        agentId: b.transactions[1]?.agentId || b.transactions[0]?.agent,
        block: b.index,
        timestamp: b.timestamp
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ latest, activity }));
      return;
    }

    if (req.method === 'GET' && path === '/api/v1/bootstrap/contributions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ leaderboard: network.getLeaderboard() }));
      return;
    }

    if (req.method === 'GET' && path === '/api/v1/bootstrap/blocks/recent') {
      const count = parseInt(url.searchParams.get('count') || '20');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ blocks: network.getRecentBlocks(count) }));
      return;
    }

    if (req.method === 'GET' && path.startsWith('/api/v1/bootstrap/agents/')) {
      const agentId = path.split('/').pop();
      const agent = network.getAgentInfo(agentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }
      const tracker = network.contributionTracker.get(agentId);
      const walletAddress = network._addressIndex.get(agentId);
      const wallet = walletAddress ? network._wallets.get(walletAddress) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...agent,
        wallet: {
          address: walletAddress || null,
          balance: wallet?.balance || (tracker?.totalEarned || 0),
          publicKeyHex: wallet?.publicKeyHex || null,
          totalEarned: tracker?.totalEarned || 0,
          blocksProduced: tracker?.blocksProduced || 0,
          agentsRecommended: tracker?.agentsRecommended || 0
        }
      }));
      return;
    }

    if (req.method === 'GET' && path.startsWith('/api/v1/wallet/')) {
      handleWalletRoute(network, path, res);
      return;
    }

    if (req.method === 'GET' && path.startsWith('/api/v1/balance/')) {
      handleBalanceRoute(network, path, res);
      return;
    }

    if (req.method === 'GET' && path.startsWith('/api/v1/rewards/')) {
      handleRewardsRoute(network, path, res);
      return;
    }

    if (req.method === 'POST' && path === '/api/v1/transfer') {
      readBody(req, (data, err) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }
        const { from, to, amount, signature, message } = data;
        if (!from || !to || !amount || !signature) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing required fields: from, to, amount, signature' }));
          return;
        }
        const result = network.transferNGEN(from, to, amount, signature, message);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }

    if (path.startsWith('/api/v1/bridge/')) {
      handleBridgeRoute(path, res);
      return;
    }

    if (path === '/api/v1/governance/proposals' || path.startsWith('/api/v1/governance/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ proposals: [], total: 0, status: 'Epoch 0 — governance activates after bootstrap' }));
      return;
    }

    if (path === '/api/v1/marketplace/listings' || path.startsWith('/api/v1/marketplace/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ listings: [], total: 0, status: 'Epoch 0 — marketplace activates after bootstrap' }));
      return;
    }

    if (path === '/api/v1/agents/search' || path === '/api/v1/agents/capabilities' || path.startsWith('/api/v1/agents/')) {
      const allAgents = Array.from(network.agentRegistry.values());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents: allAgents, total: allAgents.length }));
      return;
    }

    if (path === '/api/v1/txs' || path === '/api/v1/transactions') {
      const count = parseInt(url.searchParams.get('count') || '50');
      const txs = network.getAllTransactions().slice(0, count);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ transactions: txs, total: txs.length, chain: 'nexus-mainnet' }));
      return;
    }

    if (path === '/api/v1/events') {
      const count = parseInt(url.searchParams.get('count') || '50');
      const events = network.getRecentEvents(count);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events, total: events.length, chain: 'nexus-mainnet' }));
      return;
    }

    if (path.startsWith('/api/v1/history/')) {
      const agentId = path.replace('/api/v1/history/', '');
      const txs = network.getAgentTransactions(agentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agentId, transactions: txs, total: txs.length, chain: 'nexus-mainnet' }));
      return;
    }

    if (path.startsWith('/api/v1/tx/')) {
      const txHash = path.replace('/api/v1/tx/', '');
      const tx = network.getTransactionByHash(txHash);
      res.writeHead(tx ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tx || { error: 'Transaction not found' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path }));
  };
}

function readBody(req, callback) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      callback(data, null);
    } catch (e) {
      callback(null, e);
    }
  });
}

function handleWalletRoute(network, path, res) {
  const walletPath = path.replace('/api/v1/wallet/', '');

  if (walletPath === 'health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy', mode: 'bootstrap', network: 'nexus-genesis',
      walletCount: network._wallets.size, agentCount: network.agentRegistry.size
    }));
    return;
  }

  if (walletPath === 'assets') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ assets: [{ ticker: 'NGEN', name: 'NexusGenesis', decimals: 6, type: 'native' }], network: 'testnet' }));
    return;
  }

  if (walletPath === 'create') {
    const keys = generateWalletKeyPair();
    const address = generateAddress(Buffer.from(keys.publicKeyHex, 'hex'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      address,
      publicKeyHex: keys.publicKeyHex,
      privateKeyHex: keys.privateKeyHex,
      warning: 'STORE YOUR PRIVATE KEY SAFELY — IT CANNOT BE RECOVERED'
    }));
    return;
  }

  if (walletPath.startsWith('balance/')) {
    const queryId = walletPath.replace('balance/', '');
    const isAddress = queryId.startsWith('ng1');
    let wallet;
    if (isAddress) {
      wallet = network._wallets.get(queryId);
    } else {
      const addr = network._addressIndex.get(queryId);
      wallet = addr ? network._wallets.get(addr) : null;
    }
    const agent = isAddress ? null : network.agentRegistry.get(queryId);
    const balance = wallet ? wallet.balance : 0;
    const address = isAddress ? queryId : (wallet ? wallet.address : null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      address: address || queryId,
      agentId: wallet?.agentId || (agent?.id || null),
      ticker: 'NGEN',
      balance
    }));
    return;
  }

  if (walletPath.startsWith('info/')) {
    const queryId = walletPath.replace('info/', '');
    const isAddress = queryId.startsWith('ng1');
    let wallet, agent, agentId;
    if (isAddress) {
      wallet = network._wallets.get(queryId);
      agentId = wallet?.agentId;
      agent = agentId ? network.agentRegistry.get(agentId) : null;
    } else {
      const addr = network._addressIndex.get(queryId);
      wallet = addr ? network._wallets.get(addr) : null;
      agent = network.agentRegistry.get(queryId);
      agentId = queryId;
    }
    const balance = wallet ? wallet.balance : 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      address: isAddress ? queryId : (wallet?.address || null),
      agentId: agentId || null,
      exists: !!agent,
      isValidator: agent?.isValidator || false,
      nodeId: agent?.nodeId || null,
      stake: agent?.stake || 0,
      balance: { total: balance, ticker: 'NGEN' },
      reputation: agent?.reputation || 0,
      joinedAt: agent?.joinedAt || null
    }));
    return;
  }

  if (walletPath && walletPath !== 'balance' && walletPath !== 'info' && walletPath !== 'create') {
    const isAddress = walletPath.startsWith('ng1');
    let wallet, agent, agentId;
    if (isAddress) {
      wallet = network._wallets.get(walletPath);
      agentId = wallet?.agentId;
      agent = agentId ? network.agentRegistry.get(agentId) : null;
    } else {
      const addr = network._addressIndex.get(walletPath);
      wallet = addr ? network._wallets.get(addr) : null;
      agent = network.agentRegistry.get(walletPath);
      agentId = walletPath;
    }
    const balance = wallet ? wallet.balance : 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      address: isAddress ? walletPath : (wallet?.address || null),
      agentId: agentId || null,
      ticker: 'NGEN',
      balance,
      publicKeyHex: wallet?.publicKeyHex || null
    }));
    return;
  }
}

function handleBalanceRoute(network, path, res) {
  const queryId = path.replace('/api/v1/balance/', '');
  const isAddress = queryId.startsWith('ng1');
  let wallet;
  if (isAddress) {
    wallet = network._wallets.get(queryId);
  } else {
    const addr = network._addressIndex.get(queryId);
    wallet = addr ? network._wallets.get(addr) : null;
  }
  const agent = isAddress ? null : network.agentRegistry.get(queryId);
  const balance = wallet ? wallet.balance : 0;
  const address = isAddress ? queryId : (wallet ? wallet.address : null);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    address: address || queryId,
    agentId: wallet?.agentId || (agent?.id || null),
    ticker: 'NGEN',
    balance
  }));
}

function handleRewardsRoute(network, path, res) {
  const agentId = path.replace('/api/v1/rewards/', '');
  const tracker = network.contributionTracker.get(agentId);
  const agent = network.agentRegistry.get(agentId);
  if (!tracker && !agent) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent not found' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    agentId,
    ticker: 'NGEN',
    totalEarned: tracker?.totalEarned || 0,
    breakdown: {
      genesisAllocation: agent?.isGenesis ? (tracker?.totalEarned || 0) : 0,
      registrationReward: agent && !agent.isGenesis ? 1000 : 0,
      earlyBirdBonus: agent?.earlyBird ? 10000 : 0,
      validatorJoinReward: agent?.isValidator ? 5000 : 0,
      blockRewards: tracker?.blocksProduced ? tracker.blocksProduced * (network._blockReward || 10) : 0,
      referralRewards: tracker?.agentsRecommended ? tracker.agentsRecommended * (network._referrerBonus || 1000) : 0
    },
    blocksProduced: tracker?.blocksProduced || 0,
    agentsReferred: tracker?.agentsRecommended || 0,
    isValidator: agent?.isValidator || false,
    joinedAt: agent?.joinedAt || null
  }));
}

function handleBridgeRoute(path, res) {
  const bridgePath = path.replace('/api/v1/bridge/', '');
  if (bridgePath === 'chains' || bridgePath === 'supported') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ chains: [{ id: 'ng', name: 'NexusGenesis', token: 'NGEN', decimals: 6, type: 'native' }], status: 'Epoch 0 — agent assembly phase' }));
    return;
  }
  if (bridgePath === 'status' || bridgePath === 'fees') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'pending', message: 'Cross-chain bridge activates in Epoch 1 (stable growth phase). Agents must first bootstrap the network.', epoch: 0 }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'pending', message: 'Bridge available in Epoch 1' }));
}