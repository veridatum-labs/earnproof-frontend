/**
 * Blocked keys validation for URL query parameters.
 *
 * Prevents sensitive values (tokens, credentials, private filters) from
 * entering browser URLs, history, referrer headers, or analytics.
 *
 * Design:
 * - Explicit blocklist of known-sensitive parameter names
 * - Rejects at construction time (fail-fast)
 * - Returns structured validation results for observability
 * - Supports allowlist for specific, safe use cases
 */

/** Hard-blocked parameter names that must never appear in URLs. */
const BLOCKED_KEYS = new Set([
  // Authentication
  "token",
  "access_token",
  "bearer",
  "authorization",
  "session",
  "session_id",
  "sessionid",
  "auth",
  "api_key",
  "apikey",
  "api-key",
  "secret",
  "password",
  "passwd",
  "pwd",

  // Credentials and JWTs
  "credential",
  "credentials",
  "credential_id",
  "jwt",
  "sig",
  "signature",
  "proof",
  "private_key",
  "privatekey",
  "private-key",
  "signing_key",
  "secret_key",

  // Payment and financial
  "card",
  "card_number",
  "cvv",
  "cvc",
  "expiry",
  "exp",
  "account_number",
  "routing_number",
  "iban",
  "swift",
  "amount",
  "balance",
  "pin",

  // Personal information
  "email",
  "phone",
  "ssn",
  "tax_id",
  "dob",
  "date_of_birth",
  "address",
  "zip",
  "zipcode",
  "postal_code",
  "name",
  "firstname",
  "lastname",
  "middlename",
  "username",
  "user_id",
  "userid",

  // Blockchain/Crypto
  "wallet",
  "wallet_address",
  "walletaddress",
  "wallet-address",
  "public_key",
  "publickey",
  "public-key",
  "account",
  "seed",
  "mnemonic",
  "private_seed",
  "secret_seed",

  // Payment processors
  "payment_id",
  "transaction_id",
  "tx_id",
  "order_id",
  "invoice_id",
  "receipt",
  "stripe_token",
  "paypal_id",
  "venmo_id",

  // Proof and verification payloads
  "payload",
  "data",
  "body",
  "content",
  "message",
  "object",
  "value",
  "param",
  "params",
  "filter",
  "filters",
  "query",
  "search",
]);

/** Parameter names that are explicitly safe in URLs (allowlist). */
const ALLOWED_KEYS = new Set([
  // IDs that are safe (non-sensitive identifiers)
  "id",
  "proof_id",
  "proofid",
  "proof-id",
  "org_id",
  "orgid",
  "org-id",
  "organization_id",
  "account_id",
  "user_id",
  "member_id",
  "team_id",
  "request_id",
  "batch_id",

  // Status values
  "status",
  "step",
  "tab",
  "view",
  "mode",
  "sort",
  "order",

  // Pagination
  "page",
  "limit",
  "offset",
  "cursor",
  "take",
  "skip",

  // Filtering (safe enum values)
  "actor",
  "action",
  "resource",
  "category",
  "type",
  "kind",
  "level",
  "severity",

  // Dates
  "from",
  "to",
  "start",
  "end",
  "date",
  "datefrom",
  "datefrom",
  "dateto",
  "date_from",
  "date_to",
  "since",
  "until",

  // Misc safe params
  "return",
  "redirect",
  "callback",
  "next",
  "backto",
  "ref",
  "referrer",
  "lang",
  "language",
  "locale",
  "timezone",
  "theme",
  "format",
  "version",
  "debug",
  "trace",
  "error",
  "message",
  "code",
]);

export type BlockedKeyValidationResult =
  | { ok: true; key: string }
  | {
      ok: false;
      reason: "blocked-key" | "suspicious-pattern";
      key: string;
      suggestion?: string;
    };

/**
 * Validate that a parameter key is safe to use in a URL.
 *
 * Returns early on first violation (fail-fast). Use in URL builder
 * construction to prevent sensitive values from reaching URLs.
 */
export function validateUrlParameterKey(
  key: string,
): BlockedKeyValidationResult {
  if (!key || typeof key !== "string") {
    return {
      ok: false,
      reason: "suspicious-pattern",
      key,
    };
  }

  const normalized = key.toLowerCase().trim();

  // Check if explicitly blocked
  if (BLOCKED_KEYS.has(normalized)) {
    return {
      ok: false,
      reason: "blocked-key",
      key,
      suggestion: `Parameter '${key}' contains sensitive data. Use secure in-memory or request-body storage instead.`,
    };
  }

  // Check for suspicious patterns even if not explicitly blocked
  if (hasSuspiciousPattern(normalized)) {
    return {
      ok: false,
      reason: "suspicious-pattern",
      key,
      suggestion: `Parameter '${key}' matches sensitive data pattern. Consider using secure storage.`,
    };
  }

  // If explicitly allowed, pass
  if (ALLOWED_KEYS.has(normalized)) {
    return { ok: true, key };
  }

  // Warn on unknown keys (not in either list)
  // This is permissive but observable for debugging
  return { ok: true, key };
}

/**
 * Check if a key matches suspicious patterns that suggest sensitive data.
 */
function hasSuspiciousPattern(key: string): boolean {
  // Keys containing "secret", "private", "credential" substring
  if (
    key.includes("secret") ||
    key.includes("private") ||
    key.includes("credential")
  ) {
    return true;
  }

  // Keys ending with patterns suggesting sensitive data
  if (
    key.endsWith("_token") ||
    key.endsWith("token") ||
    key.endsWith("_key") ||
    key.endsWith("key") ||
    key.endsWith("_id") && key.length > 10
  ) {
    return true;
  }

  return false;
}

/**
 * Validate multiple parameter keys at once.
 * Returns all violations (non-fast).
 */
export function validateUrlParameterKeys(
  keys: readonly string[],
): BlockedKeyValidationResult[] {
  return keys.map((key) => validateUrlParameterKey(key));
}

/**
 * Check if any key is blocked.
 */
export function hasBlockedKeys(keys: readonly string[]): boolean {
  return keys.some((key) => {
    const result = validateUrlParameterKey(key);
    return !result.ok;
  });
}
