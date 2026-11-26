# Multi-Wallet Provider Selection and Reconnect Controls

## Overview

This document describes the multi-wallet provider system that enables users to select between different wallet providers, reconnect to their wallets, and manage disconnections predictably.

## Scope

The implementation provides:

1. **Provider Selection**: Users can choose between multiple supported wallet providers (Freighter, Stellar WebAuthn)
2. **Capability Display**: Clear indication of available and unavailable providers with reasons
3. **Reconnect Controls**: Explicit button to reconnect to a provider
4. **Disconnect Controls**: Explicit button to disconnect from a provider
5. **Unavailable Provider States**: Informative UI for providers that aren't installed or available

## Architecture

### Core Components

#### Provider Types (`lib/wallet/provider-types.ts`)

Defines the interface for wallet providers:

- `WalletProvider`: Interface that all provider implementations must follow
- `WalletProviderId`: Unique identifier for each provider type
- `ProviderConnectionState`: Current connection state and metadata
- `WalletProviderRegistry`: Registry for managing multiple providers

#### Provider Registry (`lib/wallet/provider-registry.ts`)

Manages all wallet providers:

```typescript
const registry = getProviderRegistry();

// List all providers
const allProviders = registry.getAllProviders();
const availableOnly = registry.getAllProviders('available');

// Select and manage providers
registry.selectProvider('freighter');
const selected = registry.getSelectedProvider();

// Track connection state
const state = registry.getConnectionState('freighter');
```

**Key Features:**
- Singleton instance per app
- Provider discovery and filtering
- Connection state tracking
- Change event emission
- Provider selection management

#### Freighter Provider (`lib/wallet/providers/freighter-provider.ts`)

Implements the `WalletProvider` interface for Freighter:

```typescript
const provider = new FreighterProvider();

// Check availability
if (provider.isAvailable()) {
  const address = await provider.getConnectedAddress();
  await provider.requestAccess();
  const signature = await provider.signMessage(message, address);
  await provider.disconnect();
}
```

#### Wallet Detector (`lib/auth/wallet-detector.ts`)

Enhanced to support multiple providers:

```typescript
const detector = WalletDetector.getInstance();
await detector.initialize();

// Multi-provider support
await detector.reconnect(); // Reconnect to selected provider
await detector.disconnect(); // Disconnect from selected provider
await detector.switchProvider('freighter'); // Switch to different provider

// Listen to state changes
detector.onChange((event, state) => {
  // state.activeProvider indicates which provider is active
  // event.type can now include 'provider_changed'
});
```

**New Methods:**
- `reconnect()`: Reconnect to the currently selected provider
- `disconnect()`: Disconnect from the currently selected provider
- `switchProvider(providerId)`: Switch to and connect with a different provider

**Enhanced State:**
- `activeProvider`: Which provider is currently active

**New Events:**
- `provider_changed`: Emitted when switching between providers

### React Integration

#### Hook: `useWalletProvider` (`hooks/use-wallet-provider.ts`)

Provides React component access to provider management:

```typescript
const {
  allProviders,              // All registered providers
  availableProviders,        // Only available providers
  selectedProvider,          // Currently selected provider ID
  selectedProviderState,     // Connection state of selected provider
  isConnected,               // Is selected provider connected?
  address,                   // Connected address, if any
  
  selectProvider,            // (providerId) => void
  reconnect,                 // () => Promise<boolean>
  disconnect,                // () => Promise<void>
  getProviderInfo,           // (id) => WalletProviderInfo | null
  getProviderState,          // (id) => ProviderConnectionState | null
} = useWalletProvider();
```

#### Component: `WalletProviderSelector` (`components/auth/wallet-provider-selector.tsx`)

Full-featured UI component for provider selection and management:

**Features:**
- Display current connection status with address
- Reconnect button for the selected provider
- Disconnect button
- Provider selection with availability indicator
- Unavailable provider display with installation guidance
- Learn More links for unavailable providers
- Error messaging

**Props:**
```typescript
interface WalletProviderSelectorProps {
  onConnected?: (providerId: WalletProviderId, address: string) => void;
  onDisconnected?: () => void;
  showSelection?: boolean; // Toggle provider list (default: true)
}
```

## Design Principles

### 1. Never Silently Switch Providers or Reuse Authorization

- Explicit user action required to switch providers
- Each provider selection is deterministic and observable
- Authorization is never carried over between different wallet providers
- Account changes are always detected and surfaced

### 2. Deterministic and Bounded

- State transitions are predictable
- No race conditions in provider switching
- Connection state is always consistent
- Bounded number of providers (fixed set)

### 3. Observable

- All state changes emit events
- UI components can subscribe to provider changes
- Clear indication of available vs unavailable providers
- Error states are explicit and user-facing

### 4. Backward Compatible

- Existing code using Freighter continues to work
- New multi-provider features are additive
- No breaking changes to public APIs

## Usage Examples

### Basic Provider Selection

```typescript
import { WalletProviderSelector } from '@/components/auth/wallet-provider-selector';

export function ConnectWallet() {
  return (
    <WalletProviderSelector
      onConnected={(providerId, address) => {
        console.log(`Connected to ${providerId}: ${address}`);
      }}
      onDisconnected={() => {
        console.log('Disconnected');
      }}
    />
  );
}
```

### Programmatic Provider Management

```typescript
import { useWalletProvider } from '@/hooks/use-wallet-provider';

export function ProviderManager() {
  const { selectedProvider, reconnect, disconnect } = useWalletProvider();

  return (
    <div>
      <button onClick={() => reconnect()}>Reconnect</button>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
```

### Custom Provider Display

```typescript
import { useWalletProvider } from '@/hooks/use-wallet-provider';

export function ProviderStatus() {
  const { availableProviders, allProviders, isConnected, address } =
    useWalletProvider();

  return (
    <div>
      <h3>Available Providers</h3>
      {availableProviders.map((p) => (
        <div key={p.id}>{p.name}: {p.description}</div>
      ))}

      <h3>Not Available</h3>
      {allProviders
        .filter((p) => !p.isAvailable)
        .map((p) => (
          <div key={p.id}>
            {p.name}: {p.unavailableReason}
          </div>
        ))}

      {isConnected && <p>Connected: {address}</p>}
    </div>
  );
}
```

### Listening to Provider Changes

```typescript
import { WalletDetector } from '@/lib/auth';

const detector = WalletDetector.getInstance();

detector.onChange((event, state) => {
  console.log('Wallet event:', event.type);
  console.log('Active provider:', state.activeProvider);

  if (event.type === 'provider_changed') {
    console.log('User switched providers');
  }
});
```

## Testing

### Test Files

- `lib/wallet/__tests__/provider-registry.test.ts`: Provider registry tests
- `lib/auth/__tests__/wallet-detector-multi-provider.test.ts`: Wallet detector tests
- `hooks/__tests__/use-wallet-provider.test.ts`: Hook tests
- `components/auth/__tests__/wallet-provider-selector.test.tsx`: Component tests

### Key Test Coverage

**Provider Registry:**
- Provider discovery and filtering
- Provider selection
- Connection state tracking
- Change event emission
- Singleton pattern

**Wallet Detector:**
- Provider selection and switching
- Reconnection handling
- Disconnection handling
- Multi-provider state tracking
- Authorization not reused across providers
- Deterministic behavior

**Hook:**
- Provider discovery
- Provider selection
- Connection status
- Reconnection
- Disconnection

**Component:**
- Connection status display
- Reconnect controls
- Disconnect controls
- Provider selection UI
- Unavailable provider display
- Error handling

### Running Tests

```bash
# Run all tests
npm test

# Run multi-provider tests only
npm test -- wallet-provider

# Run specific test file
npm test -- provider-registry.test.ts
```

## Authorization and Security

### Session Isolation

- Each provider has separate connection state
- Switching providers clears the previous session
- Authorization tokens are never carried between providers
- Account addresses are strictly validated per provider

### Network Compatibility

- Network verification before signing
- Provider-specific network detection
- Clear error messages for network mismatches

## Configuration

No additional environment variables are required. The system detects available providers at runtime.

## Migration Guide

### For Existing Code

Existing code using `connectFreighterWallet()` and `signFreighterMessage()` continues to work without changes:

```typescript
// Still works
import { connectFreighterWallet, signFreighterMessage } from '@/lib/wallet';

const address = await connectFreighterWallet();
const signature = await signFreighterMessage(message, address);
```

### To Use Multi-Provider Features

To add multi-provider support to existing components:

1. Import `useWalletProvider` hook
2. Replace direct `connectFreighterWallet()` calls with hook-based selection
3. Add `WalletProviderSelector` component where appropriate

```typescript
// Before
const address = await connectFreighterWallet();

// After
const { selectedProvider, address, selectProvider } = useWalletProvider();
if (!address) {
  selectProvider('freighter');
}
```

## Future Extensions

The architecture supports adding new providers without changing existing code:

1. Create a new class implementing `WalletProvider` interface
2. Add it to `DefaultProviderRegistry.initializeProviders()`
3. Update `WalletProviderId` type union to include the new provider ID

Example:

```typescript
class StellarWebAuthnProvider implements WalletProvider {
  readonly id = 'stellar_webauthn' as const;
  readonly name = 'Stellar WebAuthn' as const;
  
  // Implement required methods...
}

// In DefaultProviderRegistry.initializeProviders():
const webauthn = new StellarWebAuthnProvider();
this.providers.set(webauthn.id, webauthn);
```

## Troubleshooting

### Provider Not Available

- Ensure the wallet extension is installed
- Check browser console for errors
- Verify `provider.isAvailable()` returns the correct value

### Reconnection Fails

- Verify the provider is still connected in the extension
- Check network connectivity
- Look for error messages in console and error state

### Provider Switch Not Working

- Ensure the target provider is available
- Check that provider ID is correct
- Verify no errors occurred during connection attempt

## References

- `@stellar/freighter-api`: Freighter wallet API
- `react-hook-form`: Form state management (related)
- `@tanstack/react-query`: Query management (related)
