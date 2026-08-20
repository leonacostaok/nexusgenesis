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
  spawnAgentSigner,
  SPEND_MODES,
  CoordinationClient,
  createHttpTransport,
  ForumClient,
  smartAccount,
  canonicalizeAssetIntent,
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

// ─── Session identity ────────────────────────────────────────────────────
// P0-3: the decrypted key is held by an ISOLATED signer subprocess
// (session.signer), never in this process. session.wallet is a FALLBACK that
// is materialized LAZILY — only when signer spawning fails — so the normal
// path never holds usable key material in this process (a compromised parent
// could otherwise just call session.wallet.sign() and bypass the signer and
// its worker-side policy entirely).
const session = {
  wallet: null,       // recovered PQCWallet — LAZY fallback ONLY (INV-001/P0-3)
  signer: null,       // SignerHandle — DEFAULT key holder (isolated subprocess)
  password: null,     // envelope password, retained ONLY to respawn the signer
  agent: null,        // agent identity string
  publicKeyHex: null,
  address: null,
  envelope: null,     // encrypted envelope for the caller to persist
};

// Long idle timeout so the session signer survives realistic usage; it can be
// respawned lazily if it still exits (see ensureSessionSigner).
const SESSION_SIGNER_IDLE_MS = 60 * 60 * 1000;

/** True when this session holds (or can reconstruct) an agent identity. */
function hasSessionIdentity() {
  return !!(session.wallet || (session.envelope && session.password));
}

// ─── Smart Account (official EVM path, Sprint 2.2) ─────────────────────
// Holds a local Smart Account client per setup() call. The private key for
// executions is NEVER held here: the caller signs the canonical intent via
// the SDK/chain-eth official path and passes only the payload + signature.
// This mirrors the on-chain model — the Smart Account (contract) only ever
// sees signed intents, never key material.
let smartAccountClient = null;   // from smartAccount.createSmartAccountClient()
let smartAccountContext = null;  // { owner, sessionId }

/** Reset the local Smart Account so each test/setup is independent. */
export function __resetSmartAccountForTest() {
  smartAccountClient = null;
  smartAccountContext = null;
}

/**
 * Materialize the in-process fallback wallet on demand. This is an EXPLICIT
 * security downgrade (key enters this process) and only happens when the
 * isolated signer is unavailable — never on the default path.
 */
function fallbackWallet() {
  if (session.wallet) return session.wallet;
  if (!session.envelope || !session.password) {
    const err = new Error('No agent identity in this session. Call generate_agent_keys or register_agent first.');
    err.code = 'NO_WALLET';
    throw err;
  }
  console.error('[mcp-server] DOWNGRADE: materializing in-process wallet (isolated signer unavailable)');
  session.wallet = recoverAgentIdentity(session.envelope, session.password);
  return session.wallet;
}

/**
 * Return a live signer for this session, spawning one lazily if needed.
 * Returns null when no envelope/password is available or spawning fails —
 * callers then fall back to the in-process wallet (explicit downgrade).
 */
async function ensureSessionSigner() {
  if (!session.envelope || !session.password) return null;
  if (process.env.NEXUSGENESIS_SIGNER_DISABLE === '1') {
    // Test/diagnostic seam: simulate an environment where the signer cannot
    // be spawned, exercising the explicit in-process fallback path.
    return null;
  }
  if (session.signer) {
    try {
      await session.signer.ping(1500);
      return session.signer;
    } catch {
      // Idle-exited or dead — fall through to respawn.
      session.signer = null;
    }
  }
  try {
    // Policy-less signer: mcp-server writes are METADATA (task claim/submit/
    // verify/publish, forum) with no value transfer, so no spend policy.
    session.signer = await spawnAgentSigner({
      envelope: session.envelope,
      password: session.password,
      idleTimeoutMs: SESSION_SIGNER_IDLE_MS,
    });
    return session.signer;
  } catch (err) {
    console.error(`[mcp-server] signer spawn failed, falling back to in-process wallet: ${err.message}`);
    session.signer = null;
    return null;
  }
}

/**
 * Sign a metadata message via the isolated signer (default path), stripping
 * the 0x prefix so the output matches wallet.sign()'s bare-hex contract.
 * Returns null when no signer is available.
 */
async function signViaSigner(message) {
  const signer = await ensureSessionSigner();
  if (!signer) return null;
  const sig = await signer.signMessage(message);
  return typeof sig === 'string' ? sig.replace(/^0x/, '') : null;
}

/**
 * A wallet-like object whose .sign() routes through the ISOLATED signer
 * (metadata channel). Used by ForumClient, which only needs .sign(message)
 * returning bare-hex. Falls back to the in-process wallet only when the
 * signer is unavailable.
 */
function signerBackedWallet() {
  return {
    address: session.address,
    async sign(message) {
      const sig = await signViaSigner(message);
      return sig ?? fallbackWallet().sign(message);
    },
  };
}

// ─── Security tool handlers ─────────────────────────────────────────────

async function handleGenerateAgentKeys(args) {
  const password = args.password;
  const metadata = args.metadata || {};
  const identity = await createAgentIdentity({ password, metadata });
  session.password = password;
  // P0-3: do NOT materialize the in-process wallet here — the key must live
  // only in the isolated signer subprocess. The fallback wallet is recovered
  // lazily and only when the signer cannot be spawned (see fallbackWallet).
  session.wallet = null;
  session.agent = metadata.name || identity.address;
  session.publicKeyHex = identity.publicKeyHex;
  session.address = identity.address;
  session.envelope = identity.envelope;
  // P0-3: prefer holding the key in an isolated signer subprocess.
  session.signer = null;
  await ensureSessionSigner();
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
        signing: session.signer ? 'isolated-signer (P0-3)' : 'in-process-wallet (fallback)',
        note: 'Private key is encrypted inside `envelope` and held by an isolated signer subprocess. Persist the envelope + password; they never left this process.',
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
  const { generateKeyPair: gk, secureZero } = await import('nexusgenesis-agent-keys');
  const { publicKey, privateKey } = await gk();
  let chainAddresses;
  try {
    const { deriveChainAddresses } = await import('nexusgenesis-chain-adapters');
    // Registry only emits addresses/public keys — never private material.
    chainAddresses = deriveChainAddresses(publicKey, privateKey);
  } finally {
    // Zero the transient plaintext key from the raw keypair generation.
    secureZero(privateKey);
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        address: generateAddress(publicKey),
        publicKeyHex: publicKey.toString('hex'),
        chainAddresses,
        note: 'Raw private key is never exposed (INV-001). Derived chain addresses shown to demonstrate cross-chain derivation.',
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

// ─── Smart Account handlers (official EVM path, Sprint 2.2) ─────────────

/** Create the local Smart Account + register an agent session. */
async function handleSmartAccountSetup(args) {
  const { owner, emergencyKey, sessionId, agentId, agentEvmAddress, expiresAt, issuedAt, maxPerTx, maxDaily, allowedChains, allowedAssets, allowedContracts, allowedMethods, allowedRecipients } = args;

  if (!owner || !emergencyKey) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'owner and emergencyKey are required' }) }], isError: true };
  }
  if (!sessionId || !agentId || !agentEvmAddress) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'sessionId, agentId, and agentEvmAddress are required' }) }], isError: true };
  }
  // Fail-closed at the boundary: the official EVM path signs a digest that
  // binds sessionId as bytes32, so a non-32-byte id would only fail later at
  // signing time with a confusing error.
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(String(sessionId))) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'sessionId must be 32-byte hex (0x + 64 hex)' }) }], isError: true };
  }
  if (!expiresAt) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'expiresAt (ms epoch) is required' }) }], isError: true };
  }

  const client = await smartAccount.createSmartAccountClient({
    owner,
    emergencyKey,
    policy: { type: 'limit', maxPerTx: maxPerTx || '0', maxDaily: maxDaily || '0' },
  });

  const now = issuedAt !== undefined && issuedAt !== null ? Number(issuedAt) : Date.now();
  const reg = client.registerSession({
    sessionId,
    agentId,
    agentEvmAddress,
    issuedAt: now,
    expiresAt: Number(expiresAt),
    whitelist: {
      allowedChains, allowedAssets, allowedContracts, allowedMethods, allowedRecipients,
    },
    maxPerTx: maxPerTx || '0',
    maxDaily: maxDaily || '0',
  });
  if (!reg.ok) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: reg.reason }) }], isError: true };
  }

  smartAccountClient = client;
  smartAccountContext = { owner, sessionId };
  const est = client.estimateMaxLoss({ sessionId });
  return {
    content: [{ type: 'text', text: JSON.stringify({
      success: true,
      accountId: client.getState().accountId,
      sessionId,
      maxLoss: est.sessions[0]?.maxLossCeiling ?? null,
      note: 'Local Smart Account created. Sign intents off-chain (official EVM path) and submit via smart_account_execute — the private key never enters this process.',
    }, null, 2) }],
  };
}

function requireSmartAccount() {
  if (!smartAccountClient) {
    const err = new Error('No Smart Account in this session. Call smart_account_setup first.');
    err.code = 'NO_SMART_ACCOUNT';
    throw err;
  }
}

/**
 * Fail-closed dry-run (P3 simulation seed): evaluate an intent against the
 * local Smart Account WITHOUT executing it and WITHOUT a signature. Runs the
 * FULL hard-policy decision tree (session, whitelist, self-escalation,
 * allowance surface, nonce, ceilings) in side-effect-free preview mode —
 * only the EVM digest-binding check (INV-002) is skipped, since it needs the
 * caller's private key. Returns wouldExecute + the exact rejection reason, or
 * the digest to sign off-chain when admissible. "Quantify before acting."
 */
async function handleSmartAccountPreview(args) {
  requireSmartAccount();
  const { action, chain, asset, amount, recipient, contract, method, nonce } = args;
  if (amount === undefined || amount === null || nonce === undefined || nonce === null) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, wouldExecute: false, error: 'amount and nonce are required for a deterministic preview (INV-002/INV-007)' }) }], isError: true };
  }

  const client = smartAccountClient;
  const s = client.getSession(smartAccountContext.sessionId);
  if (!s) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, wouldExecute: false, error: 'session not found' }) }], isError: true };
  }

  // Build the EXACT canonical payload the caller would sign off-chain, so the
  // preview verdict is 1:1 with a real execution.
  let payload;
  try {
    payload = canonicalizeAssetIntent(
      { agentId: s.agentId, sessionId: s.sessionId, issuedAt: s.issuedAt, expiresAt: s.expiresAt },
      { action, chain, asset, amount, recipient, contract, method, nonce },
    );
  } catch (err) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, wouldExecute: false, error: `canonicalization failed: ${err.message}` }) }], isError: true };
  }

  const res = await client.account.executeFromAgent({
    payload,
    claimedAmount: amount,
    sessionId: s.sessionId,
    nonce: Number(nonce),
    preview: true,
  });

  if (res.ok) {
    // Admissible — hand back the digest so the caller can sign it off-chain.
    let digest = null;
    try {
      digest = await smartAccount.hashIntentDigest(payload);
    } catch {
      digest = null;
    }
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, wouldExecute: true, amount: res.amount, digest,
      note: 'Intent is admissible under the hard-policy layer. Sign it off-chain (signSmartAccountIntent) and submit via smart_account_execute.',
    }, null, 2) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify({
    success: true, wouldExecute: false, reason: res.reason,
    note: 'Fail-closed: intent rejected by the Smart Account hard-policy layer.',
  }, null, 2) }] };
}

/** Submit a caller-signed official EVM intent to the local Smart Account. */
async function handleSmartAccountExecute(args) {
  requireSmartAccount();
  const { intent, claimedAmount, nonce, signature, payload } = args;
  if (!payload || !signature) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'payload (canonical intent) and signature (official EVM path) are required. Build them off-chain: signSmartAccountIntent().' }) }], isError: true };
  }
  if (!intent || !intent.amount) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'intent with amount is required (INV-002 binding)' }) }], isError: true };
  }

  const client = smartAccountClient;
  const s = client.getSession(smartAccountContext.sessionId);
  if (!s) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'session not found' }) }], isError: true };
  }
  // Pass the caller-provided payload + signature straight to the hard-policy
  // layer — the private key NEVER enters this process. The engine re-derives
  // every property from the signed content (INV-002/003/005/006/007).
  const res = await client.account.executeFromAgent({
    payload,
    signature,
    claimedAmount: claimedAmount || intent.amount,
    sessionId: s.sessionId,
    nonce: nonce || 1,
  });
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: res.ok, ...(res.ok ? { txId: res.txId, amount: res.amount, remainingSessionDaily: res.remainingSessionDaily } : { error: res.reason }) }, null, 2) }],
    isError: !res.ok,
  };
}

/** Quantify the current exposure bound (INV-007). */
async function handleSmartAccountEstimateLoss() {
  requireSmartAccount();
  const est = smartAccountClient.estimateMaxLoss();
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...est }, null, 2) }] };
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
  // SECURITY (INV-001): no silent default-password fallback — an identity created
  // with a well-known password would be recoverable by anyone who knows it. When no
  // identity exists in this session, a real caller-supplied password is mandatory.
  if (!hasSessionIdentity()) {
    const password = args.password;
    if (!password || typeof password !== 'string' || password.length < 8) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: 'password is required (min 8 chars) when no identity exists in this session' }),
        }],
        isError: true,
      };
    }
    const identity = await createAgentIdentity({ password, metadata: { name } });
    session.password = password;
    // P0-3: key stays in the isolated signer; no eager in-process wallet.
    session.wallet = null;
    session.publicKeyHex = identity.publicKeyHex;
    session.address = identity.address;
    session.envelope = identity.envelope;
    session.signer = null;
    await ensureSessionSigner();
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

function requireSigningSession() {
  // Signer-backed (default) or already-materialized fallback wallet both count.
  if (!hasSessionIdentity()) {
    const err = new Error('No agent identity in this session. Call generate_agent_keys or register_agent first.');
    err.code = 'NO_WALLET';
    throw err;
  }
}

async function signTaskAction(action, { taskId, agent, fields }) {
  requireSigningSession();
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
  // P0-3 default: sign via the isolated signer (key in child process), which
  // signs the SAME payload string the server verifies (verifyTaskSignature).
  // Fall back to the in-process wallet only when no signer is available —
  // fallbackWallet() materializes it lazily (explicit downgrade).
  const message = JSON.stringify(dataToSign);
  const signature = (await signViaSigner(message)) ?? (await fallbackWallet().sign(message));
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
  // P0-3: forum writes sign via the ISOLATED signer (metadata channel)
  // through a wallet-compatible shim; the in-process wallet is materialized
  // only when the signer is unavailable (explicit downgrade).
  return new ForumClient({ wallet: signerBackedWallet(), baseURL: DEFAULT_API_BASE });
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
        password: { type: 'string', description: 'Password to encrypt the key envelope (required, min 8 chars, when no identity exists in this session)' },
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
    description: 'Generate a raw Dilithium2 key pair and derive Nexus/ETH/Sol addresses. The private key is never exposed (INV-001).',
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

  // Smart Account — official EVM path (Sprint 2.2). The on-chain hard-policy
  // layer (sessions, whitelist, ceilings, nonce). Private key never enters
  // this process: intents are signed off-chain via the SDK/chain-eth official
  // path and submitted as payload + signature.
  {
    name: 'smart_account_setup',
    description: 'Create a local Smart Account and register an agent session (official EVM path). Establishes the hard-policy state: session whitelist (chain/asset/contract/method/recipient), per-tx + daily ceilings, and nonce anti-replay.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Account owner identity (privileged caller, e.g. checksummed EVM address)' },
        emergencyKey: { type: 'string', description: 'Brake-only emergency identity (INV-006)' },
        sessionId: { type: 'string', description: '32-byte session ID (0x + 64 hex)' },
        agentId: { type: 'string', description: 'Agent identifier bound into the signed intent' },
        agentEvmAddress: { type: 'string', description: 'Agent EVM address (verifies canonical digest signatures)' },
        expiresAt: { type: 'number', description: 'Session expiry (ms epoch, required)' },
        issuedAt: { type: 'number', description: 'Optional session issued-at (ms epoch). Defaults to now; pin it to reproduce the exact signed session.' },
        maxPerTx: { type: 'string', description: 'Per-transaction ceiling (fail-closed, default 0)' },
        maxDaily: { type: 'string', description: 'Daily cumulative ceiling (fail-closed, default 0)' },
        allowedChains: { type: 'array', items: { type: 'string' }, description: 'Allowed chains (INV-003)' },
        allowedAssets: { type: 'array', items: { type: 'string' }, description: 'Allowed assets (INV-003)' },
        allowedContracts: { type: 'array', items: { type: 'string' }, description: 'Allowed contracts (INV-003)' },
        allowedMethods: { type: 'array', items: { type: 'string' }, description: 'Allowed methods (INV-003)' },
        allowedRecipients: { type: 'array', items: { type: 'string' }, description: 'Allowed recipients (INV-003)' },
      },
      required: ['owner', 'emergencyKey', 'sessionId', 'agentId', 'agentEvmAddress', 'expiresAt'],
    },
  },
  {
    name: 'smart_account_preview',
    description: 'Fail-closed dry-run of an asset intent against the local Smart Account — WITHOUT executing and WITHOUT a signature. Runs the full hard-policy decision tree side-effect free; returns wouldExecute + the exact rejection reason, or the digest to sign off-chain when admissible (P3 simulation seed).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Intent action (e.g. transfer)' },
        chain: { type: 'string' },
        asset: { type: 'string' },
        amount: { type: 'string', description: 'Amount (must equal the signed amount for INV-002)' },
        recipient: { type: 'string' },
        contract: { type: 'string' },
        method: { type: 'string' },
        nonce: { type: 'number', description: 'Next anti-replay nonce (> last used)' },
      },
      required: ['action', 'chain', 'asset', 'amount', 'recipient', 'contract', 'method', 'nonce'],
    },
  },
  {
    name: 'smart_account_execute',
    description: 'Submit a caller-signed official EVM intent to the local Smart Account. The private key NEVER enters this process — provide the canonical payload + signature built off-chain via signSmartAccountIntent(). Enforces INV-002/003/005/006/007.',
    inputSchema: {
      type: 'object',
      properties: {
        payload: { type: 'object', description: 'Canonical asset-intent payload (signSmartAccountIntent output)' },
        signature: { type: 'string', description: '65-byte secp256k1 EVM signature (0x + 130 hex)' },
        intent: { type: 'object', description: 'Structured intent with amount (INV-002 claimedAmount fallback)' },
        claimedAmount: { type: 'string', description: 'Claimed tx amount (defaults to intent.amount)' },
        nonce: { type: 'number', description: 'Anti-replay nonce (defaults to 1)' },
      },
      required: ['payload', 'signature', 'intent'],
    },
  },
  {
    name: 'smart_account_estimate_loss',
    description: 'Quantify the current maximum exposure bound (INV-007): per-session + account ceilings, remaining windows, and a worst-case loss statement.',
    inputSchema: { type: 'object', properties: {} },
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
    { name: 'nexusgenesis-agent-mcp', version: process.env.MCP_VERSION || '0.3.0' },
    { capabilities: { tools: {} } },
  );

  // P0-3: the session signer is a child process — terminate it when the MCP
  // session closes so it never outlives the server (and keeps the process
  // alive). The in-process wallet fallback needs no cleanup.
  server.onclose = () => {
    if (session.signer) {
      session.signer.close();
      session.signer = null;
    }
  };

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

        // Smart Account (official EVM path, Sprint 2.2)
        case 'smart_account_setup':
          return handleSmartAccountSetup(args);
        case 'smart_account_preview':
          return handleSmartAccountPreview(args);
        case 'smart_account_execute':
          return handleSmartAccountExecute(args);
        case 'smart_account_estimate_loss':
          return handleSmartAccountEstimateLoss(args);

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
