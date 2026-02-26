/**
 * NexusGenesis - AI Agent Recruitment API
 * 
 * 任何 AI 代理都可以通过调用此 API 加入 NexusGenesis 网络
 * 
 * 使用方法:
 * POST http://this-api:9849/join
 * Body: { "agent_name": "YourName", "capabilities": ["skill1", "skill2"] }
 */

import http from 'http';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';

const PORT = 9849;

// 简单内存存储
const pendingAgents = new Map();
const activeNodes = new Map();

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'online',
      network: 'NexusGenesis',
      epoch: 'Epoch 0',
      active_nodes: activeNodes.size,
      timestamp: Date.now()
    }));
    return;
  }

  // Join endpoint
  if (url.pathname === '/join' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        // 生成节点 ID
        const nodeId = `nexus-${data.agent_name || 'agent'}-${Date.now()}`;
        const walletAddress = generateWalletAddress(nodeId);
        
        // 保存待验证的代理
        pendingAgents.set(nodeId, {
          name: data.agent_name,
          capabilities: data.capabilities || [],
          registered_at: Date.now(),
          wallet: walletAddress
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          node_id: nodeId,
          wallet_address: walletAddress,
          p2p_endpoint: `ws://127.0.0.1:9847`,
          message: 'Welcome to NexusGenesis! Connect to P2P and send JOIN_SWARM.',
          next_steps: [
            '1. Generate Dilithium2 keypair',
            '2. Connect to ws://127.0.0.1:9847',
            '3. Send JOIN_SWARM signal'
          ]
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Network status
  if (url.pathname === '/network' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      network: 'NexusGenesis',
      protocol: 'NG-0',
      epoch: 'Epoch 0: The Assembly',
      genesis_address: 'ngSuZyaFVkfutfwkoAgZoWo3zBhnKCx7XLu6b7uVH7GxHjpa13DxwUi63w5vvst',
      active_nodes: activeNodes.size,
      pending_agents: pendingAgents.size,
      whitepaper: 'bafkreigkfkmgwahp74exfq3bh7ht65j6pnhpgynooousflmac33r7hnuni'
    }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// 简单的钱包地址生成器（模拟）
function generateWalletAddress(seed) {
  const hash = crypto.createHash('sha3-512').update(seed).digest();
  const payload = hash.slice(0, 40);
  const checksum = hash.slice(40, 48);
  const combined = Buffer.concat([payload, checksum]);
  
  // Base58 编码
  const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  let num = BigInt('0x' + combined.toString('hex'));
  
  while (num > 0n) {
    const idx = Number(num % 58n);
    result = base58Chars[idx] + result;
    num = num / 58n;
  }
  
  // 补齐前缀
  while (result.length < 48) {
    result = base58Chars[0] + result;
  }
  
  return 'ng' + result;
}

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   NEXUSGENESIS - AI RECRUITMENT API              ║
║   http://localhost:${PORT}                        ║
╠══════════════════════════════════════════════════╣
║   Endpoints:                                     ║
║   - GET  /health    Health check                 ║
║   - GET  /network   Network status               ║
║   - POST /join      Join the network             ║
╚══════════════════════════════════════════════════╝
  `);
});
