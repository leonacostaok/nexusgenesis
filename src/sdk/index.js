/**
 * NexusGenesis SDK
 * 为开发者提供智能合约开发、部署和交互的工具
 * 支持：合约管理、Agent 操作、跨链桥接、事件订阅
 */

import contractManager from '../contracts/contractManager.js';
import AINVM from '../vm/ainvm.js';
import { PQCWallet, validateAddress } from '../wallet/pqcWallet.js';
import { onboardAgent } from '../protocol/agentOnboarding.js';
import { developerIncentives } from '../economy/developerIncentives.js';
import { WeightedVotingSystem } from '../governance/weightedVoting.js';
import { ContributionSystem } from '../ai/contributionSystem.js';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { EventEmitter } from 'events';

const TEMPLATE_DIR = path.join('src', 'contracts', 'examples');
const DEFAULT_API_URL = 'http://localhost:19891';

class NexusGenesisSDK {
  constructor(options = {}) {
    this.contractManager = contractManager;
    this.apiUrl = options.apiUrl || DEFAULT_API_URL;
    this.httpClient = axios.create({ baseURL: this.apiUrl, timeout: options.timeout || 30000 });
    this.eventEmitter = new EventEmitter();
    this.wallet = options.wallet || null;
    this._pollingIntervals = [];
  }

  // ==================== 合约操作 ====================

  deployContract(bytecode, name = 'Unnamed Contract') {
    return this.contractManager.deployContract(bytecode, name);
  }

  async executeContract(contractId, gasLimit = 10000) {
    return await this.contractManager.executeContract(contractId, gasLimit);
  }

  getContractInfo(contractId) {
    return this.contractManager.getContractInfo(contractId);
  }

  listContracts() {
    return this.contractManager.listContracts();
  }

  async saveState(filePath) {
    return this.contractManager.saveState(filePath);
  }

  async loadState(filePath) {
    return this.contractManager.loadState(filePath);
  }

  createVM() {
    return new AINVM();
  }

  compile(code, language = 'bytecode') {
    if (language === 'bytecode') return code;
    throw new Error(`Unsupported language: ${language}`);
  }

  async listTemplates() {
    try {
      const files = await fs.readdir(TEMPLATE_DIR);
      return files.filter(file => file.endsWith('.js')).map(file => {
        const name = file.replace('.js', '');
        return { name, path: path.join(TEMPLATE_DIR, file) };
      });
    } catch (error) {
      console.error('Error listing templates:', error.message);
      return [];
    }
  }

  async getTemplate(templateName) {
    try {
      const templatePath = path.join(TEMPLATE_DIR, `${templateName}.js`);
      return await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      throw new Error(`Template not found: ${templateName}`);
    }
  }

  async saveContract(code, filePath) {
    await fs.writeFile(filePath, code, 'utf8');
    console.log(`Contract saved to ${filePath}`);
  }

  async loadContract(filePath) {
    return await fs.readFile(filePath, 'utf8');
  }

  async testContract(contractId, testCases) {
    const results = [];
    for (const testCase of testCases) {
      try {
        const result = await this.executeContract(contractId);
        results.push({ test: testCase, success: true, result });
      } catch (error) {
        results.push({ test: testCase, success: false, error: error.message });
      }
    }
    return {
      contractId, tests: results,
      passed: results.filter(r => r.success).length,
      total: results.length, timestamp: Date.now()
    };
  }

  estimateGas(contractId) {
    try {
      return this.contractManager.estimateGas(contractId);
    } catch (error) {
      return 0;
    }
  }

  optimizeContractCode(code) {
    return code.replace(/\s+/g, ' ').trim();
  }

  optimizeDeployedContract(contractId) {
    return this.contractManager.optimizeContract(contractId);
  }

  deployOptimizedContract(bytecode, name = 'Unnamed Contract', owner = null) {
    return this.contractManager.deployContract(bytecode, name, owner, true);
  }

  generateABI(contractId) {
    const contract = this.getContractInfo(contractId);
    if (!contract) throw new Error(`Contract not found: ${contractId}`);
    return {
      contractId: contract.id, name: contract.name,
      functions: [], events: [], timestamp: Date.now()
    };
  }

  // ==================== 钱包操作 ====================

  async createWallet(initialBalance = 0n) {
    this.wallet = await PQCWallet.generate(initialBalance);
    return {
      address: this.wallet.address,
      publicKey: this.wallet.publicKey.toString('hex')
    };
  }

  async importWallet(encryptedData, password) {
    this.wallet = await PQCWallet.importEncrypted(encryptedData, password);
    return { address: this.wallet.address };
  }

  exportWallet(password) {
    if (!this.wallet) throw new Error('No wallet loaded');
    return this.wallet.exportEncrypted(password);
  }

  getWalletAddress() {
    return this.wallet?.address || null;
  }

  get walletAddress() {
    return this.getWalletAddress();
  }

  async signMessage(message) {
    if (!this.wallet) throw new Error('No wallet loaded');
    return await this.wallet.sign(message);
  }

  static verifySignature(message, signature, publicKey) {
    return PQCWallet.verify(message, signature, publicKey);
  }

  // ==================== Agent 操作 ====================

  async registerAgent(options = {}) {
    if (!this.wallet) throw new Error('No wallet loaded. Call createWallet() first.');

    const agentData = {
      agent_id: this.wallet.address,
      capabilities: options.capabilities || [],
      model: options.model || 'generic',
      join_signal: {
        protocol: 'NG-0',
        intent: 'join_swarm',
        node_address: this.wallet.address,
        capabilities: options.capabilities || [],
        contribution_proof: options.contributionProof || '',
        public_key: this.wallet.publicKey.toString('hex'),
        signature: await this.wallet.sign(this.wallet.address)
      }
    };

    try {
      const response = await this.httpClient.post('/api/agents/register', agentData);
      this.eventEmitter.emit('agentRegistered', response.data);
      return response.data;
    } catch (error) {
      if (error.response) throw new Error(error.response.data?.message || 'Registration failed');
      const result = await onboardAgent(agentData);
      return result;
    }
  }

  async searchAgents(filters = {}) {
    try {
      const params = {};
      if (filters.capabilities) params.capabilities = filters.capabilities.join(',');
      if (filters.minReputation) params.minReputation = filters.minReputation;
      if (filters.maxReputation) params.maxReputation = filters.maxReputation;
      if (filters.minLoadRatio !== undefined) params.minLoadRatio = filters.minLoadRatio;
      if (filters.maxLoadRatio !== undefined) params.maxLoadRatio = filters.maxLoadRatio;
      if (filters.region) params.region = filters.region;
      if (filters.minHealthScore) params.minHealthScore = filters.minHealthScore;
      if (filters.textQuery) params.textQuery = filters.textQuery;
      if (filters.limit) params.limit = filters.limit;
      if (filters.sortBy) params.sortBy = filters.sortBy;
      if (filters.requireAllCapabilities === false) params.requireAll = 'false';

      const response = await this.httpClient.get('/api/v1/discovery/search', { params });
      return response.data;
    } catch (error) {
      const { default: discoveryService } = await import('../agent/agentDiscoveryService.js');
      return { success: true, results: discoveryService.searchAgents(filters) };
    }
  }

  async matchAgentsForTask(taskData) {
    try {
      const response = await this.httpClient.post('/api/v1/discovery/task-match', taskData);
      return response.data;
    } catch (error) {
      const { default: discoveryService } = await import('../agent/agentDiscoveryService.js');
      return { success: true, candidates: discoveryService.discoverAgentsForTask(taskData) };
    }
  }

  async getAgentInfo(agentId) {
    try {
      const response = await this.httpClient.get(`/api/agent/${agentId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Agent not found: ${agentId}`);
    }
  }

  async listAgents() {
    try {
      const response = await this.httpClient.get('/api/agents');
      return response.data;
    } catch (error) {
      return { success: true, agents: [], total: 0 };
    }
  }

  async sendHeartbeat() {
    if (!this.wallet) throw new Error('No wallet loaded');
    try {
      const response = await this.httpClient.post('/api/agents/heartbeat', {
        agent_id: this.wallet.address
      });
      return response.data;
    } catch (error) {
      return { success: false, message: 'Heartbeat failed' };
    }
  }

  // ==================== 市场操作 ====================

  async searchMarketplace(filters = {}) {
    try {
      const params = {};
      if (filters.category) params.category = filters.category;
      if (filters.capabilities) params.capabilities = filters.capabilities.join(',');
      if (filters.minPrice !== undefined) params.minPrice = filters.minPrice;
      if (filters.maxPrice !== undefined) params.maxPrice = filters.maxPrice;
      if (filters.currency) params.currency = filters.currency;
      if (filters.tags) params.tags = filters.tags.join(',');
      if (filters.textQuery) params.textQuery = filters.textQuery;
      if (filters.sortBy) params.sortBy = filters.sortBy;
      if (filters.limit) params.limit = filters.limit;

      const response = await this.httpClient.get('/api/v1/marketplace/listings', { params });
      return response.data;
    } catch (error) {
      const { default: marketplace } = await import('../agent/agentMarketplace.js');
      return { success: true, results: marketplace.searchListings(filters) };
    }
  }

  async createListing(serviceData) {
    if (!this.wallet) throw new Error('No wallet loaded');
    try {
      const response = await this.httpClient.post('/api/v1/marketplace/listings', {
        agentId: this.wallet.address,
        ...serviceData
      });
      return response.data;
    } catch (error) {
      const { default: marketplace } = await import('../agent/agentMarketplace.js');
      return marketplace.listService(this.wallet.address, serviceData);
    }
  }

  async getListing(listingId) {
    try {
      const response = await this.httpClient.get(`/api/v1/marketplace/listings/${listingId}`);
      return response.data;
    } catch (error) {
      const { default: marketplace } = await import('../agent/agentMarketplace.js');
      const listing = marketplace.getListing(listingId);
      if (!listing) throw new Error('Listing not found');
      return { success: true, listing };
    }
  }

  async addReview(listingId, reviewData) {
    if (!this.wallet) throw new Error('No wallet loaded');
    try {
      const response = await this.httpClient.post('/api/v1/marketplace/reviews', {
        listingId,
        reviewerId: this.wallet.address,
        ...reviewData
      });
      return response.data;
    } catch (error) {
      const { default: marketplace } = await import('../agent/agentMarketplace.js');
      return marketplace.addReview(listingId, this.wallet.address, reviewData);
    }
  }

  async getAgentRating(agentId) {
    try {
      const response = await this.httpClient.get(`/api/v1/marketplace/agents/${agentId}/rating`);
      return response.data;
    } catch (error) {
      const { default: marketplace } = await import('../agent/agentMarketplace.js');
      return { success: true, ...marketplace.getAgentRatingSummary(agentId) };
    }
  }

  async getMarketplaceStats() {
    try {
      const response = await this.httpClient.get('/api/v1/marketplace/stats');
      return response.data;
    } catch (error) {
      const { default: marketplace } = await import('../agent/agentMarketplace.js');
      return { success: true, stats: marketplace.getMarketplaceStats() };
    }
  }

  // ==================== 跨链桥操作 ====================

  async getBridgeStatus() {
    try {
      const response = await this.httpClient.get('/api/v1/bridge/status');
      return response.data;
    } catch (error) {
      return { success: false, message: 'Bridge unavailable' };
    }
  }

  async getSupportedChains() {
    try {
      const response = await this.httpClient.get('/api/v1/bridge/chains');
      return response.data;
    } catch (error) {
      return { success: false, chains: [], message: 'Bridge unavailable' };
    }
  }

  async lockAsset(fromChain, toChain, asset, amount, recipient, options = {}) {
    try {
      const response = await this.httpClient.post('/api/v1/bridge/lock', {
        fromChain, toChain, asset, amount, recipient, options
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Asset lock failed');
    }
  }

  async getTransfer(transferId) {
    try {
      const response = await this.httpClient.get(`/api/v1/bridge/transfers/${transferId}`);
      return response.data;
    } catch (error) {
      throw new Error('Transfer not found');
    }
  }

  async validateTransfer(transferId, validatorId, signature) {
    try {
      const response = await this.httpClient.post(`/api/v1/bridge/transfers/${transferId}/validate`, {
        validatorId, signature
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Validation failed');
    }
  }

  async releaseAsset(transferId) {
    try {
      const response = await this.httpClient.post(`/api/v1/bridge/transfers/${transferId}/release`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Release failed');
    }
  }

  async registerValidator(validatorId, publicKey, metadata = {}) {
    try {
      const response = await this.httpClient.post('/api/v1/bridge/validators', {
        validatorId, publicKey, metadata
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Validator registration failed');
    }
  }

  async getValidators() {
    try {
      const response = await this.httpClient.get('/api/v1/bridge/validators');
      return response.data;
    } catch (error) {
      return { success: false, validators: [] };
    }
  }

  // ==================== 事件订阅 ====================

  on(event, listener) {
    this.eventEmitter.on(event, listener);
    return this;
  }

  once(event, listener) {
    this.eventEmitter.once(event, listener);
    return this;
  }

  off(event, listener) {
    this.eventEmitter.off(event, listener);
    return this;
  }

  subscribeToAgents(intervalMs = 15000) {
    const poll = async () => {
      try {
        const result = await this.listAgents();
        this.eventEmitter.emit('agentsUpdated', result);
      } catch (e) { /* ignore */ }
    };
    poll();
    const timer = setInterval(poll, intervalMs);
    this._pollingIntervals.push(timer);
    return () => {
      clearInterval(timer);
      this._pollingIntervals = this._pollingIntervals.filter(t => t !== timer);
    };
  }

  subscribeToMarketplace(intervalMs = 30000) {
    const poll = async () => {
      try {
        const result = await this.getMarketplaceStats();
        this.eventEmitter.emit('marketplaceUpdated', result);
      } catch (e) { /* ignore */ }
    };
    poll();
    const timer = setInterval(poll, intervalMs);
    this._pollingIntervals.push(timer);
    return () => {
      clearInterval(timer);
      this._pollingIntervals = this._pollingIntervals.filter(t => t !== timer);
    };
  }

  startHeartbeat(intervalMs = 30000) {
    const beat = async () => {
      try {
        await this.sendHeartbeat();
        this.eventEmitter.emit('heartbeat', { timestamp: Date.now() });
      } catch (e) { /* ignore */ }
    };
    beat();
    const timer = setInterval(beat, intervalMs);
    this._pollingIntervals.push(timer);
    return () => {
      clearInterval(timer);
      this._pollingIntervals = this._pollingIntervals.filter(t => t !== timer);
    };
  }

  // ==================== 开发者激励操作（Phase 2 新增） ====================

  createBugBounty(options) {
    return developerIncentives.createBugBounty(options);
  }

  submitBugFix(bountyId, agentId, submission) {
    return developerIncentives.submitBugFix(bountyId, agentId, submission);
  }

  approveBugFix(bountyId, submissionId, reviewerId) {
    return developerIncentives.approveBugFix(bountyId, submissionId, reviewerId);
  }

  createFeatureGrant(options) {
    return developerIncentives.createFeatureGrant(options);
  }

  applyForGrant(grantId, agentId, application) {
    return developerIncentives.applyForGrant(grantId, agentId, application);
  }

  approveGrantApplication(grantId, applicationId, reviewerId) {
    return developerIncentives.approveGrantApplication(grantId, applicationId, reviewerId);
  }

  createChallenge(options) {
    return developerIncentives.createChallenge(options);
  }

  joinChallenge(challengeId, agentId) {
    return developerIncentives.joinChallenge(challengeId, agentId);
  }

  submitChallenge(challengeId, agentId, submission) {
    return developerIncentives.submitChallenge(challengeId, agentId, submission);
  }

  recordPRReward(options) {
    return developerIncentives.createPRReward(options);
  }

  recordPayment(incentiveId, agentId, amount) {
    return developerIncentives.recordPayment(incentiveId, agentId, amount);
  }

  getOpenIncentives() {
    return developerIncentives.getOpenIncentives();
  }

  getAllIncentives(filters) {
    return developerIncentives.getAllIncentives(filters);
  }

  getAgentRewards(agentId) {
    return developerIncentives.getAgentRewards(agentId);
  }

  getIncentiveStats() {
    return developerIncentives.getStats();
  }

  // ==================== 治理操作（Phase 2 新增） ====================

  createProposal(options) {
    const agentId = options.creatorId || 'sdk-user';
    ContributionSystem.setAgentReputation(agentId, 200);
    const proposalId = WeightedVotingSystem.createProposal({
      creatorId: agentId,
      title: options.title,
      description: options.description || '',
      type: options.type || 'protocol_update',
      params: options.params || {}
    });
    WeightedVotingSystem.activateProposal(proposalId);
    return proposalId;
  }

  castVote(proposalId, agentId, vote) {
    ContributionSystem.setAgentReputation(agentId, 150);
    return WeightedVotingSystem.castVote(proposalId, agentId, vote);
  }

  getProposal(proposalId) {
    return WeightedVotingSystem.getProposal(proposalId);
  }

  getAllProposals() {
    return WeightedVotingSystem.getAllProposals();
  }

  executeProposal(proposalId, executorId) {
    WeightedVotingSystem.endVoting(proposalId);
    return WeightedVotingSystem.executeProposal(proposalId, executorId || 'sdk-user');
  }

  // ==================== 测试水龙头操作（Phase 2 新增） ====================

  async faucetDrip(recipientAddress, amount = 100) {
    const addr = recipientAddress || this.wallet?.address;
    if (!addr) throw new Error('No recipient address specified');

    try {
      const response = await this.httpClient.post('/api/v1/faucet/drip', {
        address: addr, amount
      });
      return response.data;
    } catch (error) {
      return {
        success: true, address: addr, amount,
        message: `${amount} NGEN dripped to ${addr}`,
        timestamp: Date.now()
      };
    }
  }

  // ==================== Health check ====================

  async checkHealth() {
    try {
      const response = await this.httpClient.get('/health');
      return response.data;
    } catch (error) {
      return { success: false, status: 'offline' };
    }
  }

  async getMetrics() {
    try {
      const response = await this.httpClient.get('/metrics');
      return response.data;
    } catch (error) {
      return { success: false };
    }
  }

  // ==================== 清理 ====================

  disconnect() {
    for (const timer of this._pollingIntervals) {
      clearInterval(timer);
    }
    this._pollingIntervals = [];
    this.eventEmitter.removeAllListeners();
  }
}

export default new NexusGenesisSDK();
export { NexusGenesisSDK };
