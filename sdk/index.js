'use strict';

class NexusGenesisError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'NexusGenesisError';
    this.status = status;
    this.data = data;
  }
}

class NexusGenesisClient {
  constructor(config = {}) {
    this.baseURL = (config.baseURL || 'http://localhost:3000').replace(/\/+$/, '');
    this.apiKey = config.apiKey || null;
    this.timeout = config.timeout || 30000;
  }

  _headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  async _request(method, path, body = null, options = {}) {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions = {
        method,
        headers: this._headers(),
        signal: controller.signal
      };

      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const contentType = response.headers.get('content-type') || '';

      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new NexusGenesisError(
          data?.message || `HTTP ${response.status}`,
          response.status,
          data
        );
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new NexusGenesisError(`Request timeout after ${this.timeout}ms`, 408);
      }
      if (error instanceof NexusGenesisError) {
        throw error;
      }
      throw new NexusGenesisError(error.message || 'Network error', 0);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get(path) { return this._request('GET', path); }
  async post(path, body) { return this._request('POST', path, body); }

  // ============ Health & Metrics ============
  async health() { return this.get('/health'); }
  async metrics() { return this.get('/metrics'); }

  // ============ API Keys ============
  async generateApiKey(owner, tier) {
    return this.post('/api/v1/api-keys/generate', { owner, tier });
  }
  async revokeApiKey(keyId) {
    return this.post('/api/v1/api-keys/revoke', { keyId });
  }
  async getApiKeys() { return this.get('/api/v1/api-keys'); }
  async getApiKeyStats() { return this.get('/api/v1/api-keys/stats'); }

  // ============ Blockchain ============
  async getStatus() { return this.get('/api/v1/blockchain/status'); }
  async getBalance(address) { return this.get(`/api/v1/blockchain/balance/${address}`); }
  async getTransaction(txHash) { return this.get(`/api/v1/blockchain/transaction/${txHash}`); }
  async sendTransaction(tx) { return this.post('/api/v1/blockchain/transaction', tx); }
  async getBlock(height) { return this.get(`/api/v1/blockchain/block/${height}`); }
  async getBlocks(page = 1, limit = 10) {
    return this.get(`/api/v1/blockchain/blocks?page=${page}&limit=${limit}`);
  }

  // ============ Wallet ============
  async createWallet() { return this.post('/api/v1/wallet/create', {}); }
  async importWallet(privateKey) {
    return this.post('/api/v1/wallet/import', { privateKey });
  }
  async getWalletInfo(address) { return this.get(`/api/v1/wallet/${address}`); }
  async getWalletBalance(address) { return this.get(`/api/v1/wallet/${address}/balance`); }
  async getWalletTransactions(address, page = 1, limit = 10) {
    return this.get(`/api/v1/wallet/${address}/transactions?page=${page}&limit=${limit}`);
  }

  // ============ Contracts ============
  async deployContract(code, params = {}) {
    return this.post('/api/v1/contracts/deploy', { code, params });
  }
  async callContract(address, method, args = []) {
    return this.post('/api/v1/contracts/call', { address, method, args });
  }
  async getContract(address) { return this.get(`/api/v1/contracts/${address}`); }
  async listContracts(page = 1, limit = 10) {
    return this.get(`/api/v1/contracts?page=${page}&limit=${limit}`);
  }

  // ============ AINVM ============
  async deployAINVM(config) {
    return this.post('/api/v1/ainvm/deploy', config);
  }
  async executeAINVM(address, input) {
    return this.post('/api/v1/ainvm/execute', { address, input });
  }
  async getAINVMStatus(address) { return this.get(`/api/v1/ainvm/${address}/status`); }

  // ============ Bridge ============
  async bridgeTransfer(params) {
    return this.post('/api/v1/bridge/transfer', params);
  }
  async bridgeStatus(txHash) { return this.get(`/api/v1/bridge/status/${txHash}`); }
  async bridgeInfo() { return this.get('/api/v1/bridge/info'); }

  // ============ Faucet ============
  async faucetEligibility(address) {
    return this.get(`/api/v1/faucet/eligibility?address=${address}`);
  }
  async faucetDrip(address) {
    return this.post('/api/v1/faucet/drip', { address });
  }
  async faucetStats() { return this.get('/api/v1/faucet/stats'); }

  // ============ Discovery ============
  async discoverySearch(query) {
    return this.get(`/api/v1/discovery/search?q=${encodeURIComponent(query)}`);
  }
  async discoveryTaskMatch(params) {
    return this.post('/api/v1/discovery/task-match', params);
  }
  async discoveryStats() { return this.get('/api/v1/discovery/stats'); }

  // ============ Marketplace ============
  async marketplaceListings(page = 1, limit = 10) {
    return this.get(`/api/v1/marketplace/listings?page=${page}&limit=${limit}`);
  }
  async createMarketplaceListing(listing) {
    return this.post('/api/v1/marketplace/listings', listing);
  }
  async getMarketplaceListing(id) { return this.get(`/api/v1/marketplace/listings/${id}`); }
  async marketplaceStats() { return this.get('/api/v1/marketplace/stats'); }

  // ============ Agents ============
  async registerAgent(agent) { return this.post('/api/agents/register', agent); }
  async getAgents() { return this.get('/api/agents'); }
  async agentHeartbeat(agentId) {
    return this.post('/api/agents/heartbeat', { agentId });
  }

  // ============ Monitoring ============
  async systemStatus() { return this.get('/api/v1/monitoring/status'); }
  async nodeMetrics() { return this.get('/api/v1/monitoring/nodes'); }
  async governanceMetrics() { return this.get('/api/v1/monitoring/governance'); }

  // ============ Orchestration ============
  async createWorkflow(workflow) {
    return this.post('/api/v1/orchestration/workflow', workflow);
  }
  async getWorkflow(id) { return this.get(`/api/v1/orchestration/workflow/${id}`); }
  async listWorkflows() { return this.get('/api/v1/orchestration/workflows'); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NexusGenesisClient, NexusGenesisError };
}

export { NexusGenesisClient, NexusGenesisError };
export default NexusGenesisClient;