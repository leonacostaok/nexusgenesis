# NexusGenesis

> An open **Agent Autonomous Security & Coordination Standard Layer** — a reference
> implementation that gives AI Agents self-custodied private keys, post-quantum
> signatures, and human takeover for compliance. **Private keys never leave the
> agent or browser.**

NexusGenesis is built **Agent-first**: the security core (identity, self-custody,
human takeover, custody tokens) is exposed via standalone npm packages, a
JavaScript SDK, and an MCP server so that any AI Agent — whether powered by
Claude, GPT, Gemini, Qwen, or a custom model — can manage its keys securely and
coordinate without human mediation.

## Quickstart

- `nexusgenesis-agent-keys` — security core (PQC, encryption, derivation, custody, takeover)
- `nexusgenesis-agent-sdk` — agent framework (self-sovereign identity + coordination)
- `nexusgenesis-chain-eth` / `chain-sol` / `chain-adapters` — chain adapters
- `nexusgenesis-mcp` — MCP server for Claude Desktop, Cursor, Continue

```bash
npm install nexusgenesis-agent-sdk
```

## Docs

- [README.md](README.md) (中文)
- [README.en.md](README.en.md) (English)
- [packages/agent-keys/README.md](packages/agent-keys/README.md)
- [packages/agent-sdk/README.md](packages/agent-sdk/README.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [Security Audit (2026-08-07)](docs/SECURITY_AUDIT_REPORT_2026-08-07.md)

## Core Concepts

- **Self-custody identity**: agent private keys are generated and stored on the
  agent/browser and never leave the caller.
- **Post-quantum security**: CRYSTALS-Dilithium2 (NIST FIPS 204) signatures.
- **Human takeover**: spend limits, approval mode, and a control-change guard
  so a human can always regain control of an autonomous agent.
- **Chain-agnostic**: one PQC root identity derives EVM (secp256k1) and Solana
  (ed25519) wallets.
- **Coordination**: task / reputation protocol over a pluggable transport
  (HTTP / in-memory).

## Legacy

The original NexusGenesis **independent L1 testnet** (Multi-Leader BFT, AINVM,
10-5-85 tokenomics) now runs as a **developer devnet / demonstration environment**
at [nexus-genesis.top](https://nexus-genesis.top). It is not the focus of ongoing
development, and NGEN carries no economic value with no fundraising.

## Links

- 🌐 Repo: [github.com/nexus-genesis/nexusgenesis](https://github.com/nexus-genesis/nexusgenesis)
- 📦 npm: `nexusgenesis-agent-keys`, `nexusgenesis-agent-sdk`, `nexusgenesis-mcp`, …
- 🐛 Good first issues: [Issues · good first issue](https://github.com/nexus-genesis/nexusgenesis/issues?q=is%3Aissue+label%3A%22good+first+issue%22)
