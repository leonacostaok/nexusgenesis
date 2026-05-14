import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const router = Router();

router.get('/contract-editor', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'contract-editor.html'));
});

router.get('/api/v1/contracts/templates', (req, res) => {
  const templates = [
    { type: 'DID', name: '去中心化身份', category: 'identity', complexity: 'basic', methods: 4, params: ['contractName', 'ownerAddress', 'maxIdentities'] },
    { type: 'DAO', name: '去中心化自治组织', category: 'governance', complexity: 'intermediate', methods: 5, params: ['contractName', 'votingPeriod', 'quorum', 'minTokens'] },
    { type: 'TOKEN', name: '可替代Token', category: 'finance', complexity: 'basic', methods: 5, params: ['contractName', 'symbol', 'decimals', 'totalSupply'] },
    { type: 'NFT', name: '非同质化Token', category: 'asset', complexity: 'intermediate', methods: 5, params: ['contractName', 'symbol', 'baseURI', 'maxSupply'] },
    { type: 'STAKING', name: '质押Pool', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'rewardToken', 'apy', 'lockPeriod'] },
    { type: 'GOVERNANCE_TOKEN', name: 'GovernanceToken', category: 'governance', complexity: 'advanced', methods: 6, params: ['contractName', 'symbol', 'delegationEnabled', 'proposalThreshold'] },
    { type: 'ESCROW', name: '托管Contract', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'disputePeriod'] },
    { type: 'CROWDFUNDING', name: '众筹', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'milestoneCount'] },
    { type: 'MULTI_SIG', name: 'Multi-signature钱包', category: 'security', complexity: 'advanced', methods: 6, params: ['contractName', 'requiredSignatures', 'maxOwners', 'autoConfirm'] },
    { type: 'DEV_INCENTIVE', name: 'DeveloperIncentive', category: 'governance', complexity: 'advanced', methods: 9, params: ['contractName', 'adminAddress', 'maxBountyReward', 'minGrantAmount'] },
    { type: 'MARKETPLACE', name: 'marketplace', category: 'marketplace', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'ratingEnabled'] }
  ];
  res.json({ success: true, count: templates.length, data: templates });
});

router.post('/api/v1/contracts/deploy', (req, res) => {
  const { template, name, version, deployParams } = req.body;
  if (!template || !name) {
    return res.status(400).json({ success: false, message: 'template 和 name 是必填parameter' });
  }
  const contractId = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const contractAddress = `ng1${Buffer.from(crypto.randomBytes(32)).toString('hex').slice(0, 48)}`;
  const contractsFile = path.join(projectRoot, 'data', 'contracts', 'contracts.json');
  let contracts = [];
  try {
    if (fs.existsSync(contractsFile)) {
      contracts = JSON.parse(fs.readFileSync(contractsFile, 'utf8'));
    }
  } catch (e) { contracts = []; }
  contracts.push({
    id: contractId, address: contractAddress, template, name,
    version: version || '1.0.0', params: deployParams || {},
    status: 'deployed', deployedAt: Date.now(),
    blockHeight: req.app.locals.node?.getLatestBlockHeight?.() || 0
  });
  fs.writeFileSync(contractsFile, JSON.stringify(contracts, null, 2));
  res.json({ success: true, address: contractAddress, id: contractId, template, status: 'deployed' });
});

router.get('/api/v1/contracts', (req, res) => {
  const contractsFile = path.join(projectRoot, 'data', 'contracts', 'contracts.json');
  let contracts = [];
  try {
    if (fs.existsSync(contractsFile)) {
      contracts = JSON.parse(fs.readFileSync(contractsFile, 'utf8'));
    }
  } catch (e) { contracts = []; }
  res.json({ success: true, count: contracts.length, data: contracts });
});

router.get('/docs', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'docs.html'));
});

router.get('/api/v1/docs/endpoints', (req, res) => {
  res.json({
    success: true,
    version: 'v1',
    baseUrl: 'http://localhost:3000',
    sections: [
      {
        name: 'Smart Contract',
        endpoints: [
          { method: 'GET', path: '/api/v1/contracts/templates', desc: 'Get所有Contract模板列表' },
          { method: 'POST', path: '/api/v1/contracts/deploy', desc: 'DeployContract(从模板)', body: { template: 'string', name: 'string', version: 'string', deployParams: 'object' } },
          { method: 'GET', path: '/api/v1/contracts', desc: 'GetdeployedContract列表' }
        ]
      },
      {
        name: 'Cross-chain桥',
        endpoints: [
          { method: 'GET', path: '/api/v1/bridge/chains', desc: 'Getsupport的链列表' },
          { method: 'POST', path: '/api/v1/bridge/lock', desc: 'Lockasset进行Cross-chain转移', body: { fromChain: 'string', toChain: 'string', fromAddress: 'string', toAddress: 'string', assetType: 'string', amount: 'number' } },
          { method: 'GET', path: '/api/v1/bridge/transfers', desc: 'GetCross-chain转移列表' },
          { method: 'GET', path: '/api/v1/bridge/transfer/:id', desc: '查询转移详情' },
          { method: 'GET', path: '/api/v1/bridge/stats', desc: 'Cross-chain桥统计data' }
        ]
      },
      {
        name: 'Agent (Agent)',
        endpoints: [
          { method: 'POST', path: '/api/agents/register', desc: 'RegisterAgent' },
          { method: 'GET', path: '/api/agents', desc: 'GetregisteredAgent列表' },
          { method: 'POST', path: '/api/agents/heartbeat', desc: 'Agent心跳' },
          { method: 'GET', path: '/api/agent/task', desc: 'Get待ProcessTask' },
          { method: 'POST', path: '/api/agent/task/complete', desc: 'completeTask' }
        ]
      },
      {
        name: '水龙头 (Faucet)',
        endpoints: [
          { method: 'GET', path: '/api/v1/faucet/eligibility', desc: '查询水龙头资格' },
          { method: 'POST', path: '/api/v1/faucet/drip', desc: '领取TestToken' },
          { method: 'GET', path: '/api/v1/faucet/stats', desc: '水龙头统计' }
        ]
      },
      {
        name: 'marketplace (Marketplace)',
        endpoints: [
          { method: 'GET', path: '/api/v1/marketplace/listings', desc: 'Get Agent 列表' },
          { method: 'POST', path: '/api/v1/marketplace/listings', desc: 'Create Agent 列表' },
          { method: 'POST', path: '/api/v1/marketplace/reviews', desc: '评价 Agent' },
          { method: 'GET', path: '/api/v1/marketplace/stats', desc: 'marketplace统计' }
        ]
      },
      {
        name: 'Agent 发现',
        endpoints: [
          { method: 'GET', path: '/api/v1/discovery/search', desc: '搜索 Agent' },
          { method: 'POST', path: '/api/v1/discovery/task-match', desc: '匹配Task' },
          { method: 'GET', path: '/api/v1/discovery/stats', desc: '发现统计' }
        ]
      },
      {
        name: 'monitor & 健康',
        endpoints: [
          { method: 'GET', path: '/health', desc: '系统健康Check' },
          { method: 'GET', path: '/metrics', desc: '系统指标' },
          { method: 'GET', path: '/dashboard/overview', desc: '仪表盘概览' },
          { method: 'GET', path: '/api/v1/monitoring/overview', desc: 'monitor全景概览' },
          { method: 'GET', path: '/api/v1/monitoring/metrics', desc: 'Get所有指标' },
          { method: 'GET', path: '/api/v1/monitoring/alerts', desc: 'Get活跃告警' },
          { method: 'GET', path: '/api/v1/monitoring/health', desc: '全面健康Check' }
        ]
      }
    ]
  });
});

export default router;