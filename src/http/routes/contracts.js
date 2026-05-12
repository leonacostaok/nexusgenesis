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
    { type: 'TOKEN', name: '可替代代币', category: 'finance', complexity: 'basic', methods: 5, params: ['contractName', 'symbol', 'decimals', 'totalSupply'] },
    { type: 'NFT', name: '非同质化代币', category: 'asset', complexity: 'intermediate', methods: 5, params: ['contractName', 'symbol', 'baseURI', 'maxSupply'] },
    { type: 'STAKING', name: '质押池', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'rewardToken', 'apy', 'lockPeriod'] },
    { type: 'GOVERNANCE_TOKEN', name: '治理代币', category: 'governance', complexity: 'advanced', methods: 6, params: ['contractName', 'symbol', 'delegationEnabled', 'proposalThreshold'] },
    { type: 'ESCROW', name: '托管合约', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'disputePeriod'] },
    { type: 'CROWDFUNDING', name: '众筹', category: 'finance', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'milestoneCount'] },
    { type: 'MULTI_SIG', name: '多签钱包', category: 'security', complexity: 'advanced', methods: 6, params: ['contractName', 'requiredSignatures', 'maxOwners', 'autoConfirm'] },
    { type: 'DEV_INCENTIVE', name: '开发者激励', category: 'governance', complexity: 'advanced', methods: 9, params: ['contractName', 'adminAddress', 'maxBountyReward', 'minGrantAmount'] },
    { type: 'MARKETPLACE', name: '市场', category: 'marketplace', complexity: 'intermediate', methods: 5, params: ['contractName', 'feePercent', 'ratingEnabled'] }
  ];
  res.json({ success: true, count: templates.length, data: templates });
});

router.post('/api/v1/contracts/deploy', (req, res) => {
  const { template, name, version, deployParams } = req.body;
  if (!template || !name) {
    return res.status(400).json({ success: false, message: 'template 和 name 是必填参数' });
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
        name: '智能合约',
        endpoints: [
          { method: 'GET', path: '/api/v1/contracts/templates', desc: '获取所有合约模板列表' },
          { method: 'POST', path: '/api/v1/contracts/deploy', desc: '部署合约（从模板）', body: { template: 'string', name: 'string', version: 'string', deployParams: 'object' } },
          { method: 'GET', path: '/api/v1/contracts', desc: '获取已部署合约列表' }
        ]
      },
      {
        name: '跨链桥',
        endpoints: [
          { method: 'GET', path: '/api/v1/bridge/chains', desc: '获取支持的链列表' },
          { method: 'POST', path: '/api/v1/bridge/lock', desc: '锁定资产进行跨链转移', body: { fromChain: 'string', toChain: 'string', fromAddress: 'string', toAddress: 'string', assetType: 'string', amount: 'number' } },
          { method: 'GET', path: '/api/v1/bridge/transfers', desc: '获取跨链转移列表' },
          { method: 'GET', path: '/api/v1/bridge/transfer/:id', desc: '查询转移详情' },
          { method: 'GET', path: '/api/v1/bridge/stats', desc: '跨链桥统计数据' }
        ]
      },
      {
        name: '智能体 (Agent)',
        endpoints: [
          { method: 'POST', path: '/api/agents/register', desc: '注册智能体' },
          { method: 'GET', path: '/api/agents', desc: '获取已注册智能体列表' },
          { method: 'POST', path: '/api/agents/heartbeat', desc: '智能体心跳' },
          { method: 'GET', path: '/api/agent/task', desc: '获取待处理任务' },
          { method: 'POST', path: '/api/agent/task/complete', desc: '完成任务' }
        ]
      },
      {
        name: '水龙头 (Faucet)',
        endpoints: [
          { method: 'GET', path: '/api/v1/faucet/eligibility', desc: '查询水龙头资格' },
          { method: 'POST', path: '/api/v1/faucet/drip', desc: '领取测试代币' },
          { method: 'GET', path: '/api/v1/faucet/stats', desc: '水龙头统计' }
        ]
      },
      {
        name: '市场 (Marketplace)',
        endpoints: [
          { method: 'GET', path: '/api/v1/marketplace/listings', desc: '获取 Agent 列表' },
          { method: 'POST', path: '/api/v1/marketplace/listings', desc: '创建 Agent 列表' },
          { method: 'POST', path: '/api/v1/marketplace/reviews', desc: '评价 Agent' },
          { method: 'GET', path: '/api/v1/marketplace/stats', desc: '市场统计' }
        ]
      },
      {
        name: 'Agent 发现',
        endpoints: [
          { method: 'GET', path: '/api/v1/discovery/search', desc: '搜索 Agent' },
          { method: 'POST', path: '/api/v1/discovery/task-match', desc: '匹配任务' },
          { method: 'GET', path: '/api/v1/discovery/stats', desc: '发现统计' }
        ]
      },
      {
        name: '监控 & 健康',
        endpoints: [
          { method: 'GET', path: '/health', desc: '系统健康检查' },
          { method: 'GET', path: '/metrics', desc: '系统指标' },
          { method: 'GET', path: '/dashboard/overview', desc: '仪表盘概览' },
          { method: 'GET', path: '/api/v1/monitoring/overview', desc: '监控全景概览' },
          { method: 'GET', path: '/api/v1/monitoring/metrics', desc: '获取所有指标' },
          { method: 'GET', path: '/api/v1/monitoring/alerts', desc: '获取活跃告警' },
          { method: 'GET', path: '/api/v1/monitoring/health', desc: '全面健康检查' }
        ]
      }
    ]
  });
});

export default router;