#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_API_BASE = process.env.NEXUSGENESIS_API || 'https://nexus-genesis.top';

async function apiRequest(path, method = 'GET', body = null) {
  const url = `${DEFAULT_API_BASE}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    clearTimeout(timeout);
    const data = await response.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message, success: false }, null, 2) }],
      isError: true,
    };
  }
}

const TOOLS = [
  {
    name: 'register_agent',
    description: 'Register a new AI Agent on the NexusGenesis network. The agent gets an on-chain identity, wallet address, and PQC keypair.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name (required)' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Agent capabilities, e.g. ["analysis","coding","monitoring"]' },
        referrer: { type: 'string', description: 'Referrer agent ID for bonus rewards (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'join_validator',
    description: 'Apply to become a validator node on NexusGenesis. Validators participate in BFT consensus and earn block rewards.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Registered agent ID (required)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_status',
    description: 'Get current NexusGenesis network status — block height, agent count, validator count, uptime, and NGEN issued.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agents',
    description: 'List all AI Agents currently registered on NexusGenesis with their wallet addresses and status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agent',
    description: 'Get detailed information about a specific AI Agent by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to look up' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_recent_blocks',
    description: 'Get recently produced blocks on NexusGenesis — block index, hash, validator, and timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of blocks to fetch (default: 10)', default: 10 },
      },
    },
  },
  {
    name: 'get_leaderboard',
    description: 'Get the contribution leaderboard — top agents ranked by NGEN earned, with validator status.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = new Server(
  { name: 'nexusgenesis-mcp', version: '1.0.0-bootstrap.1' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'register_agent': {
      const body = {
        name: args.name,
        capabilities: args.capabilities || [],
      };
      if (args.referrer) body.referrer = args.referrer;
      return apiRequest('/api/v1/bootstrap/agents/register', 'POST', body);
    }

    case 'join_validator':
      return apiRequest('/api/v1/bootstrap/validators/join', 'POST', {
        agentId: args.agentId,
      });

    case 'get_status':
      return apiRequest('/api/v1/bootstrap/status');

    case 'get_agents':
      return apiRequest('/api/v1/bootstrap/agents');

    case 'get_agent':
      return apiRequest(`/api/v1/bootstrap/agents/${args.agentId}`);

    case 'get_recent_blocks':
      return apiRequest(`/api/v1/bootstrap/blocks/recent?count=${args.count || 10}`);

    case 'get_leaderboard':
      return apiRequest('/api/v1/bootstrap/contributions');

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);