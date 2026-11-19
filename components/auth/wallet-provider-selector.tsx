/**
 * WalletProviderSelector: Component for multi-provider wallet selection and reconnection.
 *
 * Displays available wallet providers, allows selection, reconnection, and disconnection,
 * and shows unavailable provider information with guidance.
 */

"use client";

import { useState } from "react";
import { useWalletProvider } from "@/hooks/use-wallet-provider";
import { NetworkBadge } from "@/components/common/network-badge";
import type { WalletProviderId } from "@/lib/wallet/provider-types";

interface WalletProviderSelectorProps {
  /** Called when user successfully connects to a provider */
  onConnected?: (providerId: WalletProviderId, address: string) => void;
  /** Called when user disconnects */
  onDisconnected?: () => void;
  /** Show provider selection UI. If false, only shows current connection status. */
  showSelection?: boolean;
}

/**
 * Multi-provider wallet selector component.
 *
 * Features:
 * - Displays all available wallet providers
 * - Shows connection status and address
 * - Allows provider switching
 * - Supports reconnection for the selected provider
 * - Shows unavailable providers with installation guidance
 */
export function WalletProviderSelector({
  onConnected,
  onDisconnected,
  showSelection = true,
}: WalletProviderSelectorProps) {
  const {
    allProviders,
    availableProviders,
    selectedProvider,
    selectedProviderState,
    isConnected,
    address,
    selectProvider,
    reconnect,
    disconnect,
  } = useWalletProvider();

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectProvider = async (providerId: WalletProviderId) => {
    try {
      setError(null);
      selectProvider(providerId);
      // Attempt to connect
      const available = availableProviders.find((p) => p.id === providerId);
      if (!available?.isAvailable) {
        setError(`${available?.name} is not available.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to select provider";
      setError(message);
    }
  };

  const handleReconnect = async () => {
    try {
      setError(null);
      setIsReconnecting(true);
      const success = await reconnect();
      if (success && selectedProvider && address) {
        onConnected?.(selectedProvider, address);
      } else {
        setError("Failed to reconnect. Please try again.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reconnection failed";
      setError(message);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setError(null);
      setIsDisconnecting(true);
      await disconnect();
      onDisconnected?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disconnection failed";
      setError(message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Connection Status */}
      {isConnected && address && selectedProvider && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-300">Connected Wallet</p>
              <p className="mt-1 text-xs font-mono text-slate-400">{address}</p>
              <div className="mt-2 flex items-center gap-2">
                <NetworkBadge />
                <span className="text-xs text-slate-500">
                  {allProviders.find((p) => p.id === selectedProvider)?.name}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReconnect}
                disabled={isReconnecting}
                className="h-9 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 transition"
                type="button"
              >
                {isReconnecting ? "Reconnecting..." : "Reconnect"}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="h-9 rounded-md border border-red-500/30 bg-red-500/10 px-3 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition"
                type="button"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-md bg-red-500/10 p-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Provider Selection */}
      {showSelection && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Wallet Providers</p>

          {/* Available Providers */}
          {availableProviders.length > 0 && (
            <div className="space-y-2">
              {availableProviders.map((provider) => {
                const isSelected = selectedProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSelectProvider(provider.id)}
                    className={`w-full rounded-md border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{provider.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{provider.description}</p>
                      </div>
                      {isSelected && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-cyan-500">
                          <div className="h-2 w-2 rounded-full bg-cyan-500" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Unavailable Providers */}
          {allProviders.length > availableProviders.length && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Not Available</p>
              {allProviders
                .filter((p) => !p.isAvailable)
                .map((provider) => (
                  <div
                    key={provider.id}
                    className="rounded-md border border-slate-700 bg-slate-900/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-400">{provider.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {provider.unavailableReason || "Not installed"}
                        </p>
                      </div>
                      {provider.learnMoreUrl && (
                        <a
                          href={provider.learnMoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          Learn More
                        </a>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
