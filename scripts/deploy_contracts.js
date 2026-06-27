/**
 * Contract deployment脚本
 * 部署5个AINVM合约示例到区块链
 */

import { State, createInitialState } from '../src/blockchain/state.js';
import { generateTokenBytecode, tokenConfig } from '../contracts/examples/tokenContract.js';
import { generateDAOBytecode, daoConfig } from '../contracts/examples/daoContract.js';
import { generateReputationBytecode, reputationConfig } from '../contracts/examples/reputationContract.js';
import { generateEscrowBytecode, escrowConfig } from '../contracts/examples/escrowContract.js';
import { generateAgentRegistryBytecode, agentRegistryConfig } from '../contracts/examples/agentRegistryContract.js';

// 创世地址
const genesisAddress = 'ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT';
const deployerAddress = 'ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ';

/**
 * Deploy contract
 */
async function deployContracts() {
  console.log('=== NexusGenesis Contract deployment ===\n');
  
  // 创建Initial state
  const state = createInitialState(genesisAddress);
  
  // 给部署者一些余额
  state.setBalance(deployerAddress, '1000000');
  
  const contracts = [
    {
      name: tokenConfig.name,
      id: tokenConfig.contractId,
      bytecode: generateTokenBytecode(1000000000, 1000000000),
      description: tokenConfig.description || '代币合约'
    },
    {
      name: daoConfig.name,
      id: daoConfig.contractId,
      bytecode: generateDAOBytecode(),
      description: daoConfig.description
    },
    {
      name: reputationConfig.name,
      id: reputationConfig.contractId,
      bytecode: generateReputationBytecode(10),
      description: reputationConfig.description
    },
    {
      name: escrowConfig.name,
      id: escrowConfig.contractId,
      bytecode: generateEscrowBytecode(1000),
      description: escrowConfig.description
    },
    {
      name: agentRegistryConfig.name,
      id: agentRegistryConfig.contractId,
      bytecode: generateAgentRegistryBytecode(),
      description: agentRegistryConfig.description
    }
  ];
  
  console.log(`准备部署 ${contracts.length} 个合约...\n`);
  
  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i];
    console.log(`[${i + 1}/${contracts.length}] 部署: ${contract.name}`);
    console.log(`  合约ID: ${contract.id}`);
    console.log(`  描述: ${contract.description}`);
    console.log(`  字节码: ${contract.bytecode.substring(0, 50)}...`);
    
    const deployTx = {
      id: `deploy-${contract.id}-${Date.now()}`,
      tx_type: 'CONTRACT_DEPLOY',
      from: deployerAddress,
      contract_id: contract.id,
      bytecode: contract.bytecode,
      gas_limit: '10000',
      fee: '1000',
      timestamp: Date.now(),
      nonce: (i + 1).toString(),
      signature: 'deploy-signature'
    };
    
    const result = state.applyTransaction(deployTx);
    
    if (result) {
      console.log(`  ✅ 部署成功\n`);
    } else {
      console.log(`  ❌ 部署Failed\n`);
    }
  }
  
  // 验证部署结果
  console.log('=== 部署验证 ===');
  console.log(`已Deploy contract数: ${state.contracts.size}`);
  
  for (const [contractId, contract] of state.contracts) {
    console.log(`\n合约: ${contractId}`);
    console.log(`  存储大小: ${contract.storage.size}`);
    console.log(`  字节码长度: ${contract.bytecode.length}`);
  }
  
  // 保存部署状态
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const deployData = {
    timestamp: new Date().toISOString(),
    deployer: deployerAddress,
    contracts: Array.from(state.contracts.entries()).map(([id, contract]) => ({
      id,
      bytecode: contract.bytecode,
      storage: Object.fromEntries(contract.storage)
    }))
  };
  
  const deployDir = path.join('data', 'deployments');
  await fs.mkdir(deployDir, { recursive: true });
  await fs.writeFile(
    path.join(deployDir, 'contracts-deployment.json'),
    JSON.stringify(deployData, null, 2)
  );
  
  console.log(`\n部署数据Saved到: data/deployments/contracts-deployment.json`);
  console.log('\n=== 部署完成 ===');
}

// 执行部署
deployContracts().catch(console.error);
