/**
 * Tests for useWalletProvider hook.
 *
 * Covers:
 * - Provider discovery and filtering
 * - Provider selection
 * - Reconnection
 * - Disconnection
 */

import { renderHook, act } from '@testing-library/react';
import { useWalletProvider } from '../use-wallet-provider';
import { resetProviderRegistry } from '@/lib/wallet/provider-registry';

describe('useWalletProvider hook', () => {
  beforeEach(() => {
    resetProviderRegistry();
  });

  afterEach(() => {
    resetProviderRegistry();
  });

  describe('provider discovery', () => {
    it('should return all providers', () => {
      const { result } = renderHook(() => useWalletProvider());

      expect(Array.isArray(result.current.allProviders)).toBe(true);
      expect(result.current.allProviders.length).toBeGreaterThan(0);
    });

    it('should return only available providers', () => {
      const { result } = renderHook(() => useWalletProvider());

      expect(Array.isArray(result.current.availableProviders)).toBe(true);
      result.current.availableProviders.forEach((provider) => {
        expect(provider.isAvailable).toBe(true);
      });
    });

    it('should include Freighter provider', () => {
      const { result } = renderHook(() => useWalletProvider());

      const hasFreighter = result.current.allProviders.some((p) => p.id === 'freighter');
      expect(hasFreighter).toBe(true);
    });

    it('should provide provider info', () => {
      const { result } = renderHook(() => useWalletProvider());

      const info = result.current.getProviderInfo('freighter');
      expect(info).not.toBeNull();
      expect(info?.id).toBe('freighter');
      expect(info?.name).toBe('Freighter');
    });
  });

  describe('provider selection', () => {
    it('should start with no selected provider', () => {
      const { result } = renderHook(() => useWalletProvider());

      expect(result.current.selectedProvider).toBeNull();
    });

    it('should select a provider', () => {
      const { result } = renderHook(() => useWalletProvider());

      act(() => {
        result.current.selectProvider('freighter');
      });

      expect(result.current.selectedProvider).toBe('freighter');
    });

    it('should track selected provider state', () => {
      const { result } = renderHook(() => useWalletProvider());

      act(() => {
        result.current.selectProvider('freighter');
      });

      const state = result.current.selectedProviderState;
      expect(state).not.toBeNull();
      expect(state?.providerId).toBe('freighter');
    });
  });

  describe('connection status', () => {
    it('should start as disconnected', () => {
      const { result } = renderHook(() => useWalletProvider());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.address).toBeNull();
    });

    it('should expose getProviderState', () => {
      const { result } = renderHook(() => useWalletProvider());

      const state = result.current.getProviderState('freighter');
      expect(state).not.toBeNull();
      expect(typeof state?.isConnected).toBe('boolean');
    });
  });

  describe('reconnection', () => {
    it('should expose reconnect method', () => {
      const { result } = renderHook(() => useWalletProvider());

      expect(typeof result.current.reconnect).toBe('function');
    });

    it('should return a boolean from reconnect', async () => {
      const { result } = renderHook(() => useWalletProvider());

      act(() => {
        result.current.selectProvider('freighter');
      });

      let reconnectResult: boolean | undefined;
      await act(async () => {
        reconnectResult = await result.current.reconnect();
      });

      expect(typeof reconnectResult).toBe('boolean');
    });

    it('should return false if no provider selected', async () => {
      const { result } = renderHook(() => useWalletProvider());

      let reconnectResult: boolean | undefined;
      await act(async () => {
        reconnectResult = await result.current.reconnect();
      });

      expect(reconnectResult).toBe(false);
    });
  });

  describe('disconnection', () => {
    it('should expose disconnect method', () => {
      const { result } = renderHook(() => useWalletProvider());

      expect(typeof result.current.disconnect).toBe('function');
    });

    it('should complete disconnect operation', async () => {
      const { result } = renderHook(() => useWalletProvider());

      act(() => {
        result.current.selectProvider('freighter');
      });

      await act(async () => {
        await result.current.disconnect();
      });

      // Should complete without error
      expect(true).toBe(true);
    });
  });

  describe('capability display', () => {
    it('should show provider descriptions', () => {
      const { result } = renderHook(() => useWalletProvider());

      result.current.allProviders.forEach((provider) => {
        expect(typeof provider.description).toBe('string');
        expect(provider.description.length).toBeGreaterThan(0);
      });
    });

    it('should indicate unavailable providers', () => {
      const { result } = renderHook(() => useWalletProvider());

      const unavailable = result.current.allProviders.filter((p) => !p.isAvailable);
      unavailable.forEach((provider) => {
        expect(provider.unavailableReason).toBeDefined();
      });
    });

    it('should provide learn more URLs where available', () => {
      const { result } = renderHook(() => useWalletProvider());

      const freighter = result.current.allProviders.find((p) => p.id === 'freighter');
      if (freighter?.isAvailable) {
        expect(freighter.learnMoreUrl).toContain('freighter');
      }
    });
  });

  describe('filtering and display', () => {
    it('should separate available and unavailable providers', () => {
      const { result } = renderHook(() => useWalletProvider());

      const allCount = result.current.allProviders.length;
      const availableCount = result.current.availableProviders.length;

      expect(availableCount <= allCount).toBe(true);
    });

    it('should show provider names for display', () => {
      const { result } = renderHook(() => useWalletProvider());

      result.current.allProviders.forEach((provider) => {
        expect(['Freighter', 'Stellar WebAuthn']).toContain(provider.name);
      });
    });
  });
});
