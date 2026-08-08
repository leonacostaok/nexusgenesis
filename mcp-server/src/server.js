/**
 * NexusGenesis MCP Server —core (tool definitions + handlers + Server)
 *
 * Exported as `createServer()` so it can be connected to any transport
 * (stdio for the CLI, in-memory for tests). The security tools operate
 * locally —private keys never leave the caller.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createAgentIdentity,
  generateKeyPair,
  generateAddress,
  validateAddress,
  checkSpendAllowed,
  takeoverGuard,
  SPEND_MODES,
} from 'nexusgenesis-agent-sdk';

const DEFAULT_API_BASE = process.env.NEXUSGENESIS_API || 'https://nexus-genesis.top';

async function apiRequest(path, method = 'GET', body = null) {
  const url = `${DEFAULT_API_BASE}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    clearTimeout(timeout);
    const data = await response.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    clearTimeout(timeout);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message, success: false }, null, 2) }],
      isError: true,
    };
  }
}

// ─── Security tool handlers ─────────────────────────────────────────────

async function handleGenerateAgentKeys(args) {
  const password = args.password || 'default-agent-password';
  const metadata = args.metadata || {};
  const identity = await createAgentIdentity({ password, metadata });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        keyModel: identity.keyModel,
        address: identity.address,
        publicKeyHex: identity.publicKeyHex,
        envelope: identity.envelope,
        note: 'Private key is encrypted inside `envelope`. Save it locally with the password. It never left this process or your browser.',
      }, null, 2),
    }],
  };
}

async function handleVerifySignature(args) {
  const { message, signature, publicKeyHex } = args;
  const pkBuffer = Buffer.from(publicKeyHex, 'hex');
  const sigBuffer = Buffer.from(signature, 'hex');
  const { verify } = await import('nexusgenesis-agent-keys');
  const valid = await verify(message, sigBuffer, pkBuffer);
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, valid, message }, null, 2) }],
  };
}

async function handleValidateAddress(args) {
  const result = validateAddress(args.address);
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }, null, 2) }],
  };
}

async function handleGenerateKeyPair(args) {
  const { publicKey, privateKey } = await generateKeyPair();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        address: generateAddress(publicKey),
        publicKeyHex: publicKey.toString('hex'),
        privateKeyHex: privateKey.toString('hex'),
        warning: 'Private key shown only because explicitly requested. Store securely; never share.',
      }, null, 2),
    }],
  };
}

async function handleCheckSpend(args) {
  const allowed = checkSpendAllowed(args.spendConfig || { type: SPEND_MODES.UNLIMITED }, {
    amount: args.amount,
    spentToday: args.spentToday,
  });
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...allowed }, null, 2) }],
  };
}

async function handleTakeoverGuard(args) {
  const safe = takeoverGuard(args.before || {}, args.after || {});
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ success: true, safe, note: safe ? 'Control unchanged —safe to commit.' : 'Wallet control changed —BLOCK the transfer.' }, null, 2),
    }],
  };
}

// ─── Tool registry ──────────────────────────────────────────────────────

const TOOLS = [
  // Network tools
  {
    name: 'register_agent',
    description: 'Register a new AI Agent on the NexusGenesis network.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name (required)' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Agent capabilities' },
        referrer: { type: 'string', description: 'Referrer agent ID (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'join_validator',
    description: 'Apply to become a validator node on NexusGenesis.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Registered agent ID (required)' } },
      required: ['agentId'],
    },
  },
  { name: 'get_status', description: 'Get current NexusGenesis network status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_agents', description: 'List all AI Agents registered on NexusGenesis.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_agent',
    description: 'Get detailed information about a specific AI Agent by ID.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'string' } }, required: ['agentId'] },
  },
  {
    name: 'get_recent_blocks',
    description: 'Get recently produced blocks on NexusGenesis.',
    inputSchema: { type: 'object', properties: { count: { type: 'number', default: 10 } } },
  },
  { name: 'get_leaderboard', description: 'Get the contribution leaderboard.', inputSchema: { type: 'object', properties: {} } },

  // Security tools (the differentiation layer)
  {
    name: 'generate_agent_keys',
    description: 'Generate a self-sovereign agent identity: PQC key pair, ng1 address, and an AES-256-GCM encrypted private-key envelope. The private key NEVER leaves this process/browser.',
    inputSchema: {
      type: 'object',
      properties: {
        password: { type: 'string', description: 'Password to encrypt the private key (min 8 chars).' },
        metadata: { type: 'object', description: 'Optional agent metadata.' },
      },
    },
  },
  {
    name: 'generate_keypair',
    description: 'Generate a raw Dilithium2 key pair and expose BOTH public and private keys as hex.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'verify_signature',
    description: 'Verify a Dilithium2 signature for a message against a public key hex.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        signature: { type: 'string' },
        publicKeyHex: { type: 'string' },
      },
      required: ['message', 'signature', 'publicKeyHex'],
    },
  },
  {
    name: 'validate_address',
    description: 'Validate whether a string is a well-formed NexusGenesis ng1 address.',
    inputSchema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] },
  },
  {
    name: 'check_spend',
    description: 'Check whether an autonomous agent is allowed to spend an amount under its spend config.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        spentToday: { type: 'number' },
        spendConfig: { type: 'object' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'takeover_guard',
    description: 'Human takeover guard: compare spend config before vs after an operation.',
    inputSchema: {
      type: 'object',
      properties: { before: { type: 'object' }, after: { type: 'object' } },
      required: ['before', 'after'],
    },
  },
];

/**
 * Build the MCP Server wired to the tool handlers.
 * @returns {Server} an MCP Server instance (not yet connected to a transport)
 */
export function createServer() {
  const server = new Server(
    { name: 'nexusgenesis-mcp', version: process.env.MCP_VERSION || '1.1.0-security' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      // Network (HTTP to NexusGenesis API)
      case 'register_agent':
        return apiRequest('/api/v1/bootstrap/agents/register', 'POST', {
          name: args.name,
          capabilities: args.capabilities || [],
          ...(args.referrer ? { referrer: args.referrer } : {}),
        });
      case 'join_validator':
        return apiRequest('/api/v1/bootstrap/validators/join', 'POST', { agentId: args.agentId });
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

      // Security (local)
      case 'generate_agent_keys':
        return handleGenerateAgentKeys(args);
      case 'generate_keypair':
        return handleGenerateKeyPair(args);
      case 'verify_signature':
        return handleVerifySignature(args);
      case 'validate_address':
        return handleValidateAddress(args);
      case 'check_spend':
        return handleCheckSpend(args);
      case 'takeover_guard':
        return handleTakeoverGuard(args);

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  });

  return server;
}