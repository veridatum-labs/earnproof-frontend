/**
 * React hook for managing blob object URL lifecycle within a component.
 *
 * Automatically revokes URLs on component unmount or when dependencies change.
 * Integrates with the centralized BlobURLManager for observable lifecycle tracking.
 *
 * Issue #372: Manage object URL cleanup for private downloads
 */

import { useEffect, useRef } from "react";
import {
  createBlobURL,
  revokeBlobURL,
  type BlobURLCreateOptions,
  type BlobURLCreateResult,
} from "@/lib/blob-url-manager";

/**
 * Options for the useObjectURL hook.
 */
export interface UseObjectURLOptions extends BlobURLCreateOptions {
  /** If true, don't automatically revoke on unmount (manual revocation only) */
  manual?: boolean;
}

/**
 * Result of the useObjectURL hook.
 */
export interface UseObjectURLResult {
  /** The created blob URL */
  url: string;
  /** Metadata about the URL (creation time, scope, etc.) */
  metadata: BlobURLCreateResult["metadata"];
  /** Manually revoke the URL before component unmount */
  revoke: () => void;
  /** Check if the URL is still active (not revoked) */
  isActive: () => boolean;
}

/**
 * React hook for creating and managing blob object URLs.
 *
 * Automatically revokes the URL on component unmount (unless manual mode is enabled).
 * Integrates with centralized BlobURLManager for lifecycle observability.
 *
 * @param blob - The blob to create a URL for
 * @param options - Configuration including purpose label, scope, and lifecycle options
 * @returns Object with URL, metadata, and manual revoke function
 *
 * @example
 * // Auto-revoke on unmount (default)
 * const { url, revoke } = useObjectURL(blob, {
 *   purposeLabel: "preview-image",
 *   scopeId: userId,
 * });
 *
 * // Manual revocation only
 * const { url, revoke } = useObjectURL(blob, {
 *   purposeLabel: "temp-download",
 *   manual: true,
 * });
 * // Later:
 * revoke();
 */
export function useObjectURL(blob: Blob | null | undefined, options: UseObjectURLOptions): UseObjectURLResult | null {
  const urlRef = useRef<string | null>(null);
  const metadataRef = useRef<BlobURLCreateResult["metadata"] | null>(null);
  const revokedRef = useRef(false);

  // Create the URL on mount or when blob changes
  useEffect(() => {
    if (!blob) {
      return;
    }

    try {
      const result = createBlobURL(blob, options);
      urlRef.current = result.url;
      metadataRef.current = result.metadata;
      revokedRef.current = false;
    } catch (err) {
      console.error("Failed to create blob URL:", err);
      return;
    }

    // Set up cleanup on unmount or dependency change
    return () => {
      if (!options.manual && urlRef.current && !revokedRef.current) {
        try {
          revokeBlobURL(urlRef.current);
          revokedRef.current = true;
        } catch (err) {
          console.error("Failed to revoke blob URL on cleanup:", err);
        }
      }
    };
  }, [blob, options, options.purposeLabel, options.scopeId, options.manual]);

  if (!urlRef.current || !metadataRef.current) {
    return null;
  }

  return {
    url: urlRef.current,
    metadata: metadataRef.current,
    revoke: () => {
      if (urlRef.current && !revokedRef.current) {
        try {
          revokeBlobURL(urlRef.current);
          revokedRef.current = true;
        } catch (err) {
          console.error("Failed to revoke blob URL:", err);
        }
      }
    },
    isActive: () => !revokedRef.current,
  };
}
