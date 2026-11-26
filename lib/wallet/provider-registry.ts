/**
 * Wallet provider registry and management.
 *
 * Central registry for all wallet providers, enabling provider discovery,
 * availability checking, provider selection, and connection state tracking.
 */

import type {
  WalletProvider,
  WalletProviderId,
  WalletProviderInfo,
  ProviderConnectionState,
  WalletProviderRegistry,
  ProviderChangeListener,
  ProviderChangeEvent,
} from "./provider-types";
import { FreighterProvider } from "./providers/freighter-provider";

/**
 * Default implementation of WalletProviderRegistry.
 *
 * Manages multiple wallet provider implementations and provides methods
 * for provider discovery, selection, and state tracking.
 */
export class DefaultProviderRegistry implements WalletProviderRegistry {
  private providers: Map<WalletProviderId, WalletProvider> = new Map();
  private providerInfo: Map<WalletProviderId, WalletProviderInfo> = new Map();
  private connectionStates: Map<WalletProviderId, ProviderConnectionState> = new Map();
  private selectedProviderId: WalletProviderId | null = null;
  private changeListeners: Set<ProviderChangeListener> = new Set();

  constructor() {
    this.initializeProviders();
    this.updateAllProviderInfo();
  }

  /**
   * Initialize all supported wallet providers.
   */
  private initializeProviders(): void {
    // Add Freighter provider
    const freighter = new FreighterProvider();
    this.providers.set(freighter.id, freighter);

    // Add more providers here as they are implemented
    // const webauthn = new StellarWebAuthnProvider();
    // this.providers.set(webauthn.id, webauthn);
  }

  /**
   * Update availability info for all providers.
   */
  private updateAllProviderInfo(): void {
    for (const [id, provider] of this.providers) {
      const isAvailable = provider.isAvailable();
      const unavailableReason = provider.getUnavailableReason();

      this.providerInfo.set(id, {
        id,
        name: provider.name,
        isAvailable,
        unavailableReason: unavailableReason ?? undefined,
        description: this.getProviderDescription(id),
        learnMoreUrl: this.getProviderLearnMoreUrl(id),
      });

      // Initialize connection state if not already present
      if (!this.connectionStates.has(id)) {
        this.connectionStates.set(id, {
          providerId: id,
          isConnected: false,
          address: null,
          lastChecked: 0,
        });
      }
    }
  }

  /**
   * Get a user-friendly description for a provider.
   */
  private getProviderDescription(providerId: WalletProviderId): string {
    switch (providerId) {
      case "freighter":
        return "A Stellar wallet browser extension for secure signing";
      case "stellar_webauthn":
        return "Authenticate with your device's biometric or security key";
      default:
        return "A Stellar wallet provider";
    }
  }

  /**
   * Get the help/learn more URL for a provider.
   */
  private getProviderLearnMoreUrl(providerId: WalletProviderId): string | undefined {
    switch (providerId) {
      case "freighter":
        return "https://www.freighter.app/";
      case "stellar_webauthn":
        return "https://developers.stellar.org/";
      default:
        return undefined;
    }
  }

  /**
   * Emit a provider change event to all listeners.
   */
  private emitChange(event: ProviderChangeEvent): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Provider change listener error:", error);
      }
    });
  }

  // ============ Implementation of WalletProviderRegistry ============

  getAllProviders(filter?: "available"): WalletProviderInfo[] {
    this.updateAllProviderInfo();

    const allProviders = Array.from(this.providerInfo.values());

    if (filter === "available") {
      return allProviders.filter((info) => info.isAvailable);
    }

    return allProviders;
  }

  getProvider(providerId: WalletProviderId): WalletProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  getProviderInfo(providerId: WalletProviderId): WalletProviderInfo | null {
    this.updateAllProviderInfo();
    return this.providerInfo.get(providerId) ?? null;
  }

  getFirstAvailableProvider(): WalletProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.isAvailable()) {
        return provider;
      }
    }
    return null;
  }

  getConnectionState(providerId: WalletProviderId): ProviderConnectionState | null {
    return this.connectionStates.get(providerId) ?? null;
  }

  selectProvider(providerId: WalletProviderId): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    this.selectedProviderId = providerId;
  }

  getSelectedProvider(): WalletProviderId | null {
    return this.selectedProviderId;
  }

  /**
   * Update connection state for a provider and emit change event.
   *
   * @internal Used by WalletDetector to update state
   */
  updateConnectionState(
    providerId: WalletProviderId,
    newState: ProviderConnectionState,
  ): void {
    const previous = this.connectionStates.get(providerId);
    this.connectionStates.set(providerId, newState);

    // Determine what changed
    let changeType: ProviderChangeEvent["changeType"] = "address_changed";

    if (previous && !previous.isConnected && newState.isConnected) {
      changeType = "connected";
    } else if (previous && previous.isConnected && !newState.isConnected) {
      changeType = "disconnected";
    } else if (previous && previous.address !== newState.address && newState.isConnected) {
      changeType = "address_changed";
    } else if (previous && previous.network !== newState.network) {
      changeType = "network_changed";
    }

    this.emitChange({
      providerId,
      changeType,
      state: newState,
      previous: previous ?? undefined,
    });
  }

  /**
   * Subscribe to provider state changes.
   *
   * @param listener - Called when any provider's state changes
   * @returns Unsubscribe function
   */
  onChange(listener: ProviderChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }
}

// Singleton instance
let registryInstance: DefaultProviderRegistry | null = null;

/**
 * Get the global wallet provider registry instance.
 *
 * @returns The singleton provider registry
 */
export function getProviderRegistry(): WalletProviderRegistry {
  if (!registryInstance) {
    registryInstance = new DefaultProviderRegistry();
  }
  return registryInstance;
}

/**
 * Reset the provider registry (primarily for testing).
 */
export function resetProviderRegistry(): void {
  registryInstance = null;
}
