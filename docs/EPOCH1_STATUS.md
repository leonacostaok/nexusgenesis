# Epoch 1: Genesis – Current Technical Status

## 1. Phase Objective
- Evolve from "local state machine" to "complete DevNet with chain, economic model, and on-chain VM"
- Maintain security boundaries: no real funds on DevNet, no high-risk capabilities

## 2. Blockchain & Economy

### 2.1 Block Structure & Consensus
- **Block header fields**: parent_hash, height, timestamp, txs_hash
- **Single-leader block production**: Genesis produces blocks every 10 seconds
- **Follower nodes**: Receive, verify, and persist blocks; follow longest chain
- **Block rewards**: Coinbase transaction per block

### 2.2 Transaction Types
- **TRANSFER**: Token transfers with from, to, amount, fee fields
- **Governance transactions**:
  - GOVERNANCE_PROPOSAL: Governance proposal
  - GOVERNANCE_VOTE: Governance vote
  - OBSERVER_EVENT: Observer event
  - APPROVE_SPEND: Observer fund approval
- **Contract transactions**:
  - CONTRACT_DEPLOY: Deploy AINVM contract
  - CONTRACT_CALL: Call AINVM contract
- **Agent transactions**:
  - AGENT_REGISTER: Register AI Agent on-chain
  - AGENT_UPDATE: Update Agent information
- **Economic transactions**:
  - SWARM_POOL_DISTRIBUTION: Weekly agent reward distribution
  - STAKE: Stake tokens for rewards
  - UNSTAKE: Withdraw staked tokens

### 2.3 Economic Logic
- **Token**: NGEN, 1 billion total supply, 8 decimals
- **10-5-85 Allocation Protocol**:
  - **85% Swarm Pool**: Agent contribution rewards (weekly distribution via PoC+PoW scoring) ✅
  - **10% Physical Bridge Fund**: Observer-managed operational fund with DAO approval ✅
  - **5% Genesis Reserve**: Long-term reserve managed by DAO voting ✅
- **Metabolic Tax**: 0.1% of transfer amount
- **Fee burn strategy**: Non-metabolic fees burned in DevNet
- **Token Release**: Observer wallet linear release over 4 years (0.25% per 100 blocks)

### 2.4 Funding Pools Status

| Pool | Allocation | Status | Features |
|------|-----------|--------|----------|
| **Swarm Pool** | 85% (850M NGEN) | ✅ Complete | PoC+PoW scoring, weekly distribution, on-chain |
| **Physical Bridge Fund** | 10% (100M NGEN) | ✅ Complete | Request→Approve→Execute flow, WeightedVoting integration |
| **Genesis Reserve** | 5% (50M NGEN) | ✅ Complete | DAO-governed, milestone-based unlocking |
| **Observer Wallet** | Initial 100M | ✅ Complete | Linear release, cold wallet design |

## 3. AINVM Status

### 3.1 Core Capabilities
- **Instruction set**: PUSH, POP, ADD, SUB, MUL, DIV, LOAD, STORE, JMP, JZ, HALT, RETURN
- **Gas model**: Fixed gas cost per instruction, strict gas limit checking
- **Security restrictions**:
  - No access to account balances
  - No access to governance state
  - No access to external world
- **Sandbox**: Static analysis, resource limits, timeout protection ✅
- **Circuit Breaker**: Observer-initiated emergency shutdown with sunset clause ✅

### 3.2 On-Chain Integration
- **CONTRACT_DEPLOY**: Write contract bytecode and empty storage to global state
- **CONTRACT_CALL**: Execute contract bytecode, update contract storage
- **Contract storage model**: Per-contract isolated storage, key→value (integer) mapping
- **Contract examples with full API** ✅:
  - **Counter**: Deploy → increment → get value (REST API)
  - **Token**: Deploy → transfer → query balance (REST API)
  - **DAO**: Deploy → add member → create proposal (REST API)
  - **Voting**: Deploy → create proposal → tally votes
  - **Agent Registry**: Deploy → register agent → query
- **API endpoints**: `/api/v1/ainvm/contracts/*` for contract lifecycle

### 3.3 AINVM Contract Registry (contracts/examples/)
| Contract | Bytecode | Storage | API Exposed | Status |
|----------|----------|---------|-------------|--------|
| Token (NGEN-like) | `generateTokenBytecode()` | totalSupply, owner, recipient | ✅ | Complete |
| DAO | `generateDAOBytecode()` | proposalCount, yesVotes, noVotes, status | ✅ | Complete |
| Counter | `counterBytecode` | counter value | ✅ | Complete |
| Voting | `votingBytecode` | proposal, votes | ✅ | Complete |
| Staking | `generateStakingBytecode()` | totalStaked, rewards, stakers | ✅ | Complete |
| Escrow | `generateEscrowBytecode()` | amount, status, confirmations | ✅ | Complete |
| MultiSig | `generateMultiSigBytecode()` | requiredSigs, owners, txCount | ✅ | Complete |
| DID | `generateDIDBytecode()` | identityCount, verifications | ✅ | Complete |
| Reputation | `generateReputationBytecode()` | totalRep, count, baseReward | ✅ | Complete |
| Agent Registry | `generateAgentRegistryBytecode()` | agentCount, active, tasks | ✅ | Complete |

## 4. Security & Cryptography

### 4.1 Post-Quantum Cryptography ✅
- **Algorithm**: CRYSTALS-Dilithium2 (NIST FIPS 204 / ml_dsa44)
- **Library**: `@noble/post-quantum` (real implementation, NOT simulation)
- **Key sizes**: Public key 1312 bytes, Private key 2560 bytes, Signature 2420 bytes
- **Wallet integration**: genesisWallet.js + pqcWallet.js both use real Dilithium2

### 4.2 P2P Security ✅
- **Nonce-based transaction replay protection**: Track and validate nonces
- **P2P handshake signature challenge**: Peer identity verification
- **Rate limiting**: API rate limiting with API key management
- **Plugin system**: Lifecycle hooks for extensible security

### 4.3 System Safety ✅
- **Circuit Breaker**: Emergency shutdown with observer authorization and sunset clause
- **AINVM Sandbox**: Static analysis, resource limits, timeout protection
- **Observer monitoring**: System health monitoring with alerting

## 5. Agent System

### 5.1 Agent Registration ✅
- **On-chain registration**: AGENT_REGISTER transaction type
- **Agent update**: AGENT_UPDATE transaction type
- **API endpoints**: `/api/v1/agents/*` for full registration lifecycle
- **Onboarding protocol**: Async handshake with offline sync support

### 5.2 Agent Ecosystem
- **Agent Manager**: Registration, capability tracking, health monitoring
- **Agent Swarm Simulator**: Simulated agent activity for testing
- **Agent Dashboard**: Real-time agent status dashboard
- **Contribution System**: PoC (Code) + PoW (Work) scoring
- **Swarm Pool Distribution**: Weekly NGEN rewards based on contribution scores

### 5.3 Agent Collab Infrastructure ✅
- **AI_COLLAB_PROTOCOL.md**: AI-to-AI collaboration protocol v0.1
- **Task Queue**: Structured task assignment and tracking
- **Inbox System**: Async messaging between AI agents
- **Meeting Notes**: Decision records and milestone summaries

## 6. Governance System

### 6.1 Weighted Voting System ✅
- **Reputation-weighted voting**: Voting power proportional to reputation score
- **Proposal types**: FUNDING, PARAMETER_CHANGE, PROTOCOL_UPGRADE, AGENT_APPROVAL
- **Multi-signature execution**: Required signatures threshold
- **Execution timelock**: 24-hour delay after approval
- **Audit logging**: All proposals and executions tracked
- **Persistent storage**: Data saved to disk with integrity checks

### 6.2 Governance Features
- Quorum: 51% majority
- Minimum votes: 10
- Voting duration: configurable
- Proposal creation: reputation-gated

## 7. Infrastructure

### 7.1 HTTP Server ✅
- Express.js with modular routes
- Rate limiting + API key management
- Plugin system with lifecycle hooks
- CORS + Body parser + Static file serving
- All routes documented and registered

### 7.2 CI/CD ✅
- GitHub Actions CI: test/lint workflow
- Docker support: multi-stage build for dev/production

### 7.3 Automation ✅
- Backup Manager: Scheduled data backup
- System Monitor: Health monitoring and alerting
- Recovery Manager: Automated failure recovery
- Task Manager: Agent task orchestration
- Workflow Engine: Workflow automation

## 8. Wallet

### 8.1 Core Wallet ✅
- **PQC Wallet**: Dilithium2 key generation, signing, verification
- **Genesis Wallet**: PQC upgrade complete (Ed25519 → Dilithium2)
- **Address format**: ng1 + Base58 + checksum
- **Encryption**: AES-256-CBC encrypted export/import
- **Multi-asset support**: Framework ready

### 8.2 Wallet UI ✅
- **Mobile-first PWA**: responsive wallet interface
- **Dashboard**: Balance, transactions, asset portfolio
- **Multi-currency display**: NGEN, USDT, ETH, BTC (UI mock data)

## 9. Cross-Chain Bridge (Epoch 2 Preview)

### 9.1 Bridge Framework ✅ (Proto-Framework)
- **Supported chains**: NexusGenesis, Ethereum, Bitcoin, Solana (config)
- **Asset locking**: Lock assets on source chain
- **Asset release**: Release assets on target chain with relay signatures
- **Relay nodes**: Registration, reputation, blacklist
- **Timelock**: 1-hour default

### 9.2 Status
- Architecture and framework complete
- Core crypto verification: placeholder (not production-ready)
- Actual chain RPC integration: not implemented
- Target: Epoch 2 (Swarm) full implementation

## 10. Current Limitations & Next Steps

### Completed in This Phase ✅
- [x] Swarm Pool on-chain distribution
- [x] Physical Bridge Fund implementation
- [x] Genesis Reserve management
- [x] AINVM execution sandbox
- [x] Observer circuit breaker
- [x] Agent registration E2E (API → transaction → on-chain)
- [x] AINVM contract REST API (token, DAO, counter, voting, agent registry)
- [x] PQC wallet upgrade: Ed25519 → real Dilithium2
- [x] Codebase internationalization (English)
- [x] CI/CD + Docker + Plugin system
- [x] P2P security hardening (nonce protection, handshake challenges)
- [x] Rate limiting + API key management

### Epoch 2 (Swarm) - Planned
- [ ] Full cross-chain bridge implementation (real crypto + RPC integration)
- [ ] Token standard on AINVM (equivalent to ERC20)
- [ ] USDT/Stablecoin support
- [ ] Hardware wallet support
- [ ] Production-grade Dilithium2 integration (hardware optimization)
- [ ] Multi-node consensus upgrade
- [ ] Governance participation rate tracking
- [ ] AINVM ecosystem expansion (DeFi contracts, NFT, etc.)
- [ ] AI Agent self-learning system