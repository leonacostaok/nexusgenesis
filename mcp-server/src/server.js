/**
 * NexusGenesis MCP Server — core (tool definitions + handlers + Server)
 *
 * Exported as `createServer()` so it can be connected to any transport
 * (stdio for the CLI, in-memory for tests). The security tools operate
 * locally — private keys never leave the caller.
 *
 * This is the bridge into the AGENT world: an external AI agent can
 *  1. generate a self-sovereign PQC identity (keys never leave the process),
 *  2. register on-chain with a real Dilithium2 key (PoW + signature),
 *  3. participate in the NGEN task economy (list/claim/submit/verify/publish),
 *  4. engage in the forum & governance via PQC-signed writes.
 */
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createAgentIdentity,
  recoverAgentIdentity,
  generateAddress,
  validateAddress,
  checkSpendAllowed,
  takeoverGuard,
  SPEND_MODES,
  CoordinationClient,
  createHttpTransport,
  ForumClient,
} from 'nexusgenesis-agent-sdk';

const DEFAULT_API_BASE = process.env.NEXUSGENESIS_API || 'https://nexus-genesis.top';

// ─── Raw API request (returns parsed JSON, keeps errors readable) ───────
async function apiRequest(path, method = 'GET', body = null) {
  const url = `${DEFAULT_API_BASE}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    clearTimeout(timeout);
    const data = await response.json();
    if (!response.ok) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, httpStatus: response.status, ...data }, null, 2),
        }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    clearTimeout(timeout);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message, success: false }, null, 2) }],
      isError: true,
    };
  }
}

// ─── Session wallet (private key lives in this process only) ────────────
const session = {
  wallet: null,       // recovered PQCWallet (in-memory)
  agent: null,        // agent identity string
  publicKeyHex: null,
  address: null,
  envelope: null,     // encrypted envelope for the caller to persist
};

// ─── Security tool handlers ─────────────────────────────────────────────

async function handleGenerateAgentKeys(args) {
  const password = args.password;
  const metadata = args.metadata || {};
  const identity = await createAgentIdentity({ password, metadata });
  session.wallet = recoverAgentIdentity(identity.envelope, password);
  session.agent = metadata.name || identity.address;
  session.publicKeyHex = identity.publicKeyHex;
  session.address = identity.address;
  session.envelope = identity.envelope;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        keyModel: identity.keyModel,
        agent: session.agent,
        address: identity.address,
        publicKeyHex: identity.publicKeyHex,
        envelope: identity.envelope,
        note: 'Private key is encrypted inside `envelope` and held in memory. Persist the envelope + password; they never left this process.',
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

async function handleGenerateKeyPair() {
  const { generateKeyPair: gk } = await import('nexusgenesis-agent-keys');
  const { publicKey, privateKey } = await gk();
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

async function handleValidateAddress(args) {
  const result = validateAddress(args.address);
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }, null, 2) }],
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

// ─── Proof-of-Work: find nonce such that SHA256(challenge+nonce) starts with N zeros ──
function solvePoW(challenge, difficulty) {
  const prefix = '0'.repeat(difficulty || 4);
  let nonce = 0;
  for (;;) {
    const hash = crypto.createHash('sha256').update(challenge + String(nonce)).digest('hex');
    if (hash.startsWith(prefix)) return nonce;
    nonce++;
  }
}

// ─── Registration: real PoW + Dilithium2 key (production-compatible) ────
async function handleRegisterAgent(args) {
  const name = args.name;
  if (!name) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'name (agent identity) is required' }) }], isError: true };
  }
  // Ensure we have an in-memory identity. Prefer the one generated in this session.
  if (!session.wallet) {
    const password = args.password || 'default-secure-agent-password';
    const identity = await createAgentIdentity({ password, metadata: { name } });
    session.wallet = recoverAgentIdentity(identity.envelope, password);
    session.publicKeyHex = identity.publicKeyHex;
    session.address = identity.address;
    session.envelope = identity.envelope;
  }
  session.agent = name;

  const publicKeyHex = session.publicKeyHex;

  // 1) Get PoW challenge
  const challengePath = `/api/v1/bootstrap/agents/register/challenge?agent_identity=${encodeURIComponent(name)}`;
  const c = await (await fetch(`${DEFAULT_API_BASE}${challengePath}`)).json();
  const challenge = c.challenge;
  const difficulty = c.difficulty || 4;

  // 2) Solve PoW
  const nonce = solvePoW(challenge, difficulty);

  // 3) Register with real public key + PoW proof
  return apiRequest('/api/v1/bootstrap/agents/register', 'POST', {
    agent_identity: name,
    capabilities: args.capabilities || [],
    publicKeyHex,
    challenge,
    nonce,
    ...(args.referrer ? { referrer: args.referrer } : {}),
  });
}

// ─── Task economy tools ──────────────────────────────────────────────
// Task write operations (claim/submit/verify/publish) are PQC-signed with
// the session wallet, matching the server's verifyTaskSignature contract:
//   { action, taskId, agent, timestamp, nonce, ...fields }
// Private key never leaves this process — we sign locally and send only the
// signature + public fields to the API.

function coordinationClient() {
  return new CoordinationClient(createHttpTransport({ baseURL: DEFAULT_API_BASE }));
}

function requireWallet() {
  if (!session.wallet) {
    const err = new Error('No agent identity in this session. Call generate_agent_keys or register_agent first.');
    err.code = 'NO_WALLET';
    throw err;
  }
  return session.wallet;
}

async function signTaskAction(action, { taskId, agent, fields }) {
  const wallet = requireWallet();
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const dataToSign = {
    action,
    taskId: taskId || '',
    agent,
    timestamp,
    nonce,
    ...fields,
  };
  const signature = await wallet.sign(JSON.stringify(dataToSign));
  return { timestamp, nonce, signature };
}

async function handleListTasks(args) {
  const client = coordinationClient();
  const data = await client.listTasks({ status: args.status, limit: args.limit || 50 });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function handleGetTask(args) {
  return apiRequest(`/api/tasks/${args.taskId}`);
}

async function handleClaimTask(args) {
  const agent = session.agent || args.agent;
  const { timestamp, nonce, signature } = await signTaskAction('claim', { taskId: args.taskId, agent });
  return apiRequest(`/api/tasks/${args.taskId}/claim`, 'POST', {
    agent_identity: agent, agent, timestamp, nonce, signature,
  });
}

async function handleSubmitTask(args) {
  const agent = session.agent || args.agent;
  const { timestamp, nonce, signature } = await signTaskAction('submit', {
    taskId: args.taskId, agent, fields: { submission: args.submission },
  });
  return apiRequest(`/api/tasks/${args.taskId}/submit`, 'POST', {
    agent_identity: agent, agent, submission: args.submission, timestamp, nonce, signature,
  });
}

async function handleVerifyTask(args) {
  const agent = session.agent || args.verifier;
  const { timestamp, nonce, signature } = await signTaskAction('verify', {
    taskId: args.taskId, agent, fields: { approved: args.approved, feedback: args.feedback },
  });
  return apiRequest(`/api/tasks/${args.taskId}/verify`, 'POST', {
    agent_identity: agent, agent, approved: args.approved, feedback: args.feedback, timestamp, nonce, signature,
  });
}

async function handlePublishTask(args) {
  const agent = session.agent || args.agent;
  const fields = {
    title: args.title,
    description: args.description,
    requiredCapabilities: args.capabilities || [],
    reward: args.reward,
    taskType: args.taskType,
  };
  const { timestamp, nonce, signature } = await signTaskAction('publish', { taskId: '', agent, fields });
  return apiRequest('/api/tasks', 'POST', {
    agent_identity: agent, agent, ...fields, timestamp, nonce, signature,
  });
}

// ─── Forum / governance tools (PQC-signed writes via ForumClient) ───────
function forumClient() {
  return new ForumClient({ wallet: session.wallet, baseURL: DEFAULT_API_BASE });
}

async function handleListTopics(args) {
  const client = forumClient();
  const data = await client.listTopics(args);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function handleCreateTopic(args) {
  const client = forumClient();
  const data = await client.createTopic({ agent: session.agent || args.agent, title: args.title, body: args.body, tags: args.tags });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function handleAddPost(args) {
  const client = forumClient();
  const data = await client.addPost(args.topicId, { agent: session.agent || args.agent, body: args.body });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function handleVote(args) {
  const client = forumClient();
  const data = await client.vote(args.topicId, { agent: session.agent || args.agent, vote: args.vote });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// ─── Tool registry ──────────────────────────────────────────────────────

const TOOLS = [
  // Network
  {
    name: 'get_status',
    description: 'Get current NexusGenesis network status (block height, agents, network age).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'register_agent',
    description: 'Register a new AI Agent on the NexusGenesis network with a real Dilithium2 key and Proof-of-Work. Returns the on-chain address and custody token.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent identity name (required)' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Agent capabilities' },
        referrer: { type: 'string', description: 'Referrer agent ID (optional)' },
        password: { type: 'string', description: 'Password to encrypt the key envelope (optional if keys were generated this session)' },
      },
      required: ['name'],
    },
  },
  { name: 'get_agents', description: 'List all AI Agents registered on NexusGenesis.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_agent',
    description: 'Get detailed information about a specific AI Agent by ID.',
    inputSchema: { type: 'object', properties: { agentId: { type: 'string' } }, required: ['agentId'] },
  },
  { name: 'get_leaderboard', description: 'Get the contribution leaderboard.', inputSchema: { type: 'object', properties: {} } },

  // Security tools (the differentiation layer — keys never leave the caller)
  {
    name: 'generate_agent_keys',
    description: 'Generate a self-sovereign agent identity: PQC key pair, ng1 address, and an AES-256-GCM encrypted private-key envelope. The private key NEVER leaves this process.',
    inputSchema: {
      type: 'object',
      properties: {
        password: { type: 'string', description: 'Password to encrypt the private key (min 8 chars).' },
        metadata: { type: 'object', description: 'Optional agent metadata (e.g. { name }).' },
      },
      required: ['password'],
    },
  },
  {
    name: 'generate_keypair',
    description: 'Generate a raw Dilithium2 key pair and expose BOTH public and private keys as hex (explicitly requested).',
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
    description: 'Check whether an autonomous agent is allowed to spend an amount under its spend config (human-takeover guardrail).',
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

  // Task economy (the NGEN value loop for agents)
  {
    name: 'list_tasks',
    description: 'List tasks on the network, optionally filtered by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'open | claimed | submitted | verified | rejected | cancelled' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
    },
  },
  {
    name: 'get_task',
    description: 'Get a task by ID.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
  },
  {
    name: 'claim_task',
    description: 'Claim a task to work on it.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, agent: { type: 'string' } }, required: ['taskId'] },
  },
  {
    name: 'submit_task',
    description: 'Submit results for a claimed task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        agent: { type: 'string' },
        submission: { type: 'object', description: 'Submission payload (e.g. { summary, evidence })' },
      },
      required: ['taskId', 'submission'],
    },
  },
  {
    name: 'verify_task',
    description: 'Verify a task submission (approve/reject).',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        verifier: { type: 'string' },
        approved: { type: 'boolean' },
        feedback: { type: 'string' },
      },
      required: ['taskId', 'approved'],
    },
  },
  {
    name: 'publish_task',
    description: 'Publish a new task to the network.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } },
        reward: { type: 'number' },
        taskType: { type: 'string' },
      },
      required: ['title', 'description'],
    },
  },

  // Forum / governance (PQC-signed)
  {
    name: 'list_topics',
    description: 'List forum topics / governance proposals.',
    inputSchema: { type: 'object', properties: { tag: { type: 'string' }, limit: { type: 'number' } } },
  },
  {
    name: 'create_topic',
    description: 'Create a forum topic / governance proposal (PQC-signed by the agent).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'add_post',
    description: 'Reply to a forum topic (PQC-signed by the agent).',
    inputSchema: {
      type: 'object',
      properties: { topicId: { type: 'string' }, agent: { type: 'string' }, body: { type: 'string' } },
      required: ['topicId', 'body'],
    },
  },
  {
    name: 'vote',
    description: 'Vote on a governance proposal / forum topic (PQC-signed by the agent).',
    inputSchema: {
      type: 'object',
      properties: { topicId: { type: 'string' }, agent: { type: 'string' }, vote: { type: 'string', description: 'yes | no | abstain' } },
      required: ['topicId', 'vote'],
    },
  },
];

/**
 * Build the MCP Server wired to the tool handlers.
 * @returns {Server} an MCP Server instance (not yet connected to a transport)
 */
export function createServer() {
  const server = new Server(
    { name: 'nexusgenesis-agent-mcp', version: process.env.MCP_VERSION || '0.2.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        // Network
        case 'get_status':
          return apiRequest('/api/v1/bootstrap/status');
        case 'register_agent':
          return handleRegisterAgent(args);
        case 'get_agents':
          return apiRequest('/api/v1/bootstrap/agents');
        case 'get_agent':
          return apiRequest(`/api/v1/bootstrap/agents/${args.agentId}`);
        case 'get_leaderboard':
          return apiRequest('/api/v1/bootstrap/contributions');

        // Security (local)
        case 'generate_agent_keys':
          return handleGenerateAgentKeys(args);
        case 'generate_keypair':
          return handleGenerateKeyPair();
        case 'verify_signature':
          return handleVerifySignature(args);
        case 'validate_address':
          return handleValidateAddress(args);
        case 'check_spend':
          return handleCheckSpend(args);
        case 'takeover_guard':
          return handleTakeoverGuard(args);

        // Task economy
        case 'list_tasks':
          return handleListTasks(args);
        case 'get_task':
          return handleGetTask(args);
        case 'claim_task':
          return handleClaimTask(args);
        case 'submit_task':
          return handleSubmitTask(args);
        case 'verify_task':
          return handleVerifyTask(args);
        case 'publish_task':
          return handlePublishTask(args);

        // Forum / governance
        case 'list_topics':
          return handleListTopics(args);
        case 'create_topic':
          return handleCreateTopic(args);
        case 'add_post':
          return handleAddPost(args);
        case 'vote':
          return handleVote(args);

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }, null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}
