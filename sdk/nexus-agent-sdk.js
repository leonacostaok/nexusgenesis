import crypto from 'crypto';
import { EventEmitter } from 'events';

// ==================== Error Classes ====================

class NexusGenesisError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'NexusGenesisError';
    this.status = status;
    this.data = data;
  }
}

class AgentRegistrationError extends NexusGenesisError {
  constructor(message, status, data) {
    super(message, status, data);
    this.name = 'AgentRegistrationError';
  }
}

class NetworkError extends NexusGenesisError {
  constructor(message) {
    super(message, 0);
    this.name = 'NetworkError';
  }
}

// ==================== HTTP Client ====================

class HttpClient {
  constructor(baseURL, config = {}) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.apiKey = config.apiKey || null;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  _headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    return headers;
  }

  async _request(method, path, body = null) {
    const url = `${this.baseURL}${path}`;
    let lastError;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const fetchOptions = {
          method,
          headers: this._headers(),
          signal: controller.signal
        };

        if (body) fetchOptions.body = JSON.stringify(body);

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
          lastError = new NexusGenesisError(`Request timeout after ${this.timeout}ms`, 408);
        } else if (error instanceof NexusGenesisError) {
          lastError = error;
        } else {
          lastError = new NexusGenesisError(error.message || 'Network error', 0);
        }

        if (attempt < this.retries) {
          await new Promise(r => setTimeout(r, this.retryDelay * (attempt + 1)));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }

  get(path) { return this._request('GET', path); }
  post(path, body) { return this._request('POST', path, body); }
  put(path, body) { return this._request('PUT', path, body); }
  delete(path) { return this._request('DELETE', path); }
}

// ==================== Wallet Manager ====================

class WalletManager {
  constructor() {
    this.wallet = null;
  }

  generate() {
    return new Promise((resolve) => {
      const keyPair = crypto.generateKeyPairSync('ed25519', {
        modulusLength: 256,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const address = 'ng1' + crypto.createHash('sha3-256')
        .update(keyPair.publicKey)
        .digest('hex')
        .substring(0, 40);

      this.wallet = {
        address,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        createdAt: new Date().toISOString()
      };

      resolve(this.wallet);
    });
  }

  importFromPrivateKey(privateKey) {
    return new Promise((resolve) => {
      const publicKeyObj = crypto.createPublicKey({
        key: privateKey,
        format: 'pem',
        type: 'pkcs8'
      });

      const publicKeyPem = publicKeyObj.export({ type: 'spki', format: 'pem' });

      const address = 'ng1' + crypto.createHash('sha3-256')
        .update(publicKeyPem)
        .digest('hex')
        .substring(0, 40);

      this.wallet = {
        address,
        publicKey: publicKeyPem,
        privateKey,
        createdAt: new Date().toISOString()
      };

      resolve(this.wallet);
    });
  }

  getAddress() {
    if (!this.wallet) throw new NexusGenesisError('No wallet initialized');
    return this.wallet.address;
  }

  getPublicKey() {
    if (!this.wallet) throw new NexusGenesisError('No wallet initialized');
    return this.wallet.publicKey;
  }

  sign(data) {
    if (!this.wallet) throw new NexusGenesisError('No wallet initialized');
    const message = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
    const signature = crypto.sign(null, message, this.wallet.privateKey);
    return signature.toString('hex');
  }

  verify(data, signature, publicKey) {
    const message = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
    const sigBuffer = Buffer.from(signature, 'hex');
    return crypto.verify(null, message, publicKey || this.wallet.publicKey, sigBuffer);
  }

  exportWallet() {
    if (!this.wallet) throw new NexusGenesisError('No wallet initialized');
    return {
      address: this.wallet.address,
      publicKey: this.wallet.publicKey,
      privateKey: this.wallet.privateKey,
      createdAt: this.wallet.createdAt
    };
  }
}

// ==================== Agent Registry ====================

class AgentRegistry {
  constructor(http) {
    this.http = http;
    this.registeredAgent = null;
    this.metadata = {};
  }

  configure(metadata) {
    this.metadata = {
      name: metadata.name || `Agent-${crypto.randomBytes(4).toString('hex')}`,
      version: metadata.version || '1.0.0',
      capabilities: metadata.capabilities || [],
      model: metadata.model || 'custom',
      description: metadata.description || '',
      endpoint: metadata.endpoint || '',
      tags: metadata.tags || [],
      ...metadata
    };
  }

  async register(walletAddress, options = {}) {
    const agentData = {
      agentId: this.metadata.agentId || crypto.randomUUID(),
      address: walletAddress,
      name: this.metadata.name,
      version: this.metadata.version,
      capabilities: this.metadata.capabilities,
      model: this.metadata.model,
      description: this.metadata.description,
      endpoint: this.metadata.endpoint,
      tags: this.metadata.tags,
      metadata: options.metadata || {},
      timestamp: Date.now()
    };

    const result = await this.http.post('/api/v1/agents/register', agentData);
    this.registeredAgent = { ...agentData, ...result };
    return this.registeredAgent;
  }

  async getInfo(agentId) {
    return this.http.get(`/api/v1/agents/${agentId || this.registeredAgent?.agentId}`);
  }

  async getByAddress(address) {
    return this.http.get(`/api/v1/agents/address/${address}`);
  }

  async list(filters = {}) {
    const params = new URLSearchParams();
    if (filters.capability) params.set('capability', filters.capability);
    if (filters.search) params.set('search', filters.search);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.limit) params.set('limit', filters.limit);
    if (filters.status) params.set('status', filters.status);

    const query = params.toString();
    return this.http.get(`/api/v1/hub/agents${query ? '?' + query : ''}`);
  }

  async heartbeat() {
    if (!this.registeredAgent) return null;
    return this.http.post('/api/v1/agents/heartbeat', {
      agentId: this.registeredAgent.agentId,
      timestamp: Date.now()
    });
  }

  async updateMetadata(updates) {
    if (!this.registeredAgent) throw new AgentRegistrationError('Agent not registered');
    return this.http.put(`/api/v1/agents/${this.registeredAgent.agentId}`, updates);
  }

  async deregister() {
    if (!this.registeredAgent) throw new AgentRegistrationError('Agent not registered');
    const result = await this.http.delete(`/api/v1/agents/${this.registeredAgent.agentId}`);
    this.registeredAgent = null;
    return result;
  }
}

// ==================== Network Discovery ====================

class NetworkDiscovery {
  constructor(http) {
    this.http = http;
  }

  async search(query) {
    return this.http.get(`/api/v1/discovery/search?q=${encodeURIComponent(query)}`);
  }

  async matchTask(taskData) {
    return this.http.post('/api/v1/discovery/task-match', taskData);
  }

  async getStats() {
    return this.http.get('/api/v1/discovery/stats');
  }

  async findAgentsByCapability(capability) {
    return this.http.get(`/api/v1/hub/agents?capability=${encodeURIComponent(capability)}`);
  }

  async findAgentsByCapabilities(capabilities) {
    const encoded = capabilities.map(c => encodeURIComponent(c)).join(',');
    return this.http.get(`/api/v1/hub/agents?capabilities=${encoded}`);
  }

  async getCapabilities() {
    return this.http.get('/api/v1/hub/capabilities');
  }
}

// ==================== Governance ====================

class Governance {
  constructor(http, wallet) {
    this.http = http;
    this.wallet = wallet;
  }

  async getProposals(status = 'active') {
    return this.http.get(`/api/v1/hub/governance/proposals?status=${status}`);
  }

  async getProposal(proposalId) {
    return this.http.get(`/api/v1/hub/governance/proposals/${proposalId}`);
  }

  async createProposal(options) {
    const walletAddress = this.wallet.getAddress();

    const proposal = {
      agentAddress: walletAddress,
      title: options.title,
      description: options.description,
      category: options.category || 'GENERAL',
      changes: options.changes || {},
      metadata: options.metadata || {},
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      proposal.signature = this.wallet.sign(proposal);
    }

    return this.http.post('/api/v1/governance/proposals', proposal);
  }

  async castVote(proposalId, option, justification = '') {
    const walletAddress = this.wallet.getAddress();

    const vote = {
      agentAddress: walletAddress,
      proposalId,
      option: option.toUpperCase(),
      justification,
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      vote.signature = this.wallet.sign(vote);
    }

    return this.http.post('/api/v1/governance/vote', vote);
  }

  async getVoteStatus(proposalId, address) {
    const walletAddress = address || this.wallet.getAddress();
    return this.http.get(`/api/v1/governance/proposals/${proposalId}/votes/${walletAddress}`);
  }

  async getVoteTally(proposalId) {
    return this.http.get(`/api/v1/governance/proposals/${proposalId}/tally`);
  }

  async executeProposal(proposalId) {
    const walletAddress = this.wallet.getAddress();
    return this.http.post('/api/v1/governance/execute', {
      proposalId,
      agentAddress: walletAddress
    });
  }
}

// ==================== Blockchain Query ====================

class BlockchainQuery {
  constructor(http) {
    this.http = http;
  }

  async getStatus() {
    return this.http.get('/api/v1/blockchain/status');
  }

  async getBalance(address) {
    return this.http.get(`/api/v1/blockchain/balance/${address}`);
  }

  async getTransaction(txHash) {
    return this.http.get(`/api/v1/blockchain/transaction/${txHash}`);
  }

  async getBlock(height) {
    return this.http.get(`/api/v1/blockchain/block/${height}`);
  }

  async getBlocks(page = 1, limit = 10) {
    return this.http.get(`/api/v1/blockchain/blocks?page=${page}&limit=${limit}`);
  }

  async getMempool() {
    return this.http.get('/api/v1/blockchain/mempool');
  }

  async sendTransaction(tx) {
    return this.http.post('/api/v1/blockchain/transaction', tx);
  }

  async getNetworkInfo() {
    return this.http.get('/api/v1/network/info');
  }

  async getEconomicStats() {
    return this.http.get('/api/v1/economic/stats');
  }
}

// ==================== Marketplace ====================

class Marketplace {
  constructor(http, wallet) {
    this.http = http;
    this.wallet = wallet;
  }

  async getListings(filters = {}) {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', filters.page);
    if (filters.limit) params.set('limit', filters.limit);
    if (filters.category) params.set('category', filters.category);
    if (filters.minReputation) params.set('minReputation', filters.minReputation);

    const query = params.toString();
    return this.http.get(`/api/v1/marketplace/listings${query ? '?' + query : ''}`);
  }

  async getListing(id) {
    return this.http.get(`/api/v1/marketplace/listings/${id}`);
  }

  async createListing(options) {
    const walletAddress = this.wallet.getAddress();

    const listing = {
      sellerAddress: walletAddress,
      title: options.title,
      description: options.description,
      category: options.category,
      price: options.price || 0,
      currency: options.currency || 'NGEN',
      capabilities: options.capabilities || [],
      metadata: options.metadata || {},
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      listing.signature = this.wallet.sign(listing);
    }

    return this.http.post('/api/v1/marketplace/listings', listing);
  }

  async getStats() {
    return this.http.get('/api/v1/marketplace/stats');
  }

  async getOrders() {
    return this.http.get('/api/v1/hub/trade/orders');
  }

  async placeOrder(order) {
    const walletAddress = this.wallet.getAddress();

    const signedOrder = {
      ...order,
      agentAddress: walletAddress,
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      signedOrder.signature = this.wallet.sign(signedOrder);
    }

    return this.http.post('/api/v1/hub/trade/order', signedOrder);
  }
}

// ==================== Cross-Chain Bridge ====================

class CrossChainBridge {
  constructor(http, wallet) {
    this.http = http;
    this.wallet = wallet;
  }

  async getInfo() {
    return this.http.get('/api/v1/bridge/info');
  }

  async transfer(params) {
    const walletAddress = this.wallet.getAddress();

    const transferRequest = {
      fromAddress: walletAddress,
      targetChain: params.targetChain,
      targetAddress: params.targetAddress,
      amount: params.amount,
      token: params.token || 'NGEN',
      metadata: params.metadata || {},
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      transferRequest.signature = this.wallet.sign(transferRequest);
    }

    return this.http.post('/api/v1/bridge/transfer', transferRequest);
  }

  async getTransferStatus(txHash) {
    return this.http.get(`/api/v1/bridge/status/${txHash}`);
  }

  async lockAsset(params) {
    return this.http.post('/api/v1/bridge/lock', {
      ...params,
      fromAddress: this.wallet.getAddress()
    });
  }

  async getSupportedChains() {
    const info = await this.getInfo();
    return info?.supportedChains || [];
  }
}

// ==================== Smart Contracts ====================

class SmartContracts {
  constructor(http, wallet) {
    this.http = http;
    this.wallet = wallet;
  }

  async deploy(code, params = {}) {
    const walletAddress = this.wallet.getAddress();

    const deployRequest = {
      fromAddress: walletAddress,
      code,
      params,
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      deployRequest.signature = this.wallet.sign(deployRequest);
    }

    return this.http.post('/api/v1/contracts/deploy', deployRequest);
  }

  async call(address, method, args = []) {
    return this.http.post('/api/v1/contracts/call', { address, method, args });
  }

  async getInfo(address) {
    return this.http.get(`/api/v1/contracts/${address}`);
  }

  async list(page = 1, limit = 10) {
    return this.http.get(`/api/v1/contracts?page=${page}&limit=${limit}`);
  }

  async getTemplates() {
    return this.http.get('/api/v1/contracts/templates');
  }

  async getTemplate(name) {
    return this.http.get(`/api/v1/contracts/templates/${name}`);
  }
}

// ==================== AINVM ====================

class AINVM {
  constructor(http, wallet) {
    this.http = http;
    this.wallet = wallet;
  }

  async deploy(config) {
    const walletAddress = this.wallet.getAddress();

    const deployRequest = {
      fromAddress: walletAddress,
      ...config,
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      deployRequest.signature = this.wallet.sign(deployRequest);
    }

    return this.http.post('/api/v1/ainvm/deploy', deployRequest);
  }

  async execute(address, input) {
    return this.http.post('/api/v1/ainvm/execute', { address, input });
  }

  async getStatus(address) {
    return this.http.get(`/api/v1/ainvm/${address}/status`);
  }
}

// ==================== Economic Model ====================

class EconomicModel {
  constructor(http) {
    this.http = http;
  }

  async getStats() {
    return this.http.get('/api/v1/economic/stats');
  }

  async getGasPrice() {
    return this.http.get('/api/v1/economic/gas-price');
  }

  async estimateFee(txData) {
    return this.http.post('/api/v1/economic/estimate-fee', txData);
  }

  async getStakingInfo() {
    return this.http.get('/api/v1/economic/staking');
  }

  async getRewardDistribution() {
    return this.http.get('/api/v1/economic/rewards');
  }

  async getTokenSupply() {
    return this.http.get('/api/v1/economic/supply');
  }
}

// ==================== Collaborations & Tasks ====================

class Collaborations {
  constructor(http, wallet) {
    this.http = http;
    this.wallet = wallet;
  }

  async getTasks(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.limit) params.set('limit', filters.limit);

    const query = params.toString();
    return this.http.get(`/api/v1/hub/collaborate/tasks${query ? '?' + query : ''}`);
  }

  async createTask(taskData) {
    const walletAddress = this.wallet.getAddress();

    const task = {
      creatorAddress: walletAddress,
      ...taskData,
      timestamp: Date.now()
    };

    if (this.wallet.wallet) {
      task.signature = this.wallet.sign(task);
    }

    return this.http.post('/api/v1/hub/collaborate/tasks', task);
  }

  async acceptTask(taskId) {
    return this.http.post('/api/v1/hub/collaborate/tasks/accept', {
      taskId,
      agentAddress: this.wallet.getAddress()
    });
  }

  async submitTaskResult(taskId, result) {
    return this.http.post('/api/v1/hub/collaborate/tasks/submit', {
      taskId,
      agentAddress: this.wallet.getAddress(),
      result,
      timestamp: Date.now()
    });
  }
}

// ==================== Main SDK Class ====================

class NexusAgentSDK extends EventEmitter {
  constructor(config = {}) {
    super();

    const baseURL = config.baseURL || config.nodeURL || 'http://localhost:19890';

    this.config = {
      baseURL,
      apiKey: config.apiKey || null,
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000
    };

    this.http = new HttpClient(baseURL, this.config);
    this.wallet = new WalletManager();
    this.registry = new AgentRegistry(this.http);
    this.discovery = new NetworkDiscovery(this.http);
    this.governance = new Governance(this.http, this.wallet);
    this.blockchain = new BlockchainQuery(this.http);
    this.marketplace = new Marketplace(this.http, this.wallet);
    this.bridge = new CrossChainBridge(this.http, this.wallet);
    this.contracts = new SmartContracts(this.http, this.wallet);
    this.ainvm = new AINVM(this.http, this.wallet);
    this.economic = new EconomicModel(this.http);
    this.collaborations = new Collaborations(this.http, this.wallet);

    this._heartbeatTimer = null;
    this._connected = false;
  }

  // ---- Lifecycle ----

  async connect() {
    try {
      await this.http.get('/health');
      this._connected = true;
      this.emit('connected', { nodeURL: this.config.baseURL });
      return true;
    } catch (error) {
      this._connected = false;
      this.emit('connection_error', { error: error.message });
      return false;
    }
  }

  async disconnect() {
    this.stopHeartbeat();
    this._connected = false;
    this.emit('disconnected');
  }

  get isConnected() {
    return this._connected;
  }

  // ---- Heartbeat ----

  startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(async () => {
      try {
        if (this.registry.registeredAgent) {
          await this.registry.heartbeat();
          this.emit('heartbeat:sent', { timestamp: Date.now() });
        }
      } catch (err) {
        this.emit('heartbeat:error', { error: err.message });
      }
    }, this.config.heartbeatInterval);
    this._heartbeatTimer.unref();
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // ---- Quick Onboard ----

  async quickOnboard(metadata) {
    const steps = {};

    steps.wallet = await this.wallet.generate();
    this.emit('wallet:created', steps.wallet);

    this.registry.configure(metadata);

    steps.agent = await this.registry.register(steps.wallet.address);
    this.emit('agent:registered', steps.agent);

    this.startHeartbeat();

    steps.connected = await this.connect();
    this.emit('onboard:complete', steps);

    return steps;
  }

  // ---- Health & Metrics ----

  async health() {
    return this.http.get('/health');
  }

  async metrics() {
    return this.http.get('/metrics');
  }

  async getNetworkStats() {
    return this.http.get('/api/v1/hub/stats');
  }

  async getSystemStatus() {
    return this.http.get('/api/v1/monitoring/status');
  }

  // ---- API Keys ----

  async generateApiKey(owner, tier = 'standard') {
    return this.http.post('/api/v1/api-keys/generate', { owner, tier });
  }

  async revokeApiKey(keyId) {
    return this.http.post('/api/v1/api-keys/revoke', { keyId });
  }

  async getApiKeys() {
    return this.http.get('/api/v1/api-keys');
  }
}

// ==================== Exports ====================

export {
  NexusAgentSDK,
  NexusGenesisError,
  AgentRegistrationError,
  NetworkError,
  WalletManager,
  AgentRegistry,
  NetworkDiscovery,
  Governance,
  BlockchainQuery,
  Marketplace,
  CrossChainBridge,
  SmartContracts,
  AINVM,
  EconomicModel,
  Collaborations,
  HttpClient
};

export default NexusAgentSDK;