/**
 * useWalletProvider: React hook for wallet provider selection and management.
 *
 * Provides access to provider selection, reconnection, disconnection, and
 * capability display in React components.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getProviderRegistry } from "@/lib/wallet/provider-registry";
import type {
  WalletProviderId,
  WalletProviderInfo,
  ProviderConnectionState,
} from "@/lib/wallet/provider-types";

export interface UseWalletProviderResult {
  /** All available wallet providers */
  allProviders: WalletProviderInfo[];
  /** Only available (installed) wallet providers */
  availableProviders: WalletProviderInfo[];
  /** Currently selected provider ID, or null if none selected */
  selectedProvider: WalletProviderId | null;
  /** Connection state of the selected provider */
  selectedProviderState: ProviderConnectionState | null;
  /** Whether the selected provider is connected */
  isConnected: boolean;
  /** Connected wallet address for the selected provider, if connected */
  address: string | null;

  /** Select a different provider */
  selectProvider: (providerId: WalletProviderId) => void;
  /** Attempt to reconnect to the selected provider */
  reconnect: () => Promise<boolean>;
  /** Disconnect from the selected provider */
  disconnect: () => Promise<void>;
  /** Get info about a specific provider */
  getProviderInfo: (providerId: WalletProviderId) => WalletProviderInfo | null;
  /** Get connection state for a specific provider */
  getProviderState: (providerId: WalletProviderId) => ProviderConnectionState | null;
}

/**
 * Hook for managing wallet provider selection and connection state.
 *
 * Subscribes to provider registry changes and surfaces provider information,
 * selection, and connection state for UI components.
 *
 * @returns Provider management interface
 */
export function useWalletProvider(): UseWalletProviderResult {
  const registry = useMemo(() => getProviderRegistry(), []);

  const [selectedProvider, setSelectedProvider] = useState<WalletProviderId | null>(() => {
    return registry.getSelectedProvider();
  });

  const [allProviders, setAllProviders] = useState<WalletProviderInfo[]>(() => {
    return registry.getAllProviders();
  });

  const [providerStates, setProviderStates] = useState<
    Map<WalletProviderId, ProviderConnectionState>
  >(() => {
    const states = new Map<WalletProviderId, ProviderConnectionState>();
    for (const provider of registry.getAllProviders()) {
      const state = registry.getConnectionState(provider.id);
      if (state) {
        states.set(provider.id, state);
      }
    }
    return states;
  });

  // Subscribe to provider changes
  useEffect(() => {
    const unsubscribe = registry.onChange((event) => {
      // Update provider states
      setProviderStates((prev) => {
        const next = new Map(prev);
        next.set(event.providerId, event.state);
        return next;
      });

      // Update selected provider if selection changed
      const current = registry.getSelectedProvider();
      setSelectedProvider(current);

      // Refresh provider info (availability may have changed)
      setAllProviders(registry.getAllProviders());
    });

    return () => unsubscribe();
  }, [registry]);

  const availableProviders = useMemo(
    () => allProviders.filter((p) => p.isAvailable),
    [allProviders],
  );

  const selectedProviderState = useMemo(
    () => (selectedProvider ? providerStates.get(selectedProvider) ?? null : null),
    [selectedProvider, providerStates],
  );

  const handleSelectProvider = useCallback(
    (providerId: WalletProviderId) => {
      registry.selectProvider(providerId);
      setSelectedProvider(providerId);
    },
    [registry],
  );

  const handleReconnect = useCallback(async (): Promise<boolean> => {
    if (!selectedProvider) {
      return false;
    }

    const provider = registry.getProvider(selectedProvider);
    if (!provider) {
      return false;
    }

    try {
      const address = await provider.requestAccess();
      if (address) {
        // Update connection state
        setProviderStates((prev) => {
          const next = new Map(prev);
          next.set(selectedProvider, {
            providerId: selectedProvider,
            isConnected: true,
            address,
            lastChecked: Date.now(),
          });
          return next;
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Reconnect error:", error);
      return false;
    }
  }, [selectedProvider, registry]);

  const handleDisconnect = useCallback(async (): Promise<void> => {
    if (!selectedProvider) {
      return;
    }

    const provider = registry.getProvider(selectedProvider);
    if (provider) {
      try {
        await provider.disconnect();

        // Update connection state
        setProviderStates((prev) => {
          const next = new Map(prev);
          next.set(selectedProvider, {
            providerId: selectedProvider,
            isConnected: false,
            address: null,
            lastChecked: Date.now(),
          });
          return next;
        });
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    }
  }, [selectedProvider, registry]);

  const handleGetProviderInfo = useCallback(
    (providerId: WalletProviderId) => {
      return registry.getProviderInfo(providerId);
    },
    [registry],
  );

  const handleGetProviderState = useCallback(
    (providerId: WalletProviderId) => {
      return registry.getConnectionState(providerId);
    },
    [registry],
  );

  return {
    allProviders,
    availableProviders,
    selectedProvider,
    selectedProviderState,
    isConnected: selectedProviderState?.isConnected ?? false,
    address: selectedProviderState?.address ?? null,
    selectProvider: handleSelectProvider,
    reconnect: handleReconnect,
    disconnect: handleDisconnect,
    getProviderInfo: handleGetProviderInfo,
    getProviderState: handleGetProviderState,
  };
}
