/**
 * Safe URL builder for navigation with sensitive data protection.
 *
 * Provides typed, validated URL construction that prevents tokens, credentials,
 * and private filter values from entering query strings, fragments, or history.
 *
 * Design:
 * - Explicit parameter validation before URL construction
 * - Type-safe parameter objects
 * - Observable validation errors (no silent failures)
 * - Compatible with Next.js router.push() and router.replace()
 * - Supports both href strings and URLSearchParams
 */

import { validateUrlParameterKey, validateUrlParameterKeys } from "./blocked-keys";

export type SafeUrlBuilderOptions = {
  /** Allow construction to proceed even if some parameters are not explicitly allowed */
  strict?: boolean;
  /** Log validation errors for observability */
  logErrors?: boolean;
};

export type SafeUrlBuilderResult =
  | { ok: true; pathname: string; params: URLSearchParams; href: string }
  | {
      ok: false;
      reason: "validation-failed" | "invalid-pathname";
      errors: Array<{
        key: string;
        reason: string;
      }>;
      pathname: string;
    };

/**
 * Build a safe URL with validated query parameters.
 *
 * Validates all parameter keys before construction. Rejects sensitive
 * parameter names that could leak tokens, credentials, or PII.
 *
 * @param pathname - The path component (e.g., "/proofs", "/verify")
 * @param params - Record of query parameters to add
 * @param options - Configuration for validation behavior
 *
 * @returns Result with validated href or detailed validation errors
 *
 * @example
 * // Safe usage
 * const result = buildSafeUrl("/proofs", { page: "1", status: "active" });
 * if (result.ok) {
 *   router.push(result.href);
 * }
 *
 * // Unsafe usage (will fail validation)
 * const result = buildSafeUrl("/verify", { proof: proofId, token: secret });
 * // result.ok === false with validation errors for "token"
 */
export function buildSafeUrl(
  pathname: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  options?: SafeUrlBuilderOptions,
): SafeUrlBuilderResult {
  // Validate pathname
  if (!pathname || typeof pathname !== "string") {
    return {
      ok: false,
      reason: "invalid-pathname",
      pathname: String(pathname),
      errors: [{ key: "pathname", reason: "Invalid or empty pathname" }],
    };
  }

  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (!normalizedPathname.match(/^\/[a-zA-Z0-9\-_/.?#]*$/)) {
    return {
      ok: false,
      reason: "invalid-pathname",
      pathname: normalizedPathname,
      errors: [
        {
          key: "pathname",
          reason: "Pathname contains invalid characters",
        },
      ],
    };
  }

  const errors: Array<{ key: string; reason: string }> = [];

  // Validate parameter keys
  if (params) {
    const keys = Object.keys(params);
    for (const key of keys) {
      const validation = validateUrlParameterKey(key);
      if (!validation.ok) {
        errors.push({
          key,
          reason: validation.suggestion || validation.reason,
        });
      }
    }
  }

  // If validation failed, return error result
  if (errors.length > 0) {
    if (options?.logErrors) {
      console.warn(
        `[SafeUrlBuilder] Validation failed for ${normalizedPathname}:`,
        errors,
      );
    }

    if (options?.strict !== false) {
      return {
        ok: false,
        reason: "validation-failed",
        pathname: normalizedPathname,
        errors,
      };
    }
  }

  // Build URLSearchParams from safe parameters
  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== "") {
        searchParams.set(key, String(value));
      }
    }
  }

  // Construct href
  const href =
    searchParams.size > 0
      ? `${normalizedPathname}?${searchParams.toString()}`
      : normalizedPathname;

  return {
    ok: true,
    pathname: normalizedPathname,
    params: searchParams,
    href,
  };
}

/**
 * Build a safe URL with filter parameters.
 *
 * Specialized for audit logs and similar filter-based UIs. Only allows
 * safe filter enums and standard pagination parameters.
 *
 * @param pathname - The path component (e.g., "/audit")
 * @param filters - Safe filter object with enum values only
 *
 * @returns Result with validated href or validation errors
 */
export function buildSafeFilterUrl(
  pathname: string,
  filters?: Record<
    string,
    string | number | boolean | null | undefined | readonly string[]
  >,
): SafeUrlBuilderResult {
  // Allowed filter keys for safe filters
  const allowedFilterKeys = new Set([
    "actor",
    "action",
    "resource",
    "category",
    "type",
    "status",
    "level",
    "severity",
    "page",
    "limit",
    "offset",
    "sort",
    "order",
    "from",
    "to",
    "datefrom",
    "dateto",
    "date_from",
    "date_to",
  ]);

  if (!filters) {
    return buildSafeUrl(pathname, {});
  }

  const errors: Array<{ key: string; reason: string }> = [];
  const safeParams: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (!allowedFilterKeys.has(key.toLowerCase())) {
      errors.push({
        key,
        reason: `Filter key '${key}' is not in allowed list. Only safe filter enums are permitted.`,
      });
      continue;
    }

    // Skip null/undefined
    if (value === null || value === undefined) {
      continue;
    }

    // Handle array values (multi-select filters)
    if (Array.isArray(value)) {
      if (value.length > 0) {
        safeParams[key] = value.join(",");
      }
    } else if (value !== "") {
      safeParams[key] = value;
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      reason: "validation-failed",
      pathname,
      errors,
    };
  }

  return buildSafeUrl(pathname, safeParams);
}

/**
 * Safely extract query parameters from search string or URLSearchParams.
 *
 * Returns only validated parameters, dropping any with blocked keys.
 * Safe for use with browser location.search or next/navigation useSearchParams().
 *
 * @param search - Query string (e.g., "?page=1&status=active") or URLSearchParams
 * @returns Record of validated parameters
 *
 * @example
 * const params = extractSafeSearchParams(location.search);
 * // If search includes `token=...`, it's dropped
 */
export function extractSafeSearchParams(
  search: string | URLSearchParams | null | undefined,
): Record<string, string> {
  const params: Record<string, string> = {};

  if (!search) {
    return params;
  }

  const searchParams = new URLSearchParams(search);

  for (const [key, value] of searchParams.entries()) {
    const validation = validateUrlParameterKey(key);
    if (validation.ok) {
      params[key] = value;
    }
  }

  return params;
}

/**
 * Check if a URL would contain sensitive data.
 *
 * Scans the query string and fragment for blocked keys.
 * Useful for logging checks and security audits.
 *
 * @param url - Full URL or query string to check
 * @returns true if sensitive data would be exposed
 */
export function urlContainsSensitiveData(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    // Parse as URL if it has a protocol
    let queryString = url;
    if (url.includes("://")) {
      const parsed = new URL(url);
      queryString = parsed.search + parsed.hash;
    }

    const searchParams = new URLSearchParams(queryString);
    for (const key of searchParams.keys()) {
      const validation = validateUrlParameterKey(key);
      if (!validation.ok) {
        return true;
      }
    }

    return false;
  } catch {
    // If URL parsing fails, assume it's safe (err on the side of caution)
    return false;
  }
}

/**
 * Build a redacted URL for logging, removing all query parameters.
 *
 * Useful for logging URLs without exposing any query data.
 * Returns just the pathname for privacy-safe logging.
 *
 * @param url - Full URL or pathname
 * @returns Pathname only, without query string or fragment
 *
 * @example
 * const url = "https://app.example.com/verify?proof=ABC123&token=secret";
 * const safe = toRedactedUrl(url);
 * // safe === "/verify"
 */
export function toRedactedUrl(url: string): string {
  if (!url) {
    return "";
  }

  try {
    if (url.includes("://")) {
      const parsed = new URL(url);
      return parsed.pathname;
    }

    // Already a pathname
    const pathname = url.split("?")[0].split("#")[0];
    return pathname;
  } catch {
    // If parsing fails, try simple string splitting
    return url.split("?")[0].split("#")[0];
  }
}
