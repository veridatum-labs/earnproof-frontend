/**
 * Multi-wallet provider abstraction and types.
 *
 * Defines the interface for wallet providers, enabling support for
 * multiple wallet implementations (Freighter, etc.) with consistent
 * capability discovery and connection lifecycle management.
 */

/**
 * Unique identifier for a wallet provider.
 * Used internally and in UI for provider selection and state tracking.
 */
export type WalletProviderId = "freighter" | "stellar_webauthn";

/**
 * User-friendly name for a wallet provider.
 * Safe to display in UI without additional escaping.
 */
export type WalletProviderName = "Freighter" | "Stellar WebAuthn";

/**
 * Metadata about a wallet provider's capabilities and availability.
 */
export interface WalletProviderInfo {
  /** Unique identifier for this provider. */
  id: WalletProviderId;
  /** User-friendly name for the provider. */
  name: WalletProviderName;
  /** Whether this provider is available/installed in the current browser. */
  isAvailable: boolean;
  /** Why the provider is unavailable, if not available. */
  unavailableReason?: string;
  /** User-friendly description of the provider. */
  description: string;
  /** Documentation or help link for the provider. */
  learnMoreUrl?: string;
}

/**
 * Wallet connection state for a specific provider.
 */
export interface ProviderConnectionState {
  /** The provider this state describes. */
  providerId: WalletProviderId;
  /** Whether the provider is currently connected. */
  isConnected: boolean;
  /** Connected address, if connected. */
  address: string | null;
  /** Network the provider is connected to, if available. */
  network?: string;
  /** Last time the connection state was checked. */
  lastChecked: number;
  /** If not connected, why not (user rejected, error, etc.). */
  disconnectReason?: string;
}

/**
 * Request to connect to a specific wallet provider.
 */
export interface ProviderConnectRequest {
  providerId: WalletProviderId;
  /** If true, silently fail rather than throwing; return null instead. */
  silent?: boolean;
}

/**
 * Result of attempting to connect to a wallet provider.
 */
export interface ProviderConnectResult {
  success: boolean;
  providerId: WalletProviderId;
  address?: string;
  network?: string;
  error?: string;
}

/**
 * The core interface for a wallet provider implementation.
 *
 * Providers handle connection, disconnection, capability detection,
 * and message signing operations for a specific wallet type.
 */
export interface WalletProvider {
  /** Unique identifier for this provider. */
  readonly id: WalletProviderId;

  /** Display name for the provider. */
  readonly name: WalletProviderName;

  /**
   * Check if this provider is available in the current environment.
   *
   * @returns true if available (installed/loaded), false otherwise
   */
  isAvailable(): boolean;

  /**
   * Get a human-readable reason why this provider is unavailable, if not available.
   *
   * @returns A reason string, or null if available
   */
  getUnavailableReason(): string | null;

  /**
   * Get the currently connected wallet address for this provider.
   *
   * Returns null if not connected, unavailable, or unable to determine.
   * Does not attempt to reconnect or establish new connections.
   *
   * @returns The connected address, or null
   */
  getConnectedAddress(): Promise<string | null>;

  /**
   * Request access to this wallet provider.
   *
   * Prompts the user if necessary and returns the connected address,
   * or null if the user declines or an error occurs.
   *
   * @returns The connected address, or null if unable to connect
   */
  requestAccess(): Promise<string | null>;

  /**
   * Sign a message with this provider.
   *
   * The message will be signed by the specified wallet address via
   * this provider. Returns the base64-encoded signature, or null if
   * the user declines, the wallet is unavailable, or an error occurs.
   *
   * @param message - The message to sign
   * @param walletAddress - The address to sign with
   * @returns The base64-encoded signature, or null on failure
   */
  signMessage(message: string, walletAddress: string): Promise<string | null>;

  /**
   * Disconnect from this wallet provider.
   *
   * For wallets that support explicit disconnection (e.g., revoking
   * persistent access), this should perform that action. Some wallets
   * may not support this operation.
   *
   * @returns Promise that resolves when disconnection is complete
   */
  disconnect(): Promise<void>;

  /**
   * Request that this provider check its connection state and emit
   * a change event if the state has changed since the last check.
   *
   * Used by WalletDetector to probe for state changes at intervals.
   *
   * @returns Promise that resolves when the check is complete
   */
  checkConnectionState(): Promise<void>;
}

/**
 * Event emitted when a wallet provider's connection state changes.
 */
export interface ProviderChangeEvent {
  /** The provider whose state changed. */
  providerId: WalletProviderId;
  /** The type of change that occurred. */
  changeType: "connected" | "disconnected" | "address_changed" | "network_changed";
  /** The new connection state. */
  state: ProviderConnectionState;
  /** The previous state, if known. */
  previous?: ProviderConnectionState;
}

/**
 * Listener called when a provider's connection state changes.
 */
export type ProviderChangeListener = (event: ProviderChangeEvent) => void;

/**
 * Registry of available wallet providers.
 * Manages provider initialization, availability checks, and routing.
 */
export interface WalletProviderRegistry {
  /**
   * Get all registered providers, optionally filtered.
   *
   * @param filter - Optional filter: "available" to include only available providers
   * @returns Array of provider info objects
   */
  getAllProviders(filter?: "available"): WalletProviderInfo[];

  /**
   * Get a specific provider by ID.
   *
   * @param providerId - The provider ID to retrieve
   * @returns The provider instance, or null if not found
   */
  getProvider(providerId: WalletProviderId): WalletProvider | null;

  /**
   * Get provider info (availability, name, etc.) by ID.
   *
   * @param providerId - The provider ID
   * @returns Provider info, or null if not found
   */
  getProviderInfo(providerId: WalletProviderId): WalletProviderInfo | null;

  /**
   * Get the first available provider, or null if none are available.
   *
   * @returns A provider instance, or null
   */
  getFirstAvailableProvider(): WalletProvider | null;

  /**
   * Get connection state for a specific provider.
   *
   * @param providerId - The provider to check
   * @returns Current connection state, or null if provider not found
   */
  getConnectionState(providerId: WalletProviderId): ProviderConnectionState | null;

  /**
   * Set the actively selected provider for future operations.
   *
   * @param providerId - The provider to select
   */
  selectProvider(providerId: WalletProviderId): void;

  /**
   * Get the currently selected provider.
   *
   * @returns The selected provider ID, or null if none selected
   */
  getSelectedProvider(): WalletProviderId | null;
}
