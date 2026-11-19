/**
 * Safe navigation utilities for preventing sensitive data leaks through URLs.
 *
 * Exports:
 * - buildSafeUrl: Type-safe URL builder with validation
 * - buildSafeFilterUrl: Specialized for audit logs and filters
 * - extractSafeSearchParams: Extract only validated parameters
 * - urlContainsSensitiveData: Check if URL exposes sensitive keys
 * - toRedactedUrl: Redact query string for logging
 * - validateUrlParameterKey: Validate individual parameter key
 * - validateUrlParameterKeys: Validate multiple keys
 * - hasBlockedKeys: Check for any blocked keys
 */

export {
  buildSafeUrl,
  buildSafeFilterUrl,
  extractSafeSearchParams,
  urlContainsSensitiveData,
  toRedactedUrl,
  type SafeUrlBuilderOptions,
  type SafeUrlBuilderResult,
} from "./safe-url-builder";

export {
  validateUrlParameterKey,
  validateUrlParameterKeys,
  hasBlockedKeys,
  type BlockedKeyValidationResult,
} from "./blocked-keys";
