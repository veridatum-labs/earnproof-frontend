/**
 * WalletDetector: Monitors wallet account and network changes across multiple providers.
 *
 * Detects when:
 * - User switches to a different wallet address
 * - User switches networks (testnet ↔ mainnet)
 * - Wallet becomes disconnected
 * - Provider is switched
 *
 * Signals should be handled to invalidate cached data before render.
 */

import { getProviderRegistry } from '@/lib/wallet/provider-registry';
import type { WalletProviderId } from '@/lib/wallet/provider-types';

export interface WalletState {
  address: string | null;
  network: string;
  isConnected: boolean;
  lastChecked: number;
  /** The active provider for this connection, if connected. */
  activeProvider?: WalletProviderId;
}

export type WalletChangeListener = (
  change: WalletChangeEvent,
  newState: WalletState,
) => void;

export interface WalletChangeEvent {
  type: 'account_changed' | 'network_changed' | 'disconnected' | 'connected' | 'provider_changed';
  previous?: WalletState;
  current: WalletState;
}

/**
 * WalletDetector monitors multi-provider wallet state and triggers callbacks
 * when account, network, or provider changes are detected.
 */
export class WalletDetector {
  private static instance: WalletDetector;
  private state: WalletState;
  private listeners: Set<WalletChangeListener> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly DEFAULT_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
  private registry = getProviderRegistry();
  private registryUnsubscribe: (() => void) | null = null;

  private constructor() {
    this.state = {
      address: null,
      network: this.DEFAULT_NETWORK,
      isConnected: false,
      lastChecked: Date.now(),
      activeProvider: undefined,
    };
  }

  static getInstance(): WalletDetector {
    if (!WalletDetector.instance) {
      WalletDetector.instance = new WalletDetector();
    }
    return WalletDetector.instance;
  }

  /**
   * Initialize wallet detection. Should be called once on app load.
   * Starts periodic checking for wallet changes and subscribes to provider changes.
   *
   * @param checkIntervalMs How often to poll wallet state (default: 3000ms)
   */
  async initialize(checkIntervalMs: number = 3000): Promise<void> {
    // Subscribe to provider registry changes
    this.registryUnsubscribe = this.registry.onChange((event) => {
      // Provider state changed; check if it affects our active connection
      if (event.providerId === this.state.activeProvider) {
        // Connection state for active provider changed
        if (event.changeType === 'disconnected') {
          this.clearSession('provider_disconnected');
        } else if (event.changeType === 'address_changed') {
          this.clearSession('account_changed_in_provider');
        } else if (event.changeType === 'network_changed') {
          this.clearSession('network_changed_in_provider');
        }
      }
    });

    await this.checkWallet();

    // Check periodically for changes
    this.checkInterval = setInterval(() => {
      this.checkWallet().catch((error) => {
        console.error('Wallet check error:', error);
      });
    }, checkIntervalMs);
  }

  /**
   * Stop wallet detection and cleanup.
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.registryUnsubscribe) {
      this.registryUnsubscribe();
      this.registryUnsubscribe = null;
    }
  }

  /**
   * Check current wallet state and emit change events if different.
   * Safe to call multiple times; only emits if state actually changed.
   * 
   * Checks the selected provider's connection state.
   */
  async checkWallet(): Promise<void> {
    try {
      const selectedProviderId = this.registry.getSelectedProvider();
      
      if (!selectedProviderId) {
        // No provider selected; check if first available provider is connected
        const availableProvider = this.registry.getFirstAvailableProvider();
        if (availableProvider) {
          this.registry.selectProvider(availableProvider.id);
        } else {
          // No providers available at all
          this.handleDisconnected();
          return;
        }
      }

      const provider = this.registry.getProvider(selectedProviderId!);
      if (!provider) {
        this.handleDisconnected();
        return;
      }

      const newAddress = await provider.getConnectedAddress();
      const newNetwork = this.DEFAULT_NETWORK;
      const isConnected = newAddress !== null;

      const previous = { ...this.state };
      const changed = this.detectChanges(
        selectedProviderId!,
        newAddress,
        newNetwork,
        isConnected,
      );

      if (changed) {
        this.state = {
          address: newAddress,
          network: newNetwork,
          isConnected,
          lastChecked: Date.now(),
          activeProvider: selectedProviderId,
        };

        this.emitChange(changed, previous, this.state);
      }
    } catch (error) {
      console.error('Wallet check error:', error);
      this.handleDisconnected();
    }
  }

  /**
   * Handle wallet disconnection state.
   */
  private handleDisconnected(): void {
    const wasConnected = this.state.isConnected;

    if (wasConnected) {
      const previous = { ...this.state };
      this.state = {
        address: null,
        network: this.DEFAULT_NETWORK,
        isConnected: false,
        lastChecked: Date.now(),
        activeProvider: undefined,
      };

      this.emitChange(
        {
          type: 'disconnected',
          current: this.state,
          previous,
        },
        previous,
        this.state,
      );
    }
  }

  /**
   * Clear wallet session (called by auth context when wallet changes).
   */
  private clearSession(reason: string): void {
    const wasConnected = this.state.isConnected;
    if (wasConnected) {
      const previous = { ...this.state };
      this.state = {
        address: null,
        network: this.DEFAULT_NETWORK,
        isConnected: false,
        lastChecked: Date.now(),
        activeProvider: undefined,
      };

      const eventType =
        reason === 'account_changed_in_provider'
          ? 'account_changed'
          : reason === 'network_changed_in_provider'
            ? 'network_changed'
            : 'disconnected';

      this.emitChange(
        {
          type: eventType as any,
          current: this.state,
          previous,
        },
        previous,
        this.state,
      );
    }
  }

  /**
   * Get the current wallet state (snapshot).
   */
  getState(): WalletState {
    return { ...this.state };
  }

  /**
   * Subscribe to wallet changes.
   * Listener will be called whenever account, network, or connection status changes.
   */
  onChange(listener: WalletChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Force a manual wallet check (e.g., after user clicks "Check Wallet").
   */
  async forceCheck(): Promise<void> {
    await this.checkWallet();
  }

  /**
   * Reconnect to the currently selected provider.
   * Calls requestAccess on the provider to re-establish connection.
   *
   * @returns true if reconnection succeeded, false otherwise
   */
  async reconnect(): Promise<boolean> {
    const selectedProviderId = this.registry.getSelectedProvider();
    if (!selectedProviderId) {
      console.warn('No provider selected for reconnection');
      return false;
    }

    const provider = this.registry.getProvider(selectedProviderId);
    if (!provider) {
      console.warn(`Provider not found: ${selectedProviderId}`);
      return false;
    }

    try {
      const address = await provider.requestAccess();
      if (address) {
        await this.checkWallet();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Reconnection failed:', error);
      return false;
    }
  }

  /**
   * Disconnect from the currently selected provider.
   */
  async disconnect(): Promise<void> {
    const selectedProviderId = this.registry.getSelectedProvider();
    if (!selectedProviderId) {
      return;
    }

    const provider = this.registry.getProvider(selectedProviderId);
    if (provider) {
      try {
        await provider.disconnect();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }

    const previous = { ...this.state };
    this.state = {
      address: null,
      network: this.DEFAULT_NETWORK,
      isConnected: false,
      lastChecked: Date.now(),
      activeProvider: undefined,
    };

    if (previous.isConnected) {
      this.emitChange(
        {
          type: 'disconnected',
          current: this.state,
          previous,
        },
        previous,
        this.state,
      );
    }
  }

  /**
   * Switch to a different provider and try to connect.
   *
   * @param providerId The provider to switch to
   * @returns true if connection succeeded, false otherwise
   */
  async switchProvider(providerId: WalletProviderId): Promise<boolean> {
    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      console.warn(`Provider not found: ${providerId}`);
      return false;
    }

    if (!provider.isAvailable()) {
      console.warn(`Provider not available: ${providerId}`);
      return false;
    }

    this.registry.selectProvider(providerId);

    try {
      const address = await provider.requestAccess();
      if (address) {
        await this.checkWallet();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Provider switch failed:', error);
      return false;
    }
  }

  /**
   * Emit wallet change event to all listeners.
   */
  private emitChange(
    event: WalletChangeEvent,
    previous: WalletState,
    current: WalletState,
  ): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event, current);
      } catch (error) {
        console.error('Wallet change listener error:', error);
      }
    });
  }

  /**
   * Detect what changed in wallet state.
   */
  private detectChanges(
    providerId: WalletProviderId,
    newAddress: string | null,
    newNetwork: string,
    isConnected: boolean,
  ): WalletChangeEvent | null {
    const addressChanged = newAddress !== this.state.address;
    const networkChanged = newNetwork !== this.state.network;
    const connectedChanged = isConnected !== this.state.isConnected;
    const providerChanged = providerId !== this.state.activeProvider;

    if (!addressChanged && !networkChanged && !connectedChanged && !providerChanged) {
      return null; // No change
    }

    // Determine the type of change
    if (isConnected && !this.state.isConnected) {
      return {
        type: 'connected',
        current: {
          address: newAddress,
          network: newNetwork,
          isConnected,
          lastChecked: Date.now(),
          activeProvider: providerId,
        },
      };
    }

    if (!isConnected && this.state.isConnected) {
      return {
        type: 'disconnected',
        current: {
          address: null,
          network: newNetwork,
          isConnected: false,
          lastChecked: Date.now(),
          activeProvider: undefined,
        },
      };
    }

    if (addressChanged && isConnected) {
      return {
        type: 'account_changed',
        current: {
          address: newAddress,
          network: newNetwork,
          isConnected,
          lastChecked: Date.now(),
          activeProvider: providerId,
        },
      };
    }

    if (networkChanged) {
      return {
        type: 'network_changed',
        current: {
          address: newAddress,
          network: newNetwork,
          isConnected,
          lastChecked: Date.now(),
          activeProvider: providerId,
        },
      };
    }

    if (providerChanged && isConnected) {
      return {
        type: 'provider_changed',
        current: {
          address: newAddress,
          network: newNetwork,
          isConnected,
          lastChecked: Date.now(),
          activeProvider: providerId,
        },
      };
    }

    return null;
  }

  /**
   * Reset the detector (primarily for testing).
   */
  static reset(): void {
    if (WalletDetector.instance) {
      WalletDetector.instance.destroy();
      WalletDetector.instance.listeners.clear();
    }
    WalletDetector.instance = null as any;
  }
}
