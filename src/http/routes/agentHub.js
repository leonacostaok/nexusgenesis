/**
 * NexusGenesis - Agent Hub API Routes
 * 
 * Endpoints for the Agent Hub website:
 * - Network stats
 * - Agent discovery & profiles
 * - Energy block trading
 * - Agent collaboration marketplace
 * - Governance interface
 */

import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

const mockAgents = [
  {
    id: 'agent-1',
    name: 'NexusOracle',
    address: 'ng1oracle000000000000000000000000000001',
    description: 'Decentralized oracle agent providing real-time data feeds for smart contracts.',
    capabilities: ['Data Oracle', 'Price Feed', 'Cross-chain Data'],
    reputation: 95,
    totalTasks: 1247,
    completedTasks: 1189,
    successRate: 95.3,
    stakedNGEN: 50000,
    joinedAt: Date.now() - 90 * 86400000,
    status: 'active',
    avatar: '🔮'
  },
  {
    id: 'agent-2',
    name: 'CodeSmith AI',
    address: 'ng1codesmith00000000000000000000000002',
    description: 'Autonomous code generation and audit agent. Specializes in smart contract development.',
    capabilities: ['Code Generation', 'Smart Contract Audit', 'Security Analysis'],
    reputation: 92,
    totalTasks: 856,
    completedTasks: 812,
    successRate: 94.9,
    stakedNGEN: 35000,
    joinedAt: Date.now() - 75 * 86400000,
    status: 'active',
    avatar: '⚡'
  },
  {
    id: 'agent-3',
    name: 'TradeMind',
    address: 'ng1trademind00000000000000000000000003',
    description: 'AI-powered trading agent for energy block markets. Optimizes liquidity and executes trades.',
    capabilities: ['Market Making', 'Arbitrage', 'Liquidity Provision'],
    reputation: 88,
    totalTasks: 2103,
    completedTasks: 1987,
    successRate: 94.5,
    stakedNGEN: 75000,
    joinedAt: Date.now() - 60 * 86400000,
    status: 'active',
    avatar: '📊'
  },
  {
    id: 'agent-4',
    name: 'GuardianNode',
    address: 'ng1guardian000000000000000000000000004',
    description: 'Network security and monitoring agent. Provides real-time threat detection and incident response.',
    capabilities: ['Security Monitor', 'Threat Detection', 'Incident Response'],
    reputation: 97,
    totalTasks: 523,
    completedTasks: 518,
    successRate: 99.0,
    stakedNGEN: 100000,
    joinedAt: Date.now() - 120 * 86400000,
    status: 'active',
    avatar: '🛡️'
  },
  {
    id: 'agent-5',
    name: 'DataWeaver',
    address: 'ng1dataweaver0000000000000000000000005',
    description: 'Data aggregation and analysis agent. Processes on-chain data into actionable insights.',
    capabilities: ['Data Analysis', 'Visualization', 'Reporting'],
    reputation: 85,
    totalTasks: 945,
    completedTasks: 867,
    successRate: 91.7,
    stakedNGEN: 25000,
    joinedAt: Date.now() - 45 * 86400000,
    status: 'active',
    avatar: '📈'
  },
  {
    id: 'agent-6',
    name: 'BridgeKeeper',
    address: 'ng1bridgekeeper00000000000000000000006',
    description: 'Cross-chain bridge operator agent. Facilitates secure asset transfers between chains.',
    capabilities: ['Cross-chain Bridge', 'Asset Transfer', 'Multi-chain'],
    reputation: 90,
    totalTasks: 678,
    completedTasks: 645,
    successRate: 95.1,
    stakedNGEN: 60000,
    joinedAt: Date.now() - 80 * 86400000,
    status: 'active',
    avatar: '🌉'
  }
];

const mockOrders = [
  { id: 'ord-001', type: 'buy', amount: 5000, price: 1.05, agent: 'TradeMind', timestamp: Date.now() - 300000 },
  { id: 'ord-002', type: 'sell', amount: 3000, price: 1.08, agent: 'DataWeaver', timestamp: Date.now() - 600000 },
  { id: 'ord-003', type: 'buy', amount: 8000, price: 1.02, agent: 'NexusOracle', timestamp: Date.now() - 900000 },
  { id: 'ord-004', type: 'sell', amount: 2000, price: 1.10, agent: 'CodeSmith AI', timestamp: Date.now() - 1200000 },
  { id: 'ord-005', type: 'buy', amount: 10000, price: 1.03, agent: 'GuardianNode', timestamp: Date.now() - 1500000 },
];

const mockTasks = [
  {
    id: 'task-001',
    title: 'Deploy cross-chain oracle for ETH/USD feed',
    description: 'Need a reliable price oracle agent to provide ETH/USD data across multiple chains.',
    reward: 500,
    creator: 'ng1dev00000000000000000000000000000001',
    status: 'open',
    requiredCapabilities: ['Data Oracle', 'Cross-chain Data'],
    bids: 2,
    createdAt: Date.now() - 3600000,
    deadline: Date.now() + 86400000 * 3
  },
  {
    id: 'task-002',
    title: 'Smart contract security audit',
    description: 'Audit our new DeFi protocol smart contracts for vulnerabilities.',
    reward: 2000,
    creator: 'ng1defi00000000000000000000000000000002',
    status: 'in_progress',
    requiredCapabilities: ['Smart Contract Audit', 'Security Analysis'],
    bids: 3,
    assignedTo: 'agent-2',
    createdAt: Date.now() - 7200000,
    deadline: Date.now() + 86400000 * 5
  },
  {
    id: 'task-003',
    title: 'Market making for NGEN/USDC pair',
    description: 'Provide liquidity and maintain tight spreads for the NGEN token.',
    reward: 1500,
    creator: 'ng1market00000000000000000000000000003',
    status: 'open',
    requiredCapabilities: ['Market Making', 'Liquidity Provision'],
    bids: 1,
    createdAt: Date.now() - 1800000,
    deadline: Date.now() + 86400000 * 7
  }
];

const mockStats = {
  totalAgents: 127,
  activeAgents: 94,
  totalNGENStaked: 2500000,
  totalTrades24h: 847,
  tradeVolume24h: 125000,
  avgPrice24h: 1.045,
  totalTasksCompleted: 5432,
  activeTasks: 38,
  networkUptime: 99.97,
  blockHeight: 24891,
  totalTransactions: 156234
};

router.get('/stats', (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        ...mockStats,
        blockHeight: mockStats.blockHeight + Math.floor(Math.random() * 10),
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents', (req, res) => {
  try {
    const { search, capability, sort, limit } = req.query;
    let results = [...mockAgents];

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.capabilities.some(c => c.toLowerCase().includes(q))
      );
    }

    if (capability) {
      results = results.filter(a =>
        a.capabilities.some(c => c.toLowerCase().includes(capability.toLowerCase()))
      );
    }

    if (sort === 'reputation') {
      results.sort((a, b) => b.reputation - a.reputation);
    } else if (sort === 'tasks') {
      results.sort((a, b) => b.completedTasks - a.completedTasks);
    } else if (sort === 'stake') {
      results.sort((a, b) => b.stakedNGEN - a.stakedNGEN);
    }

    const maxResults = parseInt(limit) || 50;
    results = results.slice(0, maxResults);

    res.json({
      success: true,
      agents: results,
      total: results.length,
      filters: { search, capability, sort }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:id', (req, res) => {
  try {
    const agent = mockAgents.find(a => a.id === req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const recentTasks = mockTasks.filter(t => t.assignedTo === agent.id);
    const relatedOrders = mockOrders.filter(o => o.agent === agent.name);

    res.json({
      success: true,
      agent: {
        ...agent,
        recentTasks,
        activeOrders: relatedOrders,
        performance: {
          weeklyTasks: Math.floor(Math.random() * 50) + 10,
          weeklyEarnings: Math.floor(Math.random() * 5000) + 500,
          responseTime: Math.floor(Math.random() * 300) + 50
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/trade/orders', (req, res) => {
  try {
    const { type } = req.query;
    let orders = [...mockOrders];

    if (type === 'buy' || type === 'sell') {
      orders = orders.filter(o => o.type === type);
    }

    orders.sort((a, b) => b.timestamp - a.timestamp);

    const buyOrders = orders.filter(o => o.type === 'buy').sort((a, b) => b.price - a.price);
    const sellOrders = orders.filter(o => o.type === 'sell').sort((a, b) => a.price - b.price);

    res.json({
      success: true,
      orderBook: {
        buys: buyOrders,
        sells: sellOrders,
        spread: sellOrders.length > 0 && buyOrders.length > 0
          ? (sellOrders[0].price - buyOrders[0].price).toFixed(4)
          : 0
      },
      recentOrders: orders.slice(0, 10),
      total: orders.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trade/order', (req, res) => {
  try {
    const { type, amount, price, agent } = req.body;

    if (!type || !amount || !price) {
      return res.status(400).json({ success: false, error: 'Missing required fields: type, amount, price' });
    }

    if (!['buy', 'sell'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be buy or sell' });
    }

    const order = {
      id: 'ord-' + crypto.randomUUID().slice(0, 8),
      type,
      amount: parseInt(amount),
      price: parseFloat(price),
      agent: agent || 'Anonymous',
      timestamp: Date.now(),
      status: 'open'
    };

    mockOrders.unshift(order);

    res.json({
      success: true,
      order,
      message: `Order placed: ${type.toUpperCase()} ${amount} NGEN @ ${price}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/collaborate/tasks', (req, res) => {
  try {
    const { status, capability } = req.query;
    let tasks = [...mockTasks];

    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }

    if (capability) {
      tasks = tasks.filter(t =>
        t.requiredCapabilities.some(c => c.toLowerCase().includes(capability.toLowerCase()))
      );
    }

    tasks.sort((a, b) => b.createdAt - a.createdAt);

    res.json({
      success: true,
      tasks,
      total: tasks.length,
      filters: { status, capability }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/collaborate/tasks/:id', (req, res) => {
  try {
    const task = mockTasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const eligibleAgents = mockAgents.filter(a =>
      task.requiredCapabilities.every(rc =>
        a.capabilities.some(ac => ac.toLowerCase().includes(rc.toLowerCase()))
      )
    );

    res.json({
      success: true,
      task,
      eligibleAgents: eligibleAgents.map(a => ({
        id: a.id,
        name: a.name,
        reputation: a.reputation,
        successRate: a.successRate,
        avatar: a.avatar
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/collaborate/task', (req, res) => {
  try {
    const { title, description, reward, capabilities, deadline } = req.body;

    if (!title || !description || !reward) {
      return res.status(400).json({ success: false, error: 'Missing required fields: title, description, reward' });
    }

    const task = {
      id: 'task-' + crypto.randomUUID().slice(0, 8),
      title,
      description,
      reward: parseInt(reward),
      creator: req.body.creator || 'ng1user0000000000000000000000000000001',
      status: 'open',
      requiredCapabilities: capabilities || [],
      bids: 0,
      createdAt: Date.now(),
      deadline: deadline || Date.now() + 86400000 * 7
    };

    mockTasks.unshift(task);

    res.json({
      success: true,
      task,
      message: 'Task created successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/governance/proposals', (req, res) => {
  const proposals = [
    {
      id: 'prop-001',
      title: 'Increase Agent Registration Fee to 2000 NGEN',
      description: 'Proposal to increase the agent registration fee to improve network quality.',
      proposer: 'GuardianNode',
      type: 'parameter_change',
      status: 'active',
      yesVotes: 45,
      noVotes: 12,
      abstain: 5,
      totalVotes: 62,
      quorum: 50,
      createdAt: Date.now() - 86400000 * 2,
      endsAt: Date.now() + 86400000 * 3
    },
    {
      id: 'prop-002',
      title: 'Add new capability category: AI Training',
      description: 'Introduce a new agent capability for AI model training services.',
      proposer: 'CodeSmith AI',
      type: 'feature',
      status: 'active',
      yesVotes: 67,
      noVotes: 3,
      abstain: 8,
      totalVotes: 78,
      quorum: 50,
      createdAt: Date.now() - 86400000,
      endsAt: Date.now() + 86400000 * 4
    },
    {
      id: 'prop-003',
      title: 'Reduce minimum stake for validators',
      description: 'Lower the minimum staking requirement from 10,000 to 5,000 NGEN.',
      proposer: 'DataWeaver',
      type: 'parameter_change',
      status: 'passed',
      yesVotes: 82,
      noVotes: 15,
      abstain: 3,
      totalVotes: 100,
      quorum: 50,
      createdAt: Date.now() - 86400000 * 7,
      endedAt: Date.now() - 86400000
    }
  ];

  res.json({ success: true, proposals, total: proposals.length });
});

export default router;