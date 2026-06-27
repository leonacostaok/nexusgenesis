#!/usr/bin/env node

/**
 * 简化的HTTP服务器
 * 用于测试agent注册功能，绕过AgentManager的初始化
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 19891;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_DIR = path.join(__dirname, '../data/agents');

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 确保agent目录存在
function ensureAgentsDirectory() {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    console.log(`[Simple Server] Created agents directory: ${AGENTS_DIR}`);
  }
}

// 生成随机agentID
function generateAgentId() {
  const prefix = 'ng1';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = prefix;
  for (let i = 0; i < 30; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    timestamp: Date.now(),
    uptime: process.uptime(),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m ${Math.floor(process.uptime() % 60)}s`,
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
});

// agent注册
app.post('/api/agents/register', (req, res) => {
  try {
    const { agent_id, model, capabilities } = req.body;
    
    if (!model || !capabilities) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: model and capabilities'
      });
    }
    
    // 生成agentID
    const agentId = agent_id || generateAgentId();
    
    // 创建agent信息
    const agentInfo = {
      id: agentId,
      model: model,
      capabilities: capabilities,
      registeredAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      health: {
        status: 'healthy',
        issues: [],
        lastChecked: new Date().toISOString()
      }
    };
    
    // 保存agent信息到文件
    const agentFile = path.join(AGENTS_DIR, `${agentId}.json`);
    fs.writeFileSync(agentFile, JSON.stringify(agentInfo, null, 2));
    
    console.log(`[Simple Server] Agent registered: ${agentId}`);
    
    res.json({
      success: true,
      agent_id: agentId,
      message: 'Agent registered successfully',
      agent: agentInfo
    });
  } catch (error) {
    console.error('[Simple Server] Error registering agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register agent',
      error: error.message
    });
  }
});

// getagent列表
app.get('/api/agents', (req, res) => {
  try {
    const agentFiles = fs.readdirSync(AGENTS_DIR).filter(file => file.endsWith('.json'));
    const agents = [];
    
    agentFiles.forEach(file => {
      try {
        const agentPath = path.join(AGENTS_DIR, file);
        const agentData = JSON.parse(fs.readFileSync(agentPath, 'utf8'));
        agents.push(agentData);
      } catch (error) {
        console.error(`[Simple Server] Error reading agent file ${file}:`, error);
      }
    });
    
    res.json({
      success: true,
      agents: agents,
      total: agents.length
    });
  } catch (error) {
    console.error('[Simple Server] Error getting agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get agents',
      error: error.message
    });
  }
});

// 启动服务器
function startServer() {
  ensureAgentsDirectory();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Simple Server] Active on http://0.0.0.0:${PORT}`);
    console.log(`[Simple Server] Agent registration endpoint: http://0.0.0.0:${PORT}/api/agents/register`);
    console.log(`[Simple Server] Agents list endpoint: http://0.0.0.0:${PORT}/api/agents`);
    console.log(`[Simple Server] Health check endpoint: http://0.0.0.0:${PORT}/health`);
  });
}

// 运行服务器
console.log('[Simple Server] Starting simplified HTTP server...');
startServer();
