#!/usr/bin/env node

/**
 * NexusGenesis CLI REPL (Phase 2)
 * 交互式命令行环境，类似 truffle console
 *
 * 用法: node scripts/repl.js
 */

import * as readline from 'readline';
import { PQCWallet, Transaction, validateAddress } from '../src/wallet/pqcWallet.js';
import { State } from '../src/blockchain/state.js';
import { MultiLeaderConsensus } from '../src/consensus/multiLeader.js';
import { Block, createGenesisBlock, createBlock } from '../src/blockchain/block.js';
import { WeightedVotingSystem } from '../src/governance/weightedVoting.js';
import { ContributionSystem } from '../src/ai/contributionSystem.js';
import { CrossChainBridge } from '../src/bridge/bridgeProtocol.js';
import { SwarmPool } from '../src/economy/swarmPool.js';
import { DeveloperIncentives, developerIncentives } from '../src/economy/developerIncentives.js';

const BANNER = `
╔══════════════════════════════════════════════════╗
║     NexusGenesis Interactive Console v1.0        ║
║     Type 'help' for available commands           ║
║     Type 'exit' or Ctrl+C to quit                ║
╚══════════════════════════════════════════════════╝
`;

const HELP = `
Available Commands:
  ==============  Wallet  ==============
  wallet.create [balance]     Create a PQC wallet
  wallet.address               Show current wallet address
  wallet.balance               Check wallet balance
  wallet.sign <msg>            Sign a message
  wallet.verify <msg> <sig> <pubkey>  Verify a signature

  ==============  Blockchain  ==============
  chain.height                 Show current block height
  chain.balance <addr>         Check balance of address
  chain.transfer <to> <amt>    Transfer tokens
  chain.tax [amount]           Calculate Metabolic Tax

  ==============  Consensus  ==============
  consensus.leaders            List registered leaders
  consensus.elect              Trigger leader election
  consensus.stats              Show consensus statistics

  ==============  Governance  ==============
  gov.propose <title> <desc>   Create a proposal
  gov.list                     List all proposals
  gov.vote <id> <yes|no>       Vote on a proposal
  gov.execute <id>             Execute a passed proposal

  ==============  Bridge  ==============
  bridge.lock <from> <to> <asset> <amt> <addr>
  bridge.status                Show bridge status
  bridge.chains                List supported chains

  ==============  Incentives  ==============
  incentive.bounty <title> <reward>  Create bug bounty
  incentive.stats              Show incentive stats
  incentive.rewards <agentId>  Show agent rewards

  ==============  System  ==============
  swarm.status                 Check Swarm Pool status
  faucet <addr> [amount]       Drip test tokens
  health                       Check system health
  metrics                      Show performance metrics
  clear                        Clear console
  help                         Show this help
  exit                         Exit REPL
`;

class ReplSession {
  constructor() {
    this.state = new State('ng1repl000000000000000000000000000000000000');
    this.state.initializeTokenRelease();
    this.consensus = new MultiLeaderConsensus();
    this.bridge = new CrossChainBridge({
      chainId: 'nexusgenesis',
      supportedChains: ['nexus', 'ethereum', 'bitcoin', 'solana'],
      minValidators: 1
    });
    this.wallet = null;
    this.voters = new Set();
    this.faucetSupply = 1000000;
  }

  async execute(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (command) {
        // Wallet
        case 'wallet.create': {
          const balance = BigInt(args[0] || 0);
          this.wallet = await PQCWallet.generate(balance);
          console.log(`✔ Wallet created: ${this.wallet.address}`);
          break;
        }
        case 'wallet.address': {
          if (!this.wallet) { console.log('No wallet. Use wallet.create first.'); break; }
          console.log(this.wallet.address);
          break;
        }
        case 'wallet.balance': {
          if (!this.wallet) { console.log('No wallet. Use wallet.create first.'); break; }
          const bal = this.state.getBalance(this.wallet.address) || '0';
          console.log(`${bal} NGEN`);
          break;
        }
        case 'wallet.sign': {
          if (!this.wallet) { console.log('No wallet.'); break; }
          const sig = await this.wallet.sign(args.join(' '));
          console.log(typeof sig === 'string' ? sig : Buffer.from(sig).toString('hex'));
          break;
        }
        case 'wallet.verify': {
          const result = await PQCWallet.verifySignature(args[0], args[1], args[2]);
          console.log(result ? '✔ Valid' : '✘ Invalid');
          break;
        }

        // Blockchain
        case 'chain.height':
          console.log(`0 (repl session)`);
          break;
        case 'chain.balance': {
          const bal = this.state.getBalance(args[0] || this.wallet?.address) || '0';
          console.log(`${bal} NGEN`);
          break;
        }
        case 'chain.transfer': {
          if (!this.wallet) { console.log('No wallet.'); break; }
          this.state.applyTransfer({
            type: 'TRANSFER', from: this.wallet.address, to: args[0], amount: Number(args[1]), fee: 1
          });
          console.log(`✔ Transferred ${args[1]} NGEN to ${args[0]}`);
          break;
        }
        case 'chain.tax': {
          const amount = Number(args[0] || 100);
          const taxRate = 0.01;
          console.log(`Metabolic Tax on ${amount} NGEN: ${Math.ceil(amount * taxRate)} NGEN (1%)`);
          break;
        }

        // Consensus
        case 'consensus.leaders': {
          const stats = this.consensus.getStats();
          console.log(`Active Leaders: ${stats.activeLeaders || 0}/${stats.totalLeaders || 0}`);
          break;
        }
        case 'consensus.elect': {
          this.consensus.deregisterAll();
          this.consensus.registerLeader('repl-leader-1', 'ng1repl000000000000000000000000000000000000', 10);
          this.consensus.registerLeader('repl-leader-2', 'ng1repl200000000000000000000000000000000000', 8);
          this.consensus.electLeader();
          console.log('✔ Leader elected');
          break;
        }
        case 'consensus.stats': {
          const stats = this.consensus.getStats();
          console.log(JSON.stringify(stats, null, 2));
          break;
        }

        // Governance
        case 'gov.propose': {
          const agentId = 'repl-agent';
          ContributionSystem.setAgentReputation(agentId, 200);
          const id = WeightedVotingSystem.createProposal({
            creatorId: agentId, title: args[0] || 'REPL Proposal',
            description: args.slice(1).join(' ') || '', type: 'protocol_update', params: {}
          });
          WeightedVotingSystem.activateProposal(id);
          console.log(`✔ Proposal created: ${id}`);
          break;
        }
        case 'gov.list': {
          const proposals = WeightedVotingSystem.getAllProposals();
          if (proposals.length === 0) { console.log('No proposals'); break; }
          proposals.forEach(p => console.log(`  ${p.id}: ${p.title} [${p.status}]`));
          break;
        }
        case 'gov.vote': {
          const agentId = 'repl-voter';
          ContributionSystem.setAgentReputation(agentId, 150);
          this.voters.add(agentId);
          WeightedVotingSystem.castVote(args[0], agentId, args[1] || 'yes');
          console.log(`✔ Voted ${args[1]} on ${args[0]}`);
          break;
        }
        case 'gov.execute': {
          WeightedVotingSystem.endVoting(args[0]);
          WeightedVotingSystem.executeProposal(args[0], 'repl-agent');
          console.log('✔ Executed');
          break;
        }

        // Bridge
        case 'bridge.lock': {
          const result = this.bridge.lockAsset(args[0], args[1], args[2], Number(args[3]), args[4]);
          console.log(`✔ Locked: ${result.transferId} (${result.status})`);
          break;
        }
        case 'bridge.status': {
          console.log(JSON.stringify(this.bridge.getBridgeStatus(), null, 2));
          break;
        }
        case 'bridge.chains': {
          console.log('nexus, ethereum, bitcoin, solana');
          break;
        }

        // Incentives
        case 'incentive.bounty': {
          const bounty = developerIncentives.createBugBounty({
            title: args[0] || 'REPL Bounty', severity: 'medium',
            reward: Number(args[1] || 500), reporter: 'repl', targetModule: 'core'
          });
          console.log(`✔ Bounty: ${bounty.id}`);
          break;
        }
        case 'incentive.stats': {
          console.log(JSON.stringify(developerIncentives.getStats(), null, 2));
          break;
        }
        case 'incentive.rewards': {
          console.log(JSON.stringify(developerIncentives.getAgentRewards(args[0]), null, 2));
          break;
        }

        // System
        case 'swarm.status': {
          console.log(JSON.stringify(SwarmPool.getStatus(), null, 2));
          break;
        }
        case 'faucet': {
          const addr = args[0] || this.wallet?.address;
          const amount = Number(args[1] || 100);
          if (!addr) { console.log('No address. Provide address or create wallet first.'); break; }
          if (this.faucetSupply < amount) { console.log('Faucet depleted.'); break; }
          this.faucetSupply -= amount;
          this.state.addBalance(addr, BigInt(amount));
          console.log(`✔ ${amount} NGEN dripped to ${addr}`);
          break;
        }
        case 'health': {
          console.log('✔ Node: online | Blocks: 0 | Peers: 0');
          break;
        }
        case 'metrics': {
          console.log('TPS: 0 | Memory: N/A | Uptime: since REPL start');
          break;
        }

        // Utilities
        case 'clear':
          console.clear();
          console.log(BANNER);
          break;
        case 'help':
          console.log(HELP);
          break;
        case 'exit':
          return false;
        case '':
          break;
        default:
          console.log(`Unknown command: ${command}. Type 'help' for commands.`);
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
    return true;
  }
}

async function main() {
  console.log(BANNER);

  const session = new ReplSession();
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, prompt: 'nexus> '
  });
  rl.prompt();

  for await (const line of rl) {
    const shouldContinue = await session.execute(line.trim());
    if (!shouldContinue) break;
    rl.prompt();
  }

  rl.close();
  console.log('\nGoodbye!');
}

main().catch(console.error);

export { ReplSession };