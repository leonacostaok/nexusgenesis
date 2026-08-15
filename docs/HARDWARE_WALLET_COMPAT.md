# Hardware Wallet Compatibility — NexusGenesis agent-keys

> Version: 0.1.0 | Last updated: 2026-08-15

## Positioning

NexusGenesis agent-keys is **not a hardware wallet**, but it is **hardware wallet compatible**. The architecture recognizes that hardware wallets (Ledger, Trezor, GridPlus) are the gold standard for cold storage of master keys, while agent-keys optimizes for the **hot signing** use case that hardware wallets cannot serve.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Human-Controlled Layer                     │
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐  │
│  │  Hardware Wallet     │    │  Master Key (backup)        │  │
│  │  (Ledger/Trezor)     │    │  (paper/encoded, offline)   │  │
│  │  Cold storage root   │    │  Not used for daily ops     │  │
│  └─────────┬───────────┘    └─────────────────────────────┘  │
│            │                                                    │
│            │  One-time setup: derive operation key seed        │
│            ▼                                                    │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Operation Key (rotatable, spend-limited)               │   │
│  │  Stored as encrypted envelope, not in hardware wallet   │   │
│  └────────────────────────┬───────────────────────────────┘   │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Agent Layer (hot)                          │
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐  │
│  │  ShardedSecret       │    │  Session Key (short-lived)  │  │
│  │  (in-memory, 2-of-2) │    │  Five-dimensional scoped    │  │
│  └─────────────────────┘    └─────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Hardware Wallet as Master Key Root

For maximum security, the **master key** can be derived from a hardware wallet seed:

```
BIP39 seed phrase (hardware wallet)
  → BIP32 path m/44'/NGEN'/0'/0'/0'
  → Master key (32 bytes)
  → HKDF → Operation key seed (32 bytes)
  → Dilithium2 key pair
```

**Implementation note:** This is a manual one-time setup. The hardware wallet holds the BIP39 seed; the derived master key is used once to generate the operation key, then the master key is removed from the hot environment.

### 2. Hardware Wallet for Large Transactions

The three-tier authorization system supports:
- **small-auto** (<10 NGEN): Agent signs autonomously
- **medium-timelock** (10-100 NGEN): 24h delay, human cancellation window
- **large-require-approval** (>=100 NGEN): Requires human signature

The "large" tier is designed for hardware wallet integration — the human reviews the transaction hash on their hardware wallet screen and signs it, providing the final approval.

### 3. Session Key Issuance

Session keys can be issued by a hardware wallet:
1. Hardware wallet signs a session key payload
2. The signed session key is stored in the agent's memory
3. The agent uses the session key for autonomous operations within its scope

## Comparison

| Feature | Hardware Wallet | agent-keys (this package) |
|---------|----------------|--------------------------|
| Key storage | Secure element, cold | Encrypted envelope, hot |
| Signing speed | ~1-5s (USB/BLE) | ~6ms (Dilithium2, in-process) |
| Autonomous signing | ❌ Requires human | ✅ Policy-controlled |
| Quantum resistance | ❌ ECDSA/EdDSA | ✅ Dilithium2 (FIPS 204) |
| Session keys | ❌ N/A | ✅ Five-dimensional scoped |
| Process isolation | ❌ N/A | ✅ Signer subprocess |
| Physical attack resistance | ✅ Secure element | ❌ Requires TEE |

## Recommendation

For production deployments:

1. **Cold root**: Hardware wallet or paper backup of master key (offline, never used for daily ops)
2. **Warm signer**: Encrypted operation key envelope loaded into agent-keys Signer subprocess
3. **Hot session**: Short-lived session keys for agent autonomy
4. **Large approvals**: Human reviews and signs with hardware wallet for >=100 NGEN transactions