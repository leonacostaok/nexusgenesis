/**
 * nexusgenesis-agent-sdk — smartAccount official recommended entry (facade)
 *
 * PURPOSE
 * ───────
 * Sprint 2.2: this is the SDK-level "official entry point" for the Smart
 * Account EVM path. An agent that only depends on nexusgenesis-agent-sdk can
 * reach the full on-chain hard-policy layer without importing chain-eth
 * directly:
 *
 *     import { smartAccount } from 'nexusgenesis-agent-sdk';
 *     const client = await smartAccount.createSmartAccountClient({ owner, emergencyKey, policy });
 *     const res = await client.execute({ session, intent, privateKeyHex, claimedAmount, sessionId, nonce });
 *
 * WHY LAZY
 * ────────
 * nexusgenesis-chain-eth statically imports THIS package (canonical/verifier
 * primitives live here). A static reverse import here would create a module
 * init cycle. So the facade loads chain-eth lazily (dynamic import, cached),
 * which keeps the dependency graph acyclic at load time while exposing a
 * single, stable SDK entry point.
 *
 * SECURITY
 * ────────
 * The facade adds no logic of its own — it forwards to
 * createSmartAccountClient / signSmartAccountIntent / verifySmartAccountIntent
 * in chain-eth. All fail-closed + INV invariants are enforced in the
 * forwarded implementations; nothing here can weaken them.
 */
let _modulePromise = null;

/**
 * Load (once) and cache the chain-eth Smart Account surface.
 * @returns {Promise<{createSmartAccountClient: Function, signSmartAccountIntent: Function, verifySmartAccountIntent: Function, hashIntentDigest: Function}>}
 */
async function loadChainEth() {
  if (!_modulePromise) {
    _modulePromise = import('nexusgenesis-chain-eth').then((m) => ({
      createSmartAccountClient: m.createSmartAccountClient,
      signSmartAccountIntent: m.signSmartAccountIntent,
      verifySmartAccountIntent: m.verifySmartAccountIntent,
      hashIntentDigest: m.hashIntentDigest,
    }));
  }
  return _modulePromise;
}

/**
 * Official recommended entry: build a Smart Account client (EVM flow one-stop).
 * @see nexusgenesis-chain-eth createSmartAccountClient
 */
export async function createSmartAccountClient(opts) {
  const mod = await loadChainEth();
  return mod.createSmartAccountClient(opts);
}

/**
 * Official EVM signing path: canonicalize + hash + secp256k1-sign.
 * @see nexusgenesis-chain-eth signSmartAccountIntent
 */
export async function signSmartAccountIntent(opts) {
  const mod = await loadChainEth();
  return mod.signSmartAccountIntent(opts);
}

/**
 * Verify an official EVM Smart Account intent signature.
 * @see nexusgenesis-chain-eth verifySmartAccountIntent
 */
export async function verifySmartAccountIntent(opts) {
  const mod = await loadChainEth();
  return mod.verifySmartAccountIntent(opts);
}

/**
 * Hash the canonical 12-field intent digest (cross-language with Solidity).
 * @see nexusgenesis-chain-eth hashIntentDigest
 */
export async function hashIntentDigest(canonical) {
  const mod = await loadChainEth();
  return mod.hashIntentDigest(canonical);
}

export default {
  createSmartAccountClient,
  signSmartAccountIntent,
  verifySmartAccountIntent,
  hashIntentDigest,
};
