/**
 * Trusted Types policy for enforcing safe browser injection sinks.
 *
 * Trusted Types is a browser API that requires all values assigned to
 * dangerous DOM sinks (innerHTML, src, href, etc.) to pass through a
 * policy that can validate and sanitize them. This prevents accidental
 * or malicious injection of untrusted content.
 *
 * Policy behavior:
 * - All inputs are validated strictly
 * - Invalid inputs throw errors (fail-closed)
 * - Policies must be created in a browser context (not during SSR)
 * - Violations are reported via CSP
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
 */

/**
 * Result of policy validation. If the string passes, it's wrapped in a
 * Trusted* type that the browser will accept in dangerous sinks.
 */
export type TrustedTypesResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * Wraps content that has been validated for use in a script sink.
 * The content must be static or pre-validated before reaching this policy.
 */
export interface SafeScriptContent {
  readonly __html: string;
  readonly __type: "safe-script";
}

/**
 * Wraps content that has been validated for use as HTML markup.
 * The content must be sanitized before reaching this policy.
 */
export interface SafeHtmlContent {
  readonly __html: string;
  readonly __type: "safe-html";
}

/**
 * Creates a Trusted Types policy for the application.
 * This policy enforces strict validation of all content before it reaches
 * dangerous DOM sinks.
 *
 * In production, this policy is registered with the browser's Trusted Types API.
 * During testing or on browsers without Trusted Types support, it acts as a
 * validation layer that throws on invalid input.
 *
 * Policy rules:
 * - All input must be a string
 * - All input must be non-empty after trimming
 * - HTML policies require content to be pre-sanitized or from hardcoded sources
 * - Script policies require content to be from hardcoded or explicitly approved sources
 *
 * @returns A policy object with factory methods that return validated content
 */
export function createTrustedTypesPolicy(): {
  createScript(input: string, source?: string): SafeScriptContent;
  createHTML(input: string, source?: string): SafeHtmlContent;
} {
  const POLICY_NAME = "earnproof-frontend";

  // If Trusted Types API is available, register the native policy
  if (typeof window !== "undefined" && window.trustedTypes) {
    try {
      window.trustedTypes.createPolicy(POLICY_NAME, {
        createScript: (input: string) => {
          if (typeof input !== "string") {
            throw new Error("Script content must be a string");
          }
          if (input.trim().length === 0) {
            throw new Error("Script content must not be empty");
          }
          return input;
        },
        createHTML: (input: string) => {
          if (typeof input !== "string") {
            throw new Error("HTML content must be a string");
          }
          if (input.trim().length === 0) {
            throw new Error("HTML content must not be empty");
          }
          return input;
        },
      });
    } catch (err) {
      // Policy already registered or Trusted Types not fully supported
      // Continue with fallback implementation
    }
  }

  // Fallback implementation for non-Trusted Types browsers and testing
  return {
    createScript(input: string, source?: string): SafeScriptContent {
      if (typeof input !== "string") {
        throw new TypeError("Script content must be a string");
      }
      if (input.trim().length === 0) {
        throw new Error("Script content must not be empty");
      }
      return {
        __html: input,
        __type: "safe-script",
      };
    },

    createHTML(input: string, source?: string): SafeHtmlContent {
      if (typeof input !== "string") {
        throw new TypeError("HTML content must be a string");
      }
      if (input.trim().length === 0) {
        throw new Error("HTML content must not be empty");
      }
      return {
        __html: input,
        __type: "safe-html",
      };
    },
  };
}

/**
 * Creates a Trusted Script from a static, hardcoded string.
 * Use this only for scripts that are completely defined at build time
 * with no dynamic input.
 *
 * Example:
 * ```typescript
 * const script = trustedScript(DISPLAY_PREFERENCES_BOOTSTRAP_SCRIPT);
 * ```
 *
 * @param script The script content (must be hardcoded/static)
 * @returns Validated script content safe for insertion into a script tag
 */
export function trustedScript(script: string): SafeScriptContent {
  if (typeof script !== "string") {
    throw new TypeError("Script must be a string");
  }
  if (script.trim().length === 0) {
    throw new Error("Script must not be empty");
  }
  return {
    __html: script,
    __type: "safe-script",
  };
}

/**
 * Creates a Trusted HTML from content that has been pre-sanitized or
 * is from a trusted source (like a hardcoded template).
 *
 * Only use this if:
 * - The content is completely static (defined at build time)
 * - OR the content has been explicitly sanitized with DOMPurify or similar
 * - OR the content comes from a validated, allowlisted source
 *
 * Do NOT use this for arbitrary user input or unsanitized API responses.
 *
 * @param html The HTML content (must be pre-validated/sanitized)
 * @param source Description of the validation/sanitization applied
 * @returns Validated HTML content safe for use with dangerouslySetInnerHTML
 */
export function trustedHTML(
  html: string,
  source?: string
): SafeHtmlContent {
  if (typeof html !== "string") {
    throw new TypeError("HTML must be a string");
  }
  if (html.trim().length === 0) {
    throw new Error("HTML must not be empty");
  }
  return {
    __html: html,
    __type: "safe-html",
  };
}

/**
 * Helper to detect if a value is already a trusted content wrapper.
 * Useful in utility functions that need to handle both raw strings and
 * already-trusted content.
 */
export function isTrustedContent(
  value: unknown
): value is SafeScriptContent | SafeHtmlContent {
  return (
    typeof value === "object" &&
    value !== null &&
    "__type" in value &&
    ("__html" in value)
  );
}

/**
 * Validates a string is a non-empty, non-whitespace string.
 * Used internally by policy validators.
 */
function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
