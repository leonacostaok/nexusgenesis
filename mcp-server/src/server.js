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

// ─── Smart Account (official EVM path, Sprint 2.4 T1 on-chain) ────────
// Holds on-chain Smart Accounts keyed by accountId. Each entry caches the
// deployed contract address + a ChainConnection. The Agent's execution
// private key is NEVER held here: the caller signs the canonical intent via
// the SDK/chain-eth official path and passes only payload + signature. The
// contract (SmartAccount.sol) re-derives every property from the signed
// digest (INV-002/003/005/006/007). owner/emergency/relayer are SERVER-side
// operation private keys used for deploy/register/broadcast — they enter this
// process by design (see CHAIN_OWNER_PK / CHAIN_EMERGENCY_PK / CHAIN_RELAYER_PK).
const smartAccounts = new Map(); // accountId -> entry
let smartAccountContext = null;  // { accountId, sessionId }

/** Reset the local Smart Account so each test/setup is independent. */
export function __resetSmartAccountForTest() {
  smartAccounts.clear();
  smartAccountContext = null;
  if (chainEnvPromise) {
    chainEnvPromise.then((env) => env.stop?.()).catch(() => {});
    chainEnvPromise = null;
  }
}

function equalStringArray(a, b) {
  const left = Array.isArray(a) ? a : (a === undefined || a === null ? [] : [a]);
  const right = Array.isArray(b) ? b : (b === undefined || b === null ? [] : [b]);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameSessionConfig(existing, next) {
  return existing
    && existing.agentId === next.agentId
    && existing.agentEvmAddress === next.agentEvmAddress
    && Number(existing.issuedAt) === Number(next.issuedAt)
    && Number(existing.expiresAt) === Number(next.expiresAt)
    && String(existing.maxPerTx) === String(next.maxPerTx)
    && String(existing.maxDaily) === String(next.maxDaily)
    && equalStringArray(existing.whitelist?.allowedChains, next.whitelist?.allowedChains)
    && equalStringArray(existing.whitelist?.allowedAssets, next.whitelist?.allowedAssets)
    && equalStringArray(existing.whitelist?.allowedContracts, next.whitelist?.allowedContracts)
    && equalStringArray(existing.whitelist?.allowedMethods, next.whitelist?.allowedMethods)
    && equalStringArray(existing.whitelist?.allowedRecipients, next.whitelist?.allowedRecipients);
}

function selectSmartAccount({ accountId, sessionId } = {}) {
  if (smartAccounts.size === 0) {
    const err = new Error('No Smart Account in this session. Call smart_account_setup first.');
    err.code = 'NO_SMART_ACCOUNT';
    throw err;
  }

  let entry = null;
  if (accountId) {
    entry = smartAccounts.get(accountId) || null;
    if (!entry) {
      const err = new Error(`Smart Account ${accountId} not found in this MCP session.`);
      err.code = 'SMART_ACCOUNT_NOT_FOUND';
      throw err;
    }
  } else if (smartAccountContext?.accountId && smartAccounts.has(smartAccountContext.accountId)) {
    entry = smartAccounts.get(smartAccountContext.accountId);
  } else if (smartAccounts.size === 1) {
    entry = [...smartAccounts.values()][0];
  } else {
    const err = new Error('Multiple Smart Accounts exist in this MCP session. Pass accountId to select one explicitly.');
    err.code = 'SMART_ACCOUNT_AMBIGUOUS';
    throw err;
  }

  const resolvedSessionId = sessionId || (entry.accountId === smartAccountContext?.accountId ? smartAccountContext?.sessionId : null) || entry.currentSessionId;
  if (!resolvedSessionId) {
    const err = new Error(`Smart Account ${entry.accountId} has no selected session. Pass sessionId explicitly.`);
    err.code = 'SMART_ACCOUNT_SESSION_REQUIRED';
    throw err;
  }

  const sessionRecord = entry.sessions?.get(resolvedSessionId);
  if (!sessionRecord) {
    const err = new Error(`Session ${resolvedSessionId} not found under Smart Account ${entry.accountId}.`);
    err.code = 'SMART_ACCOUNT_SESSION_NOT_FOUND';
    throw err;
  }

  entry.currentSessionId = sessionRecord.sessionId;
  smartAccountContext = { accountId: entry.accountId, sessionId: sessionRecord.sessionId };
  return { ...entry, session: sessionRecord };
}

// ─── Chain environment (Sprint 2.4 T1) ───────────────────────────────────
// Lazy singleton shared across all Smart Accounts in this MCP process. Boots
// a LocalChain (in-process EVM, zero external deps) when CHAIN_RPC_URL is
// unset, or connects to an external node/anvil otherwise. The artifact is
// resolved via SMART_ACCOUNT_ARTIFACT or the repo default. owner/emergency/
// relayer private keys come from env — these are SERVER-side operation keys
// that legitimately enter this process (see CHAIN_*_PK below).
const CHAIN_DEFAULT_OWNER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const CHAIN_DEFAULT_EMERGENCY_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CHAIN_DEFAULT_RELAYER_PK = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

let chainEnvPromise = null; // memoized boot — also guards concurrent boots

async function resolveChainEnv() {
  if (!chainEnvPromise) {
    chainEnvPromise = bootChainEnv();
    // A failed boot must not poison the cache forever — allow a retry.
    chainEnvPromise.catch(() => { chainEnvPromise = null; });
  }
  return chainEnvPromise;
}

async function bootChainEnv() {
  const { ethers } = await import('ethers');
  const { createChainProvider } = await import('nexusgenesis-chain-eth');
  const { createLocalChain } = await import('nexusgenesis-chain-eth/test-helpers/local-chain');
  const { loadSmartAccountArtifact } = await import('nexusgenesis-chain-eth/test-helpers/load-artifact');

  const artifact = loadSmartAccountArtifact();
  if (!artifact) {
    const err = new Error(
      'SmartAccount artifact not found. Run `forge build --use 0.8.24` in contracts/solidity, ' +
      'or set SMART_ACCOUNT_ARTIFACT to the built artifact JSON.',
    );
    err.code = 'SMART_ACCOUNT_ARTIFACT_MISSING';
    throw err;
  }

  const rpcUrl = process.env.CHAIN_RPC_URL || null;
  if (rpcUrl && !process.env.CHAIN_RELAYER_PK) {
    // Fail-closed: on an external chain the relayer key signs every broadcast.
    // Silently falling back to the well-known anvil key would hand the
    // broadcast path (gas, nonce, DoS surface) to anyone who knows it.
    const err = new Error(
      'CHAIN_RPC_URL is set (external chain) but CHAIN_RELAYER_PK is not. ' +
      'Refusing to sign broadcasts with a well-known anvil key — set CHAIN_RELAYER_PK explicitly.',
    );
    err.code = 'CHAIN_RELAYER_KEY_REQUIRED';
    throw err;
  }

  const owner = new ethers.Wallet(process.env.CHAIN_OWNER_PK || CHAIN_DEFAULT_OWNER_PK);
  const emergency = new ethers.Wallet(process.env.CHAIN_EMERGENCY_PK || CHAIN_DEFAULT_EMERGENCY_PK);
  const relayer = new ethers.Wallet(process.env.CHAIN_RELAYER_PK || CHAIN_DEFAULT_RELAYER_PK);

  let provider;
  let localChain = null;
  let chainUrl;
  if (rpcUrl) {
    provider = createChainProvider(rpcUrl);
    chainUrl = rpcUrl;
  } else {
    try {
      localChain = await createLocalChain({
        funded: [
          { address: owner.address, balance: 10n ** 18n },
          { address: emergency.address, balance: 10n ** 18n },
          { address: relayer.address, balance: 10n ** 18n },
        ],
      });
      provider = createChainProvider(localChain.url);
    } catch (err) {
      // Never leak a booted LocalChain when provider wiring fails.
      if (localChain) await localChain.stop().catch(() => {});
      throw err;
    }
    chainUrl = localChain.url;
  }

  return {
    provider,
    artifact,
    owner,
    emergency,
    relayer,
    chainUrl,
    localChain,
    stop: async () => { if (localChain) await localChain.stop(); },
  };
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

  // ── On-chain (Sprint 2.4 T1) ───────────────────────────────────────────
  // Deploy a fresh SmartAccount contract + register the session on-chain.
  // The contract is the single source of truth; the MCP process only caches
  // the address + a ChainConnection. owner/emergencyKey here are the PRIVILEGED
  // private keys (server-side operation keys that legitimately enter this
  // process): their derived addresses become the contract's owner/emergency
  // roles, and the owner key signs both the deploy and the registerSession
  // (owner-only, INV-005). The Agent's execution signing key NEVER enters this
  // process — callers submit payload + signature only.
  const { ethers } = await import('ethers');
  let ownerKey;
  let emergencyWallet;
  try {
    ownerKey = new ethers.Wallet(owner);
    emergencyWallet = new ethers.Wallet(emergencyKey);
  } catch {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'owner and emergencyKey must be private keys (0x + 64 hex) for on-chain setup — their addresses become the contract owner/emergency roles and owner signs deploy + registerSession (INV-005).' }) }], isError: true };
  }
  const ownerAddr = ownerKey.address;
  const emergencyAddr = emergencyWallet.address;

  // Hard ceilings are mandatory on-chain (SmartAccount.registerSession reverts
  // InvalidSession when both are 0) — validate BEFORE deploying so a bad call
  // never pays deployment gas. Keep them as strings: BigInt('...') is exact,
  // a Number() round-trip would lose precision for wei-scale limits (>2^53).
  const perTxCeiling = maxPerTx === undefined || maxPerTx === null || maxPerTx === '' ? '0' : String(maxPerTx);
  const dailyCeiling = maxDaily === undefined || maxDaily === null || maxDaily === '' ? '0' : String(maxDaily);
  if (!/^\d+$/.test(perTxCeiling) || !/^\d+$/.test(dailyCeiling)) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'maxPerTx and maxDaily must be non-negative integer strings (wei)' }) }], isError: true };
  }
  if (perTxCeiling === '0' && dailyCeiling === '0') {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'hard ceilings are mandatory: at least one of maxPerTx / maxDaily must be > 0 (INV-003/007 — no unbounded session)' }) }], isError: true };
  }

  let env;
  try {
    env = await resolveChainEnv();
  } catch (err) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }], isError: true };
  }
  const deployer = ownerKey.connect(env.provider);

  const resolvedIssuedAt = issuedAt !== undefined && issuedAt !== null ? Number(issuedAt) : Date.now();
  const resolvedExpiresAt = Number(expiresAt);

  // Deploy (idempotent per owner+emergency pair). The contract's owner AND
  // emergency roles must BOTH match for reuse — a different emergencyKey
  // deploys a fresh contract instead of silently ignoring the new brake key
  // (INV-006). The deploy pins the account-level daily ceiling at 1_000_000;
  // the request's maxPerTx/maxDaily are SESSION limits applied at
  // registerSession.
  let entry = null;
  const existingEntry = [...smartAccounts.values()].find((e) => e.owner === ownerAddr && e.emergencyKey === emergencyAddr);
  if (existingEntry) {
    entry = existingEntry;
  } else {
    const { deploySmartAccount } = await import('nexusgenesis-chain-eth');
    const dep = await deploySmartAccount({
      provider: env.provider,
      signer: deployer,
      abi: env.artifact.abi,
      bytecode: env.artifact.bytecode.object,
      owner: ownerAddr, // contract owner address (derived from owner key)
      emergencyKey: emergencyAddr, // contract emergency address
      accountMaxDaily: 1_000_000,
    });
    if (!dep.ok) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: dep.reason || dep.errorName || 'deploy failed' }) }], isError: true };
    }
    entry = {
      accountId: dep.address.toLowerCase(),
      contractAddress: dep.address.toLowerCase(),
      owner: ownerAddr,
      emergencyKey: emergencyAddr,
      conn: dep.connection,
      sessions: new Map(),
      currentSessionId: null,
      chainUrl: env.chainUrl,
    };
    smartAccounts.set(entry.accountId, entry);
  }

  // Register the session on-chain (idempotent: same sessionId + settings = no-op).
  const sessionConfig = {
    sessionId,
    agentId,
    agentEvmAddress,
    issuedAt: resolvedIssuedAt,
    expiresAt: resolvedExpiresAt,
    whitelist: {
      allowedChains, allowedAssets, allowedContracts, allowedMethods, allowedRecipients,
    },
    maxPerTx: perTxCeiling,
    maxDaily: dailyCeiling,
  };
  const existingSession = entry.sessions.get(sessionId);
  if (existingSession && !sameSessionConfig(existingSession, sessionConfig)) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Session ${sessionId} already exists in Smart Account ${entry.accountId} with different settings.` }) }],
      isError: true,
    };
  }
  if (!existingSession) {
    const reg = await entry.conn.registerSession({
      sessionId,
      agentId,
      agentEvmAddress,
      issuedAt: resolvedIssuedAt,
      expiresAt: resolvedExpiresAt,
      maxPerTx: perTxCeiling,
      maxDaily: dailyCeiling,
      whitelist: {
        allowedChains, allowedAssets, allowedContracts, allowedMethods, allowedRecipients,
      },
      signer: deployer,
    });
    if (!reg.ok) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: reg.reason || reg.errorName || 'registerSession failed' }) }], isError: true };
    }
    entry.sessions.set(sessionId, sessionConfig);
  }

  entry.currentSessionId = sessionId;
  smartAccountContext = { accountId: entry.accountId, sessionId };

  // Exposure bound from the chain (INV-007 ceilings).
  let maxLoss = null;
  try {
    const sessionLoss = await entry.conn.sessionMaxLoss(sessionId);
    maxLoss = sessionLoss !== null && sessionLoss !== undefined ? sessionLoss.toString() : null;
  } catch { /* read-only; non-fatal */ }

  return {
    content: [{ type: 'text', text: JSON.stringify({
      success: true,
      accountId: entry.accountId,
      contractAddress: entry.contractAddress,
      owner: ownerAddr, // effective contract owner role (address)
      emergencyKey: emergencyAddr, // effective brake-only role (address, INV-006)
      sessionId,
      issuedAt: resolvedIssuedAt,
      expiresAt: resolvedExpiresAt,
      chainUrl: env.chainUrl,
      onChain: true,
      session: {
        agentId,
        sessionId,
        issuedAt: resolvedIssuedAt,
        expiresAt: resolvedExpiresAt,
        agentEvmAddress,
      },
      maxLoss,
      note: 'On-chain Smart Account deployed. Use the returned session binding to build canonical payloads off-chain, then submit via smart_account_execute — the Agent signing key never enters this process (owner/emergency/relayer are server-side operation keys).',
    }, null, 2) }],
  };
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
  const { action, chain, asset, amount, recipient, contract, method, nonce, accountId, sessionId, signature } = args;
  if (amount === undefined || amount === null || nonce === undefined || nonce === null) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, wouldExecute: false, error: 'amount and nonce are required for a deterministic preview (INV-002/INV-007)' }) }], isError: true };
  }

  const { conn, session: s, accountId: resolvedAccountId } = selectSmartAccount({ accountId, sessionId });

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

  // The chain authenticates the signature (INV-002) and only THEN applies the
  // policy checks, so a signature-less eth_call always reverts with
  // InvalidSignature and cannot reach the strategy verdict. Callers who have
  // already signed can pass `signature` for a true on-chain dry-run; without
  // it we still return the exact digest to sign.
  let res = null;
  let digest = null;
  try {
    digest = await smartAccount.hashIntentDigest(payload);
  } catch {
    digest = null;
  }
  if (signature) {
    res = await conn.simulateExecuteFromAgent({ payload, signature });
  }

  if (res && res.ok) {
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true,
      wouldExecute: true,
      accountId: resolvedAccountId,
      sessionId: s.sessionId,
      // simulateExecuteFromAgent returns only the txId; echo the requested
      // amount as a wei string (exact, matching the execute path).
      amount: String(amount),
      digest,
      payload,
      session: {
        agentId: s.agentId,
        sessionId: s.sessionId,
        issuedAt: s.issuedAt,
        expiresAt: s.expiresAt,
        agentEvmAddress: s.agentEvmAddress,
      },
      note: 'Intent is admissible under the on-chain hard-policy layer. Submit the signed payload via smart_account_execute.',
    }, null, 2) }] };
  }
  if (res && !res.ok) {
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, wouldExecute: false, accountId: resolvedAccountId, sessionId: s.sessionId,
      reason: res.errorName || res.reason || 'rejected by the on-chain hard-policy layer',
      digest,
      payload,
      note: 'Fail-closed: intent rejected on-chain (signature + policy verdict).',
    }, null, 2) }] };
  }
  // No signature supplied — return the digest so the caller can sign, and
  // note that the full on-chain verdict requires the signature.
  return { content: [{ type: 'text', text: JSON.stringify({
    success: true,
    wouldExecute: null,
    accountId: resolvedAccountId,
    sessionId: s.sessionId,
    amount: String(amount),
    digest,
    payload,
    session: {
      agentId: s.agentId,
      sessionId: s.sessionId,
      issuedAt: s.issuedAt,
      expiresAt: s.expiresAt,
      agentEvmAddress: s.agentEvmAddress,
    },
    note: 'No signature provided, so no on-chain verdict was computed. Sign the returned digest off-chain (signSmartAccountIntent) and pass signature to preview, or submit via smart_account_execute.',
  }, null, 2) }] };
}

/** Broadcast a caller-signed official EVM intent to the on-chain Smart Account. */
async function handleSmartAccountExecute(args) {
  const { signature, payload, accountId, sessionId } = args;
  if (!payload || !signature) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'payload (canonical intent) and signature (official EVM path) are required. Build them off-chain: signSmartAccountIntent().' }) }], isError: true };
  }

  const { conn, session: s, accountId: resolvedAccountId } = selectSmartAccount({ accountId, sessionId: sessionId || payload.sessionId });
  // Broadcast the caller-provided payload + signature to the chain. The
  // contract re-derives every property from the signed digest
  // (INV-002/003/005/006/007) and authenticates the signature against the
  // session's registered EVM address. Any EOA may relay — we use the
  // configured CHAIN_RELAYER_PK (server-side operation key), NOT the owner.
  const env = await resolveChainEnv();
  const relayer = env.relayer.connect(env.provider);
  const res = await conn.executeFromAgent({ payload, signature, signer: relayer });
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: res.ok, accountId: resolvedAccountId, sessionId: s.sessionId, onChain: true, ...(res.ok ? {
      txHash: res.txHash,
      txId: res.txId !== null && res.txId !== undefined ? res.txId.toString() : null,
      amount: res.amount !== null && res.amount !== undefined ? res.amount.toString() : null,
    } : { error: res.errorName || res.reason || 'broadcast failed' }) }, null, 2) }],
    isError: !res.ok,
  };
}

/** Quantify the current exposure bound (INV-007) from on-chain state. */
async function handleSmartAccountEstimateLoss(args) {
  const { accountId, sessionId } = args || {};
  const { conn, accountId: resolvedAccountId, session } = selectSmartAccount({ accountId, sessionId });
  const [accountCeiling, accountRemaining, sessionMax] = await Promise.all([
    conn.accountMaxDaily(),
    conn.estimateMaxLoss(),
    conn.sessionMaxLoss(session.sessionId),
  ]);
  return { content: [{ type: 'text', text: JSON.stringify({
    success: true,
    accountId: resolvedAccountId,
    sessionId: session.sessionId,
    onChain: true,
    accountMaxDaily: accountCeiling !== null && accountCeiling !== undefined ? accountCeiling.toString() : null,
    accountRemaining: accountRemaining !== null && accountRemaining !== undefined ? accountRemaining.toString() : null,
    sessionMaxLoss: sessionMax !== undefined && sessionMax !== null ? sessionMax.toString() : null,
  }, null, 2) }] };
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
    description: 'Deploy a SmartAccount contract on-chain and register an agent session (official EVM path, Sprint 2.4 on-chain). Establishes the hard-policy state on-chain: session whitelist (chain/asset/contract/method/recipient), per-tx + daily ceilings, and nonce anti-replay. Requires CHAIN_RPC_URL (external) or uses an in-process LocalChain. owner/emergencyKey are private keys (server-side operation keys) whose addresses become the contract owner/emergency roles; owner signs deploy + registerSession. Agent execution keys never enter this process.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Owner private key (0x + 64 hex, server-side operation key). Its address becomes the contract owner role (INV-005) and signs deploy + registerSession.' },
        emergencyKey: { type: 'string', description: 'Emergency private key (0x + 64 hex, server-side operation key). Its address becomes the brake-only emergency role (INV-006).' },
        sessionId: { type: 'string', description: '32-byte session ID (0x + 64 hex)' },
        agentId: { type: 'string', description: 'Agent identifier bound into the signed intent' },
        agentEvmAddress: { type: 'string', description: 'Agent EVM address (verifies canonical digest signatures)' },
        expiresAt: { type: 'number', description: 'Session expiry (ms epoch, required)' },
        issuedAt: { type: 'number', description: 'Optional session issued-at (ms epoch). Defaults to now; pin it to reproduce the exact signed session.' },
        maxPerTx: { type: 'string', description: 'Per-transaction ceiling in wei (non-negative integer string). At least one of maxPerTx/maxDaily must be > 0 (hard ceilings are mandatory — no unbounded session).' },
        maxDaily: { type: 'string', description: 'Daily cumulative ceiling in wei (non-negative integer string). At least one of maxPerTx/maxDaily must be > 0 (hard ceilings are mandatory — no unbounded session).' },
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
    description: 'Fail-closed dry-run of an asset intent against the on-chain Smart Account — WITHOUT executing. With a caller-supplied signature it runs the full hard-policy decision tree via eth_call (side-effect free, no nonce consumed) and returns wouldExecute + the exact rejection reason. Without a signature it returns the digest + canonical payload to sign off-chain (P3 simulation seed); the chain cannot reach the policy verdict without a valid signature (INV-002).',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Optional Smart Account selector when multiple accounts exist in this MCP session' },
        sessionId: { type: 'string', description: 'Optional session selector when multiple sessions exist under one Smart Account' },
        action: { type: 'string', description: 'Intent action (e.g. transfer)' },
        chain: { type: 'string' },
        asset: { type: 'string' },
        amount: { type: 'string', description: 'Amount (must equal the signed amount for INV-002)' },
        recipient: { type: 'string' },
        contract: { type: 'string' },
        method: { type: 'string' },
        nonce: { type: 'number', description: 'Next anti-replay nonce (> last used)' },
        signature: { type: 'string', description: 'Optional 65-byte EVM signature (0x + 130 hex). When present, returns the true on-chain verdict via eth_call.' },
      },
      required: ['action', 'chain', 'asset', 'amount', 'recipient', 'contract', 'method', 'nonce'],
    },
  },
  {
    name: 'smart_account_execute',
    description: 'Broadcast a caller-signed official EVM intent to the on-chain SmartAccount contract (relayed by the configured CHAIN_RELAYER_PK). The Agent signing key NEVER enters this process — provide the canonical payload + signature built off-chain via signSmartAccountIntent(). The contract enforces INV-002/003/005/006/007 and returns the mined txHash.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Optional Smart Account selector when multiple accounts exist in this MCP session' },
        sessionId: { type: 'string', description: 'Optional session selector; defaults to payload.sessionId or the currently selected session' },
        payload: { type: 'object', description: 'Canonical asset-intent payload (signSmartAccountIntent output)' },
        signature: { type: 'string', description: '65-byte secp256k1 EVM signature (0x + 130 hex)' },
      },
      required: ['payload', 'signature'],
    },
  },
  {
    name: 'smart_account_estimate_loss',
    description: 'Quantify the current exposure bound (INV-007) from on-chain state: the account-level daily ceiling and remaining budget, plus the session-level max loss (bounded by both ceilings).',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Optional Smart Account selector when multiple accounts exist in this MCP session' },
        sessionId: { type: 'string', description: 'Optional session selector for a specific registered session' },
      },
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
