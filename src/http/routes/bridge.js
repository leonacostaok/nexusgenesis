import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const router = Router();

const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', icon: 'Ξ', chainId: 1, rpcUrl: 'https://eth.llamarpc.com', explorerUrl: 'https://etherscan.io', avgBlockTime: 12, confirmBlocks: 15 },
  { id: 'bsc', name: 'BSC', icon: '🔶', chainId: 56, rpcUrl: 'https://bsc-dataseed.binance.org', explorerUrl: 'https://bscscan.com', avgBlockTime: 3, confirmBlocks: 20 },
  { id: 'polygon', name: 'Polygon', icon: '🟣', chainId: 137, rpcUrl: 'https://polygon-rpc.com', explorerUrl: 'https://polygonscan.com', avgBlockTime: 2, confirmBlocks: 30 },
  { id: 'solana', name: 'Solana', icon: '◎', chainId: 0, rpcUrl: 'https://api.mainnet-beta.solana.com', explorerUrl: 'https://solscan.io', avgBlockTime: 0.4, confirmBlocks: 32 },
  { id: 'avalanche', name: 'Avalanche', icon: '🔺', chainId: 43114, rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', explorerUrl: 'https://snowtrace.io', avgBlockTime: 2, confirmBlocks: 20 },
  { id: 'arbitrum', name: 'Arbitrum', icon: '🔷', chainId: 42161, rpcUrl: 'https://arb1.arbitrum.io/rpc', explorerUrl: 'https://arbiscan.io', avgBlockTime: 0.25, confirmBlocks: 40 }
];

router.get('/docs/bridge', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'bridge.html'));
});

router.get('/api/v1/bridge/chains', (req, res) => {
  res.json({ success: true, data: { chains: SUPPORTED_CHAINS, count: SUPPORTED_CHAINS.length } });
});

router.get('/api/v1/bridge/fees', (req, res) => {
  const fees = {};
  for (const source of SUPPORTED_CHAINS) {
    fees[source.id] = {};
    for (const target of SUPPORTED_CHAINS) {
      if (source.id !== target.id) {
        fees[source.id][target.id] = {
          fee: source.avgBlockTime < 1 ? '0.0001' : '0.001',
          estimatedTime: Math.round((source.avgBlockTime * source.confirmBlocks + target.avgBlockTime * target.confirmBlocks) * 1.2)
        };
      }
    }
  }
  res.json({ success: true, data: { fees } });
});

router.post('/api/v1/bridge/lock', (req, res) => {
  const { sourceChain, targetChain, token, amount, recipient } = req.body;
  if (!sourceChain || !targetChain || !token || !amount || !recipient) {
    return res.status(400).json({ success: false, message: '缺少必填参数: sourceChain, targetChain, token, amount, recipient' });
  }

  const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const source = SUPPORTED_CHAINS.find(c => c.id === sourceChain);
  const target = SUPPORTED_CHAINS.find(c => c.id === targetChain);
  const estimatedTime = source && target
    ? Math.round((source.avgBlockTime * source.confirmBlocks + target.avgBlockTime * target.confirmBlocks) * 1.2)
    : 300;

  res.json({
    success: true,
    data: {
      lockId, sourceChain, targetChain, token, amount, recipient,
      status: 'pending', estimatedTime, createdAt: Date.now()
    }
  });
});

router.get('/api/v1/bridge/transfers', (req, res) => {
  res.json({
    success: true,
    data: {
      transfers: [],
      stats: {
        totalTransfers: 0, totalVolume: 0, activeTransfers: 0, completedTransfers: 0
      }
    }
  });
});

export default router;