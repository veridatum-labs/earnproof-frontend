/**
 * Wallet module exports
 */

// Provider types and registry
export { getProviderRegistry, resetProviderRegistry } from "./provider-registry";
export type {
  WalletProviderId,
  WalletProviderName,
  WalletProvider,
  WalletProviderInfo,
  ProviderConnectionState,
  ProviderConnectRequest,
  ProviderConnectResult,
  ProviderChangeEvent,
  ProviderChangeListener,
  WalletProviderRegistry,
} from "./provider-types";

// Freighter provider
export { FreighterProvider } from "./providers/freighter-provider";

// Network compatibility
export {
  getExpectedNetworkConfig,
  detectNetworkCompatibility,
  createCompatibilityCheckResult,
  validateNetworkCompatibility,
  isSigningAllowed,
} from "./network-compatibility";
export type {
  ExpectedNetworkConfig,
  NetworkCompatibility,
  NetworkCompatibilityCheckResult,
  WalletNetworkContext,
  WalletNetworkDetectionResult,
} from "./types";

// Sign message
export { signWithFreighter } from "./sign-message";

// Freighter sign (legacy)
export { connectFreighterWallet, signFreighterMessage } from "./freighter-sign";

// Network types
export type {
  WalletNetworkContext,
  WalletNetworkDetectionResult,
  NetworkCompatibility,
  NetworkCompatibilityCheckResult,
  WalletAccountChangeEvent,
  WalletNetworkChangeEvent,
} from "./types";
