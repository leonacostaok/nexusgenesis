/**
 * NexusGenesis - Memory Hygiene Utilities
 * 内存卫生工具：secureZero + ShardedSecret
 *
 * ═══════════════════════════════════════════════════════════════════
 *  能力边界声明（SECURITY BOUNDARY — 请勿删改）
 * ═══════════════════════════════════════════════════════════════════
 *  secureZero / ShardedSecret 能做到：
 *    1. 确定性覆写我们显式持有的 ArrayBuffer（Buffer/Uint8Array 底层）
 *    2. 将明文密钥的存活窗口压缩到毫秒级签名期间
 *    3. 内存 dump 后提取完整密钥的难度大幅提高（分片不连续存放）
 *
 *  secureZero / ShardedSecret 不能做到（诚实边界，主动披露）：
 *    1. 覆盖 V8 执行期间的栈上临时拷贝、JIT 优化产生的中间数据
 *    2. 覆盖被调用库（如 @noble/post-quantum）内部可能产生的副本
 *       —— 这是库的内存卫生责任，尚待独立审计验证
 *    3. 防 core dump 落盘（需 process.setrlimit('core', 0) + 系统配置）
 *    4. 防私钥进入 swap（需加密 swap / mlock，见部署加固清单）
 *    5. 防 DMA 攻击、冷启动攻击等物理内存读取
 *       —— 物理威胁域必须依赖 TEE（Nitro Enclaves / SEV-SNP），
 *          属于本软件层方案的能力边界之外
 *
 *  结论：本模块的目标是「缩小暴露窗口 + 提高攻击成本」，
 *        不是「绝对消除内存残留」。绝对承诺属于 TEE 的定义域。
 * ═══════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

/**
 * Deterministically overwrite the contents of one or more buffers.
 * 确定性覆写 Buffer 内容（不依赖 GC，立即生效）。
 *
 * Accepts Buffer / Uint8Array. Fills the underlying ArrayBuffer region
 * owned by each view. Silently skips null/undefined entries so callers
 * can pass optional values without branching.
 *
 * @param {...(Buffer|Uint8Array|null|undefined)} bufs
 * @returns {void}
 */
export function secureZero(...bufs) {
  for (const buf of bufs) {
    if (buf == null) continue;
    if (Buffer.isBuffer(buf) || buf instanceof Uint8Array) {
      try {
        buf.fill(0);
      } catch {
        // Read-only or detached views — nothing we can overwrite.
        // 非常规状态（detached ArrayBuffer），静默跳过。
      }
    }
  }
}

/** Validate a candidate shard/secret buffer is a non-empty byte buffer. */
function assertBytes(value, name) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Buffer or Uint8Array`);
  }
  if (value.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
}

/**
 * ShardedSecret — in-memory secret splitting (XOR 2-of-2).
 * 内存分片存储：明文密钥不以连续形态驻留内存。
 *
 * Design:
 *   shardA = random(len(secret))
 *   shardB = secret XOR shardA
 *   → 两个分片独立存放（不连续内存区域）
 *   → 任一分片单独不泄露任何信息（信息论安全的一次一密结构）
 *   → reassemble = shardA XOR shardB（仅在签名瞬间执行，用完立即清零）
 *
 * Threat model addressed:
 *   内存 dump / core dump 攻击者必须先定位两个不连续分片并正确
 *   组合，才能还原密钥。相比单一连续 Buffer，提取难度显著提高。
 *
 * NOT addressed (see boundary statement at top of file):
 *   物理内存读取、库内部副本、swap/core 落盘。
 */
export class ShardedSecret {
  /**
   * Shard a secret immediately. The input buffer is zeroed after sharding
   * so the caller's copy does not linger.
   * @param {Buffer|Uint8Array} secret
   */
  constructor(secret) {
    assertBytes(secret, 'secret');
    const len = secret.length;
    const shardA = crypto.randomBytes(len);
    const shardB = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      shardB[i] = secret[i] ^ shardA[i];
    }
    // Immediately destroy the caller's plaintext copy.
    secureZero(secret);
    this._shardA = shardA;
    this._shardB = shardB;
    this._length = len;
  }

  /** Rebuild shards from persisted/serialized parts (e.g. encrypted envelope). */
  static fromShards(shardA, shardB) {
    assertBytes(shardA, 'shardA');
    assertBytes(shardB, 'shardB');
    if (shardA.length !== shardB.length) {
      throw new RangeError('Shard length mismatch');
    }
    const instance = Object.create(ShardedSecret.prototype);
    instance._shardA = Buffer.from(shardA);
    instance._shardB = Buffer.from(shardB);
    instance._length = shardA.length;
    return instance;
  }

  /** Byte length of the encapsulated secret. */
  get length() {
    return this._length;
  }

  /**
   * Transient-use pattern — the recommended way to consume the secret.
   * 瞬时使用模式（推荐）：明文仅在回调执行期间存在。
   *
   * The secret is reassembled, handed to `fn`, then deterministically
   * zeroed in a finally block — even if `fn` throws. The assembled
   * plaintext NEVER outlives the callback invocation.
   *
   * CONTRACT: `fn` must not retain or leak the buffer it receives
   * (no storing in closures, no async escapes beyond the call).
   *
   * @template T
   * @param {(secret: Buffer) => T} fn
   * @returns {T}
   */
  use(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('use() requires a callback function');
    }
    if (this.isDestroyed) {
      throw new Error('ShardedSecret destroyed — key material no longer available');
    }
    const secret = this._reassemble();
    try {
      return fn(secret);
    } finally {
      secureZero(secret);
    }
  }

  /**
   * Reassemble the plaintext secret. CALLER MUST call secureZero() on the
   * result when done — prefer use() which handles this automatically.
   * @returns {Buffer} plaintext secret (caller-managed lifetime)
   */
  _reassemble() {
    const out = Buffer.alloc(this._length);
    for (let i = 0; i < this._length; i++) {
      out[i] = this._shardA[i] ^ this._shardB[i];
    }
    return out;
  }

  /**
   * Export shards for persistence (e.g. feed each shard into a separate
   * encryption envelope). Exported copies are fresh buffers; the in-memory
   * shards are untouched.
   * @returns {{ shardA: Buffer, shardB: Buffer }}
   */
  exportShards() {
    return {
      shardA: Buffer.from(this._shardA),
      shardB: Buffer.from(this._shardB)
    };
  }

  /**
   * Destroy all shard material. Idempotent; the instance is unusable after.
   * 销毁全部分片（幂等，调用后实例不可再用）。
   */
  destroy() {
    secureZero(this._shardA, this._shardB);
    this._shardA = null;
    this._shardB = null;
    this._length = -1;
  }

  /** Whether this instance still holds usable shards. */
  get isDestroyed() {
    return this._shardA === null;
  }
}

/**
 * Disable core dumps for the current process (best effort).
 * Best effort: on platforms where setrlimit is unavailable this is a no-op.
 * @returns {boolean} true if applied
 */
export function disableCoreDumps() {
  try {
    if (typeof process.setrlimit === 'function') {
      process.setrlimit('core', { soft: 0, hard: 0 });
      return true;
    }
  } catch {
    // Windows / restricted environments — no-op.
  }
  return false;
}

export default {
  secureZero,
  ShardedSecret,
  disableCoreDumps
};
