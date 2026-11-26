/**
 * Offline support and service worker caching utilities.
 *
 * Ensures that authenticated data is excluded from service worker caches,
 * preventing sensitive information from persisting offline.
 */

export {
  type ExcludedResponseCategory,
  type ResponseCacheClassification,
  type CacheAuthContext,
  shouldExcludeFromCache,
  shouldExcludeResponseFromCache,
  evaluateCacheExclusion,
  isPublicCacheable,
  SENSITIVE_CACHE_STORE_NAMES,
  clearSensitiveServiceWorkerCaches,
  clearCachesMatching,
  getCacheStoreNames,
} from "./cache-exclusion-policy";

export {
  type CacheGuardedResponse,
  guardResponseForCache,
  createAuthContext,
  CACHEABLE_RESPONSE_TYPES,
  NON_CACHEABLE_RESPONSE_TYPES,
  isResponseTypeCacheable,
  isStatusCodeCacheable,
  summarizeCacheGuardDecision,
  simulateServiceWorkerCacheLogic,
} from "./service-worker-cache-guard";
