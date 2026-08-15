/**
 * NexusGenesis agent-keys — Signer subprocess integration test
 *
 * Tests the spawnSigner → sign → close lifecycle end-to-end.
 * Requires spawning a real child process via child_process.spawn.
 *
 * NOTE: These tests are separated from the unit test suite because they
 * are heavier (process spawn, ~1s per test) and may not work on all
 * platforms (e.g., restricted Docker environments).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PQCWallet,
  spawnSigner,
  isValidEnvelope
} from '../src/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────
async function createTestEnvelope(wallet, password = 'test-password-88') {
  const envelope = wallet.exportEncrypted(password);
  if (!envelope || !isValidEnvelope(envelope)) {
    throw new Error('Failed to create test envelope');
  }
  return { envelope, password };
}

// ─── Tests ───────────────────────────────────────────────────────────────
test('[CRITICAL] spawnSigner with valid envelope produces init_ok', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  const signer = await spawnSigner({ envelope, password });
  try {
    assert.ok(signer, 'SignerHandle must be returned');
    // Ping to confirm it's alive.
    await signer.ping();
  } finally {
    await signer.close();
  }
});

test('[CRITICAL] signer.sign() produces a valid signature', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  const signer = await spawnSigner({ envelope, password });
  try {
    const sig = await signer.sign('0xabcdef1234567890');
    assert.ok(sig, 'signature must be returned');
    assert.ok(sig.startsWith('0x'), 'signature must be 0x-prefixed');

    // Verify the signature using the wallet's public key.
    const sigBuffer = Buffer.from(sig.slice(2), 'hex');
    const ok = await wallet.verify('0xabcdef1234567890', sigBuffer);
    assert.equal(ok, true, 'signature must verify with the original public key');
  } finally {
    await signer.close();
  }
});

test('signer.sign() with options.amount signs correctly', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  // No policy — amount is ignored by the worker but still flows through IPC.
  const signer = await spawnSigner({ envelope, password });
  try {
    const sig = await signer.sign('0xabcdef1234567890', { amount: '42' });
    assert.ok(sig && typeof sig === 'string' && sig.startsWith('0x'),
      'sign with options.amount must still produce a signature');
  } finally {
    await signer.close();
  }
});

test('signer.rejects invalid hash format', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  const signer = await spawnSigner({ envelope, password });
  try {
    await assert.rejects(
      () => signer.sign('not-a-hex-string'),
      /Invalid hash/i
    );
  } finally {
    await signer.close();
  }
});

test('signer.close() terminates the child process', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  const signer = await spawnSigner({ envelope, password });
  await signer.close();
  // After close, sign should reject.
  await assert.rejects(
    () => signer.sign('0xdeadbeef'),
    /closed/i
  );
});

test('signer respects spend policy (deny)', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  // Policy: require-approval mode — every spend denied.
  const policy = { type: 'require-approval' };

  const signer = await spawnSigner({ envelope, password, policy });
  try {
    await assert.rejects(
      () => signer.sign('0xaaaaaaaaaaaaaaaa', { amount: '5' }),
      /requires human approval/i
    );
  } finally {
    await signer.close();
  }
});

test('signer enforces limit mode maxPerTx against the REAL amount', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  // Policy: limit mode, maxPerTx=5, maxDaily=100.
  // amount=3 → within maxPerTx(5) → passes base check, tier=small-auto → signs.
  // amount=50 → exceeds maxPerTx(5) → fails base check → rejected.
  const policy = { type: 'limit', maxPerTx: '5', maxDaily: '100' };

  const signer = await spawnSigner({ envelope, password, policy });
  try {
    // In-limit small spend passes.
    const sig = await signer.sign('0xbbbbbbbbbbbbbbbb', { amount: '3' });
    assert.ok(typeof sig === 'string' && sig.startsWith('0x'), 'small in-limit spend must sign');

    // Out-of-limit spend is denied — the base check catches it (50 > maxPerTx=5)
    // before the tier check is even reached.
    await assert.rejects(
      () => signer.sign('0xcccccccccccccccc', { amount: '50' }),
      /exceeds maxPerTx|human approval/i
    );
  } finally {
    await signer.close();
  }
});

test('signer fails CLOSED when policy set but no amount provided', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  const policy = { type: 'limit', maxPerTx: '5', maxDaily: '100' };

  const signer = await spawnSigner({ envelope, password, policy });
  try {
    await assert.rejects(
      () => signer.sign('0xdddddddddddddddd'),
      /no amount/i
    );
  } finally {
    await signer.close();
  }
});

test('signer returns timelock info for medium-tier spend', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope, password } = await createTestEnvelope(wallet);

  // unlimited base mode; default tiers small=10/large=100 → 50 is medium.
  const policy = { type: 'unlimited' };

  const signer = await spawnSigner({ envelope, password, policy });
  try {
    const result = await signer.sign('0xeeeeeeeeeeeeeeee', { amount: '50' });
    assert.ok(result && typeof result === 'object' && result.timelocked === true,
      'medium-tier spend must resolve with a timelock object, not a signature');
    assert.equal(result.timelockMs, 24 * 60 * 60 * 1000);
    assert.ok(result.scheduledAt > Date.now());
  } finally {
    await signer.close();
  }
});

test('signer rejects invalid envelope', async () => {
  await assert.rejects(
    () => spawnSigner({ envelope: { invalid: true }, password: 'test-password-88' }),
    /Invalid/i
  );
});

test('signer rejects short password', async () => {
  const wallet = await PQCWallet.generate();
  const { envelope } = await createTestEnvelope(wallet);
  await assert.rejects(
    () => spawnSigner({ envelope, password: 'short' }),
    /at least 8/i
  );
});