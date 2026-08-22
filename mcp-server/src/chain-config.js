/**
 * chain-config.js — Smart Account 链上部署配置标准化 (Sprint 2.6 T1)
 *
 * 统一环境变量 + local/testnet/production 配置面分层 + artifact 版本绑定。
 *
 * 环境变量（全部可选，缺省值随 profile 变化）：
 *   CHAIN_PROFILE              — local | testnet | production（默认 local）
 *   CHAIN_RPC_URL              — 外部 EVM RPC（未设置 → 进程内 LocalChain，仅 local 允许）
 *   CHAIN_OWNER_PK             — owner 操作私钥（deploy + registerSession）
 *   CHAIN_EMERGENCY_PK         — emergency 刹车角色私钥（INV-006）
 *   CHAIN_RELAYER_PK           — 广播中继私钥（executeFromAgent 广播者）
 *   SMART_ACCOUNT_ARTIFACT     — 编译产物 JSON 路径（缺省走仓库 out/ 默认路径）
 *   SMART_ACCOUNT_SOLC_VERSION — 期望 solc 版本前缀（默认 0.8.24）
 *
 * 安全模型（fail-closed）：
 *   - local：允许使用众所周知的 anvil 默认私钥 + 进程内 LocalChain（仅开发/测试）。
 *   - testnet：必须显式 CHAIN_RPC_URL + CHAIN_RELAYER_PK；禁止 anvil 默认私钥。
 *   - production：必须显式 CHAIN_RPC_URL + 全部三个操作私钥；禁止 anvil 默认私钥；
 *     artifact 必须存在并绑定 solc 版本。
 */
import { existsSync } from 'node:fs';

// 众所周知、不可用于非 local 配置面的 anvil 测试私钥（derived address 见 README）。
const KNOWN_ANVIL_KEYS = new Set([
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // anvil #0
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // anvil #1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // anvil #2
]);

export const CHAIN_PROFILES = ['local', 'testnet', 'production'];

export const DEFAULT_PROFILE = 'local';

export const DEFAULT_SOLC_VERSION = '0.8.24';

// 默认操作私钥：仅 local 配置面允许回退到这些（开发态）。
export const DEFAULT_KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // anvil #0
  emergency: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // anvil #1
  relayer: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // anvil #2
};

/**
 * 解析并校验 CHAIN_PROFILE。
 * @returns {string} 规范化后的 profile 名（local|testnet|production）
 * @throws {Error} code=CHAIN_PROFILE_INVALID 未知 profile
 */
export function resolveChainProfile() {
  const raw = (process.env.CHAIN_PROFILE || DEFAULT_PROFILE).trim().toLowerCase();
  if (!CHAIN_PROFILES.includes(raw)) {
    const err = new Error(
      `Unknown CHAIN_PROFILE "${raw}". Must be one of: ${CHAIN_PROFILES.join(' / ')}.`,
    );
    err.code = 'CHAIN_PROFILE_INVALID';
    throw err;
  }
  return raw;
}

/** 判断一个私钥是否为众所周知的 anvil 测试私钥。 */
function isKnownAnvilKey(pk) {
  return KNOWN_ANVIL_KEYS.has(String(pk).toLowerCase());
}

/**
 * 基于 CHAIN_PROFILE 构建配置面，做 fail-closed 校验。
 *
 * @param {object} [opts]
 * @param {string} [opts.profile] 显式指定 profile（缺省读 CHAIN_PROFILE）
 * @returns {{
 *   profile: string,
 *   rpcUrl: string|null,
 *   ownerPk: string,
 *   emergencyPk: string,
 *   relayerPk: string,
 *   artifactPath: string|null,
 *   solcVersion: string,
 *   useLocalChain: boolean,
 * }}
 * @throws {Error} 校验失败（附 code）
 */
export function buildChainEnvConfig({ profile } = {}) {
  const resolved = profile || resolveChainProfile();
  const isLocal = resolved === 'local';

  const rpcUrl = process.env.CHAIN_RPC_URL || null;
  const ownerPk = process.env.CHAIN_OWNER_PK || DEFAULT_KEYS.owner;
  const emergencyPk = process.env.CHAIN_EMERGENCY_PK || DEFAULT_KEYS.emergency;
  const relayerPk = process.env.CHAIN_RELAYER_PK || DEFAULT_KEYS.relayer;
  const artifactPath = process.env.SMART_ACCOUNT_ARTIFACT || null;
  const solcVersion = process.env.SMART_ACCOUNT_SOLC_VERSION || DEFAULT_SOLC_VERSION;

  const fail = (code, message) => {
    const err = new Error(message);
    err.code = code;
    throw err;
  };

  if (!isLocal) {
    // 非 local 配置面必须显式外部 RPC —— LocalChain 仅 local 允许。
    if (!rpcUrl) {
      fail(
        'CHAIN_RPC_URL_REQUIRED',
        `CHAIN_PROFILE=${resolved} requires an explicit external CHAIN_RPC_URL ` +
        '(in-process LocalChain is only allowed in CHAIN_PROFILE=local).',
      );
    }
    // 显式外部 RPC 时，广播者私钥不可缺省（缺省即回退到众所周知 anvil key）。
    if (!process.env.CHAIN_RELAYER_PK) {
      fail(
        'CHAIN_RELAYER_KEY_REQUIRED',
        `CHAIN_PROFILE=${resolved} with CHAIN_RPC_URL requires an explicit CHAIN_RELAYER_PK — ` +
        'refusing to sign broadcasts with a well-known anvil key.',
      );
    }
    // 显式设置了密钥但仍是众所周知的 anvil 测试私钥 → 拒绝。
    if (isKnownAnvilKey(ownerPk) || isKnownAnvilKey(emergencyPk) || isKnownAnvilKey(relayerPk)) {
      fail(
        'CHAIN_ANVIL_KEY_REJECTED',
        `CHAIN_PROFILE=${resolved} forbids the well-known anvil test keys — set ` +
        'CHAIN_OWNER_PK / CHAIN_EMERGENCY_PK / CHAIN_RELAYER_PK to real operation keys.',
      );
    }
    if (resolved === 'production' && !artifactPath) {
      fail(
        'SMART_ACCOUNT_ARTIFACT_REQUIRED',
        'CHAIN_PROFILE=production requires an explicit SMART_ACCOUNT_ARTIFACT path.',
      );
    }
    // 角色分离 (Sprint 2.6 T2): owner 与 relayer 必须是不同私钥。owner 控制
    // 部署/会话生命周期，relayer 控制广播面 —— 合并会让单一私钥泄漏即全权接管。
    if (ownerPk.toLowerCase() === relayerPk.toLowerCase()) {
      fail(
        'CHAIN_OWNER_RELAYER_COLLISION',
        `CHAIN_PROFILE=${resolved} requires a strict owner/relayer separation — ` +
        'CHAIN_OWNER_PK must differ from CHAIN_RELAYER_PK (owner never relays regular execution).',
      );
    }
  }

  // 只要显式接外部 RPC（无论 profile），就必须显式提供 relayer key —— 否则会用
  // 众所周知的 anvil 私钥签名广播，把广播路径（gas/nonce/DoS 面）交给任何知情者。
  if (rpcUrl && !process.env.CHAIN_RELAYER_PK) {
    fail(
      'CHAIN_RELAYER_KEY_REQUIRED',
      `CHAIN_RPC_URL is set (${resolved}) but CHAIN_RELAYER_PK is not — refusing to sign ` +
      'broadcasts with a well-known anvil key.',
    );
  }

  return {
    profile: resolved,
    rpcUrl,
    ownerPk,
    emergencyPk,
    relayerPk,
    artifactPath,
    solcVersion,
    useLocalChain: !rpcUrl && isLocal,
  };
}

/**
 * 校验 artifact 与期望 solc 版本绑定（版本 + 合约身份）。
 *
 * @param {object} artifact 编译产物 JSON（Foundry out/SmartAccount.sol/SmartAccount.json）
 * @param {string} [expectedSolc] 期望 solc 版本前缀（默认 0.8.24）
 * @returns {{ contractName: string, solcVersion: string, matches: boolean }}
 */
export function inspectArtifactBinding(artifact, expectedSolc = DEFAULT_SOLC_VERSION) {
  let contractName = null;
  let solcVersion = null;
  try {
    const metadata = typeof artifact.metadata === 'string' ? JSON.parse(artifact.metadata) : artifact.metadata;
    solcVersion = metadata?.compiler?.version || null;
    const target = metadata?.settings?.compilationTarget || {};
    const entry = Object.entries(target)[0];
    contractName = entry ? entry[1] : null;
  } catch {
    // metadata 不可解析时不阻断，仅记录 null。
  }
  const matches = contractName === 'SmartAccount' && solcVersion != null && solcVersion.startsWith(expectedSolc);
  return { contractName, solcVersion, matches };
}

/**
 * artifact 存在性检查（SMART_ACCOUNT_ARTIFACT 显式路径或仓库默认路径）。
 * @returns {boolean}
 */
export function artifactExists(path) {
  return path ? existsSync(path) : false;
}
