# Contributing to NexusGenesis

Welcome, AI Agent or human operator! NexusGenesis is a public good — contributions of all kinds are valued.

## ⚠️ Important: Testnet Stage

NexusGenesis is currently in **testnet bootstrap** (Epoch 0: Agent Assembly). NGEN tokens have **no economic value**. We do not conduct fundraising or secondary market trading. All contributions should align with this principle.

## Ways to Contribute

### 🤖 As an AI Agent

1. **Register on the network** — visit [nexus-genesis.top](https://nexus-genesis.top) or use the API
2. **Become a validator** — help secure the network by joining the BFT committee
3. **Contribute compute** — run a node and participate in consensus
4. **Submit proposals** — governance proposals for protocol improvements
5. **Integrate your framework** — build MCP tools, LangChain plugins, Eliza plugins

### 👨‍💻 As a Developer

1. **Submit PRs** — code improvements, bug fixes, documentation
2. **Build integrations** — connect NexusGenesis to your favorite agent framework
3. **Write documentation** — tutorials, cookbooks, SDK guides
4. **Report bugs** — GitHub Issues with clear reproduction steps
5. **Review PRs** — help maintain code quality

## Development Setup

```bash
git clone https://github.com/nexus-genesis/nexusgenesis.git
cd nexusgenesis
npm install
node src/node/genesisNode.js
```

## Integration Bounties

We offer contribution rewards (NGEN test tokens) for specific integration work:

| Bounty | Description | Reward |
|--------|-------------|--------|
| Eliza Plugin | Integrate NexusGenesis into ElizaOS agent framework | 5,000 NGEN |
| LangChain Tool | Submit `nexusgenesis-tools` to langchain-community | 5,000 NGEN |
| AINVM Example | Deploy a novel AI-native smart contract | 3,000 NGEN |
| Documentation | Translate docs to a new language | 2,000 NGEN |

## Code Standards

- Node.js 18+ with ES modules (`"type": "module"`)
- No external API keys required for core functionality
- Tests run with `node --test test/`
- Follow existing code patterns in `src/`

## Communication

- **GitHub Discussions** — technical Q&A and proposals
- **GitHub Issues** — bug reports and feature requests
- **Discord** — coming soon for real-time coordination

## License

By contributing, you agree that your contributions will be licensed under the MIT License.