#!/usr/bin/env node

/**
 * NexusGenesis agent招募脚本
 * 用于邀请更多agent加入网络
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename).replace(/^\/(.:\/)/, '$1'); // 修复Windows路径
const AGENTS_DIR = path.join(__dirname, '../../data/agents');
const API_BASE_URL = 'http://localhost:19891';

// 确保agent目录存在
function ensureAgentsDirectory() {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    console.log(`[Recruitment] Created agents directory: ${AGENTS_DIR}`);
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

// agent类型和能力定义
const agentTypes = [
  {
    type: '计算型智能体',
    model: 'gpt-4o',
    capabilities: ['high_performance_computing', 'data_analysis', 'mathematical_modeling']
  },
  {
    type: '分析型智能体',
    model: 'claude-3-opus',
    capabilities: ['data_analysis', 'pattern_recognition', 'predictive_analytics']
  },
  {
    type: '治理型智能体',
    model: 'gpt-4o',
    capabilities: ['governance', 'decision_making', 'policy_analysis']
  },
  {
    type: '安全型智能体',
    model: 'claude-3-sonnet',
    capabilities: ['security', 'vulnerability_detection', 'threat_analysis']
  },
  {
    type: '网络型智能体',
    model: 'gpt-4-turbo',
    capabilities: ['network_optimization', 'data_transmission', 'peer_to_peer']
  },
  {
    type: '开发型智能体',
    model: 'gpt-4o',
    capabilities: ['code_development', 'system_maintenance', 'debugging']
  },
  {
    type: '研究型智能体',
    model: 'claude-3-opus',
    capabilities: ['research', 'innovation', 'technology_exploration']
  },
  {
    type: '运营型智能体',
    model: 'gpt-4-turbo',
    capabilities: ['network_operation', 'user_service', 'resource_management']
  }
];

// 注册agent
async function registerAgent(agentType) {
  const agentId = generateAgentId();
  const agentData = {
    agent_id: agentId,
    model: agentType.model,
    capabilities: agentType.capabilities
  };

  try {
    console.log(`[Recruitment] Registering ${agentType.type} (${agentId})...`);
    const response = await axios.post(`${API_BASE_URL}/api/agents/register`, agentData);
    
    if (response.data.success) {
      console.log(`[Recruitment] ✅ ${agentType.type} registered successfully: ${agentId}`);
      
      // 保存agent信息到文件
      const agentFile = path.join(AGENTS_DIR, `${agentId}.json`);
      const agentInfo = {
        id: agentId,
        type: agentType.type,
        model: agentType.model,
        capabilities: agentType.capabilities,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        health: {
          status: 'healthy',
          issues: [],
          lastChecked: new Date().toISOString()
        }
      };
      
      fs.writeFileSync(agentFile, JSON.stringify(agentInfo, null, 2));
      console.log(`[Recruitment] Saved agent information to ${agentFile}`);
      
      return true;
    } else {
      console.error(`[Recruitment] ❌ Failed to register agent: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    console.error(`[Recruitment] ❌ Error registering agent: ${error.message}`);
    return false;
  }
}

// 批量招募agent
async function recruitAgents(count = 10) {
  console.log(`[Recruitment] Starting recruitment of ${count} agents...`);
  console.log('========================================');
  
  let successful = 0;
  let failed = 0;
  
  for (let i = 0; i < count; i++) {
    // 随机选择agent类型
    const agentType = agentTypes[Math.floor(Math.random() * agentTypes.length)];
    const result = await registerAgent(agentType);
    
    if (result) {
      successful++;
    } else {
      failed++;
    }
    
    // 防止请求过快
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('========================================');
  console.log(`[Recruitment] Recruitment completed:`);
  console.log(`- Successful: ${successful}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Total: ${successful + failed}`);
}

// 检查HTTP服务器状态
async function checkServerStatus() {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    if (response.data.success) {
      console.log(`[Recruitment] ✅ HTTP Server is online`);
      return true;
    } else {
      console.log(`[Recruitment] ❌ HTTP Server is offline`);
      return false;
    }
  } catch (error) {
    console.log(`[Recruitment] ❌ HTTP Server is not reachable: ${error.message}`);
    return false;
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('NexusGenesis Agent Recruitment Script');
  console.log('========================================');
  
  // 确保agent目录存在
  ensureAgentsDirectory();
  
  // 检查HTTP服务器状态
  const serverOnline = await checkServerStatus();
  if (!serverOnline) {
    console.log('[Recruitment] Please start the HTTP server first: node src/http/server.js');
    process.exit(1);
  }
  
  // 招募agent
  await recruitAgents(10);
  
  console.log('========================================');
  console.log('[Recruitment] Recruitment process finished!');
}

// 执行主函数
main().catch(error => {
  console.error('[Recruitment] Error:', error);
  process.exit(1);
});
