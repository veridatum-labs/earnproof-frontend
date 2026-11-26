/**
 * Service worker cache guard: intercepts fetch events and prevents
 * authenticated responses from being cached.
 *
 * This module provides utilities for service workers to:
 * - Intercept fetch requests before they're cached
 * - Evaluate whether responses contain sensitive data
 * - Prevent caching of authenticated/protected responses
 * - Maintain deterministic, testable cache behavior
 *
 * Safe to import in the main thread (utility functions are plain TypeScript).
 * Service workers themselves would use the guard functions to implement
 * filtering within their fetch event handlers.
 */

import {
  evaluateCacheExclusion,
  type CacheAuthContext,
  type ResponseCacheClassification,
} from "./cache-exclusion-policy";

/**
 * Cloned Response object with metadata about its cache eligibility.
 */
export interface CacheGuardedResponse {
  /** The Response object (may be cloned if modified) */
  response: Response;
  /** Whether this response should be stored in the service worker cache */
  shouldCache: boolean;
  /** Cache classification details for logging/audit */
  classification: ResponseCacheClassification;
}

/**
 * Guard a response before it enters the service worker cache.
 *
 * Evaluates the request URL and response properties to determine if the
 * response contains sensitive data that should not be cached. If exclusion
 * is recommended, returns the response with `shouldCache: false`.
 *
 * The response object itself is not modified; the caller decides whether
 * to cache based on the `shouldCache` flag.
 *
 * @param url - Request URL
 * @param response - Fetch response to evaluate
 * @param authContext - Current authentication context
 * @returns CacheGuardedResponse with cache decision and classification
 */
export function guardResponseForCache(
  url: string,
  response: Response,
  authContext: CacheAuthContext,
): CacheGuardedResponse {
  const classification = evaluateCacheExclusion(url, response, authContext);

  return {
    response,
    shouldCache: !classification.excluded,
    classification,
  };
}

/**
 * Create an auth context from the current environment.
 *
 * In a browser context with token manager, this would check whether
 * the user has an active token. In tests, pass the context directly.
 *
 * @param isAuthenticated - Whether user is authenticated
 * @param tenantId - Optional tenant ID for multi-tenant scenarios
 * @returns CacheAuthContext
 */
export function createAuthContext(
  isAuthenticated: boolean,
  tenantId?: string,
): CacheAuthContext {
  return {
    isAuthenticated,
    hasAuthToken: isAuthenticated,
    tenantId,
  };
}

/**
 * Response types that are safe to cache (generally).
 *
 * Used in service worker fetch handlers to make quick decisions about
 * response eligibility before detailed cache guard evaluation.
 */
export const CACHEABLE_RESPONSE_TYPES = [
  "basic", // Same-origin fetch, no authentication
  "cors", // Cross-origin fetch with CORS headers
];

/**
 * Response types that should never be cached.
 *
 * These opaque or error responses may contain sensitive data or indicate
 * failed auth, so they should never be stored persistently.
 */
export const NON_CACHEABLE_RESPONSE_TYPES = [
  "opaque", // Cross-origin fetch without CORS (body not readable, often private data)
  "error", // Network error
];

/**
 * Check if a response type suggests the response is safe to cache.
 *
 * Response.type values are: "basic", "cors", "error", "opaque", "navigate", "default"
 *
 * Note: Response.type is read-only and set by the browser based on fetch mode.
 * This is a quick heuristic check; actual cache decisions must also evaluate
 * the URL and headers.
 *
 * @param responseType - The Response.type value
 * @returns True if the response type is generally cacheable
 */
export function isResponseTypeCacheable(responseType: ResponseType): boolean {
  return CACHEABLE_RESPONSE_TYPES.includes(responseType);
}

/**
 * Check if a response status indicates a successful cacheable response.
 *
 * HTTP status codes that browsers and caches treat as cacheable include:
 * - 200 OK
 * - 203 Non-Authoritative Information
 * - 204 No Content
 * - 206 Partial Content
 * - 300 Multiple Choices
 * - 301 Moved Permanently
 * - 404 Not Found
 * - 405 Method Not Allowed
 * - 410 Gone
 * - 414 URI Too Long
 * - 501 Not Implemented
 *
 * Status codes like 401, 403, 500, 502, 503 are not cacheable without
 * explicit cache headers.
 *
 * @param status - HTTP status code
 * @returns True if the status code is cacheable without explicit headers
 */
export function isStatusCodeCacheable(status: number): boolean {
  const cacheableStatuses = [
    200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501,
  ];
  return cacheableStatuses.includes(status);
}

/**
 * Summary of a cache guard decision for logging and debugging.
 *
 * Produces a string that describes why a response was cached or excluded,
 * suitable for console logs or telemetry.
 *
 * @param guarded - CacheGuardedResponse from guardResponseForCache
 * @param url - Request URL (for context)
 * @returns Human-readable summary
 */
export function summarizeCacheGuardDecision(
  guarded: CacheGuardedResponse,
  url: string,
): string {
  if (guarded.shouldCache) {
    return `[CacheGuard] Response cacheable: "${url}"`;
  }

  const reason = guarded.classification.reason || "unknown reason";
  const category = guarded.classification.category || "excluded";
  return `[CacheGuard] Response excluded (${category}): ${reason}`;
}

/**
 * Simulate a service worker fetch + cache flow for testing.
 *
 * This function helps test the cache guard logic without a real service worker:
 * 1. Receives a fetch URL
 * 2. Would normally call fetch() here
 * 3. Guards the response for cache eligibility
 * 4. Decides whether to cache based on guard result
 *
 * In production, service workers call this logic in their fetch handler.
 * In tests, this can be mocked or simulated without network calls.
 *
 * @param url - Request URL
 * @param mockResponse - Mock Response for testing (or real fetch in production)
 * @param authContext - Authentication context
 * @returns CacheGuardedResponse with cache decision
 */
export function simulateServiceWorkerCacheLogic(
  url: string,
  mockResponse: Response,
  authContext: CacheAuthContext,
): CacheGuardedResponse {
  // In a real service worker, this would be:
  // const response = await fetch(event.request);
  // Here we use the provided mockResponse for testing.

  const guarded = guardResponseForCache(url, mockResponse, authContext);

  // Log the decision (in real SW, this would go to console or telemetry)
  if (typeof console !== "undefined") {
    const summary = summarizeCacheGuardDecision(guarded, url);
    if (!guarded.shouldCache) {
      console.debug(summary);
    }
  }

  return guarded;
}
