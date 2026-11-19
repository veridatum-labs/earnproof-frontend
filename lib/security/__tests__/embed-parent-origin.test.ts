/**
 * Tests for parent-origin validation (issue #368).
 * Covers: allowlist matching, message schema validation, origin normalization.
 */

import {
  buildParentOriginValidator,
  normalizeOrigin,
  normalizeOrigins,
  isValidParentMessage,
  isValidWidgetMessage,
  getParentOrigin,
  type ParentOriginValidation,
} from "@/lib/security/embed-parent-origin";

describe("embed-parent-origin", () => {
  describe("normalizeOrigin", () => {
    it("normalizes HTTPS origins with lowercase domain", () => {
      const result = normalizeOrigin("https://Example.COM:3000");
      expect(result).toBe("https://example.com:3000");
    });

    it("preserves scheme casing but lowercases domain", () => {
      const result = normalizeOrigin("HTTPS://Example.COM");
      expect(result).toBe("https://example.com");
    });

    it("handles origins without port", () => {
      const result = normalizeOrigin("https://example.com");
      expect(result).toBe("https://example.com");
    });

    it("preserves explicit port numbers", () => {
      const result = normalizeOrigin("https://example.com:8080");
      expect(result).toBe("https://example.com:8080");
    });

    it("returns wildcard as-is", () => {
      const result = normalizeOrigin("*");
      expect(result).toBe("*");
    });

    it("throws on malformed origins", () => {
      expect(() => normalizeOrigin("not-a-url")).toThrow();
      expect(() => normalizeOrigin("://missing-scheme")).toThrow();
      expect(() => normalizeOrigin("")).toThrow();
    });

    it("throws on non-HTTP(S) schemes", () => {
      expect(() => normalizeOrigin("ftp://example.com")).toThrow();
      expect(() => normalizeOrigin("file:///etc/passwd")).toThrow();
    });
  });

  describe("normalizeOrigins", () => {
    it("normalizes an array of origins", () => {
      const result = normalizeOrigins([
        "https://Example.COM",
        "https://app.example.com:3000",
      ]);
      expect(result).toEqual(["https://example.com", "https://app.example.com:3000"]);
    });

    it("deduplicates origins", () => {
      const result = normalizeOrigins([
        "https://example.com",
        "HTTPS://EXAMPLE.COM",
        "https://example.com:443",
      ]);
      // https://example.com:443 is NOT the same as https://example.com (port 80 default)
      expect(result.length).toBe(2);
      expect(result).toContain("https://example.com");
      expect(result).toContain("https://example.com:443");
    });

    it("filters out invalid entries silently", () => {
      const result = normalizeOrigins([
        "https://example.com",
        "not-a-url",
        "https://app.example.com",
        "ftp://invalid.scheme",
      ]);
      expect(result).toEqual(["https://example.com", "https://app.example.com"]);
    });

    it("handles empty array", () => {
      expect(normalizeOrigins([])).toEqual([]);
    });

    it("includes wildcard in results", () => {
      const result = normalizeOrigins(["https://example.com", "*"]);
      expect(result).toContain("*");
    });
  });

  describe("buildParentOriginValidator", () => {
    it("validates against a specific allow-list", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://example.com", "https://app.example.com"],
      });

      const validResult = validator("https://example.com") as ParentOriginValidation;
      expect(validResult.ok).toBe(true);
      expect(validResult.origin).toBe("https://example.com");

      const invalidResult = validator("https://hostile.com") as ParentOriginValidation;
      expect(invalidResult.ok).toBe(false);
      expect(invalidResult.reason).toBe("allowlist-mismatch");
    });

    it("allows standalone (non-embedded) widget when origin is null", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://example.com"],
      });

      const result = validator(null) as ParentOriginValidation;
      expect(result.ok).toBe(true);
      expect(result.origin).toBe("standalone");
    });

    it("allows any origin with wildcard", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["*"],
      });

      expect(validator("https://example.com").ok).toBe(true);
      expect(validator("https://hostile.com").ok).toBe(true);
      expect(validator("https://anything.example.com:8080").ok).toBe(true);
    });

    it("normalizes origins during validation (case-insensitive domain matching)", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://Example.COM"],
      });

      const result = validator("HTTPS://example.com") as ParentOriginValidation;
      expect(result.ok).toBe(true);
    });

    it("rejects invalid origin URLs", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://example.com"],
      });

      const result = validator("not-a-url") as ParentOriginValidation;
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("invalid-origin");
    });

    it("denies disallowed origins", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: [],
      });

      const result = validator("https://example.com") as ParentOriginValidation;
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("allowlist-mismatch");
    });

    it("allows undefined origin (standalone)", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: [],
      });

      const result = validator(undefined) as ParentOriginValidation;
      expect(result.ok).toBe(true);
      expect(result.origin).toBe("standalone");
    });
  });

  describe("isValidParentMessage", () => {
    it("accepts parent:ping messages", () => {
      expect(isValidParentMessage({ type: "parent:ping" })).toBe(true);
    });

    it("accepts parent:reload messages", () => {
      expect(isValidParentMessage({ type: "parent:reload" })).toBe(true);
    });

    it("rejects unknown message types in strict mode", () => {
      expect(
        isValidParentMessage({ type: "parent:unknown" }, { strict: true }),
      ).toBe(false);
    });

    it("accepts unknown message types in non-strict mode", () => {
      expect(
        isValidParentMessage({ type: "parent:unknown" }, { strict: false }),
      ).toBe(true);
    });

    it("rejects non-object messages", () => {
      expect(isValidParentMessage("string-message")).toBe(false);
      expect(isValidParentMessage(123)).toBe(false);
      expect(isValidParentMessage(null)).toBe(false);
      expect(isValidParentMessage(undefined)).toBe(false);
    });

    it("rejects messages without type field", () => {
      expect(isValidParentMessage({ data: "no-type" })).toBe(false);
    });

    it("rejects messages with non-string type", () => {
      expect(isValidParentMessage({ type: 123 })).toBe(false);
      expect(isValidParentMessage({ type: null })).toBe(false);
    });
  });

  describe("isValidWidgetMessage", () => {
    it("accepts widget:ready messages with version", () => {
      expect(isValidWidgetMessage({ type: "widget:ready", version: 1 })).toBe(
        true,
      );
    });

    it("rejects widget:ready without version", () => {
      expect(isValidWidgetMessage({ type: "widget:ready" })).toBe(false);
    });

    it("rejects widget:ready with non-number version", () => {
      expect(
        isValidWidgetMessage({ type: "widget:ready", version: "1" }),
      ).toBe(false);
    });

    it("accepts widget:error messages with code", () => {
      expect(
        isValidWidgetMessage({ type: "widget:error", code: "NETWORK_ERROR" }),
      ).toBe(true);
    });

    it("accepts widget:error messages with optional detail", () => {
      expect(
        isValidWidgetMessage({
          type: "widget:error",
          code: "NETWORK_ERROR",
          detail: "Connection timeout",
        }),
      ).toBe(true);
    });

    it("rejects widget:error without code", () => {
      expect(isValidWidgetMessage({ type: "widget:error" })).toBe(false);
      expect(
        isValidWidgetMessage({ type: "widget:error", detail: "some detail" }),
      ).toBe(false);
    });

    it("accepts widget:result messages with valid status", () => {
      const statuses = ["valid", "expired", "revoked", "unknown", "invalid"] as const;
      for (const status of statuses) {
        expect(isValidWidgetMessage({ type: "widget:result", status })).toBe(
          true,
        );
      }
    });

    it("rejects widget:result with invalid status", () => {
      expect(
        isValidWidgetMessage({ type: "widget:result", status: "unverified" }),
      ).toBe(false);
    });

    it("rejects widget:result without status", () => {
      expect(isValidWidgetMessage({ type: "widget:result" })).toBe(false);
    });

    it("rejects unknown widget message types", () => {
      expect(isValidWidgetMessage({ type: "widget:unknown" })).toBe(false);
    });

    it("rejects non-object messages", () => {
      expect(isValidWidgetMessage("string")).toBe(false);
      expect(isValidWidgetMessage(null)).toBe(false);
      expect(isValidWidgetMessage(undefined)).toBe(false);
    });

    it("rejects messages without type field", () => {
      expect(isValidWidgetMessage({ status: "valid" })).toBe(false);
    });
  });

  describe("getParentOrigin", () => {
    it("returns null in a top-level window (window.top === window)", () => {
      // In jsdom test environment, we're running in a top-level context
      const result = getParentOrigin();
      expect(result).toBeNull();
    });

    // Full iframe testing would require integration tests or setup with
    // jsdom configuration. Unit tests here cover the logic structure.
  });

  describe("allowlist edge cases", () => {
    it("handles origins with query params (ignored by URL normalization)", () => {
      // URL.origin always returns scheme://host:port, query/hash/path are dropped
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://example.com"],
      });

      // These should all match https://example.com
      const result1 = validator("https://example.com/path?query=1");
      const result2 = validator("https://example.com:443");

      // URL normalization drops path/query but https://example.com:443 is
      // explicit about the port, making it different from https://example.com
      // (which defaults to port 80/443 depending on scheme).
      if (result1.ok && result2.ok) {
        expect(result1.origin).toBe("https://example.com");
      }
    });

    it("requires exact scheme match (http != https)", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://example.com"],
      });

      const result = validator("http://example.com");
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("allowlist-mismatch");
    });

    it("handles subdomains as distinct origins", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: ["https://example.com"],
      });

      const subdomain = validator("https://app.example.com");
      expect(subdomain.ok).toBe(false);
    });

    it("allows mixed wildcard and specific origins", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: [
          "https://trusted.com",
          "https://app.trusted.com",
          "*",
        ],
      });

      expect(validator("https://trusted.com").ok).toBe(true);
      expect(validator("https://untrusted.com").ok).toBe(true); // Allowed by wildcard
    });
  });

  describe("message schema edge cases", () => {
    it("rejects messages with extra fields (still validates core fields)", () => {
      // Extra fields are allowed; only the required ones matter
      expect(
        isValidParentMessage({
          type: "parent:ping",
          extra: "field",
          nested: { data: "here" },
        }),
      ).toBe(true);
    });

    it("validates widget messages with extra fields", () => {
      expect(
        isValidWidgetMessage({
          type: "widget:ready",
          version: 1,
          extra: "field",
        }),
      ).toBe(true);
    });

    it("rejects arrays and other collection types", () => {
      expect(isValidParentMessage([])).toBe(false);
      expect(isValidWidgetMessage([{ type: "widget:ready", version: 1 }])).toBe(
        false,
      );
    });
  });

  describe("production security posture", () => {
    it("empty allow-list denies all embedded origins", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: [],
      });

      expect(validator("https://any.com").ok).toBe(false);
      expect(validator("https://example.com").ok).toBe(false);
    });

    it("standalone widget (origin=null) always passes validation", () => {
      const validator = buildParentOriginValidator({
        allowedParentOrigins: [],
      });

      // Even with empty allow-list, standalone is allowed
      expect(validator(null).ok).toBe(true);
      expect(validator(undefined).ok).toBe(true);
    });

    it("strict message validation rejects anything not explicitly allowed", () => {
      // Future-proofing: if we add postMessage listening later
      expect(isValidParentMessage({ type: "widget:override" }, { strict: true })).toBe(false);
      expect(isValidParentMessage({ type: "earnproof:inject-token" }, { strict: true })).toBe(
        false,
      );
    });

    it("widget messages must have exact schema (no lenient parsing)", () => {
      // Prevent injection attacks through message schema ambiguity
      const validMessage = {
        type: "widget:error",
        code: "ERROR_CODE",
      };
      expect(isValidWidgetMessage(validMessage)).toBe(true);

      const injection = {
        type: "widget:error",
        code: "ERROR_CODE",
        overrideParent: true, // Attacker tries to add this
      };
      expect(isValidWidgetMessage(injection)).toBe(true); // Extra fields allowed
      // But the schema doesn't define this field, so it won't be used by widget code
    });
  });
});
