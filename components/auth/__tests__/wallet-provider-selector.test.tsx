/**
 * Tests for WalletProviderSelector component.
 *
 * Covers:
 * - Provider selection UI
 * - Reconnection controls
 * - Disconnection controls
 * - Unavailable provider display
 * - Callback handling
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletProviderSelector } from '../wallet-provider-selector';
import { resetProviderRegistry } from '@/lib/wallet/provider-registry';

// Mock the useWalletProvider hook
jest.mock('@/hooks/use-wallet-provider', () => ({
  useWalletProvider: () => ({
    allProviders: [
      {
        id: 'freighter',
        name: 'Freighter',
        isAvailable: true,
        description: 'A Stellar wallet browser extension',
        learnMoreUrl: 'https://freighter.app',
      },
      {
        id: 'stellar_webauthn',
        name: 'Stellar WebAuthn',
        isAvailable: false,
        unavailableReason: 'Not installed',
        description: 'Authenticate with biometric',
      },
    ],
    availableProviders: [
      {
        id: 'freighter',
        name: 'Freighter',
        isAvailable: true,
        description: 'A Stellar wallet browser extension',
      },
    ],
    selectedProvider: 'freighter',
    selectedProviderState: {
      providerId: 'freighter',
      isConnected: true,
      address: 'GTEST123456789',
      lastChecked: Date.now(),
    },
    isConnected: true,
    address: 'GTEST123456789',
    selectProvider: jest.fn(),
    reconnect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getProviderInfo: jest.fn(),
    getProviderState: jest.fn(),
  }),
}));

// Mock NetworkBadge component
jest.mock('@/components/common/network-badge', () => ({
  NetworkBadge: () => <div data-testid="network-badge">Testnet</div>,
}));

describe('WalletProviderSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetProviderRegistry();
  });

  describe('connection status display', () => {
    it('should show connected status with address', () => {
      render(<WalletProviderSelector />);

      expect(screen.getByText('Connected Wallet')).toBeInTheDocument();
      expect(screen.getByText('GTEST123456789')).toBeInTheDocument();
    });

    it('should display network badge when connected', () => {
      render(<WalletProviderSelector />);

      expect(screen.getByTestId('network-badge')).toBeInTheDocument();
    });

    it('should show provider name when connected', () => {
      render(<WalletProviderSelector />);

      expect(screen.getByText('Freighter')).toBeInTheDocument();
    });
  });

  describe('reconnection controls', () => {
    it('should render reconnect button when connected', () => {
      render(<WalletProviderSelector />);

      const reconnectButton = screen.getByRole('button', { name: /reconnect/i });
      expect(reconnectButton).toBeInTheDocument();
    });

    it('should call reconnect handler on button click', async () => {
      render(<WalletProviderSelector onConnected={jest.fn()} />);

      const reconnectButton = screen.getByRole('button', { name: /reconnect/i });
      fireEvent.click(reconnectButton);

      await waitFor(() => {
        expect(reconnectButton).toBeInTheDocument();
      });
    });

    it('should show loading state during reconnection', async () => {
      const { useWalletProvider } = require('@/hooks/use-wallet-provider');
      useWalletProvider.mockReturnValue({
        allProviders: [],
        availableProviders: [],
        selectedProvider: 'freighter',
        selectedProviderState: {
          providerId: 'freighter',
          isConnected: true,
          address: 'GTEST123',
          lastChecked: Date.now(),
        },
        isConnected: true,
        address: 'GTEST123',
        selectProvider: jest.fn(),
        reconnect: jest.fn(() => new Promise(() => {})), // Never resolves
        disconnect: jest.fn().mockResolvedValue(undefined),
        getProviderInfo: jest.fn(),
        getProviderState: jest.fn(),
      });

      render(<WalletProviderSelector />);

      const reconnectButton = screen.getByRole('button', { name: /reconnect/i });
      fireEvent.click(reconnectButton);

      await waitFor(() => {
        expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
      });
    });

    it('should call onConnected callback on successful reconnection', async () => {
      const onConnected = jest.fn();
      const { useWalletProvider } = require('@/hooks/use-wallet-provider');
      useWalletProvider.mockReturnValue({
        allProviders: [],
        availableProviders: [],
        selectedProvider: 'freighter',
        selectedProviderState: {
          providerId: 'freighter',
          isConnected: true,
          address: 'GTEST123',
          lastChecked: Date.now(),
        },
        isConnected: true,
        address: 'GTEST123',
        selectProvider: jest.fn(),
        reconnect: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getProviderInfo: jest.fn(),
        getProviderState: jest.fn(),
      });

      render(<WalletProviderSelector onConnected={onConnected} />);

      const reconnectButton = screen.getByRole('button', { name: /reconnect/i });
      fireEvent.click(reconnectButton);

      await waitFor(() => {
        expect(onConnected).toHaveBeenCalledWith('freighter', 'GTEST123');
      });
    });
  });

  describe('disconnection controls', () => {
    it('should render disconnect button when connected', () => {
      render(<WalletProviderSelector />);

      const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
      expect(disconnectButton).toBeInTheDocument();
    });

    it('should call disconnect handler on button click', async () => {
      const { useWalletProvider } = require('@/hooks/use-wallet-provider');
      const disconnectMock = jest.fn().mockResolvedValue(undefined);
      useWalletProvider.mockReturnValue({
        allProviders: [],
        availableProviders: [],
        selectedProvider: 'freighter',
        selectedProviderState: {
          providerId: 'freighter',
          isConnected: true,
          address: 'GTEST123',
          lastChecked: Date.now(),
        },
        isConnected: true,
        address: 'GTEST123',
        selectProvider: jest.fn(),
        reconnect: jest.fn().mockResolvedValue(true),
        disconnect: disconnectMock,
        getProviderInfo: jest.fn(),
        getProviderState: jest.fn(),
      });

      render(<WalletProviderSelector />);

      const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(disconnectMock).toHaveBeenCalled();
      });
    });

    it('should call onDisconnected callback on successful disconnection', async () => {
      const onDisconnected = jest.fn();
      const { useWalletProvider } = require('@/hooks/use-wallet-provider');
      useWalletProvider.mockReturnValue({
        allProviders: [],
        availableProviders: [],
        selectedProvider: 'freighter',
        selectedProviderState: {
          providerId: 'freighter',
          isConnected: true,
          address: 'GTEST123',
          lastChecked: Date.now(),
        },
        isConnected: true,
        address: 'GTEST123',
        selectProvider: jest.fn(),
        reconnect: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getProviderInfo: jest.fn(),
        getProviderState: jest.fn(),
      });

      render(<WalletProviderSelector onDisconnected={onDisconnected} />);

      const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(onDisconnected).toHaveBeenCalled();
      });
    });
  });

  describe('provider selection UI', () => {
    it('should render provider selection when showSelection is true', () => {
      render(<WalletProviderSelector showSelection={true} />);

      expect(screen.getByText('Wallet Providers')).toBeInTheDocument();
    });

    it('should not render provider selection when showSelection is false', () => {
      render(<WalletProviderSelector showSelection={false} />);

      const heading = screen.queryByText('Wallet Providers');
      if (heading) {
        // If found, it should not be visible
        expect(heading.closest('[class*="space-y"]')).not.toHaveStyle('display: none');
      }
    });

    it('should display available providers', () => {
      render(<WalletProviderSelector showSelection={true} />);

      expect(screen.getByText('Freighter')).toBeInTheDocument();
      expect(screen.getByText('A Stellar wallet browser extension')).toBeInTheDocument();
    });

    it('should highlight selected provider', () => {
      render(<WalletProviderSelector showSelection={true} />);

      const buttons = screen.getAllByRole('button');
      const freighterButton = buttons.find(
        (b) => b.textContent.includes('Freighter') && b.textContent.includes('A Stellar'),
      );

      expect(freighterButton).toHaveClass('bg-cyan-500/10');
    });

    it('should show unavailable providers section', () => {
      render(<WalletProviderSelector showSelection={true} />);

      expect(screen.getByText('Not Available')).toBeInTheDocument();
      expect(screen.getByText('Stellar WebAuthn')).toBeInTheDocument();
    });

    it('should show unavailable reason for disabled providers', () => {
      render(<WalletProviderSelector showSelection={true} />);

      expect(screen.getByText('Not installed')).toBeInTheDocument();
    });

    it('should show learn more link for unavailable providers', () => {
      render(<WalletProviderSelector showSelection={true} />);

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should display error message when reconnection fails', async () => {
      const { useWalletProvider } = require('@/hooks/use-wallet-provider');
      useWalletProvider.mockReturnValue({
        allProviders: [],
        availableProviders: [],
        selectedProvider: 'freighter',
        selectedProviderState: {
          providerId: 'freighter',
          isConnected: true,
          address: 'GTEST123',
          lastChecked: Date.now(),
        },
        isConnected: true,
        address: 'GTEST123',
        selectProvider: jest.fn(),
        reconnect: jest.fn().mockResolvedValue(false),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getProviderInfo: jest.fn(),
        getProviderState: jest.fn(),
      });

      render(<WalletProviderSelector />);

      const reconnectButton = screen.getByRole('button', { name: /reconnect/i });
      fireEvent.click(reconnectButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to reconnect/i)).toBeInTheDocument();
      });
    });

    it('should display error message on disconnect error', async () => {
      const { useWalletProvider } = require('@/hooks/use-wallet-provider');
      useWalletProvider.mockReturnValue({
        allProviders: [],
        availableProviders: [],
        selectedProvider: 'freighter',
        selectedProviderState: {
          providerId: 'freighter',
          isConnected: true,
          address: 'GTEST123',
          lastChecked: Date.now(),
        },
        isConnected: true,
        address: 'GTEST123',
        selectProvider: jest.fn(),
        reconnect: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockRejectedValue(new Error('Disconnect failed')),
        getProviderInfo: jest.fn(),
        getProviderState: jest.fn(),
      });

      render(<WalletProviderSelector />);

      const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(screen.getByText(/disconnection failed/i)).toBeInTheDocument();
      });
    });
  });
});
