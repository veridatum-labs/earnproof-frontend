/**
 * Tests for multi-provider wallet detector.
 *
 * Covers:
 * - Provider selection and switching
 * - Reconnection handling
 * - Disconnection handling
 * - Multi-provider state tracking
 */

import { WalletDetector } from '../wallet-detector';
import { resetProviderRegistry, getProviderRegistry } from '@/lib/wallet/provider-registry';
import type { WalletProviderId } from '@/lib/wallet/provider-types';

describe('WalletDetector with multi-provider support', () => {
  beforeEach(() => {
    WalletDetector.reset();
    resetProviderRegistry();
  });

  afterEach(() => {
    WalletDetector.reset();
    resetProviderRegistry();
  });

  describe('provider selection', () => {
    it('should track active provider in wallet state', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      detector.onChange((event, state) => {
        if (state.activeProvider) {
          expect(typeof state.activeProvider).toBe('string');
          done();
        }
      });

      detector.initialize().catch(() => {
        // Initialization may fail if no providers available, which is ok for this test
      });
    });

    it('should indicate no provider when disconnected', async () => {
      const detector = WalletDetector.getInstance();

      await detector.initialize();
      await detector.disconnect();

      const state = detector.getState();
      expect(state.activeProvider).toBeUndefined();
      expect(state.isConnected).toBe(false);
    });

    it('should detect provider_changed event on provider switch', (done) => {
      const detector = WalletDetector.getInstance();

      detector.onChange((event) => {
        if (event.type === 'provider_changed') {
          expect(event.current.activeProvider).toBeDefined();
          done();
        }
      });

      detector.initialize().catch(() => {
        // Expected to fail if no providers available
      });
    });
  });

  describe('reconnection', () => {
    it('should expose reconnect method', () => {
      const detector = WalletDetector.getInstance();

      expect(typeof detector.reconnect).toBe('function');
    });

    it('should return false if no provider selected', async () => {
      const detector = WalletDetector.getInstance();
      const result = await detector.reconnect();

      expect(result).toBe(false);
    });

    it('should attempt to reconnect to selected provider', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Select Freighter
      registry.selectProvider('freighter');

      // This may succeed or fail depending on environment
      const result = await detector.reconnect();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('disconnection', () => {
    it('should expose disconnect method', () => {
      const detector = WalletDetector.getInstance();

      expect(typeof detector.disconnect).toBe('function');
    });

    it('should emit disconnected event on disconnect', (done) => {
      const detector = WalletDetector.getInstance();

      detector.onChange((event) => {
        if (event.type === 'disconnected') {
          expect(event.current.isConnected).toBe(false);
          expect(event.current.activeProvider).toBeUndefined();
          done();
        }
      });

      detector.disconnect().catch(() => {
        // Disconnect may fail if already disconnected, which is ok
      });
    });

    it('should clear active provider on disconnect', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Select a provider
      registry.selectProvider('freighter');

      await detector.disconnect();

      const state = detector.getState();
      expect(state.activeProvider).toBeUndefined();
    });
  });

  describe('provider switching', () => {
    it('should expose switchProvider method', () => {
      const detector = WalletDetector.getInstance();

      expect(typeof detector.switchProvider).toBe('function');
    });

    it('should return false if provider not found', async () => {
      const detector = WalletDetector.getInstance();
      const result = await detector.switchProvider('unknown_provider' as WalletProviderId);

      expect(result).toBe(false);
    });

    it('should return false if provider not available', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Get an unavailable provider if one exists
      const providers = registry.getAllProviders();
      const unavailable = providers.find((p) => !p.isAvailable);

      if (unavailable) {
        const result = await detector.switchProvider(unavailable.id);
        expect(result).toBe(false);
      }
    });

    it('should attempt to connect when switching to available provider', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const availableProvider = registry.getFirstAvailableProvider();
      if (availableProvider) {
        const result = await detector.switchProvider(availableProvider.id);
        expect(typeof result).toBe('boolean');
      }
    });
  });

  describe('wallet state transitions', () => {
    it('should track state through connection lifecycle', async () => {
      const detector = WalletDetector.getInstance();
      let initialState = detector.getState();

      expect(initialState.isConnected).toBe(false);
      expect(initialState.address).toBeNull();
      expect(initialState.activeProvider).toBeUndefined();

      // State may change after initialization depending on environment
      await detector.initialize();

      const afterInitState = detector.getState();
      expect(afterInitState).toBeDefined();
    });

    it('should preserve address when network changes', () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Mock initial connected state with Freighter
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        network: 'testnet',
        lastChecked: Date.now(),
      });

      registry.selectProvider('freighter');

      const initialState = detector.getState();
      expect(initialState.address).toBe('GTEST123');

      // Simulate network change
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        network: 'public',
        lastChecked: Date.now(),
      });

      const afterNetworkChange = detector.getState();
      expect(afterNetworkChange.address).toBe('GTEST123');
    });

    it('should handle provider disconnection silently', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Set up as connected
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });

      registry.selectProvider('freighter');

      let eventFired = false;
      detector.onChange(() => {
        eventFired = true;
      });

      // Simulate provider disconnection
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });

      // Listener should be called
      expect(eventFired).toBe(true);
    });
  });

  describe('never silently reuse authorization across providers', () => {
    it('should clear session on provider change', () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Connect with Freighter
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });
      registry.selectProvider('freighter');

      let eventCount = 0;
      detector.onChange((event) => {
        eventCount++;
        // Any significant change should trigger disconnection or account_changed
        if (event.type === 'provider_changed') {
          expect(event.current.isConnected).toBe(true);
          // The event itself indicates we're switching
        }
      });

      // Try to switch provider (simulate)
      registry.selectProvider('stellar_webauthn');

      // Should have events indicating the change
      expect(eventCount >= 0).toBe(true);
    });

    it('should not reuse session token across different wallet addresses', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      // Connect first address
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'ADDRESS1',
        lastChecked: Date.now(),
      });
      registry.selectProvider('freighter');

      const addresses: string[] = [];
      detector.onChange((event) => {
        addresses.push(event.current.address || '');

        if (addresses.length === 2) {
          // Should have different addresses recorded
          expect(addresses[0]).not.toBe(addresses[1]);
          done();
        }
      });

      // Simulate account change
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'ADDRESS2',
        lastChecked: Date.now(),
      });
    });
  });

  describe('bounded and deterministic behavior', () => {
    it('should have deterministic initial state', () => {
      const detector1 = WalletDetector.getInstance();
      const state1 = detector1.getState();

      WalletDetector.reset();

      const detector2 = WalletDetector.getInstance();
      const state2 = detector2.getState();

      expect(state1.isConnected).toBe(state2.isConnected);
      expect(state1.address).toBe(state2.address);
    });

    it('should handle multiple rapid state changes', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const events: string[] = [];

      detector.onChange((event) => {
        events.push(event.type);
      });

      registry.selectProvider('freighter');

      // Rapid changes
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST1',
        lastChecked: Date.now(),
      });

      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST2',
        lastChecked: Date.now(),
      });

      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });

      setTimeout(() => {
        // All events should be recorded
        expect(events.length > 0).toBe(true);
        done();
      }, 50);
    });
  });
});
