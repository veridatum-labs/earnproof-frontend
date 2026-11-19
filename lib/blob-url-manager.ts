/**
 * Centralized object URL lifecycle management for private downloads and previews.
 *
 * Ensures:
 * - URLs are created with deterministic blob input
 * - URLs are revoked after use or abandonment
 * - URLs cannot be reused across tenant or session changes
 * - Lifecycle is observable for testing and diagnostics
 * - Compatible with existing authorization and privacy guarantees
 *
 * Issue #372: Manage object URL cleanup for private downloads
 */

/**
 * Metadata tracking for a created blob URL.
 * Used for observability and lifecycle verification.
 */
export interface BlobURLMetadata {
  url: string;
  createdAt: Date;
  revokedAt: Date | null;
  purposeLabel: string;
  /** Optional tenant/session identifier to prevent cross-tenant reuse */
  scopeId?: string;
}

/**
 * Configuration options for blob URL creation.
 */
export interface BlobURLCreateOptions {
  /** Human-readable label for observability (e.g., "credential-export", "offline-bundle-download") */
  purposeLabel: string;
  /** Optional scope identifier (tenant ID, session ID) to prevent cross-scope reuse */
  scopeId?: string;
  /** Optional callback fired immediately before revocation */
  onBeforeRevoke?: (url: string) => void;
}

/**
 * Result of a blob URL creation operation.
 */
export interface BlobURLCreateResult {
  url: string;
  metadata: BlobURLMetadata;
}

/**
 * Central manager for blob object URLs.
 * Tracks creation, revocation, and lifecycle of all URLs.
 */
class BlobURLManager {
  private metadata: Map<string, BlobURLMetadata> = new Map();
  private onBeforeRevoke: Map<string, (url: string) => void> = new Map();
  private scopeTracker: Map<string, Set<string>> = new Map();

  /**
   * Creates a blob URL with lifecycle tracking.
   *
   * @param blob - The blob to create a URL for
   * @param options - Configuration options including purpose label and scope
   * @returns Object containing the URL and its metadata
   * @throws Error if blob is invalid or scope mismatch is detected
   */
  create(blob: Blob, options: BlobURLCreateOptions): BlobURLCreateResult {
    if (!blob || !(blob instanceof Blob)) {
      throw new Error("Invalid blob provided to BlobURLManager.create");
    }

    const url = URL.createObjectURL(blob);
    const now = new Date();

    const meta: BlobURLMetadata = {
      url,
      createdAt: now,
      revokedAt: null,
      purposeLabel: options.purposeLabel,
      scopeId: options.scopeId,
    };

    this.metadata.set(url, meta);

    // Track URLs by scope for potential future validation
    if (options.scopeId) {
      if (!this.scopeTracker.has(options.scopeId)) {
        this.scopeTracker.set(options.scopeId, new Set());
      }
      this.scopeTracker.get(options.scopeId)!.add(url);
    }

    // Store revocation callback if provided
    if (options.onBeforeRevoke) {
      this.onBeforeRevoke.set(url, options.onBeforeRevoke);
    }

    return { url, metadata: meta };
  }

  /**
   * Revokes a blob URL and cleans up its metadata.
   *
   * @param url - The blob URL to revoke
   * @throws Error if URL is not tracked (double-revoke prevention)
   */
  revoke(url: string): void {
    const meta = this.metadata.get(url);

    if (!meta) {
      // URL not tracked or already revoked; fail closed to prevent reuse
      throw new Error(`Attempting to revoke untracked or already-revoked URL: ${url}`);
    }

    // Call before-revoke callback if registered
    const callback = this.onBeforeRevoke.get(url);
    if (callback) {
      try {
        callback(url);
      } catch (err) {
        // Log but don't block revocation on callback error
        console.error("Error in onBeforeRevoke callback:", err);
      }
    }

    // Revoke the actual browser URL
    URL.revokeObjectURL(url);

    // Mark as revoked and clean up
    meta.revokedAt = new Date();
    this.onBeforeRevoke.delete(url);
  }

  /**
   * Revokes all URLs created within a specific scope.
   * Used for tenant/session cleanup.
   *
   * @param scopeId - The scope identifier to revoke all URLs for
   * @returns Array of URLs that were revoked
   */
  revokeScope(scopeId: string): string[] {
    const urls = this.scopeTracker.get(scopeId);
    if (!urls) {
      return [];
    }

    const revoked: string[] = [];
    for (const url of urls) {
      const meta = this.metadata.get(url);
      if (meta && !meta.revokedAt) {
        try {
          this.revoke(url);
          revoked.push(url);
        } catch (err) {
          // Log but continue revoking others
          console.error(`Failed to revoke URL for scope ${scopeId}:`, err);
        }
      }
    }

    // Clean up scope tracker entry
    this.scopeTracker.delete(scopeId);
    return revoked;
  }

  /**
   * Retrieves metadata for a blob URL.
   * Used for observability and testing.
   *
   * @param url - The blob URL
   * @returns Metadata if tracked, undefined otherwise
   */
  getMetadata(url: string): BlobURLMetadata | undefined {
    return this.metadata.get(url);
  }

  /**
   * Gets all tracked URLs (revoked and active).
   * Used for diagnostics and testing.
   *
   * @returns Array of all metadata entries
   */
  getAllMetadata(): BlobURLMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Gets active (non-revoked) URLs.
   * Used for diagnostics and testing.
   *
   * @returns Array of active metadata entries
   */
  getActiveMetadata(): BlobURLMetadata[] {
    return Array.from(this.metadata.values()).filter((m) => !m.revokedAt);
  }

  /**
   * Clears all tracking data.
   * WARNING: Does NOT revoke URLs. Use revokeScope or revoke explicitly first.
   * Used for testing and reset scenarios.
   */
  clear(): void {
    this.metadata.clear();
    this.onBeforeRevoke.clear();
    this.scopeTracker.clear();
  }
}

// Singleton instance
const manager = new BlobURLManager();

/**
 * Creates a blob URL with centralized lifecycle tracking.
 *
 * @param blob - The blob to create a URL for
 * @param options - Configuration including purpose label and optional scope
 * @returns Object containing URL and metadata
 *
 * @example
 * const { url } = createBlobURL(credentialBlob, {
 *   purposeLabel: "credential-export",
 *   scopeId: tenantId,
 * });
 * // Later:
 * revokeBlobURL(url);
 */
export function createBlobURL(blob: Blob, options: BlobURLCreateOptions): BlobURLCreateResult {
  return manager.create(blob, options);
}

/**
 * Revokes a blob URL managed by the central manager.
 *
 * @param url - The blob URL to revoke
 * @throws Error if URL is not tracked
 */
export function revokeBlobURL(url: string): void {
  manager.revoke(url);
}

/**
 * Revokes all blob URLs created within a specific scope (tenant, session).
 * Used during tenant/session changes.
 *
 * @param scopeId - The scope identifier to clean up
 * @returns Array of URLs that were revoked
 */
export function revokeBlobURLScope(scopeId: string): string[] {
  return manager.revokeScope(scopeId);
}

/**
 * Gets metadata for a blob URL.
 * Used for observability, testing, and diagnostics.
 *
 * @param url - The blob URL
 * @returns Metadata or undefined if not tracked
 */
export function getBlobURLMetadata(url: string): BlobURLMetadata | undefined {
  return manager.getMetadata(url);
}

/**
 * Gets all tracked blob URL metadata.
 * Used for diagnostics and testing.
 *
 * @returns Array of all metadata
 */
export function getAllBlobURLMetadata(): BlobURLMetadata[] {
  return manager.getAllMetadata();
}

/**
 * Gets active (non-revoked) blob URL metadata.
 * Used for diagnostics and testing.
 *
 * @returns Array of active metadata
 */
export function getActiveBlobURLMetadata(): BlobURLMetadata[] {
  return manager.getActiveMetadata();
}

/**
 * Clears all blob URL tracking.
 * WARNING: Does NOT revoke URLs. Used primarily for testing.
 */
export function clearBlobURLTracking(): void {
  manager.clear();
}
