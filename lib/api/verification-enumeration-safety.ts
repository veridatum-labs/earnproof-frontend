import type { ApiErrorResponse } from "../errors/types";
import { ApiError } from "../errors/types";

/**
 * Universal safe verification not found / inaccessible error response.
 *
 * Requirements:
 * Public verification responses must not reveal whether protected identifiers
 * exist through divergent UI states.
 * Normalize not-found (404), unauthorized (401/403), malformed (400/422),
 * and rate-limited (429) presentations while preserving support references.
 */
export const ENUMERATION_SAFE_VERIFICATION_MESSAGE =
  "Verification details are unavailable for this identifier. Check the identifier or contact support.";

/**
 * HTTP statuses that could leak identifier existence if presented differently
 * to unauthenticated or public viewers.
 */
export const ENUMERATION_SENSITIVE_STATUSES = new Set([400, 401, 403, 404, 422, 429]);

export type EnumerationSafeVerificationError = {
  /** Normalized deterministic message identical across not-found, unauthorized, malformed, rate-limited */
  message: string;
  /** Normalized status code (404 for uniform presentation) or original */
  statusCode?: number;
  /** Preserved support reference if available */
  requestId?: string;
  /** Preserved correlation reference if available */
  correlationId?: string;
  /** Whether the request can be retried (e.g., 429 rate limit or 5xx server error) */
  isRateLimited: boolean;
  retryAfterMs?: number | null;
  /** Whether this is an expected enumeration-safe failure (not a 5xx infrastructure failure) */
  isEnumerationSafe: boolean;
};

/**
 * Normalizes an error from a verification endpoint into an enumeration-safe representation.
 * Preserves support references (requestId, correlationId) while eliminating divergent
 * existence signals across 404 Not Found, 401/403 Unauthorized, 400/422 Malformed, and 429 Rate-Limited.
 */
export function normalizeVerificationError(error: unknown): EnumerationSafeVerificationError {
  let requestId: string | undefined;
  let correlationId: string | undefined;
  let statusCode: number | undefined;
  let retryAfterMs: number | null = null;
  let rawMessage = "";

  if (error instanceof ApiError) {
    statusCode = error.status;
    requestId = error.requestId;
    correlationId = error.correlationId;
    rawMessage = error.message;
  } else if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.status === "number") {
      statusCode = errObj.status;
    } else if (typeof errObj.statusCode === "number") {
      statusCode = errObj.statusCode;
    }
    if (typeof errObj.requestId === "string") {
      requestId = errObj.requestId;
    }
    if (typeof errObj.correlationId === "string") {
      correlationId = errObj.correlationId;
    }
    if (typeof errObj.retryAfterMs === "number") {
      retryAfterMs = errObj.retryAfterMs;
    }
    if (typeof errObj.message === "string") {
      rawMessage = errObj.message;
    }
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  // Check if status code or message indicates enumeration-sensitive error (404, 401, 403, 400, 422, 429)
  const isSensitiveStatus = statusCode !== undefined && ENUMERATION_SENSITIVE_STATUSES.has(statusCode);
  const isRateLimit = statusCode === 429 || /rate[- ]limit|too many requests/i.test(rawMessage);
  
  const matchesSensitiveMessage =
    /404|not found|unauthorized|forbidden|401|403|400|422|malformed|invalid identifier/i.test(rawMessage);

  if (isSensitiveStatus || matchesSensitiveMessage || isRateLimit) {
    return {
      message: ENUMERATION_SAFE_VERIFICATION_MESSAGE,
      statusCode: statusCode ?? 404,
      requestId,
      correlationId,
      isRateLimited: isRateLimit,
      retryAfterMs,
      isEnumerationSafe: true,
    };
  }

  // Server error / network failure / timeout
  let defaultMessage = "Unable to verify proof. Please check your connection and try again.";
  if ((statusCode && statusCode >= 500) || /500|server error/i.test(rawMessage)) {
    defaultMessage = "Server error occurred during verification. Please try again later.";
  } else if (/timeout|timed out/i.test(rawMessage)) {
    defaultMessage = "Request timed out. Please check your connection and try again.";
  }

  return {
    message: defaultMessage,
    statusCode,
    requestId,
    correlationId,
    isRateLimited: false,
    retryAfterMs: null,
    isEnumerationSafe: false,
  };
}

/**
 * Creates an ApiError configured with enumeration-safe messaging while preserving support metadata.
 */
export function createEnumerationSafeApiError(params: {
  status: number;
  requestId?: string;
  correlationId?: string;
}): ApiError {
  return new ApiError({
    status: params.status,
    message: ENUMERATION_SAFE_VERIFICATION_MESSAGE,
    requestId: params.requestId,
    correlationId: params.correlationId,
  });
}
