/**
 * nexusgenesis-chain-adapters —entry point
 */
import {
  SUPPORTED_CHAINS,
  deriveChainAddresses,
  deriveChainAddress,
  deriveAgentFingerprint
} from './registry.js';
import {
  deriveEthWallet,
  deriveEthWalletFromPQC,
  signMessage as signEth,
  verifyMessage as verifyEth
} from 'nexusgenesis-chain-eth';
import {
  deriveSolWallet,
  deriveSolWalletFromPQC,
  signMessage as signSol,
  verifyMessage as verifySol
} from 'nexusgenesis-chain-sol';

export {
  SUPPORTED_CHAINS,
  deriveChainAddresses,
  deriveChainAddress,
  deriveAgentFingerprint,
  deriveEthWallet,
  deriveEthWalletFromPQC,
  signEth,
  verifyEth,
  deriveSolWallet,
  deriveSolWalletFromPQC,
  signSol,
  verifySol
};

export default {
  SUPPORTED_CHAINS,
  deriveChainAddresses,
  deriveChainAddress,
  deriveAgentFingerprint
};