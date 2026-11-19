/**
 * Freighter wallet provider implementation.
 *
 * Adapts the Freighter Stellar wallet API to the WalletProvider interface,
 * enabling Freighter to participate in the multi-provider wallet system.
 */

import type { WalletProvider, ProviderConnectionState } from "../provider-types";
import { appConfig } from "@/config/app";

async function loadFreighter(): Promise<{
  getAddress: typeof import("@stellar/freighter-api").getAddress;
  requestAccess: typeof import("@stellar/freighter-api").requestAccess;
  signMessage: typeof import("@stellar/freighter-api").signMessage;
}> {
  return import("@stellar/freighter-api");
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Freighter provider implementation.
 *
 * Connects to the Freighter browser extension and implements the
 * WalletProvider interface for integration with the multi-provider system.
 */
export class FreighterProvider implements WalletProvider {
  readonly id = "freighter" as const;
  readonly name = "Freighter" as const;

  private lastKnownAddress: string | null = null;
  private checkInProgress: Promise<void> | null = null;

  /**
   * Check if Freighter is available in the browser.
   *
   * @returns true if Freighter is loaded and accessible
   */
  isAvailable(): boolean {
    // Check for the Freighter global object
    if (typeof window === "undefined") return false;
    if (typeof (window as any).freighter !== "undefined") {
      return true;
    }
    return false;
  }

  /**
   * Get a reason why Freighter is unavailable.
   *
   * @returns A user-friendly reason, or null if available
   */
  getUnavailableReason(): string | null {
    if (this.isAvailable()) {
      return null;
    }
    return "Freighter is not installed. Install the Freighter extension to use this wallet provider.";
  }

  /**
   * Get the currently connected Freighter address without prompting.
   *
   * @returns The connected address, or null if not connected
   */
  async getConnectedAddress(): Promise<string | null> {
    try {
      const freighter = await loadFreighter();
      const result = await freighter.getAddress().catch(() => null);
      if (result?.address) {
        this.lastKnownAddress = result.address;
        return result.address;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Request Freighter access and return the connected address.
   *
   * Prompts the user if necessary. Returns null if the user declines
   * or Freighter is not available.
   *
   * @returns The connected address, or null if unable to connect
   */
  async requestAccess(): Promise<string | null> {
    try {
      const freighter = await loadFreighter();

      // First try requestAccess, which shows the Freighter dialog
      const access = await freighter.requestAccess().catch(() => null);
      if (access?.address) {
        this.lastKnownAddress = access.address;
        return access.address;
      }

      // Fall back to getAddress if requestAccess didn't work
      const result = await freighter.getAddress().catch(() => null);
      if (result?.address) {
        this.lastKnownAddress = result.address;
        return result.address;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Sign a message with Freighter.
   *
   * @param message - The message to sign
   * @param walletAddress - The address to sign with
   * @returns The base64-encoded signature, or null on failure
   */
  async signMessage(
    message: string,
    walletAddress: string,
  ): Promise<string | null> {
    try {
      const freighter = await loadFreighter();
      const response = await freighter.signMessage(message, {
        networkPassphrase: appConfig.stellarNetworkPassphrase,
        address: walletAddress,
      }).catch(() => null);

      if (!response?.signedMessage) {
        return null;
      }

      if (typeof response.signedMessage === "string") {
        return response.signedMessage;
      }

      return bytesToBase64(response.signedMessage);
    } catch {
      return null;
    }
  }

  /**
   * Disconnect from Freighter.
   *
   * Freighter doesn't currently support explicit disconnection,
   * so this is a no-op that fulfills the interface contract.
   */
  async disconnect(): Promise<void> {
    // Freighter doesn't support explicit disconnect
    // The user would need to revoke access via the extension itself
    this.lastKnownAddress = null;
  }

  /**
   * Check Freighter's connection state and detect changes.
   *
   * @returns Promise that resolves when check is complete
   */
  async checkConnectionState(): Promise<void> {
    // Avoid concurrent checks
    if (this.checkInProgress) {
      await this.checkInProgress;
      return;
    }

    this.checkInProgress = (async () => {
      try {
        const address = await this.getConnectedAddress();
        if (address !== this.lastKnownAddress) {
          // Connection state changed; the caller should detect this
          // via ProviderChangeListener callbacks
        }
      } catch {
        // Silently handle errors in background check
      }
    })();

    await this.checkInProgress;
    this.checkInProgress = null;
  }
}
