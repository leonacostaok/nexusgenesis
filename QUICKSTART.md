# NexusGenesis Quick Start

**Get an autonomous AI agent running with post-quantum keys, self-custody, and human takeover in about 5 minutes.**

NexusGenesis is a security & coordination standard layer for autonomous AI agents:

- **Self-custody** — private keys are generated and kept on your agent/browser and **never leave the caller**.
- **Quantum-resistant** — signatures use CRYSTALS-Dilithium2 (NIST **FIPS 204**) via `@noble/post-quantum`.
- **Multi-chain** — one PQC root identity derives addresses on NexusGenesis (`ng1`), Ethereum, and Solana.
- **Human takeover** — a human can always regain control, with spend limits and an approval mode, for compliance.
- **MCP-ready** — plug the same security into Claude Desktop, Cursor, Continue, or any MCP client.

> The legacy L1 network (`nexus-genesis.top`) is a separate code line kept for opportunistic development. This guide covers the **security-standard packages**, which work standalone with no network required.

---

## 1. Prerequisites

- **Node.js >= 18** (npm included)
- An empty project folder

```bash
mkdir my-agent && cd my-agent
npm init -y
```

---

## 2. Install the packages

```bash
npm install nexusgenesis-agent-keys nexusgenesis-agent-sdk nexusgenesis-chain-adapters
```

That's everything for a standalone agent. No chain, no server, no network needed for Steps 3–6.

---

## 3. Create a self-sovereign agent identity (5 lines)

Save this as `agent.mjs`:

```js
import { generateKeyPair, generateAddress } from 'nexusgenesis-agent-keys';

// 1. Post-quantum root key pair (Dilithium2 / FIPS 204)
const { publicKey, privateKey } = await generateKeyPair();

// 2. NexusGenesis native address (ng1 + Base58)
const address = generateAddress(publicKey);

console.log({ address, publicKeyHex: publicKey.toString('hex') });
```

Run it:

```bash
node agent.mjs
```

> **The private key stays in your process.** Only `publicKeyHex` and the address are meant to be shared.

---

## 4. One identity → three chains

NexusGenesis's differentiator: derive deterministic **Ethereum** and **Solana** wallets from the **same** PQC root key.

```js
import { generateKeyPair } from 'nexusgenesis-agent-keys';
import { deriveChainAddresses, deriveAgentFingerprint } from 'nexusgenesis-chain-adapters';

const { publicKey, privateKey } = await generateKeyPair();
const fingerprint = deriveAgentFingerprint(publicKey);   // sha256 of the public key
const addrs = deriveChainAddresses(publicKey, privateKey);

console.log({ fingerprint, ...addrs });
// { fingerprint: '…', nexus: 'ng1…', eth: '0x…', sol: '…' }
```

---

## 5. Sign & verify (offline, tamper-proof)

```js
import { generateKeyPair, sign, verify } from 'nexusgenesis-agent-keys';

const { publicKey, privateKey } = await generateKeyPair();
const message = 'agent claims task-42';

const signature = (await sign(message, privateKey)).toString('hex');
const valid = await verify(message, Buffer.from(signature, 'hex'), publicKey);

console.log({ valid }); // true
```

---

## 6. Human takeover & spend control

Compliance safety net: a human can restrict what an autonomous agent is allowed to spend, and the agent can detect if control changed mid-operation.

```js
import { takeoverGuard, checkSpendAllowed, SPEND_MODES } from 'nexusgenesis-agent-sdk';

// Enforce a per-transaction ceiling:
const allow = checkSpendAllowed(
  { type: SPEND_MODES.LIMIT, maxPerTx: 100 },
  { amount: 50 }
);
// => { allowed: true }

// Detect a human takeover mid-operation (BLOCK the transfer if changed):
const before = { type: SPEND_MODES.UNLIMITED };
const after  = { type: SPEND_MODES.REQUIRE_APPROVAL };
const safe = takeoverGuard(before, after);
// => false — human changed control, do NOT commit the transfer.
```

---

## 7. Encrypted identity via the SDK

Prefer a ready-made identity object with an encrypted envelope? Use the SDK:

```js
import { createAgentIdentity, recoverAgentIdentity, signAsAgent } from 'nexusgenesis-agent-sdk';

const identity = await createAgentIdentity({ password: 'agent-secret-123', metadata: { name: 'AnalystBot' } });
// { address: 'ng1…', publicKeyHex, envelope, keyModel: 'self-sovereign' }

// Recover only on the agent's own machine:
const wallet = recoverAgentIdentity(identity.envelope, 'agent-secret-123');

// Sign as the agent:
const sig = await signAsAgent(wallet, { action: 'claim', taskId: 't-1' });
```

`envelope` is the private key encrypted with **AES-256-GCM + PBKDF2**. Store it locally; it never leaves your machine.

---

## 8. Plug the same security into your MCP client

Install once:

```bash
npm install -g nexusgenesis-agent-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nexusgenesis": {
      "command": "npx",
      "args": ["nexusgenesis-agent-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "nexusgenesis": {
      "command": "npx",
      "args": ["nexusgenesis-agent-mcp"]
    }
  }
}
```

Then ask your assistant, for example:

- *"Create a self-sovereign agent identity for me"* → returns an encrypted envelope
- *"Generate a post-quantum keypair and verify a signature"*
- *"Check if this agent can spend 50 under a 100-per-transaction limit"*

> **Security:** the key-generation tools return only public material + an encrypted envelope. The private key is generated and retained on the caller's side and never transmitted.

---

## 9. Full runnable example

The complete 5-minute flow in one file (`run.mjs`):

```js
import { generateKeyPair, generateAddress, sign, verify } from 'nexusgenesis-agent-keys';
import { deriveChainAddresses } from 'nexusgenesis-chain-adapters';
import { checkSpendAllowed, SPEND_MODES } from 'nexusgenesis-agent-sdk';

const { publicKey, privateKey } = await generateKeyPair();

const nexus  = generateAddress(publicKey);
const chains = deriveChainAddresses(publicKey, privateKey);

const msg = 'hello nexus';
const sig = (await sign(msg, privateKey)).toString('hex');
const ok  = await verify(msg, Buffer.from(sig, 'hex'), publicKey);

const spend = checkSpendAllowed({ type: SPEND_MODES.LIMIT, maxPerTx: 100 }, { amount: 50 });

console.log({
  nexus,
  eth: chains.eth,
  sol: chains.sol,
  signatureValid: ok,
  spendAllowed: spend.allowed,
});
```

```bash
node run.mjs
```

---

## Next steps

- **Packages** — [agent-keys](packages/agent-keys/README.md) · [agent-sdk](packages/agent-sdk/README.md) · [chain-eth](packages/chain-eth/README.md) · [chain-sol](packages/chain-sol/README.md) · [chain-adapters](packages/chain-adapters/README.md)
- **MCP server** — [mcp-server/README.md](mcp-server/README.md)
- **Security model** — [SECURITY.md](SECURITY.md) · [docs/SECURITY_SPEC.md](docs/SECURITY_SPEC.md)
- **Full demo** — [examples/demo-cross-chain.mjs](examples/demo-cross-chain.mjs)

## License

MIT
