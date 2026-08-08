# NexusGenesis Release Report

- **Date**: 2026-08-07
- **Author**: NexusGenesis Development Team
- **Version**: v0.1.0 (Security Standard Layer initial release)

---

## 1. Release Overview

This release marks NexusGenesis's pivot from an "independent L1 blockchain" to an **Agent Autonomous Security & Coordination Standard Layer**. Core positioning: **one quantum-resistant root identity (Dilithium2), multi-chain autonomy, human takeover at any time, private keys never leave the process.**

### Technology stack
- **PQC**: Dilithium2 (NIST FIPS 204) via `@noble/post-quantum`
- **Encryption**: AES-256-GCM + PBKDF2-HMAC-SHA512 (310,000 iterations)
- **Key derivation**: HKDF (RFC 5869) + three-tier key architecture
- **Cross-chain**: ETH (secp256k1 / EIP-55) + SOL (ed25519 / base58)
- **Coordination**: chain-agnostic pluggable transport (HTTP / in-memory)

---

## 2. Newly Published Packages (production-ready)

| Package | Version | Description |
|---|---|---|
| `nexusgenesis-agent-keys` | 0.1.0 | Core key library: PQC (Dilithium2 / FIPS 204), AES-256-GCM encryption, three-tier key derivation, human takeover, custody tokens |
| `nexusgenesis-agent-sdk` | 0.1.0 | Agent framework: `keys` + `coordination` dual tracks, chain-agnostic pluggable transport |
| `nexusgenesis-chain-eth` | 0.1.0 | ETH adapter: PQC root identity → HKDF-derived secp256k1 → EIP-55 address + EIP-191 sign/verify |
| `nexusgenesis-chain-sol` | 0.1.0 | SOL adapter: same root identity → ed25519 → base58 address + sign/verify |
| `nexusgenesis-chain-adapters` | 0.1.0 | Cross-chain aggregate: one Dilithium2 root identity → nexus/eth/sol address registry |

### Verification results
- ✅ All 5 packages `npm install` + `import` pass (43 exports available)
- ✅ Full 50 tests green
- ✅ MCP end-to-end integration tests 7/7 pass
- ✅ Cross-chain demo runs end-to-end

---

## 3. Deprecated Packages (leftover)

| Old package | Version | Status | Deprecation notice |
|---|---|---|---|
| `@nexusgenesis_/agent-keys` | 0.1.0 | ⚠️ deprecated | Use `nexusgenesis-agent-keys` |
| `@nexusgenesis_/agent-sdk` | 0.1.0 | ⚠️ deprecated | Use `nexusgenesis-agent-sdk` |
| `@nexusgenesis_/chain-eth` | 0.1.0 | ⚠️ deprecated | Use `nexusgenesis-chain-eth` |
| `@nexusgenesis_/chain-sol` | 0.1.0 | ⚠️ deprecated | Use `nexusgenesis-chain-sol` |
| `@nexusgenesis_/chain-adapters` | 0.1.0 | ⚠️ deprecated | Use `nexusgenesis-chain-adapters` |

### Why they were deprecated

The old packages used the `@nexusgenesis_` (with underscore) scope, which violated npm naming conventions. This caused the registry to accept them but **metadata GET to return 404 and the packages to be uninstallable**. Since npm no longer permits package deletion, we used **deprecation notices** to direct users to the official non-scoped package names.

---

## 4. Deprecated → New Package Mapping

| Old (deprecated) | New (official) |
|---|---|
| `@nexusgenesis_/agent-keys` | `nexusgenesis-agent-keys` |
| `@nexusgenesis_/agent-sdk` | `nexusgenesis-agent-sdk` |
| `@nexusgenesis_/chain-eth` | `nexusgenesis-chain-eth` |
| `@nexusgenesis_/chain-sol` | `nexusgenesis-chain-sol` |
| `@nexusgenesis_/chain-adapters` | `nexusgenesis-chain-adapters` |

---

## 5. Quick Start

```bash
# Install the core packages
npm install nexusgenesis-agent-keys
npm install nexusgenesis-agent-sdk
npm install nexusgenesis-chain-eth
npm install nexusgenesis-chain-sol
npm install nexusgenesis-chain-adapters

# Or use the MCP Server
npx nexusgenesis-agent-mcp
```

### Usage example

```javascript
import { PQCWallet, generateKeyPair } from 'nexusgenesis-agent-keys';
import { createAgentSDK } from 'nexusgenesis-agent-sdk';
import { createETHAdapter } from 'nexusgenesis-chain-eth';

// 1. Generate a PQC root identity
const wallet = await PQCWallet.generate();

// 2. Create the agent coordination SDK
const sdk = createAgentSDK({ identity: wallet });

// 3. Derive an ETH key
const ethAdapter = createETHAdapter(wallet);
const ethAddress = await ethAdapter.getAddress();
```

---

## 6. Core Differentiators

1. **Quantum-resistant security**: Dilithium2 (NIST FIPS 204) signatures against quantum-computing attacks
2. **Multi-layer key architecture**: Master Key (cold storage) + Operation Key (agent-held) + Custody Token (24h authorization)
3. **Human takeover**: regain wallet control from an agent at any time; spend modes (unlimited / limit / require-approval)
4. **Chain-native**: one root identity derives ETH/SOL keys — no multi-wallet management
5. **MCP integration**: AI agents manage keys securely via MCP; private keys never leave the caller
6. **Chain-agnostic coordination**: pluggable transport (HTTP / in-memory), any chain

---

## 7. Security Statement

- All private keys are encrypted at rest with AES-256-GCM; keys derived via PBKDF2-HMAC-SHA512 (310,000 iterations)
- MCP Server security tools ensure private keys never leave the client process
- Human takeover supports spend limits, approval, and other safeguards
- Passed 50 unit tests + 7 MCP integration tests

---

## 8. Next Steps

- [ ] Deploy Solidity guardian contracts (automated ETH human takeover)
- [ ] More chain adapters (Polkadot, Cosmos, etc.)
- [ ] Improve coordination test coverage
- [ ] Expand the international (English) documentation
- [ ] Publish official npm documentation

---

## 9. Contact

- GitHub: https://github.com/nexus-genesis/nexusgenesis
- Official packages: `nexusgenesis-*` (npm)
