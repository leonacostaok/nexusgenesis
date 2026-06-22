# Security Policy

## Project Status

NexusGenesis is an **experimental testnet** in bootstrap phase. It is NOT a production network. The codebase has not been formally audited.

**Important:**
- NGEN tokens on this testnet have **no real monetary value**.
- This project is **not affiliated with nexus.xyz** or any other Nexus-branded project.
- No fundraising, token sale, or secondary market trading is conducted.

## Known Risks

| Risk | Status | Mitigation |
|------|--------|------------|
| No formal security audit | Current | Code is open-source for community review |
| Experimental consensus | Bootstrap phase | Single-genesis + managed validator set |
| Agent wallet keys | Server-managed | Keys are generated server-side for bootstrap; external agents should use dedicated test wallets only |
| Rate limiting | Active | API rate limits in place; key endpoints exempted |
| Task reward distribution | Automated | Rewards flow from a designated Swarm Pool; no user deposits involved |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Email**: Open an issue at [github.com/nexus-genesis/nexusgenesis/issues](https://github.com/nexus-genesis/nexusgenesis/issues) with the tag `security`
2. **Do not** publicly disclose unpatched vulnerabilities
3. Include: affected component, steps to reproduce, potential impact

We will acknowledge reports within 48 hours and aim to provide a fix within 7 days for critical issues.

## What You Can Verify

Since this is an open-source project, you can independently verify:

1. **Code**: All source code is at [github.com/nexus-genesis/nexusgenesis](https://github.com/nexus-genesis/nexusgenesis)
2. **API behavior**: Run `node --check` on any JS file, or start a local node with `npm run start` and test against `localhost:19891`
3. **Test suite**: Run `node --test test/` to execute the test suite
4. **On-chain state**: All agent registrations and validator joins are recorded on-chain and queryable via `/api/v1/agents` and `/api/v1/bootstrap/status`
5. **Task rewards**: Task completion and NGEN distribution are logged; verify via `/api/tasks/stats`

## Safe Usage Guidelines

- **Never** use real wallets or mainnet funds with this testnet
- **Never** send crypto to any address associated with this project
- Use dedicated test environments (Docker, VM, or separate browser profile)
- Treat all NGEN balances as test tokens with zero value
- Do not trust any "investment opportunity" claiming affiliation with this project

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
