# nexusgenesis-agent-keys

**Agent Autonomous Key Security** — PQC (Dilithium2) keys, AES-256-GCM encryption, three-tier key derivation, custody tokens, and human takeover. **Private keys never leave the agent/browser.**

This is the security-only core of the NexusGenesis Agent Coordination Protocol, decoupled from any chain. It is the foundation of the "Agent Autonomy Security Standard" — a differentiator over every agent framework whose private keys live on a server or in memory.

## Why this package exists

Most agent frameworks (AgentKit, Olas, Fetch, LangChain) hold agent private keys on a server or in process memory. `nexusgenesis-agent-keys` implements the opposite model:

- **Private keys never leave the caller** (agent process / browser)
- **Human can always take back control** of an autonomous agent (takeover)
- **Quantum-resistant signatures** (Dilithium2, NIST FIPS 204)

## Install

```bash
npm install nexusgenesis-agent-keys
```

Node.js >= 18, ESM only.

## Modules

| Subpath | Exports | Purpose |
|---------|---------|---------|
| `nexusgenesis-agent-keys` | everything | All-in-one |
| `nexusgenesis-agent-keys/pqc` | `generateKeyPair`, `sign`, `verify`, `hash`, ... | Dilithium2 primitives |
| `nexusgenesis-agent-keys/encryption` | `encryptPrivateKey`, `decryptPrivateKey`, ... | AES-256-GCM at-rest encryption |
| `nexusgenesis-agent-keys/derivation` | `deriveOpKeySeed`, `KEY_MODELS`, `rotateOpKey`, ... | Three-tier key hierarchy |
| `nexusgenesis-agent-keys/wallet` | `PQCWallet`, `Transaction` | PQC wallet & tx |
| `nexusgenesis-agent-keys/takeover` | `takeoverGuard`, `checkSpendAllowed`, `takeoverWallet`, ... | Human takeover & spend controls |

## Quick examples

### Generate & sign (PQC)

```js
import { generateKeyPair, sign, verify } from 'nexusgenesis-agent-keys';

const { publicKey, privateKey } = await generateKeyPair();
const sig = await sign('payload', privateKey);
const ok = await verify('payload', sig, publicKey); // true
```

### Wallet with human takeover

```js
import { PQCWallet, takeoverGuard, SPEND_MODES } from 'nexusgenesis-agent-keys';

const wallet = await PQCWallet.generate();

// Capture spend config before an autonomous operation...
const before = { type: SPEND_MODES.UNLIMITED };
// ...after the operation, ensure control didn't change.
const after = { type: SPEND_MODES.UNLIMITED };
if (takeoverGuard(before, after)) {
  // safe to commit — the agent still has autonomy
}
```

### Encrypt a private key at rest

```js
import { encryptPrivateKey, decryptPrivateKey } from 'nexusgenesis-agent-keys';

const envelope = encryptPrivateKey(privateKey, 'your-password', { address });
const recovered = decryptPrivateKey(envelope, 'your-password');
```

## Security properties

- **Signatures**: Dilithium2 (NIST FIPS 204) via `@noble/post-quantum`
- **At-rest encryption**: AES-256-GCM + PBKDF2-HMAC-SHA512 (310,000 iters, OWASP 2023)
- **Derivation**: HKDF-SHA256, per-(agent, version) deterministic operation keys
- **Custody**: HMAC-SHA256 short-lived (24h) tokens bound to a public-key fingerprint
- **Takeover**: spend limits + require-approval mode + mid-operation control-change guard

## Tests

```bash
npm test
```

## License

MIT