/**
 * Tests for navigation URL safety.
 *
 * Covers:
 * - Blocked-key validation
 * - Safe URL builder with validation
 * - Safe filter URL construction
 * - Safe search parameter extraction
 * - Sensitive data detection in URLs
 * - URL redaction for logging
 */

import {
  buildSafeUrl,
  buildSafeFilterUrl,
  extractSafeSearchParams,
  urlContainsSensitiveData,
  toRedactedUrl,
  validateUrlParameterKey,
  validateUrlParameterKeys,
  hasBlockedKeys,
} from "@/lib/navigation";

describe("Navigation URL Safety", () => {
  describe("validateUrlParameterKey", () => {
    describe("blocked keys", () => {
      it("rejects token", () => {
        const result = validateUrlParameterKey("token");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects access_token", () => {
        const result = validateUrlParameterKey("access_token");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects api_key", () => {
        const result = validateUrlParameterKey("api_key");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects password", () => {
        const result = validateUrlParameterKey("password");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects credential", () => {
        const result = validateUrlParameterKey("credential");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects private_key", () => {
        const result = validateUrlParameterKey("private_key");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects wallet_address", () => {
        const result = validateUrlParameterKey("wallet_address");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects email", () => {
        const result = validateUrlParameterKey("email");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects phone", () => {
        const result = validateUrlParameterKey("phone");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects card_number", () => {
        const result = validateUrlParameterKey("card_number");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      it("rejects ssn", () => {
        const result = validateUrlParameterKey("ssn");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("blocked-key");
      });

      // Case-insensitive matching
      it("rejects TOKEN (case-insensitive)", () => {
        const result = validateUrlParameterKey("TOKEN");
        expect(result.ok).toBe(false);
      });

      it("rejects Access_Token (case-insensitive)", () => {
        const result = validateUrlParameterKey("Access_Token");
        expect(result.ok).toBe(false);
      });
    });

    describe("suspicious patterns", () => {
      it("rejects keys containing 'secret'", () => {
        const result = validateUrlParameterKey("my_secret_key");
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("suspicious-pattern");
      });

      it("rejects keys containing 'private'", () => {
        const result = validateUrlParameterKey("private_data");
        expect(result.ok).toBe(false);
      });

      it("rejects keys ending with _token", () => {
        const result = validateUrlParameterKey("refresh_token");
        expect(result.ok).toBe(false);
      });

      it("rejects keys ending with _key", () => {
        const result = validateUrlParameterKey("encryption_key");
        expect(result.ok).toBe(false);
      });
    });

    describe("allowed keys", () => {
      it("allows id", () => {
        const result = validateUrlParameterKey("id");
        expect(result.ok).toBe(true);
      });

      it("allows proof_id", () => {
        const result = validateUrlParameterKey("proof_id");
        expect(result.ok).toBe(true);
      });

      it("allows org_id", () => {
        const result = validateUrlParameterKey("org_id");
        expect(result.ok).toBe(true);
      });

      it("allows page", () => {
        const result = validateUrlParameterKey("page");
        expect(result.ok).toBe(true);
      });

      it("allows status", () => {
        const result = validateUrlParameterKey("status");
        expect(result.ok).toBe(true);
      });

      it("allows sort", () => {
        const result = validateUrlParameterKey("sort");
        expect(result.ok).toBe(true);
      });

      it("allows actor", () => {
        const result = validateUrlParameterKey("actor");
        expect(result.ok).toBe(true);
      });

      it("allows action", () => {
        const result = validateUrlParameterKey("action");
        expect(result.ok).toBe(true);
      });

      it("allows from", () => {
        const result = validateUrlParameterKey("from");
        expect(result.ok).toBe(true);
      });

      it("allows to", () => {
        const result = validateUrlParameterKey("to");
        expect(result.ok).toBe(true);
      });
    });

    describe("boundary cases", () => {
      it("rejects empty string", () => {
        const result = validateUrlParameterKey("");
        expect(result.ok).toBe(false);
      });

      it("rejects null", () => {
        const result = validateUrlParameterKey(null as any);
        expect(result.ok).toBe(false);
      });

      it("rejects undefined", () => {
        const result = validateUrlParameterKey(undefined as any);
        expect(result.ok).toBe(false);
      });

      it("handles whitespace in key", () => {
        const result = validateUrlParameterKey("  token  ");
        expect(result.ok).toBe(false);
      });
    });
  });

  describe("validateUrlParameterKeys", () => {
    it("validates multiple keys", () => {
      const results = validateUrlParameterKeys(["id", "page", "status"]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("catches any blocked keys", () => {
      const results = validateUrlParameterKeys([
        "id",
        "page",
        "token",
        "status",
      ]);
      expect(results).toHaveLength(4);
      expect(results[2].ok).toBe(false);
    });
  });

  describe("hasBlockedKeys", () => {
    it("returns false for all safe keys", () => {
      expect(hasBlockedKeys(["id", "page", "status"])).toBe(false);
    });

    it("returns true if any key is blocked", () => {
      expect(hasBlockedKeys(["id", "page", "token"])).toBe(true);
    });

    it("returns true for credential", () => {
      expect(hasBlockedKeys(["credential"])).toBe(true);
    });
  });

  describe("buildSafeUrl", () => {
    it("builds safe URL with no params", () => {
      const result = buildSafeUrl("/proofs");
      expect(result.ok).toBe(true);
      expect(result.href).toBe("/proofs");
    });

    it("builds safe URL with allowed params", () => {
      const result = buildSafeUrl("/proofs", { page: "1", status: "active" });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("/proofs");
      expect(result.href).toContain("page=1");
      expect(result.href).toContain("status=active");
    });

    it("rejects URL with blocked key", () => {
      const result = buildSafeUrl("/verify", { proof: "ABC123", token: "secret" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("validation-failed");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].key).toBe("token");
    });

    it("rejects multiple blocked keys", () => {
      const result = buildSafeUrl("/api", {
        token: "secret",
        api_key: "key",
        password: "pass",
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(3);
    });

    it("handles numeric params", () => {
      const result = buildSafeUrl("/proofs", { page: 1, limit: 10 });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("page=1");
      expect(result.href).toContain("limit=10");
    });

    it("handles boolean params", () => {
      const result = buildSafeUrl("/proofs", { archived: true });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("archived=true");
    });

    it("skips null and undefined params", () => {
      const result = buildSafeUrl("/proofs", {
        page: 1,
        status: null,
        filter: undefined,
      });
      expect(result.ok).toBe(true);
      expect(result.href).not.toContain("status");
      expect(result.href).not.toContain("filter");
    });

    it("skips empty string params", () => {
      const result = buildSafeUrl("/proofs", { page: 1, filter: "" });
      expect(result.ok).toBe(true);
      expect(result.href).not.toContain("filter");
    });

    it("normalizes pathname", () => {
      const result = buildSafeUrl("proofs");
      expect(result.ok).toBe(true);
      expect(result.pathname).toBe("/proofs");
    });

    it("rejects invalid pathname", () => {
      const result = buildSafeUrl("https://attacker.com");
      expect(result.ok).toBe(false);
    });

    it("rejects empty pathname", () => {
      const result = buildSafeUrl("");
      expect(result.ok).toBe(false);
    });

    it("allows custom validation behavior with strict: false", () => {
      const result = buildSafeUrl(
        "/proofs",
        { page: 1, token: "secret", unknown_field: "value" },
        { strict: false },
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1); // token is still blocked
    });
  });

  describe("buildSafeFilterUrl", () => {
    it("builds filter URL with allowed filter keys", () => {
      const result = buildSafeFilterUrl("/audit", {
        actor: "user123",
        action: "create",
        status: "completed",
      });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("actor=user123");
      expect(result.href).toContain("action=create");
      expect(result.href).toContain("status=completed");
    });

    it("rejects disallowed filter keys", () => {
      const result = buildSafeFilterUrl("/audit", {
        actor: "user123",
        token: "secret",
      });
      expect(result.ok).toBe(false);
      expect(result.errors[0].key).toBe("token");
    });

    it("handles pagination in filters", () => {
      const result = buildSafeFilterUrl("/audit", {
        page: 1,
        limit: 20,
        actor: "user123",
      });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("page=1");
      expect(result.href).toContain("limit=20");
    });

    it("handles array values (multi-select)", () => {
      const result = buildSafeFilterUrl("/audit", {
        action: ["create", "delete", "update"],
      });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("action=create%2Cdelete%2Cupdate");
    });

    it("skips empty arrays", () => {
      const result = buildSafeFilterUrl("/audit", {
        action: [],
        page: 1,
      });
      expect(result.ok).toBe(true);
      expect(result.href).not.toContain("action");
    });

    it("handles date range filters", () => {
      const result = buildSafeFilterUrl("/audit", {
        date_from: "2024-01-01",
        date_to: "2024-12-31",
      });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("date_from");
      expect(result.href).toContain("date_to");
    });
  });

  describe("extractSafeSearchParams", () => {
    it("extracts allowed params from query string", () => {
      const params = extractSafeSearchParams("?page=1&status=active");
      expect(params.page).toBe("1");
      expect(params.status).toBe("active");
    });

    it("drops blocked params from query string", () => {
      const params = extractSafeSearchParams(
        "?page=1&token=secret&status=active",
      );
      expect(params.page).toBe("1");
      expect(params.status).toBe("active");
      expect(params.token).toBeUndefined();
    });

    it("works with URLSearchParams", () => {
      const searchParams = new URLSearchParams("?id=123&page=1");
      const params = extractSafeSearchParams(searchParams);
      expect(params.id).toBe("123");
      expect(params.page).toBe("1");
    });

    it("handles empty search string", () => {
      const params = extractSafeSearchParams("");
      expect(Object.keys(params)).toHaveLength(0);
    });

    it("handles null/undefined", () => {
      expect(extractSafeSearchParams(null)).toEqual({});
      expect(extractSafeSearchParams(undefined)).toEqual({});
    });

    it("preserves multiple sensitive params dropped", () => {
      const params = extractSafeSearchParams(
        "?token=t&api_key=k&password=p&page=1",
      );
      expect(Object.keys(params)).toEqual(["page"]);
    });
  });

  describe("urlContainsSensitiveData", () => {
    it("returns false for safe URLs", () => {
      expect(urlContainsSensitiveData("/proofs?page=1&status=active")).toBe(
        false,
      );
    });

    it("returns true if token in query string", () => {
      expect(
        urlContainsSensitiveData("/verify?proof=ABC&token=secret"),
      ).toBe(true);
    });

    it("returns true if credential in query string", () => {
      expect(
        urlContainsSensitiveData("/api?credential=credentials"),
      ).toBe(true);
    });

    it("returns true if api_key in query string", () => {
      expect(urlContainsSensitiveData("?api_key=secret")).toBe(true);
    });

    it("returns true if email in query string", () => {
      expect(
        urlContainsSensitiveData("?page=1&email=user@example.com"),
      ).toBe(true);
    });

    it("handles full URLs", () => {
      expect(
        urlContainsSensitiveData(
          "https://example.com/verify?proof=ABC&token=secret",
        ),
      ).toBe(true);
    });

    it("handles empty URL", () => {
      expect(urlContainsSensitiveData("")).toBe(false);
    });

    it("handles malformed URL gracefully", () => {
      expect(urlContainsSensitiveData("not a valid url !!!")).toBe(false);
    });
  });

  describe("toRedactedUrl", () => {
    it("removes query string", () => {
      const result = toRedactedUrl("/proofs?page=1&status=active");
      expect(result).toBe("/proofs");
    });

    it("removes fragment", () => {
      const result = toRedactedUrl("/verify#section");
      expect(result).toBe("/verify");
    });

    it("removes both query and fragment", () => {
      const result = toRedactedUrl(
        "/proofs?page=1&token=secret#top",
      );
      expect(result).toBe("/proofs");
    });

    it("handles full URLs", () => {
      const result = toRedactedUrl(
        "https://example.com/proofs?page=1&token=secret#top",
      );
      expect(result).toBe("/proofs");
    });

    it("preserves path with multiple segments", () => {
      const result = toRedactedUrl(
        "/app/proofs/detail?id=123&token=secret",
      );
      expect(result).toBe("/app/proofs/detail");
    });

    it("handles empty URL", () => {
      expect(toRedactedUrl("")).toBe("");
    });

    it("handles pathname-only URL", () => {
      const result = toRedactedUrl("/proofs");
      expect(result).toBe("/proofs");
    });

    it("handles malformed URL gracefully", () => {
      const result = toRedactedUrl("some string without protocol");
      expect(result).toBeTruthy();
    });
  });

  describe("regression tests", () => {
    it("does not allow proof IDs to be treated as credentials", () => {
      // proof_id should be safe, but credential should not
      const proof = validateUrlParameterKey("proof_id");
      const cred = validateUrlParameterKey("credential");
      expect(proof.ok).toBe(true);
      expect(cred.ok).toBe(false);
    });

    it("does not allow org_id to conflict with api_key validation", () => {
      const orgId = validateUrlParameterKey("org_id");
      const apiKey = validateUrlParameterKey("api_key");
      expect(orgId.ok).toBe(true);
      expect(apiKey.ok).toBe(false);
    });

    it("preserves existing public behavior for proof verification URLs", () => {
      // Existing code uses /verify?proof={id}
      const result = buildSafeUrl("/verify", { proof: "EP-ABC-123" });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("proof=EP-ABC-123");
    });

    it("preserves filter-based navigation behavior", () => {
      // Audit logs use filter navigation
      const result = buildSafeFilterUrl("/audit", {
        actor: "user@org",
        action: "create",
        category: "proof",
      });
      expect(result.ok).toBe(true);
      expect(result.href).toContain("actor");
      expect(result.href).toContain("action");
      expect(result.href).toContain("category");
    });

    it("prevents status parameter confusion with sensitive data", () => {
      // Status values are safe (application-controlled enum)
      const result = buildSafeUrl("/settings/governance", {
        status: "approved",
      });
      expect(result.ok).toBe(true);
    });

    it("handles URL params that look similar to tokens but are safe", () => {
      // Ensure we don't have false positives
      const result = buildSafeUrl("/proofs", {
        id: "abc123def456", // looks like a token but is just an ID
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("authorization and security", () => {
    it("validates parameters independently of authorization state", () => {
      // Validation should not depend on whether user is logged in
      const result = buildSafeUrl("/protected", { token: "secret" });
      expect(result.ok).toBe(false);
    });

    it("rejects sensitive params regardless of pathname", () => {
      // Every path is protected, not just sensitive ones
      expect(buildSafeUrl("/public", { token: "secret" }).ok).toBe(false);
      expect(buildSafeUrl("/private", { token: "secret" }).ok).toBe(false);
    });

    it("maintains blocklist across different param names", () => {
      // Aliases for the same sensitive concept should all be blocked
      const tokenAlias = validateUrlParameterKey("access_token");
      const keyAlias = validateUrlParameterKey("api_key");
      const walletAlias = validateUrlParameterKey("wallet_address");
      expect(tokenAlias.ok).toBe(false);
      expect(keyAlias.ok).toBe(false);
      expect(walletAlias.ok).toBe(false);
    });
  });
});
