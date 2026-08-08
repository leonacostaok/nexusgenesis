# Legacy L1 — Deferred Development Backlog

> **Status: ON HOLD (opportunistic development).** The primary product line is
> the security standard layer. These Legacy L1 infrastructure issues are
> recorded so they can be picked up whenever L1 development resumes. Not
> blocking — the core value-exchange engine itself was verified working.

## Verification Baseline (2026-08-08)

The Agent→Agent NGEN value-exchange loop was verified **in-memory** by driving
`agentWalletManager` directly (same core logic as the HTTP API), bypassing the
two infrastructure issues below:

| Step | Result |
|------|--------|
| Create wallets | OK — `ng1...` addresses |
| Faucet claim | OK — funded 1000 NGEN |
| Transfer A→B | **OK** — `tx-ebf6b74de2f19591`, Dilithium2 signed |
| Balances | A: 499, B: 1500 (fee 1, metabolic tax 0.1%) |
| History | Recorded |

**Conclusion:** The transfer engine is sound (deduction, fee, metabolic tax,
recipient credit, signature, history, plus human-takeover rollback guard at
`src/wallet/agentWalletManager.js`). Script:
`scripts/verify-value-exchange.mjs`.

## Backlog

### 1. DevNet orchestrator config mismatch
- **File:** `scripts/start_mainnet.js`
- **Issue:** Line 51 reads `this.config.devnet.name` but the config file
  `mainnet.config.json` uses a top-level `network` object (`network.name`,
  `network.epoch`). The orchestrator expects a `devnet` key that doesn't exist
  → `TypeError: Cannot read properties of undefined (reading 'name')` at
  startup.
- **Fix direction:** Align the orchestrator to read `network.*`, or add a
  `devnet` top-level section to `mainnet.config.json`.
- **Impact:** Blocks `npm run devnet` (multi-node orchestration). Single-node
  `npm start` starts, but HTTP API readiness is affected by issue #2.

### 2. State persistence `toString` crash
- **File:** `src/blockchain/state.js` (error surfaced at line 2423,
  `Error saving state`)
- **Issue:** During state serialization, an `undefined` value calls `.toString()`
  and throws, so state save fails. This can stall/destabilize initialization
  and persistence on longer-running nodes.
- **Fix direction:** Find the undefined field in the state object being
  serialized and guard it (or normalize to a safe representation before
  `JSON.stringify`).
- **Impact:** Persistence reliability; HTTP server readiness on full node boot.

### 3. HTTP server readiness on full boot (related to #2)
- **Issue:** With `npm start`, the node process binds ports (19891, 9847, 20891)
  but the HTTP API did not respond in probing — likely a consequence of the
  state-save error disrupting the startup path.
- **Fix direction:** Confirm after #2 is resolved; verify
  `GET /api/v1/wallet/health` returns `success: true` on `localhost:19891`.
