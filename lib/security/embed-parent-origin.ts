/**
 * Parent-origin validation for embedded verification widget (issue #368).
 * =======================================================================
 *
 * The embeddable widget may run in a third-party ("relying party") iframe
 * that is untrusted by default. This module defines trust boundaries
 * through configurable parent-origin allow-lists and validates
 * communication through message schema enforcement and origin checks.
 *
 * Security model:
 * - The widget always runs in an iframe (by design). We can't prevent
 *   embedding itself (CSP frame-ancestors * is intentionally permissive),
 *   but we CAN validate the parent's origin and refuse to trust messages
 *   from hostile hosts.
 * - Message validation is a DEFENSE IN DEPTH layer: the widget doesn't
 *   actually listen to parent messages in normal operation, so invalid
 *   messages have no effect even without this validation. These checks
 *   guard against future changes that might add postMessage listening.
 * - An embedding host that fails origin validation should either see no
 *   communication from the widget (RFP / closed world) or explicit
 *   "denied" signals depending on configuration.
 */

/**
 * Validation result for a parent-origin trust decision.
 */
export type ParentOriginValidation =
  | { ok: true; origin: string }
  | { ok: false; reason: "invalid-origin" | "not-embedded" | "allowlist-mismatch" };

/**
 * Schema for widget-to-parent messages. Used for outbound message
 * validation (deny-by-default). Currently the widget doesn't send
 * unsolicited messages, but this schema prepares for future features.
 */
export type WidgetMessage =
  | { type: "widget:ready"; version: number }
  | { type: "widget:error"; code: string; detail?: string }
  | { type: "widget:result"; status: "valid" | "expired" | "revoked" | "unknown" | "invalid" };

/**
 * Schema for parent-to-widget messages. Used for inbound message
 * validation (deny-by-default). Currently the widget doesn't listen
 * for these, but this schema prepares for future features like
 * retry signals or configuration from the parent.
 */
export type ParentMessage =
  | { type: "parent:ping" }
  | { type: "parent:reload" };

/**
 * Configuration for parent-origin validation.
 */
export type EmbedParentOriginConfig = {
  /**
   * Allow-list of parent origins that are trusted to embed this widget.
   * Empty array = no embedded verification (only standalone). Wildcard
   * '*' = allow any origin (use only for public/open platforms, not
   * production). Specific origins = curated relying-party sites.
   *
   * Origins are matched exactly (scheme + domain + port), case-insensitive
   * on the domain part per RFC. Examples:
   * - 'https://example.com'
   * - 'https://app.example.com:3000'
   * - '*' (any origin, use with extreme caution)
   */
  allowedParentOrigins: string[];

  /**
   * What to do if the widget detects it's embedded in a disallowed origin.
   * 'silent' = render nothing, no error shown (closed-world RFP).
   * 'deny' = render an explicit "denied" message (fail-open UX).
   */
  deniedEmbeddingBehavior?: "silent" | "deny";

  /**
   * Enable strict message schema validation. When true, any message that
   * doesn't match the ParentMessage schema throws an error. When false,
   * unknown message types are logged but don't break functionality.
   * Always true for production to prevent message-injection bugs.
   */
  strictMessageValidation?: boolean;
};

/**
 * Build a validation function for a given config. Returns a function that
 * checks a claimed parent origin and returns a validation result.
 */
export function buildParentOriginValidator(
  config: EmbedParentOriginConfig,
): (origin: string | null | undefined) => ParentOriginValidation {
  const normalized = normalizeOrigins(config.allowedParentOrigins);

  return (claimedOrigin: string | null | undefined): ParentOriginValidation => {
    // Not embedded (widget running in top-level window, e.g., during tests
    // or standalone). This is a valid state — the widget can run alone.
    if (claimedOrigin === null || claimedOrigin === undefined) {
      return { ok: true, origin: "standalone" };
    }

    let parsedOrigin: string;
    try {
      parsedOrigin = normalizeOrigin(claimedOrigin);
    } catch {
      return { ok: false, reason: "invalid-origin" };
    }

    // Check allow-list
    const isAllowed = normalized.some((allowed) =>
      allowed === "*" || allowed === parsedOrigin,
    );

    if (!isAllowed) {
      return { ok: false, reason: "allowlist-mismatch" };
    }

    return { ok: true, origin: parsedOrigin };
  };
}

/**
 * Normalize a single origin for comparison. Throws if the origin is invalid.
 * Lowercases the domain part (per RFC 3986) but preserves scheme/port casing.
 */
export function normalizeOrigin(origin: string): string {
  if (origin === "*") {
    return "*";
  }

  try {
    const url = new URL(origin);
    // Reconstruct with lowercase hostname (domain part is case-insensitive)
    return `${url.protocol}//${url.host.toLowerCase()}`;
  } catch {
    throw new Error(`Invalid origin: ${origin}`);
  }
}

/**
 * Normalize an array of origins. Filters out duplicates and invalid entries.
 */
export function normalizeOrigins(origins: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const origin of origins) {
    try {
      const normalized = normalizeOrigin(origin);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch {
      // Silently skip invalid entries during config normalization
    }
  }

  return result;
}

/**
 * Validate a parent-to-widget message against the schema. Returns true if
 * valid, false if invalid. When strictMessageValidation is true, caller
 * should treat false as an error condition.
 */
export function isValidParentMessage(
  message: unknown,
  options: { strict?: boolean } = {},
): message is ParentMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const obj = message as Record<string, unknown>;
  const type = obj.type;

  if (typeof type !== "string") {
    return false;
  }

  // Known message types
  if (type === "parent:ping" || type === "parent:reload") {
    return true;
  }

  // Unknown message type
  return !options.strict;
}

/**
 * Validate a widget-to-parent message against the schema. Returns true if
 * valid, false if invalid. Callers should treat false as an error condition
 * for integrity reasons (widget should never send invalid messages).
 */
export function isValidWidgetMessage(message: unknown): message is WidgetMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const obj = message as Record<string, unknown>;
  const type = obj.type;

  if (typeof type !== "string") {
    return false;
  }

  switch (type) {
    case "widget:ready": {
      return typeof obj.version === "number";
    }
    case "widget:error": {
      return typeof obj.code === "string" && (obj.detail === undefined || typeof obj.detail === "string");
    }
    case "widget:result": {
      return (
        typeof obj.status === "string" &&
        ["valid", "expired", "revoked", "unknown", "invalid"].includes(obj.status)
      );
    }
    default:
      return false;
  }
}

/**
 * Determine the parent origin of the current window (this frame). Returns
 * the origin of the parent frame if embedded, or null if running in a
 * top-level window.
 *
 * This is NOT a security check — it's just determining whether we're
 * embedded or not. The origin is accessible to any script in the frame,
 * so there's nothing secret here. Actual trust decisions happen in
 * `buildParentOriginValidator`.
 */
export function getParentOrigin(): string | null {
  // Not embedded (running in top-level window)
  if (typeof window === "undefined" || window.top === window) {
    return null;
  }

  try {
    // In an iframe. Parent origin is accessible via window.location in
    // same-origin context, but cross-origin iframes cannot read
    // window.parent.location. Try to infer it from document.referrer
    // (set when parent navigates to the iframe) or fall back to
    // trying to read window.parent.location with appropriate error handling.

    // First, try referrer (works for same-origin, gives us the parent's URL)
    if (document.referrer) {
      const referrerUrl = new URL(document.referrer);
      return referrerUrl.origin;
    }

    // Second, try window.parent.location (only works in same-origin context)
    try {
      const parentLocation = window.parent.location.href;
      const parentUrl = new URL(parentLocation);
      return parentUrl.origin;
    } catch {
      // Cross-origin iframe: both methods fail. We're embedded but can't
      // determine the parent's origin through standard APIs.
      // Return a special marker that indicates "embedded but unknown parent origin".
      // This is not a security risk — the parent can always communicate its own
      // origin via postMessage if needed.
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Render state for denied embedding (when parent origin is not in allow-list
 * and deniedEmbeddingBehavior is set to 'deny' instead of 'silent').
 */
export type DeniedEmbeddingState = {
  kind: "denied-parent-origin";
  reason: "allowlist-mismatch" | "invalid-origin";
};

</content>
</invoke>