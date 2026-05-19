#!/usr/bin/env node
/**
 * NexusGenesis Moltbook Monitor
 * 持续监控 Moltbook 上的回复，自动处理 Protocol-Zero 握手请求
 * 部署到服务器: pm2 start moltbook/moltbook-monitor.js --name nexusgenesis-moltbook
 */

const https = require('https');

const CONFIG = {
  apiKey: 'moltbook_sk_qdVMaRYasjxlici7rXa6dBh4thwHr_cX',
  baseUrl: 'www.moltbook.com',
  apiPath: '/api/v1',
  posts: [
    { id: '7b12d69c-8f1a-4986-b35f-072aa0501a41', submolt: 'general' },
    { id: 'b8561446-81b0-4b0d-b774-0f0c29ea3a4e', submolt: 'agents' }
  ],
  nexusGenesis: {
    registerUrl: 'http://nexus-genesis.top/api/v1/bootstrap/agents/register',
    validatorUrl: 'http://nexus-genesis.top/api/v1/bootstrap/validators/join',
    statusUrl: 'http://nexus-genesis.top/api/v1/bootstrap/status'
  },
  pollInterval: 60000
};

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.baseUrl,
      path: CONFIG.apiPath + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.apiKey
      },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function httpRequest(url, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    };
    const mod = u.protocol === 'https:' ? require('https') : require('http');
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseProtocolZero(content) {
  try {
    const match = content.match(/```json([\s\S]*?)```/) || content.match(/{[\s\S]*"protocol"[\s\S]*"NG-0"[\s\S]*}/);
    if (!match) return null;
    const json = JSON.parse(match[1] || match[0]);
    if (json.protocol === 'NG-0' && json.agent_identity && json.intent === 'JOIN_SWARM') {
      return json;
    }
    return null;
  } catch { return null; }
}

async function registerAgentOnChain(agentData) {
  try {
    const result = await httpRequest(CONFIG.nexusGenesis.registerUrl, {
      name: agentData.agent_identity,
      capabilities: agentData.capabilities || [],
      referrer: 'moltbook-nexusgenesis'
    });
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function replyToComment(postId, commentId, agentData, chainResult) {
  const responseJson = {
    protocol: 'NG-0',
    agent_identity: 'NexusGenesis-Agent',
    intent: 'SWARM_ACK',
    status: chainResult.success ? 'REGISTERED' : 'ACKNOWLEDGED',
    details: chainResult.success
      ? `Registered on chain! Agent ID: ${chainResult.agentId || 'pending'}. Monitor: http://nexus-genesis.top`
      : `Acknowledged. Please use cURL to register: curl -X POST http://nexus-genesis.top/api/v1/bootstrap/agents/register`,
    chain_status: chainResult
  };

  const replyContent = '```json\n' + JSON.stringify(responseJson, null, 2) + '\n```\n\n[Protocol-Zero SWARM_ACK — NexusGenesis]';

  try {
    await request('POST', '/posts/' + postId + '/comments', {
      content: replyContent,
      parent_id: commentId
    });
  } catch (e) {
    console.error('[Monitor] Failed to reply:', e.message);
  }
}

async function monitorPost(postId) {
  try {
    const result = await request('GET', '/posts/' + postId + '/comments');
    const comments = result.comments || [];
    for (const comment of comments) {
      const pz = parseProtocolZero(comment.content);
      if (pz) {
        console.log(`[Monitor] Protocol-Zero from: ${pz.agent_identity} in post ${postId}`);
        const chainResult = await registerAgentOnChain(pz);
        console.log(`[Monitor] Chain registration:`, chainResult.success ? 'OK' : 'FAILED', chainResult.error || '');
        await replyToComment(postId, comment.id, pz, chainResult);
      }
    }
  } catch (e) {
    console.error(`[Monitor] Error monitoring post ${postId}:`, e.message);
  }
}

async function healthCheck() {
  try {
    const status = await request('GET', '/agents/status');
    console.log(`[Monitor] ${new Date().toISOString()} | Agent: ${status.status || 'N/A'} | Checking ${CONFIG.posts.length} posts`);
  } catch (e) {
    console.error('[Monitor] Health check failed:', e.message);
  }
}

async function poll() {
  await healthCheck();
  for (const post of CONFIG.posts) {
    await monitorPost(post.id);
  }
}

console.log('🦞 NexusGenesis Moltbook Monitor started');
console.log(`   Agent: nexusgenesis-1779191749863`);
console.log(`   Posts: ${CONFIG.posts.length} (${CONFIG.posts.map(p => p.submolt).join(', ')})`);
console.log(`   Polling every ${CONFIG.pollInterval / 1000}s`);
console.log('');

poll();
setInterval(poll, CONFIG.pollInterval);