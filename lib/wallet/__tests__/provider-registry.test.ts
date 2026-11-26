/**
 * Tests for wallet provider registry.
 *
 * Covers:
 * - Provider discovery and availability
 * - Provider selection
 * - Connection state tracking
 * - Change event emission
 */

import { DefaultProviderRegistry, getProviderRegistry, resetProviderRegistry } from '../provider-registry';
import { FreighterProvider } from '../providers/freighter-provider';
import type { WalletProviderId } from '../provider-types';

describe('DefaultProviderRegistry', () => {
  beforeEach(() => {
    resetProviderRegistry();
  });

  afterEach(() => {
    resetProviderRegistry();
  });

  describe('provider discovery', () => {
    it('should list all registered providers', () => {
      const registry = getProviderRegistry();
      const providers = registry.getAllProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.id === 'freighter')).toBe(true);
    });

    it('should filter available providers', () => {
      const registry = getProviderRegistry();
      const available = registry.getAllProviders('available');

      expect(available.every((p) => p.isAvailable)).toBe(true);
    });

    it('should get provider info by ID', () => {
      const registry = getProviderRegistry();
      const info = registry.getProviderInfo('freighter');

      expect(info).not.toBeNull();
      expect(info?.id).toBe('freighter');
      expect(info?.name).toBe('Freighter');
      expect(typeof info?.description).toBe('string');
    });

    it('should return null for unknown provider ID', () => {
      const registry = getProviderRegistry();
      const info = registry.getProviderInfo('unknown_provider' as WalletProviderId);

      expect(info).toBeNull();
    });
  });

  describe('provider selection', () => {
    it('should select a provider', () => {
      const registry = getProviderRegistry();

      registry.selectProvider('freighter');
      expect(registry.getSelectedProvider()).toBe('freighter');
    });

    it('should throw on unknown provider selection', () => {
      const registry = getProviderRegistry();

      expect(() => {
        registry.selectProvider('unknown' as WalletProviderId);
      }).toThrow('Unknown provider');
    });

    it('should get first available provider', () => {
      const registry = getProviderRegistry();
      const provider = registry.getFirstAvailableProvider();

      if (provider) {
        expect(provider.isAvailable()).toBe(true);
      }
    });
  });

  describe('connection state', () => {
    it('should initialize connection states for all providers', () => {
      const registry = getProviderRegistry();

      const freighterState = registry.getConnectionState('freighter');
      expect(freighterState).not.toBeNull();
      expect(freighterState?.isConnected).toBe(false);
      expect(freighterState?.address).toBeNull();
    });

    it('should return null for unknown provider state', () => {
      const registry = getProviderRegistry();
      const state = registry.getConnectionState('unknown' as WalletProviderId);

      expect(state).toBeNull();
    });
  });

  describe('change events', () => {
    it('should emit change event when connection state updates', (done) => {
      const registry = getProviderRegistry();

      registry.onChange((event) => {
        expect(event.providerId).toBe('freighter');
        expect(event.changeType).toBe('connected');
        expect(event.state.isConnected).toBe(true);
        done();
      });

      // Simulate a connection state update
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });
    });

    it('should allow unsubscribing from change events', (done) => {
      const registry = getProviderRegistry();
      let callCount = 0;

      const unsubscribe = registry.onChange(() => {
        callCount++;
      });

      // Emit first event
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });

      unsubscribe();

      // Emit second event after unsubscribing
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 10);
    });

    it('should detect address_changed event type', (done) => {
      const registry = getProviderRegistry();

      // Set initial state
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GOLD123',
        lastChecked: Date.now(),
      });

      registry.onChange((event) => {
        if (event.changeType === 'address_changed') {
          expect(event.state.address).toBe('GNEW123');
          done();
        }
      });

      // Change address
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GNEW123',
        lastChecked: Date.now(),
      });
    });

    it('should detect disconnected event type', (done) => {
      const registry = getProviderRegistry();

      // Set initial connected state
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: true,
        address: 'GTEST123',
        lastChecked: Date.now(),
      });

      registry.onChange((event) => {
        if (event.changeType === 'disconnected') {
          expect(event.state.isConnected).toBe(false);
          done();
        }
      });

      // Disconnect
      (registry as any).updateConnectionState('freighter', {
        providerId: 'freighter',
        isConnected: false,
        address: null,
        lastChecked: Date.now(),
      });
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const registry1 = getProviderRegistry();
      const registry2 = getProviderRegistry();

      expect(registry1).toBe(registry2);
    });

    it('should reset instance', () => {
      const registry1 = getProviderRegistry();
      registry1.selectProvider('freighter');

      resetProviderRegistry();

      const registry2 = getProviderRegistry();
      expect(registry2.getSelectedProvider()).toBeNull();
    });
  });
});

describe('FreighterProvider', () => {
  describe('availability', () => {
    it('should check if Freighter is available', () => {
      const provider = new FreighterProvider();
      const available = provider.isAvailable();

      expect(typeof available).toBe('boolean');
    });

    it('should provide unavailable reason if not available', () => {
      const provider = new FreighterProvider();
      if (!provider.isAvailable()) {
        const reason = provider.getUnavailableReason();
        expect(reason).not.toBeNull();
        expect(typeof reason).toBe('string');
      }
    });

    it('should return null reason if available', () => {
      const provider = new FreighterProvider();
      if (provider.isAvailable()) {
        const reason = provider.getUnavailableReason();
        expect(reason).toBeNull();
      }
    });
  });

  describe('provider interface compliance', () => {
    it('should have correct ID and name', () => {
      const provider = new FreighterProvider();

      expect(provider.id).toBe('freighter');
      expect(provider.name).toBe('Freighter');
    });

    it('should implement all required methods', () => {
      const provider = new FreighterProvider();

      expect(typeof provider.isAvailable).toBe('function');
      expect(typeof provider.getUnavailableReason).toBe('function');
      expect(typeof provider.getConnectedAddress).toBe('function');
      expect(typeof provider.requestAccess).toBe('function');
      expect(typeof provider.signMessage).toBe('function');
      expect(typeof provider.disconnect).toBe('function');
      expect(typeof provider.checkConnectionState).toBe('function');
    });
  });
});
