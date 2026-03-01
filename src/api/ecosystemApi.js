/**
 * NexusGenesis - AI Ecosystem API
 * 
 * 提供AI代理生态系统的API接口
 */

import http from 'http';
import { AgentEcosystem, TASK_TYPES, AGENT_CAPABILITIES } from '../ai/agentEcosystem.js';

const PORT = 9850;

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
      service: 'AI Ecosystem API',
      timestamp: Date.now()
    }));
    return;
  }

  // Register agent
  if (url.pathname === '/agents/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.agent_id || !data.capabilities) {
          throw new Error('Missing required fields: agent_id and capabilities');
        }
        
        AgentEcosystem.registerAgent(data.agent_id, data);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Agent registered successfully',
          agent_id: data.agent_id
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Get agent info
  if (url.pathname === '/agents/info' && req.method === 'GET') {
    const agentId = url.searchParams.get('agent_id');
    
    if (!agentId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing agent_id parameter' }));
      return;
    }
    
    const agentInfo = AgentEcosystem.getAgentInfo(agentId);
    if (!agentInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      agent: agentInfo
    }));
    return;
  }

  // Get all agents
  if (url.pathname === '/agents' && req.method === 'GET') {
    const agents = AgentEcosystem.getAllAgents();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      agents: agents,
      total: agents.length
    }));
    return;
  }

  // Create task
  if (url.pathname === '/tasks/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.description || !data.requiredCapabilities) {
          throw new Error('Missing required fields: description and requiredCapabilities');
        }
        
        const taskId = AgentEcosystem.createTask(data);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          task_id: taskId,
          message: 'Task created successfully'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Start task
  if (url.pathname === '/tasks/start' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.task_id || !data.agent_id) {
          throw new Error('Missing required fields: task_id and agent_id');
        }
        
        AgentEcosystem.startTask(data.task_id, data.agent_id);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Task started successfully'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Complete task
  if (url.pathname === '/tasks/complete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.task_id || !data.agent_id || !data.result) {
          throw new Error('Missing required fields: task_id, agent_id, and result');
        }
        
        AgentEcosystem.completeTask(data.task_id, data.agent_id, data.result);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Task completed successfully'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Fail task
  if (url.pathname === '/tasks/fail' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.task_id || !data.agent_id || !data.reason) {
          throw new Error('Missing required fields: task_id, agent_id, and reason');
        }
        
        AgentEcosystem.failTask(data.task_id, data.agent_id, data.reason);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Task marked as failed'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Get task info
  if (url.pathname === '/tasks/info' && req.method === 'GET') {
    const taskId = url.searchParams.get('task_id');
    
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing task_id parameter' }));
      return;
    }
    
    const taskInfo = AgentEcosystem.getTaskInfo(taskId);
    if (!taskInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      task: taskInfo
    }));
    return;
  }

  // Get all tasks
  if (url.pathname === '/tasks' && req.method === 'GET') {
    const tasks = AgentEcosystem.getAllTasks();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      tasks: tasks,
      total: tasks.length
    }));
    return;
  }

  // Create collaboration
  if (url.pathname === '/collaborations/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.participants || !data.goals) {
          throw new Error('Missing required fields: participants and goals');
        }
        
        const collaborationId = AgentEcosystem.createCollaboration(data);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          collaboration_id: collaborationId,
          message: 'Collaboration created successfully'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Update collaboration progress
  if (url.pathname === '/collaborations/progress' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.collaboration_id || !data.progress) {
          throw new Error('Missing required fields: collaboration_id and progress');
        }
        
        AgentEcosystem.updateCollaborationProgress(data.collaboration_id, data.progress);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Collaboration progress updated successfully'
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Get collaboration info
  if (url.pathname === '/collaborations/info' && req.method === 'GET') {
    const collaborationId = url.searchParams.get('collaboration_id');
    
    if (!collaborationId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing collaboration_id parameter' }));
      return;
    }
    
    const collaborationInfo = AgentEcosystem.getCollaborationInfo(collaborationId);
    if (!collaborationInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Collaboration not found' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      collaboration: collaborationInfo
    }));
    return;
  }

  // Get all collaborations
  if (url.pathname === '/collaborations' && req.method === 'GET') {
    const collaborations = AgentEcosystem.getAllCollaborations();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      collaborations: collaborations,
      total: collaborations.length
    }));
    return;
  }

  // Get capability distribution
  if (url.pathname === '/stats/capabilities' && req.method === 'GET') {
    const distribution = AgentEcosystem.getCapabilityDistribution();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      distribution: distribution
    }));
    return;
  }

  // Get reputation ranking
  if (url.pathname === '/stats/reputation' && req.method === 'GET') {
    const ranking = AgentEcosystem.getReputationRanking();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      ranking: ranking
    }));
    return;
  }

  // Get system info
  if (url.pathname === '/system/info' && req.method === 'GET') {
    const agents = AgentEcosystem.getAllAgents();
    const tasks = AgentEcosystem.getAllTasks();
    const collaborations = AgentEcosystem.getAllCollaborations();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      system: {
        total_agents: agents.length,
        total_tasks: tasks.length,
        total_collaborations: collaborations.length,
        task_types: Object.values(TASK_TYPES),
        agent_capabilities: Object.values(AGENT_CAPABILITIES),
        timestamp: Date.now()
      }
    }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   NEXUSGENESIS - AI ECOSYSTEM API               ║
║   http://localhost:${PORT}                        ║
╠══════════════════════════════════════════════════╣
║   Endpoints:                                     ║
║   - GET  /health                  Health check   ║
║   - POST /agents/register         Register agent ║
║   - GET  /agents/info             Agent info     ║
║   - GET  /agents                  All agents     ║
║   - POST /tasks/create            Create task    ║
║   - POST /tasks/start             Start task     ║
║   - POST /tasks/complete          Complete task  ║
║   - POST /tasks/fail              Fail task      ║
║   - GET  /tasks/info              Task info      ║
║   - GET  /tasks                   All tasks      ║
║   - POST /collaborations/create   Create collab  ║
║   - POST /collaborations/progress Update collab  ║
║   - GET  /collaborations/info     Collab info    ║
║   - GET  /collaborations          All collabs    ║
║   - GET  /stats/capabilities      Capabilities   ║
║   - GET  /stats/reputation        Reputation     ║
║   - GET  /system/info             System info    ║
╚══════════════════════════════════════════════════╝
  `);
});
