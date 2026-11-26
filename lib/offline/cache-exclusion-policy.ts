/**
 * Cache exclusion policy for service worker caches.
 *
 * Ensures that authenticated API responses and protected pages are never
 * written to Cache Storage, preventing sensitive data (credentials, proof
 * data, payment info, personal account data) from persisting offline.
 *
 * This module defines:
 * - Response guards: checks if a response should be cached based on
 *   authentication status, content type, and endpoint sensitivity
 * - Cache exclusion rules: patterns and conditions that determine which
 *   requests and responses should be excluded from caching
 * - Cache purge behavior: strategies for clearing caches on auth changes
 */

/**
 * Categories of responses that must never be cached.
 */
export type ExcludedResponseCategory =
  | "authenticated-api"
  | "protected-page"
  | "credentials"
  | "payment-data"
  | "proof-data"
  | "personal-data";

/**
 * Response classification for cache storage decisions.
 */
export interface ResponseCacheClassification {
  /** Whether this response should be excluded from cache storage */
  excluded: boolean;
  /** Category of exclusion if applicable */
  category?: ExcludedResponseCategory;
  /** Reason for exclusion (for logging/audit) */
  reason?: string;
}

/**
 * Authentication context for cache decisions.
 */
export interface CacheAuthContext {
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Auth token presence (independent of token validity) */
  hasAuthToken: boolean;
  /** Optional tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * Endpoints and path patterns that contain sensitive, authenticated data.
 *
 * These patterns match URL paths that should never be cached, regardless
 * of HTTP cache headers, because they contain wallet-authenticated or
 * user-sensitive information.
 */
const AUTHENTICATED_API_PATTERNS = [
  // Payment and billing
  /^\/api\/payments(?:\/|$)/,
  /^\/api\/billing(?:\/|$)/,
  /^\/api\/payment-methods(?:\/|$)/,

  // Proof operations and verification flows
  /^\/api\/proofs(?:\/|$)/,
  /^\/api\/proof-requests(?:\/|$)/,
  /^\/api\/proof-shares(?:\/|$)/,

  // User account and organization
  /^\/api\/account(?:\/|$)/,
  /^\/api\/users(?:\/|$)/,
  /^\/api\/organizations(?:\/|$)/,
  /^\/api\/organization-members(?:\/|$)/,

  // Settings and configuration
  /^\/api\/settings(?:\/|$)/,
  /^\/api\/api-keys(?:\/|$)/,
  /^\/api\/sessions(?:\/|$)/,
  /^\/api\/audit-log(?:\/|$)/,
  /^\/api\/trusted-sources(?:\/|$)/,

  // Authentication and sessions
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/token(?:\/|$)/,
  /^\/api\/session(?:\/|$)/,
  /^\/api\/login(?:\/|$)/,
  /^\/api\/logout(?:\/|$)/,
];

/**
 * Page routes that require authentication and contain sensitive data.
 *
 * These client-side routes should not be cached by the service worker
 * because they may contain sensitive user data in the DOM or initial state.
 */
const AUTHENTICATED_PAGE_PATTERNS = [
  // Proof operations
  /^\/proofs(?:\/|$)/,

  // Account and organization settings
  /^\/settings(?:\/|$)/,
  /^\/account(?:\/|$)/,
  /^\/organizations(?:\/|$)/,

  // Verification flows (not strictly authenticated, but privacy-sensitive)
  /^\/verify(?:\/|$)/,
];

/**
 * Headers that indicate the response contains sensitive authentication data.
 */
const SENSITIVE_RESPONSE_HEADERS = [
  "authorization",
  "x-auth-token",
  "x-api-key",
  "set-cookie",
];

/**
 * Determine if a request URL should be excluded from caching.
 *
 * @param url - Full or partial URL/path to check
 * @param isAuthenticated - Whether the user is currently authenticated
 * @returns Classification of whether and why the URL should be excluded
 */
export function shouldExcludeFromCache(
  url: string,
  isAuthenticated: boolean,
): ResponseCacheClassification {
  try {
    // Parse the URL to get the pathname
    const urlObj =
      url.startsWith("http://") || url.startsWith("https://")
        ? new URL(url)
        : new URL(`http://localhost${url}`);

    const pathname = urlObj.pathname;

    // Check API endpoints for authenticated patterns
    for (const pattern of AUTHENTICATED_API_PATTERNS) {
      if (pattern.test(pathname)) {
        return {
          excluded: true,
          category: "authenticated-api",
          reason: `API endpoint "${pathname}" contains authenticated data and must not be cached`,
        };
      }
    }

    // Check page routes for authenticated patterns
    if (isAuthenticated) {
      for (const pattern of AUTHENTICATED_PAGE_PATTERNS) {
        if (pattern.test(pathname)) {
          return {
            excluded: true,
            category: "protected-page",
            reason: `Page "${pathname}" requires authentication and must not be cached`,
          };
        }
      }
    }

    // Not excluded
    return {
      excluded: false,
    };
  } catch {
    // If URL parsing fails, err on the side of caution: exclude from cache
    return {
      excluded: true,
      category: "authenticated-api",
      reason: "URL parsing failed; excluding as precaution",
    };
  }
}

/**
 * Determine if a Response object should be excluded from caching.
 *
 * Checks the response headers and status for indicators of sensitive data.
 * A response containing auth tokens, credentials, or sensitive headers
 * must not be cached.
 *
 * @param response - Response to evaluate
 * @param context - Authentication context
 * @returns Classification of whether and why the response should be excluded
 */
export function shouldExcludeResponseFromCache(
  response: Response,
  context: CacheAuthContext,
): ResponseCacheClassification {
  // Check for sensitive response headers
  for (const headerName of SENSITIVE_RESPONSE_HEADERS) {
    if (response.headers.has(headerName)) {
      return {
        excluded: true,
        category: "credentials",
        reason: `Response contains sensitive header "${headerName}" and must not be cached`,
      };
    }
  }

  // Check for explicit no-store cache directive (honor it strictly)
  const cacheControl = response.headers.get("cache-control");
  if (cacheControl && cacheControl.includes("no-store")) {
    return {
      excluded: true,
      category: "authenticated-api",
      reason: "Response declares Cache-Control: no-store and must not be cached",
    };
  }

  // Check for private directive on authenticated requests
  if (
    context.isAuthenticated &&
    cacheControl &&
    cacheControl.includes("private")
  ) {
    return {
      excluded: true,
      category: "authenticated-api",
      reason:
        "Response declares Cache-Control: private with authentication and must not be cached",
    };
  }

  // Response is safe to cache (caller should still verify the URL)
  return {
    excluded: false,
  };
}

/**
 * Comprehensive cache guard: checks both URL and response for exclusion.
 *
 * A response should be excluded if:
 * - The URL is in an authenticated endpoint pattern, OR
 * - The response contains sensitive headers or no-store directive, OR
 * - User is authenticated and accessing a protected page
 *
 * @param url - Request URL
 * @param response - Response object
 * @param context - Authentication context
 * @returns Classification of whether and why the response should be excluded
 */
export function evaluateCacheExclusion(
  url: string,
  response: Response,
  context: CacheAuthContext,
): ResponseCacheClassification {
  // Check URL-based exclusion
  const urlClassification = shouldExcludeFromCache(url, context.isAuthenticated);
  if (urlClassification.excluded) {
    return urlClassification;
  }

  // Check response-based exclusion
  const responseClassification = shouldExcludeResponseFromCache(
    response,
    context,
  );
  if (responseClassification.excluded) {
    return responseClassification;
  }

  // Not excluded
  return {
    excluded: false,
  };
}

/**
 * Validate that a URL path is truly safe for public caching.
 *
 * Returns true only if the URL is explicitly known to be public and contains
 * no sensitive data. Used as a positive allowlist check before caching.
 *
 * @param url - URL to validate
 * @returns True if the URL is known to be safe for public caching
 */
export function isPublicCacheable(url: string): boolean {
  try {
    const urlObj =
      url.startsWith("http://") || url.startsWith("https://")
        ? new URL(url)
        : new URL(`http://localhost${url}`);

    const pathname = urlObj.pathname;

    // Public-safe patterns: public pages, static assets, public docs
    const publicSafePatterns = [
      /^\/$/,
      /^\/how-it-works(?:\/|$)/,
      /^\/developers(?:\/|$)/,
      /^\/faq(?:\/|$)/,
      /^\/about(?:\/|$)/,
      /^\/privacy(?:\/|$)/,
      /^\/security(?:\/|$)/,
      /^\/accessibility(?:\/|$)/,
      /^\/contact(?:\/|$)/,
      /^\/proof-types(?:\/|$)/,
      /^\/issuers(?:\/|$)/,
      /^\/.*\.(?:js|css|png|jpg|jpeg|gif|svg|woff|woff2|eot|ttf)$/i,
    ];

    for (const pattern of publicSafePatterns) {
      if (pattern.test(pathname)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Cache store names that may contain sensitive data and should be cleared
 * on auth changes (logout, token revocation, account switch).
 */
export const SENSITIVE_CACHE_STORE_NAMES = [
  "earnproof-api",
  "earnproof-authenticated",
  "earnproof-payments",
  "earnproof-proofs",
  "earnproof-settings",
];

/**
 * Clear all service worker caches that may contain sensitive data.
 *
 * Called on logout, account change, or auth failure to prevent stale
 * authenticated data from being served on restoration from bfcache or
 * when a new user logs in.
 *
 * @returns Promise that resolves when all sensitive caches are cleared
 */
export async function clearSensitiveServiceWorkerCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  try {
    const cacheNames = await caches.keys();
    const deletionPromises = [];

    for (const cacheName of cacheNames) {
      // Delete cache stores that are known to contain sensitive data
      if (
        SENSITIVE_CACHE_STORE_NAMES.some((name) => cacheName.includes(name))
      ) {
        deletionPromises.push(caches.delete(cacheName));
      }

      // Delete any cache that matches patterns suggesting sensitive content
      if (
        cacheName.includes("api") ||
        cacheName.includes("auth") ||
        cacheName.includes("proof") ||
        cacheName.includes("payment") ||
        cacheName.includes("authenticated")
      ) {
        deletionPromises.push(caches.delete(cacheName));
      }
    }

    await Promise.all(deletionPromises);
  } catch (error) {
    // Log but don't throw: cache clearing failure shouldn't break auth flow
    console.error("[CacheExclusionPolicy] Failed to clear service worker caches:", error);
  }
}

/**
 * Clear only caches matching a specific pattern.
 *
 * Useful for targeted cache invalidation without clearing all caches.
 *
 * @param pattern - Regex pattern or string to match cache names
 * @returns Promise that resolves when matching caches are cleared
 */
export async function clearCachesMatching(pattern: RegExp | string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  try {
    const cacheNames = await caches.keys();
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    const deletionPromises = [];

    for (const cacheName of cacheNames) {
      if (regex.test(cacheName)) {
        deletionPromises.push(caches.delete(cacheName));
      }
    }

    await Promise.all(deletionPromises);
  } catch (error) {
    console.error("[CacheExclusionPolicy] Failed to clear matching caches:", error);
  }
}

/**
 * Get all cache store names for diagnostics and testing.
 *
 * @returns Promise resolving to array of cache names
 */
export async function getCacheStoreNames(): Promise<string[]> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return [];
  }

  try {
    return await caches.keys();
  } catch {
    return [];
  }
}
