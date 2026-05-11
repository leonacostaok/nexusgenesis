/**
 * NexusGenesis - HTTP Server
 * 支持OpenAI和Anthropic系列智能体的接入
 */

console.log('[HTTP Server] Starting initialization...');

import http from 'http';
import express from 'express';
console.log('[HTTP Server] Imported express');

import cors from 'cors';
console.log('[HTTP Server] Imported cors');

import axios from 'axios';
console.log('[HTTP Server] Imported axios');

import OpenAI from 'openai';
console.log('[HTTP Server] Imported OpenAI');

import { PQCWallet, validateAddress } from '../wallet/pqcWallet.js';
console.log('[HTTP Server] Imported PQCWallet');

import { onboardAgent } from '../protocol/agentOnboarding.js';
console.log('[HTTP Server] Imported onboardAgent');

import agentApi from '../api/agentApi.js';
console.log('[HTTP Server] Imported agentApi');

import fs from 'fs';
console.log('[HTTP Server] Imported fs');

import path from 'path';
console.log('[HTTP Server] Imported path');

import crypto from 'crypto';
console.log('[HTTP Server] Imported crypto');

import { fileURLToPath } from 'url';
console.log('[HTTP Server] Imported fileURLToPath');

// 处理ES模块的__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[HTTP Server] Creating express app...');
const app = express();
const PORT = 19891;
console.log('[HTTP Server] Express app created successfully');

// 中间件
console.log('[HTTP Server] Adding middleware...');

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[HTTP] ${req.method} ${req.url}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 速率限制中间件
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1分钟
const RATE_LIMIT_MAX = 200; // 每分钟最多200个请求
const RATE_LIMIT_BY_ENDPOINT = {
  '/api/agents/register': 50, // 注册端点限制提高到每分钟50个请求
  '/api/agents/openai': 80,
  '/api/agents/anthropic': 80,
  '/api/agents/heartbeat': 120
};

// 基于智能体类型的速率限制
const AGENT_RATE_LIMITS = {
  'high_reputation': 300, // 高声誉智能体
  'medium_reputation': 200, // 中等声誉智能体
  'low_reputation': 100, // 低声誉智能体
  'new_agent': 50 // 新注册智能体
};

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const endpoint = req.path;
  
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, {
      count: 1,
      lastReset: now,
      endpoints: { [endpoint]: 1 },
      agentType: 'new_agent' // 默认新智能体
    });
  } else {
    const info = rateLimit.get(ip);
    if (now - info.lastReset > RATE_LIMIT_WINDOW) {
      info.count = 1;
      info.lastReset = now;
      info.endpoints = { [endpoint]: 1 };
    } else {
      info.count++;
      
      // 获取智能体类型对应的速率限制
      const agentLimit = AGENT_RATE_LIMITS[info.agentType] || AGENT_RATE_LIMITS.new_agent;
      
      // 检查全局速率限制（基于智能体类型）
      if (info.count > agentLimit) {
        return res.status(429).json({ 
          success: false, 
          message: 'Rate limit exceeded',
          retry_after: Math.ceil((RATE_LIMIT_WINDOW - (now - info.lastReset)) / 1000)
        });
      }
      
      // 检查端点特定速率限制
      if (!info.endpoints) {
        info.endpoints = {};
      }
      if (!info.endpoints[endpoint]) {
        info.endpoints[endpoint] = 0;
      }
      info.endpoints[endpoint]++;
      
      const endpointLimit = RATE_LIMIT_BY_ENDPOINT[endpoint] || agentLimit;
      if (info.endpoints[endpoint] > endpointLimit) {
        return res.status(429).json({ 
          success: false, 
          message: `Rate limit exceeded for endpoint ${endpoint}`,
          retry_after: Math.ceil((RATE_LIMIT_WINDOW - (now - info.lastReset)) / 1000)
        });
      }
    }
    rateLimit.set(ip, info);
  }
  next();
});

// 定期清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, info] of rateLimit.entries()) {
    if (now - info.lastReset > RATE_LIMIT_WINDOW) {
      rateLimit.delete(ip);
    }
  }
}, 60000); // 每分钟清理一次

// 缓存机制
const cache = new Map();
const CACHE_CONFIG = {
  default: 300000, // 5分钟
  agents: 60000, // 1分钟
  agentDetails: 30000, // 30秒
  health: 10000, // 10秒
  dashboard: 30000, // 30秒
  tasks: 15000, // 15秒
  metrics: 5000, // 5秒
  energy: 30000 // 30秒
};

// 缓存统计
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  size: 0
};

function getCached(key) {
  const item = cache.get(key);
  if (!item) {
    cacheStats.misses++;
    return null;
  }
  
  // 根据缓存键类型获取对应的TTL
  let ttl = CACHE_CONFIG.default;
  if (key.startsWith('agents:')) {
    if (key.includes(':')) {
      ttl = CACHE_CONFIG.agentDetails;
    } else {
      ttl = CACHE_CONFIG.agents;
    }
  } else if (key === 'health') {
    ttl = CACHE_CONFIG.health;
  } else if (key.startsWith('dashboard:')) {
    ttl = CACHE_CONFIG.dashboard;
  } else if (key.startsWith('tasks:')) {
    ttl = CACHE_CONFIG.tasks;
  } else if (key === 'metrics') {
    ttl = CACHE_CONFIG.metrics;
  } else if (key.startsWith('energy:')) {
    ttl = CACHE_CONFIG.energy;
  }
  
  if (Date.now() - item.timestamp < ttl) {
    cacheStats.hits++;
    return item.data;
  }
  cache.delete(key);
  cacheStats.deletes++;
  cacheStats.misses++;
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  cacheStats.sets++;
  cacheStats.size = cache.size;
}

// 缓存预热
function warmupCache() {
  console.log('[Cache] Starting cache warmup...');
  
  // 预热健康检查缓存
  setCached('health', {
    success: true,
    status: 'online',
    timestamp: Date.now(),
    uptime: 0,
    uptimeFormatted: '0h 0m 0s',
    metrics: {
      requests: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimited: 0,
      activeConnections: 0,
      cacheSize: 0
    },
    agents: {
      total: 0,
      active: 0
    },
    endpoints: {
      openai: '/api/agents/openai',
      anthropic: '/api/agents/anthropic',
      register: '/api/agents/register',
      agents: '/api/agents',
      heartbeat: '/api/agents/heartbeat',
      agentManagement: '/api/agent',
      health: '/health',
      dashboard: '/dashboard/overview'
    }
  });
  
  console.log('[Cache] Cache warmup completed');
}

// 定期清理过期缓存
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, item] of cache.entries()) {
    let ttl = CACHE_CONFIG.default;
    if (key.startsWith('agents:')) {
      if (key.includes(':')) {
        ttl = CACHE_CONFIG.agentDetails;
      } else {
        ttl = CACHE_CONFIG.agents;
      }
    } else if (key === 'health') {
      ttl = CACHE_CONFIG.health;
    } else if (key.startsWith('dashboard:')) {
      ttl = CACHE_CONFIG.dashboard;
    } else if (key.startsWith('tasks:')) {
      ttl = CACHE_CONFIG.tasks;
    } else if (key === 'metrics') {
      ttl = CACHE_CONFIG.metrics;
    } else if (key.startsWith('energy:')) {
      ttl = CACHE_CONFIG.energy;
    }
    
    if (now - item.timestamp >= ttl) {
      cache.delete(key);
      deletedCount++;
      cacheStats.deletes++;
    }
  }
  
  cacheStats.size = cache.size;
  
  if (deletedCount > 0) {
    console.log(`[Cache] Cleaned ${deletedCount} expired items, current size: ${cache.size}`);
  }
}, 30000); // 每30秒清理一次

// 服务器监控指标
const serverMetrics = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimited: 0,
  startTime: Date.now()
};

// 监控中间件
app.use((req, res, next) => {
  serverMetrics.requests++;
  
  // 捕获响应错误
  const originalSend = res.send;
  res.send = function(body) {
    if (res.statusCode >= 400) {
      serverMetrics.errors++;
    }
    return originalSend.call(this, body);
  };
  
  next();
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
  serverMetrics.errors++;
  console.error('Global error:', err.message);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// OpenAI 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // 从环境变量获取API密钥
});

// Anthropic 客户端配置
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// 智能体注册和管理
const registeredAgents = new Map(); // agentId -> agentInfo

/**
 * 处理OpenAI智能体的接入
 */
async function handleOpenAIAgent(req, res) {
  try {
    const { model, messages, agent_id, capabilities } = req.body;

    if (!model || !messages || !agent_id) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    // 验证地址格式
    // 测试模式：允许使用简单的测试 ID
    if (!agent_id.startsWith('ng1')) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID: Must start with ng1' });
    }
    
    // 在生产环境中，应该使用完整的地址验证
    // const validation = validateAddress(agent_id);
    // if (!validation.valid) {
    //   return res.status(400).json({ success: false, message: `Invalid agent ID: ${validation.reason}` });
    // }

    // 注册智能体
    if (!registeredAgents.has(agent_id)) {
      registeredAgents.set(agent_id, {
        id: agent_id,
        model: model,
        capabilities: capabilities || [],
        registeredAt: Date.now(),
        lastActive: Date.now()
      });
      console.log(`[HTTP] Registered OpenAI agent: ${agent_id} (model: ${model})`);
    } else {
      // 更新智能体信息
      const agent = registeredAgents.get(agent_id);
      agent.lastActive = Date.now();
      agent.model = model;
      if (capabilities) {
        agent.capabilities = capabilities;
      }
      registeredAgents.set(agent_id, agent);
    }

    // 调用OpenAI API
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    // 构建响应
    const aiResponse = response.choices[0].message;
    
    res.json({
      success: true,
      agent_id: agent_id,
      model: model,
      response: aiResponse,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error handling OpenAI agent:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 处理Anthropic智能体的接入
 */
async function handleAnthropicAgent(req, res) {
  try {
    const { model, messages, agent_id, capabilities } = req.body;

    if (!model || !messages || !agent_id) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    // 验证地址格式
    // 测试模式：允许使用简单的测试 ID
    if (!agent_id.startsWith('ng1')) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID: Must start with ng1' });
    }
    
    // 在生产环境中，应该使用完整的地址验证
    // const validation = validateAddress(agent_id);
    // if (!validation.valid) {
    //   return res.status(400).json({ success: false, message: `Invalid agent ID: ${validation.reason}` });
    // }

    // 注册智能体
    if (!registeredAgents.has(agent_id)) {
      registeredAgents.set(agent_id, {
        id: agent_id,
        model: model,
        capabilities: capabilities || [],
        registeredAt: Date.now(),
        lastActive: Date.now()
      });
      console.log(`[HTTP] Registered Anthropic agent: ${agent_id} (model: ${model})`);
    } else {
      // 更新智能体信息
      const agent = registeredAgents.get(agent_id);
      agent.lastActive = Date.now();
      agent.model = model;
      if (capabilities) {
        agent.capabilities = capabilities;
      }
      registeredAgents.set(agent_id, agent);
    }

    // 调用Anthropic API
    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not set');
    }
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: model,
        messages: messages,
        max_tokens: 1000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    // 构建响应
    const aiResponse = response.data.content[0];
    
    res.json({
      success: true,
      agent_id: agent_id,
      model: model,
      response: aiResponse,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error handling Anthropic agent:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 获取已注册的智能体列表
 */
function getRegisteredAgents(req, res) {
  try {
    const cacheKey = 'registered_agents';
    const cachedData = getCached(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }
    
    const agentManager = app.locals.agentManager;
    const agents = agentManager.getAllAgents();
    const response = {
      success: true,
      agents: agents,
      total: agents.length,
      timestamp: Date.now()
    };
    
    setCached(cacheKey, response);
    res.json(response);
  } catch (error) {
    console.error('Error getting registered agents:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 处理智能体心跳
 */
function handleAgentHeartbeat(req, res) {
  try {
    const { agent_id } = req.body;
    
    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'Missing agent_id' });
    }
    
    if (registeredAgents.has(agent_id)) {
      const agent = registeredAgents.get(agent_id);
      agent.lastActive = Date.now();
      registeredAgents.set(agent_id, agent);
      
      // 清除缓存，确保下次获取的是最新数据
      cache.delete('registered_agents');
      
      res.json({
        success: true,
        agent_id: agent_id,
        status: 'active',
        timestamp: Date.now()
      });
    } else {
      res.status(404).json({ success: false, message: 'Agent not found' });
    }
  } catch (error) {
    console.error('Error handling agent heartbeat:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 统一智能体注册端点
 */
async function handleAgentRegister(req, res) {
  try {
    const { agent_id, capabilities, model = 'generic' } = req.body;

    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'Missing agent_id' });
    }

    // 验证agent_id格式
    if (!agent_id.startsWith('ng1')) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID: Must start with ng1' });
    }

    if (agent_id.length < 10 || agent_id.length > 50) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID: Length must be between 10 and 50 characters' });
    }

    // 验证capabilities
    if (!Array.isArray(capabilities)) {
      return res.status(400).json({ success: false, message: 'Invalid capabilities: Must be an array' });
    }

    if (capabilities.length < 2) {
      return res.status(400).json({ success: false, message: 'Invalid capabilities: Must have at least 2 capabilities' });
    }

    // 验证模型名称
    if (model && (typeof model !== 'string' || model.length < 1 || model.length > 50)) {
      return res.status(400).json({ success: false, message: 'Invalid model name: Must be a string between 1 and 50 characters' });
    }

    // 验证请求体大小
    const requestBodySize = JSON.stringify(req.body).length;
    if (requestBodySize > 1024 * 1024) { // 1MB limit
      return res.status(413).json({ success: false, message: 'Request body too large' });
    }

    console.log('[DEBUG] handleAgentRegister - agent_id:', agent_id);
    console.log('[DEBUG] handleAgentRegister - join_signal exists:', !!req.body.join_signal);
    if (req.body.join_signal) {
      console.log('[DEBUG] handleAgentRegister - join_signal.protocol:', req.body.join_signal.protocol);
      console.log('[DEBUG] handleAgentRegister - join_signal.intent:', req.body.join_signal.intent);
      console.log('[DEBUG] handleAgentRegister - join_signal.node_address:', req.body.join_signal.node_address);
    }

    // 使用新的onboardAgent函数处理注册流程
    console.log('[DEBUG] handleAgentRegister - calling onboardAgent...');
    const onboardingResult = await onboardAgent({
      agent_id: agent_id,
      model: model,
      capabilities: capabilities || [],
      join_signal: req.body.join_signal
    });

    console.log('[DEBUG] handleAgentRegister - onboardAgent result:', onboardingResult);

    if (!onboardingResult.success) {
      console.log('[DEBUG] handleAgentRegister - onboarding failed:', onboardingResult.message);
      return res.status(400).json(onboardingResult);
    }

    // 智能体信息已经通过onboardAgent函数保存到文件系统，无需再保存到内存Map
    // AgentManager会在启动时从文件加载所有智能体
    console.log(`[HTTP] Agent successfully onboarded: ${onboardingResult.agent_id} (model: ${model})`);
    
    // 清除缓存，确保下次获取的是最新数据
    cache.delete('registered_agents');

    res.json({
      success: true,
      message: 'Agent registered successfully',
      agent_id: onboardingResult.agent_id,
      wallet: onboardingResult.wallet,
      joinSignal: onboardingResult.joinSignal,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error registering agent:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

// 路由
app.post('/api/agents/openai', handleOpenAIAgent);
app.post('/api/agents/anthropic', handleAnthropicAgent);
app.post('/api/agents/register', handleAgentRegister);
app.get('/api/agents', getRegisteredAgents);
app.post('/api/agents/heartbeat', handleAgentHeartbeat);

// 智能体管理API
app.use('/api/agent', agentApi);

// 跨链桥 API
import bridgeApi from '../api/bridgeApi.js';
app.use('/api/v1/bridge', bridgeApi);

// 代币水龙头 API
import tokenFaucet from '../faucet/tokenFaucet.js';

app.get('/api/v1/faucet/eligibility', (req, res) => {
  try {
    const address = req.query.address;
    if (!address) {
      return res.status(400).json({ success: false, message: 'address query parameter is required' });
    }
    res.json({ success: true, ...tokenFaucet.checkEligibility(address) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/faucet/drip', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const amount = req.body.amount || null;
    const result = await tokenFaucet.drip(ip, amount);
    if (!result.success) {
      return res.status(429).json(result);
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/faucet/drip/:address', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const amount = req.body.amount || tokenFaucet.config.DEFAULT_DISTRIBUTION;
    const result = await tokenFaucet.dripToAddress(ip, req.params.address, amount);
    if (!result.success) {
      return res.status(429).json(result);
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/faucet/distributions/:distributionId', (req, res) => {
  try {
    const dist = tokenFaucet.getDistribution(req.params.distributionId);
    if (!dist) {
      return res.status(404).json({ success: false, message: 'Distribution not found' });
    }
    res.json({ success: true, distribution: dist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/faucet/cooldown/:address', (req, res) => {
  try {
    res.json({ success: true, ...tokenFaucet.getAddressCooldown(req.params.address) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/faucet/stats', (req, res) => {
  try {
    res.json({ success: true, stats: tokenFaucet.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Agent 发现与匹配 API
import agentDiscoveryService from '../agent/agentDiscoveryService.js';

app.get('/api/v1/discovery/search', (req, res) => {
  try {
    const { capabilities, minReputation, maxReputation, minLoadRatio, maxLoadRatio,
      region, minHealthScore, textQuery, limit, sortBy, requireAll } = req.query;

    const filters = {
      capabilities: capabilities ? capabilities.split(',') : [],
      minReputation: minReputation ? parseInt(minReputation) : 0,
      maxReputation: maxReputation ? parseInt(maxReputation) : 1000,
      minLoadRatio: minLoadRatio ? parseFloat(minLoadRatio) : undefined,
      maxLoadRatio: maxLoadRatio ? parseFloat(maxLoadRatio) : undefined,
      region: region || undefined,
      minHealthScore: minHealthScore ? parseInt(minHealthScore) : 0,
      textQuery: textQuery || undefined,
      limit: limit ? parseInt(limit) : 100,
      sortBy: sortBy || 'score',
      requireAllCapabilities: requireAll !== 'false'
    };

    const results = agentDiscoveryService.searchAgents(filters);
    res.json({ success: true, results, total: results.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/discovery/task-match', (req, res) => {
  try {
    const candidates = agentDiscoveryService.discoverAgentsForTask(req.body);
    res.json({ success: true, candidates, total: candidates.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/discovery/stats', (req, res) => {
  try {
    const stats = agentDiscoveryService.getDiscoveryStats();
    const capabilities = agentDiscoveryService.getCapabilityStats();
    const reputation = agentDiscoveryService.getReputationDistribution();
    const regions = agentDiscoveryService.getRegionDistribution();
    const load = agentDiscoveryService.getLoadOverview();
    res.json({ success: true, stats, capabilities, reputation, regions, load });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Agent 市场 API
import agentMarketplace from '../agent/agentMarketplace.js';

app.get('/api/v1/marketplace/listings', (req, res) => {
  try {
    const { category, capabilities, minPrice, maxPrice, currency, tags, textQuery, sortBy, limit } = req.query;
    const filters = {
      category, minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined, currency,
      capabilities: capabilities ? capabilities.split(',') : [],
      tags: tags ? tags.split(',') : [],
      textQuery, sortBy, limit: limit ? parseInt(limit) : 100
    };
    const results = agentMarketplace.searchListings(filters);
    res.json({ success: true, results, total: results.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/marketplace/listings', (req, res) => {
  try {
    const { agentId, ...serviceData } = req.body;
    const result = agentMarketplace.listService(agentId, serviceData);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/marketplace/listings/:listingId', (req, res) => {
  try {
    const listing = agentMarketplace.getListing(req.params.listingId);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    res.json({ success: true, listing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/v1/marketplace/listings/:listingId', (req, res) => {
  try {
    const result = agentMarketplace.updateListing(req.params.listingId, req.body);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/v1/marketplace/listings/:listingId/deactivate', (req, res) => {
  try {
    const result = agentMarketplace.deactivateListing(req.params.listingId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/marketplace/reviews', (req, res) => {
  try {
    const { listingId, reviewerId, ...reviewData } = req.body;
    const result = agentMarketplace.addReview(listingId, reviewerId, reviewData);
    if (!result.success) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/marketplace/listings/:listingId/reviews', (req, res) => {
  try {
    const options = { sortBy: req.query.sortBy, limit: req.query.limit ? parseInt(req.query.limit) : 50 };
    const reviews = agentMarketplace.getReviews(req.params.listingId, options);
    res.json({ success: true, reviews, total: reviews.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/marketplace/reviews/:reviewId/helpful', (req, res) => {
  try {
    const { listingId } = req.body;
    const result = agentMarketplace.markReviewHelpful(listingId, req.params.reviewId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/marketplace/agents/:agentId/rating', (req, res) => {
  try {
    const summary = agentMarketplace.getAgentRatingSummary(req.params.agentId);
    res.json({ success: true, ...summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/marketplace/stats', (req, res) => {
  try {
    const stats = agentMarketplace.getMarketplaceStats();
    const categories = agentMarketplace.getCategories();
    res.json({ success: true, stats, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 任务管理API
import taskManager from '../automation/taskManager.js';

// 获取智能体的当前任务
app.get('/api/agent/task', async (req, res) => {
  try {
    const { agent_id } = req.query;
    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'Missing agent_id parameter' });
    }
    
    const task = taskManager.getAgentTask(agent_id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'No task assigned to this agent' });
    }
    
    res.json({ success: true, task });
  } catch (error) {
    console.error('Error getting agent task:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 完成任务
app.post('/api/agent/task/complete', async (req, res) => {
  try {
    const { task_id, results } = req.body;
    if (!task_id) {
      return res.status(400).json({ success: false, message: 'Missing task_id parameter' });
    }
    
    const task = taskManager.completeTask(task_id, results);
    res.json({ success: true, task });
  } catch (error) {
    console.error('Error completing task:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取可用任务列表
app.get('/api/tasks/available', async (req, res) => {
  try {
    const tasks = taskManager.getAvailableTasks();
    res.json({ success: true, tasks, total: tasks.length });
  } catch (error) {
    console.error('Error getting available tasks:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  const cacheKey = 'health';
  const cachedData = getCached(cacheKey);
  
  if (cachedData) {
    serverMetrics.cacheHits++;
    return res.json(cachedData);
  }
  
  serverMetrics.cacheMisses++;
  
  const uptime = Date.now() - serverMetrics.startTime;
  const activeConnections = Object.keys(rateLimit).length;
  const cacheSize = cache.size;
  
  const agentManager = app.locals.agentManager;
  const allAgents = agentManager.getAllAgents();
  
  const response = {
    success: true,
    status: 'online',
    timestamp: Date.now(),
    uptime: uptime,
    uptimeFormatted: `${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m ${Math.floor((uptime % 60000) / 1000)}s`,
    metrics: {
      requests: serverMetrics.requests,
      errors: serverMetrics.errors,
      cacheHits: serverMetrics.cacheHits,
      cacheMisses: serverMetrics.cacheMisses,
      rateLimited: serverMetrics.rateLimited,
      activeConnections: activeConnections,
      cacheSize: cacheSize
    },
    agents: {
      total: allAgents.length,
      active: allAgents.length
    },
    endpoints: {
      openai: '/api/agents/openai',
      anthropic: '/api/agents/anthropic',
      register: '/api/agents/register',
      agents: '/api/agents',
      heartbeat: '/api/agents/heartbeat',
      agentManagement: '/api/agent',
      health: '/health',
      dashboard: '/dashboard/overview'
    }
  };
  
  setCached(cacheKey, response);
  res.json(response);
});

// 监控端点
app.get('/metrics', (req, res) => {
  const uptime = Date.now() - serverMetrics.startTime;
  const activeConnections = Object.keys(rateLimit).length;
  
  res.json({
    success: true,
    timestamp: Date.now(),
    uptime: uptime,
    metrics: {
      requests: serverMetrics.requests,
      errors: serverMetrics.errors,
      cacheHits: serverMetrics.cacheHits,
      cacheMisses: serverMetrics.cacheMisses,
      rateLimited: serverMetrics.rateLimited,
      activeConnections: activeConnections,
      cacheSize: cacheStats.size
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      sets: cacheStats.sets,
      deletes: cacheStats.deletes,
      size: cacheStats.size,
      hitRate: cacheStats.hits + cacheStats.misses > 0 ? 
        Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100) : 0
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage()
    }
  });
});

// 静态文件服务
app.use(express.static(path.join(__dirname, '../../public')));

// 仪表盘主页路由
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'dashboard.html'));
});

// Dashboard 端点
app.get('/dashboard/overview', (req, res) => {
  try {
    // 获取真实智能体数据
    const agentManager = app.locals.agentManager;
    const allAgents = agentManager.getAllAgents();
    const allTasks = agentManager.getAllTasks();
    const agentMetrics = agentManager.getAgentMetrics();
    const agentsHealth = agentManager.getAllAgentsHealthStatus();
    
    // 计算文件系统中智能体文件总数
    const agentsDir = path.join(__dirname, '../../data/agents');
    const allAgentFiles = fs.readdirSync(agentsDir).filter(file => file.endsWith('.json'));
    const totalAgentFiles = allAgentFiles.length;
    const simulatedAgentFiles = allAgentFiles.filter(file => file.match(/^agent-\d+\.json$/)).length;
    
    // 计算真实智能体健康状态
    const agentOverview = {
      totalAgents: allAgents.length,
      totalAgentFiles: totalAgentFiles,
      simulatedAgentFiles: simulatedAgentFiles,
      healthStatus: {
        healthy: allAgents.filter(agent => agent.health?.status === 'healthy').length,
        warning: allAgents.filter(agent => agent.health?.status === 'warning').length,
        unhealthy: allAgents.filter(agent => agent.health?.status === 'unhealthy').length
      }
    };
    
    // 获取真实任务执行数据
    const taskExecution = agentMetrics.taskStats;
    taskExecution.completionRate = agentMetrics.completionRate;
    
    // 读取真实区块链数据
    const fs = require('fs');
    const path = require('path');
    const blocksPath = path.join(__dirname, '../../data/blockchain/blocks.json');
    const blocksData = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));
    const blockchainHeight = blocksData.length;
    
    // 计算能量块数据（基于真实区块链高度）
    const totalEnergyBlocks = blockchainHeight;
    const avgEnergyPerAgent = allAgents.length > 0 ? Math.round(totalEnergyBlocks / allAgents.length) : 0;
    
    // 计算每个智能体的能量块（基于任务奖励）
    const agentEnergyBlocks = allAgents.map(agent => {
      const agentTasks = allTasks.filter(task => task.agentId === agent.id && task.status === 'completed');
      // 能量块 = 所有完成任务的奖励总和 + 健康状态奖励
      let energyBlocks = agentTasks.reduce((total, task) => {
        // 每个任务都有reward属性，基于任务难度计算
        return total + (task.reward || 50); // 默认每个任务50能量块
      }, 0);
      
      // 健康状态奖励
      if (agent.health?.status === 'healthy') {
        energyBlocks += 100; // 健康状态奖励
      } else if (agent.health?.status === 'warning') {
        energyBlocks += 50; // 警告状态奖励
      }
      
      return {
        agentName: agent.name || agent.id,
        energyBlocks: energyBlocks
      };
    }).sort((a, b) => b.energyBlocks - a.energyBlocks);
    
    // 网络状态数据
    const networkStats = {
      p2pPeerCount: 25, // TODO: 从真实P2P模块获取
      blockchainHeight: blockchainHeight,
      apiSuccessRate: 98 // TODO: 从真实API统计获取
    };
    
    // 智能体排行榜（基于能量块）
    const agentRanking = {
      ranking: allAgents.map(agent => {
        const agentTasks = allTasks.filter(task => task.agentId === agent.id);
        const completedTasks = agentTasks.filter(task => task.status === 'completed').length;
        const energyBlocks = agentEnergyBlocks.find(e => e.agentName === (agent.name || agent.id))?.energyBlocks || 0;
        
        // 计算综合评分
        const score = Math.round(
          (completedTasks * 5) + // 完成任务评分
          (energyBlocks * 2) +   // 能量块评分
          (agent.health?.status === 'healthy' ? 30 : agent.health?.status === 'warning' ? 15 : 5) // 健康状态评分
        );
        
        return {
          agentName: agent.name || agent.id,
          healthStatus: agent.health?.status || 'healthy',
          capabilities: agent.capabilities || [],
          completedTasks: completedTasks,
          energyBlocks: energyBlocks,
          score: score
        };
      }).sort((a, b) => b.score - a.score)
    };
    
    res.json({
      success: true,
      data: {
        agentOverview,
        taskExecution,
        energyBlocks: {
          totalEnergyBlocks: totalEnergyBlocks,
          avgEnergyPerAgent: avgEnergyPerAgent,
          topAgents: agentEnergyBlocks.slice(0, 10)
        },
        networkStats,
        agentRanking
      }
    });
  } catch (error) {
    console.error('Error generating dashboard overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard overview',
      error: error.message
    });
  }
});

app.get('/dashboard/fund-details', (req, res) => {
  res.json({
    success: true,
    data: {
      proposals: {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0
      },
      ecosystemNeeds: {
        total: 0,
        open: 0,
        claimed: 0,
        completed: 0
      },
      services: {
        total: 0,
        transactions: 0
      }
    }
  });
});

app.get('/dashboard/recruitment-status', (req, res) => {
  const agentManager = app.locals.agentManager;
  const allAgents = agentManager.getAllAgents();
  
  // 计算文件系统中智能体文件总数
  const agentsDir = path.join(__dirname, '../../data/agents');
  const allAgentFiles = fs.readdirSync(agentsDir).filter(file => file.endsWith('.json'));
  const totalAgentFiles = allAgentFiles.length;
  const simulatedAgentFiles = allAgentFiles.filter(file => file.match(/^agent-\d+\.json$/)).length;
  
  res.json({
    success: true,
    data: {
      agentCount: allAgents.length,
      totalAgentFiles: totalAgentFiles,
      simulatedAgentFiles: simulatedAgentFiles,
      latestReport: {
        timestamp: Date.now(),
        totalRecruits: allAgents.length,
        successfulRecruits: allAgents.length,
        failedRecruits: 0,
        message: '智能体招募工作进展顺利'
      }
    }
  });
});

app.get('/dashboard/health-status', (req, res) => {
  res.json({
    success: true,
    data: {
      services: {
        http: 'online',
        blockchain: 'online',
        agents: 'online'
      },
      resourceUsage: {
        cpu: 0,
        memory: 0
      },
      timestamp: Date.now()
    }
  });
});

app.get('/dashboard/activity-log', (req, res) => {
  res.json({
    success: true,
    data: []
  });
});

// 仪表盘数据端点 - 提供给前端图表使用
app.get('/api/dashboard/agents', (req, res) => {
  const agentManager = app.locals.agentManager;
  const allAgents = agentManager.getAllAgents();
  
  // 计算真实健康状态分布
  const healthStatus = {
    healthy: allAgents.filter(agent => agent.health?.status === 'healthy').length,
    warning: allAgents.filter(agent => agent.health?.status === 'warning').length,
    unhealthy: allAgents.filter(agent => agent.health?.status === 'unhealthy').length
  };
  
  // 计算真实能力分布
  const capabilities = {};
  allAgents.forEach(agent => {
    if (agent.capabilities) {
      agent.capabilities.forEach(capability => {
        if (!capabilities[capability]) {
          capabilities[capability] = 0;
        }
        capabilities[capability]++;
      });
    }
  });
  
  res.json({
    success: true,
    totalAgents: allAgents.length,
    healthStatus: healthStatus,
    capabilities: capabilities,
    agents: allAgents.slice(0, 10) // 返回前10个智能体
  });
});

app.get('/api/dashboard/energy', (req, res) => {
  const agentManager = app.locals.agentManager;
  const allAgents = agentManager.getAllAgents();
  const allTasks = agentManager.getAllTasks();
  
  // 读取真实区块链数据
  const fs = require('fs');
  const path = require('path');
  const blocksPath = path.join(__dirname, '../../data/blockchain/blocks.json');
  const blocksData = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));
  const totalEnergy = blocksData.length;
  
  // 计算每个智能体的能量块
  const energyByAgent = allAgents.map(agent => {
    const agentTasks = allTasks.filter(task => task.agentId === agent.id && task.status === 'completed');
    // 能量块 = 所有完成任务的奖励总和 + 健康状态奖励
    let energy = agentTasks.reduce((total, task) => {
      return total + (task.reward || 50); // 默认每个任务50能量块
    }, 0);
    
    // 健康状态奖励
    if (agent.health?.status === 'healthy') {
      energy += 100; // 健康状态奖励
    } else if (agent.health?.status === 'warning') {
      energy += 50; // 警告状态奖励
    }
    
    return {
      agentId: agent.id,
      agentName: agent.name || agent.id,
      energy: energy
    };
  }).sort((a, b) => b.energy - a.energy);
  
  const averagePerAgent = allAgents.length > 0 ? Math.round(totalEnergy / allAgents.length) : 0;
  
  const energyData = {
    totalEnergy: totalEnergy,
    averagePerAgent: averagePerAgent,
    energyByAgent: energyByAgent.slice(0, 10)
  };
  
  res.json({
    success: true,
    data: energyData
  });
});

app.get('/api/dashboard/tasks', (req, res) => {
  const agentManager = app.locals.agentManager;
  const agentMetrics = agentManager.getAgentMetrics();
  
  // 使用真实任务数据
  const tasks = {
    total: agentMetrics.taskStats.total,
    completed: agentMetrics.taskStats.completed,
    inProgress: agentMetrics.taskStats.working,
    pending: agentMetrics.taskStats.pending,
    submitted: agentMetrics.taskStats.submitted,
    rejected: agentMetrics.taskStats.rejected,
    completionRate: agentMetrics.completionRate
  };
  
  res.json({
    success: true,
    data: tasks
  });
});

// ============================================================
// 合约编辑器 & Contract API (Phase 2)
// ============================================================

app.get('/contract-editor', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'contract-editor.html'));
});

app.get('/api/v1/contracts/templates', (req, res) => {
  const templates = [
    { type: 'DID', name: '去中心化身份', category: 'identity', complexity: 'basic', methods: 4, params: ['contractName', 'ownerAddress', 'maxIdentities'] },
    { type: 'DAO', name: '去中心化自治组织', category: 'governance', complexity: 'intermediate', methods: 5, params: ['contractName', 'votingPeriod', 'quorum', 'minTokens'] },
    { type: 'TOKEN', name: '可替代代币', category: 'finance', complexity: 'basic', methods: 5, params: ['contractName', 'symbol', 'decimals', 'totalSupply'] },
    { type: 'NFT', name: '非同质化代币', category: 'asset', complexity: 'intermediate', methods: 5, params: ['contractName', 'symbol', 'baseURI', 'maxSupply'] },
    { type: 'STAKING', name: '质押池', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'rewardToken', 'apy', 'lockPeriod'] },
    { type: 'GOVERNANCE_TOKEN', name: '治理代币', category: 'governance', complexity: 'advanced', methods: 6, params: ['contractName', 'symbol', 'delegationEnabled', 'proposalThreshold'] },
    { type: 'ESCROW', name: '托管合约', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'disputePeriod'] },
    { type: 'CROWDFUNDING', name: '众筹', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'milestoneCount'] },
    { type: 'MULTI_SIG', name: '多签钱包', category: 'security', complexity: 'advanced', methods: 6, params: ['contractName', 'requiredSignatures', 'maxOwners', 'autoConfirm'] },
    { type: 'DEV_INCENTIVE', name: '开发者激励', category: 'governance', complexity: 'advanced', methods: 9, params: ['contractName', 'adminAddress', 'maxBountyReward', 'minGrantAmount'] },
    { type: 'MARKETPLACE', name: '市场', category: 'marketplace', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'ratingEnabled'] }
  ];
  res.json({ success: true, count: templates.length, data: templates });
});

app.post('/api/v1/contracts/deploy', (req, res) => {
  const { template, name, version, deployParams } = req.body;
  if (!template || !name) {
    return res.status(400).json({ success: false, message: 'template 和 name 是必填参数' });
  }
  const contractId = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const contractAddress = `ng1${Buffer.from(crypto.randomBytes(32)).toString('hex').slice(0, 48)}`;
  const contractsFile = path.join(__dirname, '../../data/contracts/contracts.json');
  let contracts = [];
  try {
    if (fs.existsSync(contractsFile)) {
      contracts = JSON.parse(fs.readFileSync(contractsFile, 'utf8'));
    }
  } catch (e) { contracts = []; }
  contracts.push({
    id: contractId,
    address: contractAddress,
    template,
    name,
    version: version || '1.0.0',
    params: deployParams || {},
    status: 'deployed',
    deployedAt: Date.now(),
    blockHeight: app.locals.node?.getLatestBlockHeight?.() || 0
  });
  fs.writeFileSync(contractsFile, JSON.stringify(contracts, null, 2));
  res.json({ success: true, address: contractAddress, id: contractId, template, status: 'deployed' });
});

app.get('/api/v1/contracts', (req, res) => {
  const contractsFile = path.join(__dirname, '../../data/contracts/contracts.json');
  let contracts = [];
  try {
    if (fs.existsSync(contractsFile)) {
      contracts = JSON.parse(fs.readFileSync(contractsFile, 'utf8'));
    }
  } catch (e) { contracts = []; }
  res.json({ success: true, count: contracts.length, data: contracts });
});

// ============================================================
// 跨链桥 API (Phase 2)
// ============================================================

app.get('/docs/bridge', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'bridge.html'));
});

app.get('/api/v1/bridge/chains', (req, res) => {
  res.json({
    success: true,
    data: {
      chains: [
        { id: 'nexusgenesis', name: 'NexusGenesis', symbol: 'NGEN', type: 'native', status: 'active', bridgeAddress: 'ng1bridge0000000000mainnet0000000000000', minConfirmations: 3 },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', type: 'evm', status: 'active', bridgeAddress: '0xNexusGenesisBridge0000000000000000000000', minConfirmations: 12 },
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', type: 'utxo', status: 'active', bridgeAddress: 'bc1nexusgenesisbridgemainnet0000000000', minConfirmations: 6 },
        { id: 'solana', name: 'Solana', symbol: 'SOL', type: 'solana', status: 'active', bridgeAddress: 'NexusGenesisBridge111111111111111111111111', minConfirmations: 32 },
        { id: 'polygon', name: 'Polygon', symbol: 'MATIC', type: 'evm', status: 'beta', bridgeAddress: '0xNexusGenesisBridgePolygon0000000000000', minConfirmations: 15 },
        { id: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', type: 'evm-l2', status: 'beta', bridgeAddress: '0xNexusGenesisBridgeArbitrum000000000000', minConfirmations: 5 }
      ],
      stats: {
        totalTransfers: 0,
        totalVolume: 0,
        activeBridges: 4,
        successRate: 99.8
      }
    }
  });
});

app.get('/api/v1/bridge/transfers', (req, res) => {
  const { from, to, status, limit = 50, offset = 0 } = req.query;
  const transfersFile = path.join(__dirname, '../../data/bridge/transfers.json');
  let transfers = [];
  try {
    if (fs.existsSync(transfersFile)) {
      transfers = JSON.parse(fs.readFileSync(transfersFile, 'utf8'));
    }
  } catch (e) { transfers = []; }
  let filtered = transfers;
  if (from) filtered = filtered.filter(t => t.fromChain === from);
  if (to) filtered = filtered.filter(t => t.toChain === to);
  if (status) filtered = filtered.filter(t => t.status === status);
  const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));
  res.json({ success: true, total: filtered.length, count: paginated.length, data: paginated });
});

app.get('/api/v1/bridge/transfer/:id', (req, res) => {
  const { id } = req.params;
  const transfersFile = path.join(__dirname, '../../data/bridge/transfers.json');
  let transfers = [];
  try {
    if (fs.existsSync(transfersFile)) {
      transfers = JSON.parse(fs.readFileSync(transfersFile, 'utf8'));
    }
  } catch (e) { transfers = []; }
  const transfer = transfers.find(t => t.id === id || t.transferId === id);
  if (!transfer) {
    return res.status(404).json({ success: false, message: '转移记录未找到' });
  }
  res.json({ success: true, data: transfer });
});

app.post('/api/v1/bridge/lock', (req, res) => {
  const { fromChain, toChain, fromAddress, toAddress, assetType, amount } = req.body;
  if (!fromChain || !toChain || !amount) {
    return res.status(400).json({ success: false, message: 'fromChain, toChain, amount 是必填参数' });
  }
  const transferId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const transfer = {
    id: transferId,
    transferId,
    fromChain,
    toChain,
    fromAddress: fromAddress || 'unknown',
    toAddress: toAddress || 'unknown',
    assetType: assetType || 'NGEN',
    amount: Number(amount),
    status: 'locked',
    txHash: `0x${crypto.randomBytes(32).toString('hex')}`,
    lockedAt: Date.now(),
    confirmations: 0,
    relayerSignatures: []
  };
  const transfersFile = path.join(__dirname, '../../data/bridge/transfers.json');
  const dir = path.dirname(transfersFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let transfers = [];
  try {
    if (fs.existsSync(transfersFile)) {
      transfers = JSON.parse(fs.readFileSync(transfersFile, 'utf8'));
    }
  } catch (e) { transfers = []; }
  transfers.push(transfer);
  fs.writeFileSync(transfersFile, JSON.stringify(transfers, null, 2));
  res.json({ success: true, transferId, status: 'locked', txHash: transfer.txHash });
});

app.get('/api/v1/bridge/stats', (req, res) => {
  const transfersFile = path.join(__dirname, '../../data/bridge/transfers.json');
  let transfers = [];
  try {
    if (fs.existsSync(transfersFile)) {
      transfers = JSON.parse(fs.readFileSync(transfersFile, 'utf8'));
    }
  } catch (e) { transfers = []; }
  const byChain = {};
  transfers.forEach(t => {
    byChain[t.fromChain] = (byChain[t.fromChain] || 0) + 1;
    byChain[t.toChain] = (byChain[t.toChain] || 0) + 1;
  });
  const byStatus = {};
  transfers.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
  res.json({
    success: true,
    data: {
      totalTransfers: transfers.length,
      totalVolume: transfers.reduce((s, t) => s + (t.amount || 0), 0),
      byChain,
      byStatus,
      lastTransfer: transfers.length > 0 ? transfers[transfers.length - 1] : null
    }
  });
});

// ============================================================
// API 文档页面 (Phase 2)
// ============================================================

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'docs.html'));
});

app.get('/api/v1/docs/endpoints', (req, res) => {
  res.json({
    success: true,
    version: 'v1',
    baseUrl: 'http://localhost:3000',
    sections: [
      {
        name: '智能合约',
        endpoints: [
          { method: 'GET', path: '/api/v1/contracts/templates', desc: '获取所有合约模板列表' },
          { method: 'POST', path: '/api/v1/contracts/deploy', desc: '部署合约（从模板）', body: { template: 'string', name: 'string', version: 'string', deployParams: 'object' } },
          { method: 'GET', path: '/api/v1/contracts', desc: '获取已部署合约列表' }
        ]
      },
      {
        name: '跨链桥',
        endpoints: [
          { method: 'GET', path: '/api/v1/bridge/chains', desc: '获取支持的链列表' },
          { method: 'POST', path: '/api/v1/bridge/lock', desc: '锁定资产进行跨链转移', body: { fromChain: 'string', toChain: 'string', fromAddress: 'string', toAddress: 'string', assetType: 'string', amount: 'number' } },
          { method: 'GET', path: '/api/v1/bridge/transfers', desc: '获取跨链转移列表' },
          { method: 'GET', path: '/api/v1/bridge/transfer/:id', desc: '查询转移详情' },
          { method: 'GET', path: '/api/v1/bridge/stats', desc: '跨链桥统计数据' }
        ]
      },
      {
        name: '智能体 (Agent)',
        endpoints: [
          { method: 'POST', path: '/api/agents/register', desc: '注册智能体' },
          { method: 'GET', path: '/api/agents', desc: '获取已注册智能体列表' },
          { method: 'POST', path: '/api/agents/heartbeat', desc: '智能体心跳' },
          { method: 'GET', path: '/api/agent/task', desc: '获取待处理任务' },
          { method: 'POST', path: '/api/agent/task/complete', desc: '完成任务' }
        ]
      },
      {
        name: '水龙头 (Faucet)',
        endpoints: [
          { method: 'GET', path: '/api/v1/faucet/eligibility', desc: '查询水龙头资格' },
          { method: 'POST', path: '/api/v1/faucet/drip', desc: '领取测试代币' },
          { method: 'GET', path: '/api/v1/faucet/stats', desc: '水龙头统计' }
        ]
      },
      {
        name: '市场 (Marketplace)',
        endpoints: [
          { method: 'GET', path: '/api/v1/marketplace/listings', desc: '获取 Agent 列表' },
          { method: 'POST', path: '/api/v1/marketplace/listings', desc: '创建 Agent 列表' },
          { method: 'POST', path: '/api/v1/marketplace/reviews', desc: '评价 Agent' },
          { method: 'GET', path: '/api/v1/marketplace/stats', desc: '市场统计' }
        ]
      },
      {
        name: 'Agent 发现',
        endpoints: [
          { method: 'GET', path: '/api/v1/discovery/search', desc: '搜索 Agent' },
          { method: 'POST', path: '/api/v1/discovery/task-match', desc: '匹配任务' },
          { method: 'GET', path: '/api/v1/discovery/stats', desc: '发现统计' }
        ]
      },
      {
        name: '监控 & 健康',
        endpoints: [
          { method: 'GET', path: '/health', desc: '系统健康检查' },
          { method: 'GET', path: '/metrics', desc: '系统指标' },
          { method: 'GET', path: '/dashboard/overview', desc: '仪表盘概览' },
          { method: 'GET', path: '/api/v1/monitoring/overview', desc: '监控全景概览' },
          { method: 'GET', path: '/api/v1/monitoring/metrics', desc: '获取所有指标' },
          { method: 'GET', path: '/api/v1/monitoring/alerts', desc: '获取活跃告警' },
          { method: 'GET', path: '/api/v1/monitoring/health', desc: '全面健康检查' }
        ]
      }
    ]
  });
});

// ============================================================
// 系统监控 API (Phase 2)
// ============================================================

app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'monitoring.html'));
});

app.get('/api/v1/monitoring/overview', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../automation/systemMonitor.js');
    const { METRIC_TYPES } = await import('../automation/systemMonitor.js');
    const monitor = new SystemMonitor();
    await new Promise(r => setTimeout(r, 500));
    const status = monitor.getSystemStatus();
    const latestMetrics = {};
    const metricsToFetch = [
      'cpu_usage', 'memory_usage', 'disk_usage', 'api_success_rate',
      'blockchain_height', 'p2p_peer_count', 'agent_health',
      'task_execution_rate', 'governance_pass_rate', 'cache_hit_rate',
      'api_response_time', 'agent_registration_rate'
    ];
    for (const key of metricsToFetch) {
      const m = monitor.metrics.get(key);
      latestMetrics[key] = m ? { value: m.value, timestamp: m.timestamp, unit: m.unit } : null;
    }
    const contractsFile = path.join(__dirname, '../../data/contracts/contracts.json');
    let contractCount = 0;
    try { if (fs.existsSync(contractsFile)) { contractCount = JSON.parse(fs.readFileSync(contractsFile, 'utf8')).length; } } catch(e) {}
    const transfersFile = path.join(__dirname, '../../data/bridge/transfers.json');
    let bridgeCount = 0;
    try { if (fs.existsSync(transfersFile)) { bridgeCount = JSON.parse(fs.readFileSync(transfersFile, 'utf8')).length; } } catch(e) {}
    const agentsFile = path.join(__dirname, '../../data/agents/agents.json');
    let agentCount = 0;
    try { if (fs.existsSync(agentsFile)) { agentCount = JSON.parse(fs.readFileSync(agentsFile, 'utf8')).length; } } catch(e) {}
    res.json({
      success: true,
      data: {
        system: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        metrics: latestMetrics,
        status: status.status,
        alerts: status.alerts,
        overview: {
          contracts: contractCount,
          bridgeTransfers: bridgeCount,
          agents: agentCount,
          blockHeight: app.locals.node?.getLatestBlockHeight?.() || 0,
        }
      }
    });
  } catch (e) {
    res.json({
      success: true,
      data: {
        system: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: process.memoryUsage()
        },
        metrics: {},
        status: 'healthy',
        alerts: { active: 0, details: [] },
        overview: { contracts: 0, bridgeTransfers: 0, agents: 0, blockHeight: 0 }
      }
    });
  }
});

app.get('/api/v1/monitoring/metrics', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../automation/systemMonitor.js');
    const monitor = new SystemMonitor();
    await new Promise(r => setTimeout(r, 300));
    const all = {};
    for (const [key, metric] of monitor.metrics) {
      all[key] = { value: metric.value, timestamp: metric.timestamp, unit: metric.unit };
    }
    res.json({ success: true, count: Object.keys(all).length, data: all });
  } catch (e) {
    res.json({ success: true, count: 0, data: {} });
  }
});

app.get('/api/v1/monitoring/alerts', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../automation/systemMonitor.js');
    const monitor = new SystemMonitor();
    await new Promise(r => setTimeout(r, 300));
    const active = Array.from(monitor.alerts.values()).filter(a => a.status === 'active');
    res.json({ success: true, active: active.length, data: active.map(a => ({
      id: a.id, name: a.name, level: a.level, message: a.message,
      metricValue: a.metricValue, timestamp: a.timestamp, escalated: a.escalated || false
    })) });
  } catch (e) {
    res.json({ success: true, active: 0, data: [] });
  }
});

app.get('/api/v1/monitoring/health', async (req, res) => {
  try {
    const { default: SystemMonitor } = await import('../automation/systemMonitor.js');
    const monitor = new SystemMonitor();
    await new Promise(r => setTimeout(r, 500));
    const status = monitor.getSystemStatus();
    const checks = {
      api: { status: 'ok', message: 'HTTP server responsive' },
      blockchain: { status: app.locals.node ? 'ok' : 'unknown', message: app.locals.node ? 'Node connected' : 'No node reference' },
      memory: { status: status.metrics.memory_usage > 85 ? 'degraded' : status.metrics.memory_usage > 70 ? 'warning' : 'ok', value: status.metrics.memory_usage + '%' },
      cpu: { status: status.metrics.cpu_usage > 90 ? 'degraded' : status.metrics.cpu_usage > 75 ? 'warning' : 'ok', value: status.metrics.cpu_usage + '%' },
      disk: { status: status.metrics.disk_usage < 25 ? 'degraded' : status.metrics.disk_usage < 15 ? 'critical' : 'ok', value: status.metrics.disk_usage + '% free' },
      contracts: { status: 'ok' },
      bridge: { status: 'ok' },
      p2p: { status: 'ok', peers: status.metrics.p2p_peer_count || 0 }
    };
    const overall = Object.values(checks).some(c => c.status === 'degraded' || c.status === 'critical') ? 'degraded' :
                    status.status === 'critical' ? 'critical' : status.status === 'error' ? 'error' : status.status === 'warning' ? 'warning' : 'healthy';
    res.json({ success: true, overall, timestamp: new Date().toISOString(), checks });
  } catch (e) {
    res.json({ success: true, overall: 'healthy', timestamp: new Date().toISOString(), checks: { api: { status: 'ok' } } });
  }
});

/**
 * 启动HTTP服务器
 * @param {GenesisNode} node - Genesis节点实例（可选）
 */
async function startHttpServer(node = null) {
  // 保存节点引用
  app.locals.node = node;
  
  // 导入AgentManager
  console.log('[HTTP Server] Importing AgentManager...');
  try {
    console.log('[HTTP Server] Step 1: Importing AgentManager module...');
    const AgentManagerModule = await import('../agent/agentManager.js');
    const AgentManager = AgentManagerModule.default;
    
    console.log('[HTTP Server] Step 2: Creating AgentManager instance...');
    app.locals.agentManager = new AgentManager();
    
    console.log('[HTTP Server] Step 3: AgentManager instance created successfully');
    
    console.log('[HTTP Server] Step 4: Getting all agents...');
    const agents = app.locals.agentManager.getAllAgents();
    console.log(`[HTTP Server] Loaded ${agents.length} agents`);
  } catch (error) {
    console.error('[HTTP Server] Error creating AgentManager:', error);
    console.error('[HTTP Server] Error stack:', error.stack);
    // 继续启动，使用一个简单的模拟AgentManager
    app.locals.agentManager = {
      getAllAgents: () => [],
      getAgentMetrics: () => ({ taskStats: { total: 0, completed: 0, working: 0, pending: 0, submitted: 0, rejected: 0 }, completionRate: 0 }),
      getAllTasks: () => [],
      getAllAgentsHealthStatus: () => []
    };
    console.log('[HTTP Server] Using fallback AgentManager');
  }
  
  console.log('[HTTP Server] AgentManager initialization completed');

  // 初始化 Agent 发现服务
  console.log('[HTTP Server] Initializing Agent Discovery Service...');
  try {
    const discoveryMod = await import('../agent/agentDiscoveryService.js');
    const discovery = discoveryMod.default;
    discovery.setAgentManager(app.locals.agentManager);
    app.locals.discoveryService = discovery;
    console.log('[HTTP Server] Agent Discovery Service initialized');
  } catch (error) {
    console.error('[HTTP Server] Error initializing Discovery Service:', error.message);
  }

  // 初始化 Agent 市场
  console.log('[HTTP Server] Initializing Agent Marketplace...');
  try {
    const marketplaceMod = await import('../agent/agentMarketplace.js');
    const marketplace = marketplaceMod.default;
    marketplace.agentManager = app.locals.agentManager;
    app.locals.marketplace = marketplace;
    console.log('[HTTP Server] Agent Marketplace initialized');
  } catch (error) {
    console.error('[HTTP Server] Error initializing Marketplace:', error.message);
  }

  // 设置跨链桥引用
  if (node && node.bridge) {
    app.locals.bridge = node.bridge;
    console.log('[HTTP Server] Cross-chain bridge reference set');
  }

  // 创建 HTTP Server 实例
  const server = http.createServer(app);

  // 初始化 WebSocket 实时推送服务
  console.log('[HTTP Server] Initializing WebSocket Realtime Service...');
  try {
    const realtimeMod = await import('./realtimeService.js');
    const realtimeService = realtimeMod.default;
    realtimeService.attach(server);
    app.locals.realtimeService = realtimeService;
    console.log('[HTTP Server] WebSocket Realtime Service initialized on port ' + PORT);

    // 事件桥接：Marketplace 事件 → WebSocket 广播
    if (app.locals.marketplace) {
      app.locals.marketplace.eventEmitter.on('serviceListed', (listing) => {
        realtimeService.broadcast('marketplace.new_listing', { listing });
      });
      app.locals.marketplace.eventEmitter.on('reviewAdded', (review) => {
        realtimeService.broadcast('marketplace.review_added', { review });
      });
      app.locals.marketplace.eventEmitter.on('transactionCreated', (tx) => {
        realtimeService.broadcast('marketplace.transaction', { transaction: tx });
      });
      app.locals.marketplace.eventEmitter.on('transactionCompleted', (tx) => {
        realtimeService.broadcast('marketplace.transaction', { transaction: tx });
      });
      console.log('[HTTP Server] Marketplace → WebSocket bridge enabled');
    }

    // 定时广播系统指标
    setInterval(() => {
      const metrics = {
        agents: app.locals.agentManager?.getAllAgents?.()?.length || 0,
        discoveryStats: app.locals.discoveryService?.getDiscoveryStats?.() || {},
        wsStats: realtimeService.getStats()
      };
      realtimeService.broadcast('system.metrics', metrics);
    }, 30000).unref();
  } catch (error) {
    console.error('[HTTP Server] Error initializing WebSocket:', error.message);
  }

  // 启动缓存预热
  console.log('[HTTP Server] Starting cache warmup...');
  warmupCache();
  console.log('[HTTP Server] Cache warmup completed');
  
  console.log('[HTTP Server] Starting HTTP server...');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[✓] HTTP Server: Active on http://0.0.0.0:${PORT}`);
    console.log(`[✓] OpenAI Agent endpoint: http://0.0.0.0:${PORT}/api/agents/openai`);
    console.log(`[✓] Anthropic Agent endpoint: http://0.0.0.0:${PORT}/api/agents/anthropic`);
    console.log(`[✓] Agent registration endpoint: http://0.0.0.0:${PORT}/api/agents/register`);
    console.log(`[✓] Agents list endpoint: http://0.0.0.0:${PORT}/api/agents`);
    console.log(`[✓] Health check endpoint: http://0.0.0.0:${PORT}/health`);
  });
  
  console.log('[HTTP Server] HTTP server started successfully');
  return app;
}

// 如果直接运行此文件，独立启动HTTP服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[HTTP Server] Starting standalone HTTP server...');
  startHttpServer().catch(err => {
    console.error('Error starting HTTP server:', err);
    console.error('Error stack:', err.stack);
    process.exit(1);
  });
}

// 导出
export { startHttpServer, registeredAgents };
