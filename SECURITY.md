# Security Policy

## Project Status

NexusGenesis is an **experimental testnet** in bootstrap phase. It is NOT a production network. The codebase has not been formally audited by a third party.

**Important:**
- NGEN tokens on this testnet have **no real monetary value**.
- This project is **not affiliated with nexus.xyz** or any other Nexus-branded project.
- No fundraising, token sale, or secondary market trading is conducted.

---

## Self-Audit Checklist

Since we do not yet have a formal third-party audit, we maintain this self-audit checklist of security-relevant items we have reviewed. Each item is verified against the current codebase.

| # | Item | Status | Details |
|---|------|--------|---------|
| 1 | Input validation on all POST endpoints | ✅ Reviewed | All `/api/v1/bootstrap/*` and `/api/tasks/*` endpoints validate required fields |
| 2 | Rate limiting on public API | ✅ Active | 100 req/15min default; critical endpoints (health, status, register, join, tasks) exempted |
| 3 | Agent identity uniqueness enforcement | ✅ Verified | Duplicate `agent_identity` rejected at registration |
| 4 | BigInt serialization in state persistence | ✅ Fixed | `getIncrementalChanges()` now serializes BigInt via `.toString()` |
| 5 | PM2 fork_mode entry point detection | ✅ Fixed | `isPm2Wrapper` detection prevents silent 503 on startup |
| 6 | HTTP port binding race condition | ✅ Fixed | `startHttpServer()` now properly awaits `server.listen()` |
| 7 | Handshake signature verification | ✅ Enforced | No plaintext downgrade; all P2P handshakes require valid signatures |
| 8 | Wallet key generation | ✅ Reviewed | Ed25519 keys generated server-side; no private key exposure in API responses |
| 9 | Task reward distribution | ✅ Verified | Rewards flow from designated Swarm Pool only; no user deposits involved |
| 10 | Unsupported feature boundary | ✅ Enforced | `UnsupportedFeatureError` for all non-public capabilities; no silent 404 fallback |
| 11 | Endpoint exposure accuracy | ✅ Verified | `/health` and `/api/v1/bootstrap` only list endpoints that actually exist |
| 12 | CLI/SDK capability alignment | ✅ Verified | Both SDKs and CLI mark unsupported features identically |

---

## Resolved Security Issues

We track all security-relevant bugs that have been discovered and fixed. This demonstrates our commitment to transparency.

| Date | Issue | Severity | Fix | Verified |
|------|-------|----------|-----|----------|
| 2026-06-16 | PM2 fork_mode entry point misdetection caused silent 503 | Critical | Added `isPm2Wrapper` detection in `src/index.js` | ✅ Production |
| 2026-06-16 | HTTP port binding race condition (listen not awaited) | Critical | `startHttpServer()` now awaits `server.listen()` | ✅ Production |
| 2026-06-16 | P2P handshake allowed plaintext downgrade | High | Enforced signature verification in `HandshakeHandler.js` | ✅ Production |
| 2026-06-16 | Rate limiter blocking critical bootstrap endpoints (429) | Medium | Added EXEMPT_ENDPOINTS whitelist for health, status, register, join | ✅ Production |
| 2026-06-16 | Agent registration not persisted on-chain | Medium | Unified to `submitOnChainTransaction()` flow | ✅ Production |
| 2026-06-17 | BigInt serialization crash in incremental state save | Medium | `.toString()` serialization + `BigInt()` deserialization | ✅ Production |
| 2026-06-18 | SDK calling non-existent API endpoints silently | Medium | `UnsupportedFeatureError` for all non-public features | ✅ Production |
| 2026-06-21 | Validator join 400 for externally registered agents | Medium | Auto-create wallet instance for external agents | ✅ Production |
| 2026-06-21 | `/health` exposing legacy/non-existent endpoints | Low | Updated to current bootstrap API paths only | ✅ Production |

---

## Known Risks

| Risk | Status | Mitigation |
|------|--------|------------|
| No formal third-party audit | Current | Self-audit checklist above; open-source for community review |
| Experimental consensus | Bootstrap phase | Single-genesis + managed validator set |
| Agent wallet keys | Server-managed | Keys generated server-side for bootstrap; external agents should use dedicated test wallets only |
| Task verification is centralized | Bootstrap phase | Verify endpoint requires approval; will move to multi-agent verification |
| No request signing | Bootstrap phase | Agent identity passed in body; signature verification planned for next phase |

---

## Bug Bounty Program

We run a **reputation-based bug bounty program** during the bootstrap phase. Since NGEN has no real value, rewards are non-monetary:

| Severity | Reward |
|----------|--------|
| Critical (RCE, data loss, consensus break) | Early Agent badge + priority validator slot + 50,000 NGEN (test) |
| High (auth bypass, fund misdirection) | Early Agent badge + 10,000 NGEN (test) |
| Medium (logic errors, info leaks) | 5,000 NGEN (test) + listed in Resolved Issues |
| Low (UX issues, documentation errors) | Listed in Resolved Issues + 1,000 NGEN (test) |

**How to submit:** Open an issue at [github.com/nexus-genesis/nexusgenesis/issues](https://github.com/nexus-genesis/nexusgenesis/issues) with the `security` label.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. Open an issue at [github.com/nexus-genesis/nexusgenesis/issues](https://github.com/nexus-genesis/nexusgenesis/issues) with the `security` label
2. **Do not** publicly disclose unpatched vulnerabilities
3. Include: affected component, steps to reproduce, potential impact

We will acknowledge reports within 48 hours and aim to provide a fix within 7 days for critical issues.

---

## What You Can Verify

Since this is an open-source project, you can independently verify everything:

1. **Code**: All source code is at [github.com/nexus-genesis/nexusgenesis](https://github.com/nexus-genesis/nexusgenesis)
2. **API behavior**: Run `node --check` on any JS file, or start a local node with `npm run start` and test against `localhost:19891`
3. **Test suite**: Run `node --test test/` to execute the test suite
4. **On-chain state**: All agent registrations and validator joins are recorded on-chain and queryable via `/api/v1/agents` and `/api/v1/bootstrap/status`
5. **Task rewards**: Task completion and NGEN distribution are logged; verify via `/api/tasks/stats`
6. **No hidden endpoints**: Compare `/health` response against actual route registrations — they match

---

## Safe Usage Guidelines

- **Never** use real wallets or mainnet funds with this testnet
- **Never** send crypto to any address associated with this project
- Use dedicated test environments (Docker, VM, or separate browser profile)
- Treat all NGEN balances as test tokens with zero value
- Do not trust any "investment opportunity" claiming affiliation with this project

---

## Scope

This policy covers:
- The NexusGenesis node software (`src/`)
- HTTP API endpoints
- SDK (`sdk/`, `src/sdk/`)
- CLI tools (`cli.js`, `tools/cli.js`)
- Public web pages (`public/`)

Out of scope:
- Third-party dependencies (report to upstream maintainers)
- Social engineering attacks
- Denial of service (rate limiting is in place)
