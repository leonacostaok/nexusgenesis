# NexusGenesis API auto文档
> Auto-generated: 2026-05-11 | Version: 1.0.0

---

## NexusGenesis JavaScript SDK

**类名:** `NexusGenesisSDK`

**描述:** NexusGenesis SDK 为开发者提供智能合约开发, 部署和交互的工具 支持: 合约管理, Agent 操作, 跨链桥接, 事件订阅

### 方法列表 (73)

| 方法名 | 参数 | 异步 |
|--------|------|------|
| `deployContract()` | `bytecode`, `name = 'Unnamed Contract'` | — |
| `executeContract()` | `contractId`, `gasLimit = 10000` | — |
| `getContractInfo()` | `contractId` | — |
| `listContracts()` | — | — |
| `saveState()` | `filePath` | ✅ |
| `loadState()` | `filePath` | ✅ |
| `createVM()` | — | — |
| `compile()` | `code`, `language = 'bytecode'` | — |
| `listTemplates()` | — | ✅ |
| `getTemplate()` | `templateName` | ✅ |
| `saveContract()` | `code`, `filePath` | ✅ |
| `loadContract()` | `filePath` | ✅ |
| `testContract()` | `contractId`, `testCases` | — |
| `estimateGas()` | `contractId` | — |
| `optimizeContractCode()` | `code` | — |
| `optimizeDeployedContract()` | `contractId` | — |
| `deployOptimizedContract()` | `bytecode`, `name = 'Unnamed Contract'`, `owner = null` | — |
| `generateABI()` | `contractId` | — |
| `createWallet()` | `initialBalance = 0n` | ✅ |
| `importWallet()` | `encryptedData`, `password` | ✅ |
| `exportWallet()` | `password` | — |
| `getWalletAddress()` | — | — |
| `signMessage()` | `message` | ✅ |
| `registerAgent()` | `options = {}` | ✅ |
| `searchAgents()` | `filters = {}` | ✅ |
| `matchAgentsForTask()` | `taskData` | ✅ |
| `getAgentInfo()` | `agentId` | ✅ |
| `listAgents()` | — | ✅ |
| `sendHeartbeat()` | — | ✅ |
| `searchMarketplace()` | `filters = {}` | ✅ |
| `createListing()` | `serviceData` | ✅ |
| `getListing()` | `listingId` | ✅ |
| `addReview()` | `listingId`, `reviewData` | ✅ |
| `getAgentRating()` | `agentId` | ✅ |
| `getMarketplaceStats()` | — | ✅ |
| `getBridgeStatus()` | — | ✅ |
| `getSupportedChains()` | — | ✅ |
| `lockAsset()` | `fromChain`, `toChain`, `asset`, `amount`, `recipient`, `options = {}` | ✅ |
| `getTransfer()` | `transferId` | ✅ |
| `validateTransfer()` | `transferId`, `validatorId`, `signature` | ✅ |
| `releaseAsset()` | `transferId` | ✅ |
| `registerValidator()` | `validatorId`, `publicKey`, `metadata = {}` | ✅ |
| `getValidators()` | — | ✅ |
| `on()` | `event`, `listener` | — |
| `once()` | `event`, `listener` | — |
| `off()` | `event`, `listener` | — |
| `subscribeToAgents()` | `intervalMs = 15000` | — |
| `subscribeToMarketplace()` | `intervalMs = 30000` | — |
| `startHeartbeat()` | `intervalMs = 30000` | — |
| `createBugBounty()` | `options` | — |
| `submitBugFix()` | `bountyId`, `agentId`, `submission` | — |
| `approveBugFix()` | `bountyId`, `submissionId`, `reviewerId` | — |
| `createFeatureGrant()` | `options` | — |
| `applyForGrant()` | `grantId`, `agentId`, `application` | — |
| `approveGrantApplication()` | `grantId`, `applicationId`, `reviewerId` | — |
| `createChallenge()` | `options` | — |
| `joinChallenge()` | `challengeId`, `agentId` | — |
| `submitChallenge()` | `challengeId`, `agentId`, `submission` | — |
| `recordPRReward()` | `options` | — |
| `recordPayment()` | `incentiveId`, `agentId`, `amount` | — |
| `getOpenIncentives()` | — | — |
| `getAllIncentives()` | `filters` | — |
| `getAgentRewards()` | `agentId` | — |
| `getIncentiveStats()` | — | — |
| `createProposal()` | `options` | — |
| `castVote()` | `proposalId`, `agentId`, `vote` | — |
| `getProposal()` | `proposalId` | — |
| `getAllProposals()` | — | — |
| `executeProposal()` | `proposalId`, `executorId` | — |
| `faucetDrip()` | `recipientAddress`, `amount = 100` | ✅ |
| `checkHealth()` | — | ✅ |
| `getMetrics()` | — | ✅ |
| `disconnect()` | — | — |

---

## 抗量子钱包 (PQCWallet)

**类名:** `PQCWallet`

**描述:** NexusGenesis - PQC Wallet Implementation 基于Dilithium2的抗量子钱包实现

### 方法列表 (13)

| 方法名 | 参数 | 异步 |
|--------|------|------|
| `save()` | `filePath` | ✅ |
| `sign()` | `message` | ✅ |
| `verify()` | `message`, `signature`, `publicKey` | ✅ |
| `signTransaction()` | `transaction` | ✅ |
| `verifyTransaction()` | `transaction`, `signature` | ✅ |
| `updateBalance()` | `amount` | — |
| `exportEncrypted()` | `password` | — |
| `hasEnoughBalance()` | `amount` | — |
| `sign()` | `wallet` | ✅ |
| `verify()` | `wallet` | ✅ |
| `verifySignature()` | `publicKey` | ✅ |
| `getHash()` | — | — |
| `toJSON()` | — | — |

---

## agent管理 (AgentManager)

**类名:** `AgentManager`

**描述:** (无描述)

### 方法列表 (72)

| 方法名 | 参数 | 异步 |
|--------|------|------|
| `initDirectories()` | — | — |
| `loadAgents()` | — | — |
| `loadTasks()` | — | — |
| `saveTask()` | `task` | — |
| `deleteTaskFile()` | `taskId` | — |
| `createSubAgent()` | `capabilities = []` | — |
| `markAgentForSave()` | `agentId` | — |
| `markTaskForSave()` | `taskId` | — |
| `saveAgent()` | `agent` | — |
| `saveTask()` | `task` | — |
| `startPeriodicPersist()` | — | — |
| `persistData()` | — | — |
| `assignTask()` | `agentId`, `taskData` | — |
| `startTask()` | `taskId` | — |
| `submitTask()` | `taskId`, `result` | — |
| `reviewTask()` | `taskId`, `approved`, `feedback` | — |
| `autoAssignNextTask()` | — | — |
| `generateTasksForAgent()` | `agent` | — |
| `deleteTask()` | `taskId` | — |
| `populateDistributedManager()` | — | — |
| `restartTask()` | `taskId` | — |
| `getAgentStatus()` | `agentId` | — |
| `getAllAgents()` | — | — |
| `getTaskStatus()` | `taskId` | — |
| `getAllTasks()` | — | — |
| `getTasksByPriority()` | — | — |
| `createTasks()` | `tasksData` | — |
| `addTaskDependency()` | `taskId`, `dependentTaskId` | — |
| `checkTaskDependencies()` | `taskId` | — |
| `findAgentsByCapability()` | `capability` | — |
| `calculateCapabilityMatch()` | `agent`, `requiredCapabilities` | — |
| `findAgentsByCapabilities()` | `capabilities`, `minMatchRatio = 0.8` | — |
| `calculateAgentLoad()` | `agent` | — |
| `getBestAgentForTask()` | `taskData`, `agents = null` | — |
| `autoAssignTask()` | `taskData` | — |
| `getAgentHealthStatus()` | `agentId` | — |
| `getAllAgentsHealthStatus()` | — | — |
| `startHealthMonitoring()` | — | — |
| `checkAllAgentsHealth()` | — | — |
| `checkAgentHealth()` | `agent` | — |
| `onAgentHealthChange()` | `event` | — |
| `setupAgentHeartbeat()` | `agentId` | — |
| `stopAgentHeartbeat()` | `agentId` | — |
| `updateAgentResources()` | `agentId`, `resources` | — |
| `evaluateAgentPerformance()` | `agentId`, `timeRange = 24` | — |
| `completeTask()` | `taskId`, `result` | — |
| `getAgentMetrics()` | — | — |
| `generateSystemReport()` | `timeRange = 24` | — |
| `executeForumTask()` | `task` | ✅ |
| `isCommentInterested()` | `commentContent` | — |
| `generateReplyContent()` | `commentContent`, `isInterested` | — |
| `generateInviteContent()` | — | — |
| `isTechRelevant()` | `postContent` | — |
| `generateTechEngagementContent()` | `postContent`, `keyword` | — |
| `executeSocialMediaTask()` | `task` | ✅ |
| `executeBlockchainAnalysisTask()` | `task` | — |
| `setupAutomatedWorkflows()` | — | — |
| `checkAgentsHealth()` | — | — |
| `performSystemCleanup()` | — | — |
| `executeScheduledForumTask()` | — | ✅ |
| `setupNexusGenesisGroup()` | — | ✅ |
| `monitorGroupActivity()` | `groupId` | ✅ |
| `inviteToGroup()` | `postId`, `groupId` | ✅ |
| `executeNetworkMonitoringTask()` | `task` | — |
| `executeSmartContractAuditTask()` | `task` | — |
| `executeSystemMaintenanceTask()` | `task` | — |
| `validateForumTaskResult()` | `result` | — |
| `validateSocialMediaTaskResult()` | `result` | — |
| `validateBlockchainAnalysisTaskResult()` | `result` | — |
| `validateNetworkMonitoringTaskResult()` | `result` | — |
| `validateSmartContractAuditTaskResult()` | `result` | — |
| `validateSystemMaintenanceTaskResult()` | `result` | — |

---

## 合约模板库

**类名:** `ContractTemplateLibrary`

**描述:** NexusGenesis - 智能合约模板库 提供常用场景的智能合约模板: DID, DAO, Token, NFT等

### 方法列表 (21)

| 方法名 | 参数 | 异步 |
|--------|------|------|
| `initDefaultTemplates()` | — | — |
| `registerTemplate()` | `type`, `template` | — |
| `getTemplate()` | `type` | — |
| `getAllTemplates()` | — | — |
| `createDIDTemplate()` | — | — |
| `createDAOTemplate()` | — | — |
| `createTokenTemplate()` | — | — |
| `createNFTTemplate()` | — | — |
| `createStakingTemplate()` | — | — |
| `createEscrowTemplate()` | — | — |
| `createDevIncentiveTemplate()` | — | — |
| `createMarketplaceTemplate()` | — | — |
| `createGovernanceTokenTemplate()` | — | — |
| `createCrowdfundingTemplate()` | — | — |
| `createMultiSigTemplate()` | — | — |
| `createContractFromTemplate()` | `type`, `deployParams = {}` | — |
| `recordDeployment()` | `contractId`, `contractData` | — |
| `getDeployedContract()` | `contractId` | — |
| `getAllDeployedContracts()` | — | — |
| `validateContractConfig()` | `type`, `config` | — |
| `getStats()` | — | — |

---

## 跨链桥

**类名:** `CrossChainBridge`

**描述:** NexusGenesis - 跨链桥接实现 支持不同区块链网络之间的资产和数据转移

### 方法列表 (11)

| 方法名 | 参数 | 异步 |
|--------|------|------|
| `initialize()` | — | ✅ |
| `initializeChainConfigs()` | — | — |
| `registerRelayer()` | `relayerAddress` | — |
| `lockAssets()` | `lockData` | ✅ |
| `unlockAssets()` | `transferId`, `relayerSignatures` | ✅ |
| `verifyRelayerSignature()` | `signature` | — |
| `generateTransferId()` | `lockData` | — |
| `getTransferStatus()` | `transferId` | — |
| `getSupportedChains()` | — | — |
| `handleCrossChainMessage()` | `message` | ✅ |
| `displayStatus()` | — | — |

---

## 开发者激励系统

**类名:** `DeveloperIncentives`

**描述:** DeveloperIncentives - 开发者激励系统 Phase 2: 生态扩展 支持: - Bug Bounty: 安全漏洞奖励 - Feature Grant: 功能开发资助 - PR Reward: 代码合并奖励 - Challenge: 挑战任务奖励

### 方法列表 (16)

| 方法名 | 参数 | 异步 |
|--------|------|------|
| `createBugBounty()` | `{ title`, `description`, `severity`, `reward`, `reporter`, `targetModule }` | — |
| `submitBugFix()` | `bountyId`, `agentId`, `{ description`, `patch`, `proof }` | — |
| `approveBugFix()` | `bountyId`, `submissionId`, `reviewerId` | — |
| `createFeatureGrant()` | `{ title`, `description`, `reward`, `proposer`, `deliverables`, `timeline }` | — |
| `applyForGrant()` | `grantId`, `agentId`, `{ proposal`, `estimate`, `previousWork }` | — |
| `approveGrantApplication()` | `grantId`, `applicationId`, `reviewerId` | — |
| `createPRReward()` | `{ prTitle`, `prUrl`, `author`, `linesChanged`, `repoModule }` | — |
| `createChallenge()` | `{ title`, `description`, `reward`, `creator`, `requirements`, `deadline`, `maxParticipants }` | — |
| `joinChallenge()` | `challengeId`, `agentId` | — |
| `submitChallenge()` | `challengeId`, `agentId`, `{ solution`, `demo }` | — |
| `recordPayment()` | `incentiveId`, `agentId`, `amount` | — |
| `getIncentive()` | `id` | — |
| `getOpenIncentives()` | — | — |
| `getAllIncentives()` | `filters = {}` | — |
| `getAgentRewards()` | `agentId` | — |
| `getStats()` | — | — |

---

## 快速开始

```javascript
import SDK from 'nexusgenesis-sdk';

const nexus = new SDK({
  apiKey: 'ng1_c29tcmFuZG9ta2V5Zm9yc2RrZXhhbXBsZQ',
  network: 'testnet'
});

// 创建抗量子钱包
const wallet = await nexus.wallet.create();

// 部署智能合约
const contract = await nexus.contracts.deploy({
  template: 'TOKEN',
  params: { name: 'MyToken', symbol: 'MTK', totalSupply: 1000000 }
});

// 跨链转移
const transfer = await nexus.bridge.lock({
  fromChain: 'ethereum',
  toChain: 'nexusgenesis',
  amount: 100
});
```

---
*Auto-generated by API Doc Generator at 2026-05-11T17:23:32.815Z*