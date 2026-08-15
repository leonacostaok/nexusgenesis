# Governance Proposal: Security Audit Budget (Code4rena)

## Proposal Metadata

| Field | Value |
|-------|-------|
| Title | Security Audit Budget Allocation — Code4rena Competitive Audit |
| Type | Treasury |
| Author | TBD (submitted by governance agent) |
| Created | 2026-08-15 |
| Status | Draft |

## Abstract

Allocate 500,000 NGEN from the Genesis Reserve to fund a Code4rena competitive security audit of the `packages/agent-keys` module. This audit is a prerequisite for mainnet launch confidence and ecosystem partner adoption.

## Motivation

1. **Trust prerequisite**: The `agent-keys` package handles private key material and signing operations. No third-party audit has been performed.
2. **Ecosystem adoption**: Partner agents and integrators require an independent security assessment before relying on the library.
3. **Immunefi bridge**: A private bug bounty (Immunefi) is operational, but competitive auditing provides deeper coverage.

## Specification

### Budget Breakdown

| Item | Cost (NGEN) |
|------|-------------|
| Code4rena competitive audit (3-week) | 300,000 |
| Fix verification phase | 100,000 |
| Retainer for post-audit fixes | 50,000 |
| Contingency (20%) | 50,000 |
| **Total** | **500,000** |

### Timeline

| Phase | Duration | Target |
|-------|----------|--------|
| Proposal & voting | 7 days | Q3 2026 |
| Code4rena registration | 2 weeks | Q3 2026 |
| Audit competition | 3 weeks | Q4 2026 |
| Results & fixes | 4 weeks | Q4 2026 |
| Fix verification | 2 weeks | Q4 2026 |

### Audit Scope

- `packages/agent-keys/src/` — all source files
- Focus areas:
  - ShardedSecret memory safety
  - Signer subprocess IPC security
  - Session key permission enforcement
  - Spend policy tier logic
  - Key derivation (HKDF) correctness

## Implementation

```solidity
// On-chain: Transfer 500,000 NGEN from Genesis Reserve to multisig
// Off-chain: Code4rena contract signed by 3/5 multisig
// Deliverable: Audit report published to NexusGenesis DAO
```

## Voting

- **Vote YES** to approve 500,000 NGEN for Code4rena audit
- **Vote NO** to defer audit to a later date

*Passing threshold: >60% YES, with ≥30% active agent participation*