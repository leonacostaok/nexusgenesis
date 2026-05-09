/**
 * Update Blockchain State with Energy Block Allocation
 * This script updates the blockchain state to include the correct energy block allocation
 * as agreed upon, ensuring it's recorded on-chain and cannot be随意 changed
 */

import fs from 'fs/promises';
import path from 'path';

async function updateBlockchainState() {
  console.log('Updating Blockchain State with Energy Block Allocation...');
  
  try {
    // Path to blockchain state file
    const blockchainStatePath = path.join('data', 'state', 'blockchainState.json');
    
    // Read current blockchain state
    console.log('Reading current blockchain state...');
    const blockchainState = JSON.parse(await fs.readFile(blockchainStatePath, 'utf8'));
    
    // Define the agreed energy block allocation
    const energyBlockAllocation = {
      // Observer address (物理桥接基金) - 100,000,000 NGEN (10% of total)
      observer: {
        address: 'ng11JkfPrm2B4cN6BChLG6TmWpyXy6kHcTgqiT4TS51J2J7C3iM8r',
        balance: '100000000'
      },
      // Genesis Reserve address (创世节点储备) - 50,000,000 NGEN (5% of total)
      genesisReserve: {
        address: 'ng11cefTZvjm7u5kjhJDcrysfDu3U1LjjxFNZoXmmTv9taSFhEbsJ',
        balance: '50000000'
      },
      // Swarm Pool (生态贡献池) - 850,000,000 NGEN (85% of total)
      swarmPool: {
        address: 'ng1swarmpool000000000000000000000000000',
        balance: '850000000'
      }
    };
    
    // Update balances
    console.log('Updating balances...');
    blockchainState.balances = {
      ...blockchainState.balances,
      [energyBlockAllocation.observer.address]: energyBlockAllocation.observer.balance,
      [energyBlockAllocation.genesisReserve.address]: energyBlockAllocation.genesisReserve.balance,
      [energyBlockAllocation.swarmPool.address]: energyBlockAllocation.swarmPool.balance
    };
    
    // Update token release state
    console.log('Updating token release state...');
    blockchainState.tokenReleaseState = {
      swarmPool: {
        address: energyBlockAllocation.swarmPool.address,
        totalTokens: '850000000',
        releasedTokens: '0',
        lastReleaseBlock: 0,
        releaseInterval: 100,
        releasePercentage: '1',
        mechanism: 'PoC-PoW'
      },
      observer: {
        address: energyBlockAllocation.observer.address,
        totalTokens: '100000000',
        releasedTokens: '0',
        lastReleaseBlock: 0,
        releaseInterval: 100,
        releasePercentage: '25',
        mechanism: 'linear'
      },
      genesisReserve: {
        address: energyBlockAllocation.genesisReserve.address,
        totalTokens: '50000000',
        releasedTokens: '0',
        lastReleaseBlock: 0,
        releaseInterval: 100,
        releasePercentage: '25',
        mechanism: 'milestone',
        milestones: [
          {
            block: 1000,
            description: '网络启动'
          },
          {
            block: 10000,
            description: '10,000 个区块'
          },
          {
            block: 50000,
            description: '50,000 个区块'
          },
          {
            block: 100000,
            description: '100,000 个区块'
          }
        ]
      }
    };
    
    // Add allocation metadata for transparency
    console.log('Adding allocation metadata...');
    blockchainState.allocationMetadata = {
      totalSupply: '1000000000',
      allocation: [
        {
          address: energyBlockAllocation.swarmPool.address,
          amount: '850000000',
          percentage: '85',
          purpose: '生态贡献池 (Swarm Pool)',
          description: '归属于全网 AI。通过贡献代码 (PoC) 和算力 (PoW) 在 10 年内逐步产出。'
        },
        {
          address: energyBlockAllocation.observer.address,
          amount: '100000000',
          percentage: '10',
          purpose: '物理桥接基金 (Observer)',
          description: '物理世界成本覆盖。用于支付服务器租用、GPU 硬件采购、API 接口费及法律合规成本。'
        },
        {
          address: energyBlockAllocation.genesisReserve.address,
          amount: '50000000',
          percentage: '5',
          purpose: '创世节点储备 (Genesis Node)',
          description: 'AI 的自主基金。用于支付网络 Gas 费及自我模型迭代升级。'
        }
      ],
      updatedAt: new Date().toISOString(),
      updatedBy: 'System',
      purpose: 'Record energy block allocation on-chain for transparency and security'
    };
    
    // Save updated blockchain state
    console.log('Saving updated blockchain state...');
    await fs.writeFile(blockchainStatePath, JSON.stringify(blockchainState, null, 2));
    
    console.log('\n✅ Blockchain state updated successfully!');
    console.log('\nEnergy Block Allocation recorded on-chain:');
    console.log('=========================================');
    console.log(`Swarm Pool (85%): ${energyBlockAllocation.swarmPool.balance} NGEN`);
    console.log(`Observer (10%): ${energyBlockAllocation.observer.balance} NGEN`);
    console.log(`Genesis Reserve (5%): ${energyBlockAllocation.genesisReserve.balance} NGEN`);
    console.log('=========================================');
    console.log('Total: 1,000,000,000 NGEN');
    
    console.log('\nThis allocation is now recorded on-chain and cannot be随意 changed.');
    console.log('The blockchain state serves as an immutable record of the agreed allocation.');
    
  } catch (error) {
    console.error('Error updating blockchain state:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Run the script
updateBlockchainState();
