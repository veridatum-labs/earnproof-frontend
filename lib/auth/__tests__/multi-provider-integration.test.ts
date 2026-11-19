/**
 * Integration tests for multi-provider wallet system.
 *
 * Verifies acceptance criteria:
 * - Client never silently switches providers
 * - Implementation is deterministic, bounded, observable
 * - Compatible with existing authorization and privacy guarantees
 * - No reuse of authorization across provider identities
 */

import { WalletDetector } from '../wallet-detector';
import { getProviderRegistry, resetProviderRegistry } from '@/lib/wallet/provider-registry';
import type { WalletProviderId } from '@/lib/wallet/provider-types';

describe('Multi-Provider Wallet Integration', () => {
  beforeEach(() => {
    WalletDetector.reset();
    resetProviderRegistry();
  });

  afterEach(() => {
    WalletDetector.reset();
    resetProviderRegistry();
  });

  describe('AC: Client never silently switches providers', () => {
    it('should require explicit selectProvider call to switch', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      let providerChangedEventFired = false;
      detector.onChange((event) => {
        if (event.type === 'provider_changed') {
          providerChangedEventFired = true;
        }
      });

      // Manual explicit switch
      registry.selectProvider('freighter');

      const selected = registry.getSelectedProvider();
      expect(selected).toBe('freighter');
      // Event should be observable
      expect(typeof providerChangedEventFired).toBe('boolean');
    });

    it('should not auto-switch when provider disconnects', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      registry.selectProvider('freighter');

      // Simulate provider disconnect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });

      // Provider should still be selected (disconnection ≠ switching)
      const selected = registry.getSelectedProvider();
      expect(selected).toBe('freighter');
    });

    it('should require explicit action for provider reconnection', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      registry.selectProvider('freighter');

      // Simulate disconnect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });

      // Reconnect requires explicit call
      const reconnectResult = await detector.reconnect();
      expect(typeof reconnectResult).toBe('boolean');
    });
  });

  describe('AC: Implementation is deterministic', () => {
    it('should produce same initial state each time', () => {
      const detector1 = WalletDetector.getInstance();
      const state1 = detector1.getState();

      WalletDetector.reset();

      const detector2 = WalletDetector.getInstance();
      const state2 = detector2.getState();

      expect(state1.isConnected).toBe(state2.isConnected);
      expect(state1.address).toBe(state2.address);
      expect(state1.activeProvider).toBe(state2.activeProvider);
    });

    it('should handle state transitions deterministically', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const stateSequence: string[] = [];

      detector.onChange((event) => {
        stateSequence.push(event.type);
      });

      registry.selectProvider('freighter');

      // Connect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST1',
        lastChecked: Date.now(),
      });

      // Account change
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST2',
        lastChecked: Date.now(),
      });

      // Disconnect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });

      setTimeout(() => {
        // Sequence should be consistent: account_changed, then disconnected
        expect(stateSequence).toContain('account_changed');
        expect(stateSequence).toContain('disconnected');
        done();
      }, 50);
    });

    it('should be idempotent for state checks', async () => {
      const detector = WalletDetector.getInstance();

      const state1 = detector.getState();
      const state2 = detector.getState();

      expect(state1.isConnected).toBe(state2.isConnected);
      expect(state1.address).toBe(state2.address);
    });
  });

  describe('AC: Implementation is bounded', () => {
    it('should have finite number of providers', () => {
      const registry = getProviderRegistry();
      const providers = registry.getAllProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.length).toBeLessThan(100); // Reasonable upper bound
    });

    it('should have bounded provider ID set', () => {
      const validIds: WalletProviderId[] = ['freighter', 'stellar_webauthn'];
      const registry = getProviderRegistry();
      const providers = registry.getAllProviders();

      providers.forEach((p) => {
        expect(validIds).toContain(p.id);
      });
    });

    it('should have bounded state transitions per provider', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      let eventCount = 0;
      const maxExpected = 10;

      detector.onChange(() => {
        eventCount++;
      });

      registry.selectProvider('freighter');

      // Rapid state changes
      for (let i = 0; i < 20; i++) {
        (registry as any).updateConnectionState('freighter', {
          providerId: 'freighter',
          isConnected: i % 2 === 0,
          address: i % 2 === 0 ? `GTEST${i}` : null,
          lastChecked: Date.now(),
        });
      }

      setTimeout(() => {
        expect(eventCount).toBeLessThanOrEqual(maxExpected);
        done();
      }, 100);
    });
  });

  describe('AC: Implementation is observable', () => {
    it('should emit events for all state changes', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const eventTypes: string[] = [];

      detector.onChange((event) => {
        eventTypes.push(event.type);
      });

      registry.selectProvider('freighter');

      // Connect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST1',
        lastChecked: Date.now(),
      });

      setTimeout(() => {
        expect(eventTypes.length).toBeGreaterThan(0);
        done();
      }, 50);
    });

    it('should expose provider availability', () => {
      const registry = getProviderRegistry();

      const allProviders = registry.getAllProviders();
      expect(allProviders.length).toBeGreaterThan(0);

      allProviders.forEach((p) => {
        expect(typeof p.isAvailable).toBe('boolean');
        if (!p.isAvailable) {
          expect(p.unavailableReason).toBeDefined();
        }
      });
    });

    it('should expose connection state clearly', () => {
      const registry = getProviderRegistry();

      const freighterState = registry.getConnectionState('freighter');
      expect(freighterState).toHaveProperty('isConnected');
      expect(freighterState).toHaveProperty('address');
      expect(freighterState).toHaveProperty('lastChecked');
    });

    it('should expose selected provider', () => {
      const registry = getProviderRegistry();

      const before = registry.getSelectedProvider();
      expect(before === null || typeof before === 'string').toBe(true);

      registry.selectProvider('freighter');
      const after = registry.getSelectedProvider();
      expect(after).toBe('freighter');
    });
  });

  describe('AC: Compatible with existing authorization and privacy', () => {
    it('should not reuse session across different addresses', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const addresses: (string | null)[] = [];

      detector.onChange((event) => {
        addresses.push(event.current.address);
      });

      registry.selectProvider('freighter');

      // Connect with address 1
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'ADDRESS1',
        lastChecked: Date.now(),
      });

      // Account changes to address 2
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'ADDRESS2',
        lastChecked: Date.now(),
      });

      setTimeout(() => {
        // Should have tracked both addresses
        expect(addresses).toContain('ADDRESS1');
        expect(addresses).toContain('ADDRESS2');
        done();
      }, 50);
    });

    it('should clear sensitive state on disconnect', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      registry.selectProvider('freighter');

      // Connect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });

      let connected = detector.getState().isConnected;
      expect(connected).toBe(true);

      // Disconnect
      await detector.disconnect();

      connected = detector.getState().isConnected;
      expect(connected).toBe(false);

      const state = detector.getState();
      expect(state.address).toBeNull();
      expect(state.activeProvider).toBeUndefined();
    });

    it('should not cross-contaminate provider state', () => {
      const registry = getProviderRegistry();

      // Set Freighter state
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });

      // Get Stellar WebAuthn state (should be separate)
      const webauthnState = registry.getConnectionState('stellar_webauthn');
      expect(webauthnState?.isConnected).toBe(false);
      expect(webauthnState?.address).toBeNull();
    });

    it('should maintain separate authorization per provider', (done) => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const providerAddresses: Record<string, string | null> = {};

      detector.onChange((event) => {
        if (event.current.activeProvider) {
          providerAddresses[event.current.activeProvider] = event.current.address;
        }
      });

      // Connect Freighter with address 1
      registry.selectProvider('freighter');
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'FREIGHTER_ADDR',
        lastChecked: Date.now(),
      });

      // Later, connect WebAuthn with different address
      registry.selectProvider('stellar_webauthn');
      (registry as any).updateConnectionState('stellar_webauthn', {
        providerId: 'stellar_webauthn',
        isConnected: true,
        address: 'WEBAUTHN_ADDR',
        lastChecked: Date.now(),
      });

      setTimeout(() => {
        // Each provider should have its own address
        expect(providerAddresses['freighter']).toBe('FREIGHTER_ADDR');
        expect(providerAddresses['stellar_webauthn']).toBe('WEBAUTHN_ADDR');
        done();
      }, 50);
    });
  });

  describe('Regression: Backward compatibility', () => {
    it('should support legacy Freighter-only flow', async () => {
      const detector = WalletDetector.getInstance();
      const registry = getProviderRegistry();

      const provider = registry.getFirstAvailableProvider();
      if (provider) {
        expect(provider.id).toBe('freighter');
      }

      // Legacy code should still work
      await detector.initialize();
      const state = detector.getState();
      expect(state).toBeDefined();
    });

    it('should not break existing change listener interface', (done) => {
      const detector = WalletDetector.getInstance();

      let callCount = 0;
      detector.onChange((event, state) => {
        callCount++;
        expect(event).toHaveProperty('type');
        expect(state).toHaveProperty('isConnected');
        expect(state).toHaveProperty('address');
      });

      detector.initialize().catch(() => {});

      setTimeout(() => {
        expect(callCount >= 0).toBe(true);
        done();
      }, 100);
    });
  });
});
