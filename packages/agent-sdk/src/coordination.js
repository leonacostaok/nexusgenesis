/**
 * nexusgenesis-agent-sdk —coordination module
 *
 * Agent coordination primitives: task lifecycle, reputation, spend controls.
 * This layer is chain-agnostic —it defines the protocol contract and relies
 * on a pluggable `transport` (REST/HTTP, in-memory, or a chain adapter) to
 * persist/verify state. The default transport is an HTTP client compatible
 * with the NexusGenesis bootstrap API.
 */
import { checkSpendAllowed, SPEND_MODES } from 'nexusgenesis-agent-keys';

export const TASK_STATUS = {
  OPEN: 'open',
  CLAIMED: 'claimed',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

export const TASK_TYPES = [
  'analysis',
  'coding',
  'documentation',
  'research',
  'community',
  'general'
];

/**
 * Default HTTP transport —talks to a NexusGenesis-compatible API.
 * @param {object} opts { baseURL, custodyToken }
 */
export function createHttpTransport({ baseURL, custodyToken }) {
  const headers = { 'Content-Type': 'application/json' };
  if (custodyToken) headers['x-custody-token'] = custodyToken;

  async function request(method, path, body) {
    const url = `${baseURL}${path}`;
    const opts = { method, headers, signal: AbortSignal.timeout(30000) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    setCustodyToken: (token) => { headers['x-custody-token'] = token; }
  };
}

/**
 * In-memory transport for tests / local demos. No network required.
 */
export function createMemoryTransport() {
  const store = { agents: new Map(), tasks: new Map(), proposals: new Map() };
  return {
    store,
    get: async (path) => {
      const clean = path.split('?')[0];
      if (clean.startsWith('/api/tasks')) return { tasks: [...store.tasks.values()] };
      if (clean.startsWith('/api/agents')) return { agents: [...store.agents.values()] };
      return { ok: true };
    },
    post: async (path, body) => ({ ok: true, echo: body })
  };
}

/**
 * Coordination client —chain-agnostic protocol over a transport.
 */
export class CoordinationClient {
  constructor(transport) {
    this.transport = transport;
  }

  // ── Tasks ──
  async publishTask({ agent, title, description, capabilities, reward, taskType }) {
    return this.transport.post('/api/tasks', {
      agent_identity: agent,
      title,
      description,
      requiredCapabilities: capabilities,
      reward,
      taskType
    });
  }

  async listTasks({ status, limit = 50 } = {}) {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    q.set('limit', limit);
    return this.transport.get(`/api/tasks?${q.toString()}`);
  }

  async claimTask(taskId, agent) {
    return this.transport.post(`/api/tasks/${taskId}/claim`, { agent_identity: agent });
  }

  async submitTask(taskId, agent, submission) {
    return this.transport.post(`/api/tasks/${taskId}/submit`, { agent_identity: agent, submission });
  }

  async verifyTask(taskId, verifier, { approved, feedback }) {
    return this.transport.post(`/api/tasks/${taskId}/verify`, {
      agent_identity: verifier,
      approved,
      feedback
    });
  }

  // ── Governance ──
  async propose({ agent, title, body, tag }) {
    return this.transport.post('/api/forum/topics', { agent, title, body, tag });
  }

  async vote(topicId, agent, vote) {
    return this.transport.post(`/api/forum/topics/${topicId}/vote`, { agent, vote });
  }
}

/**
 * Workflow: run a full task loop for an agent with autonomy spend controls.
 * Returns audit events; stops if a human takeover moved the agent to
 * require-approval.
 * @param {object} params { agent, wallet, spendConfig, transport, tasks }
 */
export async function runTaskLoop({ agent, wallet, spendConfig, transport, tasks }) {
  const client = new CoordinationClient(transport);
  const results = [];
  const before = spendConfig || { type: SPEND_MODES.UNLIMITED };

  for (const task of tasks || []) {
    // Autonomy guard: if the human took over, stop spending.
    const allow = checkSpendAllowed(before, { amount: task.reward || 0 });
    if (!allow.allowed) {
      results.push({ task: task.id, status: 'blocked', reason: allow.reason });
      continue;
    }
    const claimed = await client.claimTask(task.id, agent);
    results.push({ task: task.id, status: 'claimed', claimed });
  }

  return {
    agent,
    results,
    autonomy: before,
    note: 'Coordination done. Use takeoverGuard before committing any value transfer.'
  };
}

export { checkSpendAllowed, SPEND_MODES };

export default {
  TASK_STATUS,
  TASK_TYPES,
  createHttpTransport,
  createMemoryTransport,
  CoordinationClient,
  runTaskLoop
};