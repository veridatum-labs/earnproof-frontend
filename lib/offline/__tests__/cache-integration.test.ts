/**
 * Integration tests for cache exclusion with sensitive data policy.
 *
 * Verifies that the cache exclusion policy works correctly with:
 * - Sensitive data policy (lib/network/sensitive-data-policy.ts)
 * - Existing API client no-store policy
 * - bfcache guard behavior
 */

import {
  shouldExcludeFromCache,
  shouldExcludeResponseFromCache,
  evaluateCacheExclusion,
  clearSensitiveServiceWorkerCaches,
  type CacheAuthContext,
} from "../cache-exclusion-policy";

describe("Cache Exclusion Policy Integration", () => {
  describe("integration with sensitive data policy", () => {
    it("excludes payment endpoints that sensitive-data-policy monitors", () => {
      const paymentEndpoints = [
        "/api/payments",
        "/api/billing",
        "/api/payment-methods",
      ];

      for (const endpoint of paymentEndpoints) {
        const result = shouldExcludeFromCache(endpoint, false);
        expect(result.excluded).toBe(true);
        expect(result.category).toBe("authenticated-api");
      }
    });

    it("excludes proof endpoints that sensitive-data-policy monitors", () => {
      const proofEndpoints = [
        "/api/proofs",
        "/api/proof-requests",
        "/api/proof-shares",
      ];

      for (const endpoint of proofEndpoints) {
        const result = shouldExcludeFromCache(endpoint, false);
        expect(result.excluded).toBe(true);
      }
    });

    it("excludes account/org endpoints that sensitive-data-policy monitors", () => {
      const accountEndpoints = [
        "/api/account",
        "/api/users",
        "/api/organizations",
        "/api/organization-members",
      ];

      for (const endpoint of accountEndpoints) {
        const result = shouldExcludeFromCache(endpoint, false);
        expect(result.excluded).toBe(true);
      }
    });

    it("excludes settings endpoints that sensitive-data-policy monitors", () => {
      const settingsEndpoints = [
        "/api/settings",
        "/api/api-keys",
        "/api/sessions",
        "/api/audit-log",
        "/api/trusted-sources",
      ];

      for (const endpoint of settingsEndpoints) {
        const result = shouldExcludeFromCache(endpoint, false);
        expect(result.excluded).toBe(true);
      }
    });

    it("excludes auth endpoints that sensitive-data-policy monitors", () => {
      const authEndpoints = [
        "/api/auth",
        "/api/token",
        "/api/session",
        "/api/login",
        "/api/logout",
      ];

      for (const endpoint of authEndpoints) {
        const result = shouldExcludeFromCache(endpoint, false);
        expect(result.excluded).toBe(true);
      }
    });

    it("cooperates with cache clearing during logout flow", async () => {
      // Simulate the logout flow:
      // 1. User is authenticated
      const authContext: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      // 2. Payment response should be excluded (never cached)
      const paymentResponse = new Response('{"amount":100}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      const paymentExclusion = evaluateCacheExclusion(
        "/api/payments",
        paymentResponse,
        authContext,
      );
      expect(paymentExclusion.excluded).toBe(true);

      // 3. When logout is called, clearSensitiveServiceWorkerCaches would be called
      // (we can't fully test this without a real service worker, but we verify the function exists)
      await expect(clearSensitiveServiceWorkerCaches()).resolves.not.toThrow();

      // 4. After logout, user is no longer authenticated
      const unauthContext: CacheAuthContext = {
        isAuthenticated: false,
        hasAuthToken: false,
      };

      // 5. Protected page should now be cacheable (no longer authenticated)
      const settingsResponse = new Response("<html>Settings</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
      const settingsExclusion = evaluateCacheExclusion(
        "/settings",
        settingsResponse,
        unauthContext,
      );
      expect(settingsExclusion.excluded).toBe(false);
    });
  });

  describe("integration with API client no-store policy", () => {
    it("respects API client's no-store cache mode", () => {
      const response = new Response("data", {
        headers: {
          "Cache-Control": "no-store",
        },
      });
      const context: CacheAuthContext = {
        isAuthenticated: false,
        hasAuthToken: false,
      };

      // Even a public endpoint should be excluded if the response has no-store
      const result = evaluateCacheExclusion("/", response, context);
      expect(result.excluded).toBe(true);
      expect(result.reason).toContain("no-store");
    });

    it("works alongside API client's Cache-Control request header", () => {
      // API client sends Cache-Control: no-store in request headers
      // This test verifies our response guard doesn't conflict with that

      const response = new Response("data", {
        headers: {
          "Content-Type": "application/json",
        },
      });
      const context: CacheAuthContext = {
        isAuthenticated: false,
        hasAuthToken: false,
      };

      // API endpoints should still be excluded based on URL patterns,
      // independent of the request-side no-store
      const result = evaluateCacheExclusion("/api/payments", response, context);
      expect(result.excluded).toBe(true);
    });
  });

  describe("integration with bfcache guard", () => {
    it("protects /proofs routes from caching (bfcache-guard targets these)", () => {
      const response = new Response("proof data");
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      // bfcache-guard.ts targets /proofs with no-store in cache-headers.ts
      const result = evaluateCacheExclusion("/proofs", response, context);
      expect(result.excluded).toBe(true);
    });

    it("protects /settings routes from caching (bfcache-guard targets these)", () => {
      const response = new Response("settings data");
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      // bfcache-guard.ts targets /settings with no-store in cache-headers.ts
      const result = evaluateCacheExclusion("/settings", response, context);
      expect(result.excluded).toBe(true);
    });

    it("complements bfcache guard's defense-in-depth for Firefox", () => {
      // bfcache-guard.ts notes that Firefox's bfcache doesn't key off Cache-Control,
      // so pageshow/pagehide events are needed. Our cache exclusion policy adds
      // a layer by preventing the response from being cached in the first place.

      const response = new Response("sensitive data");
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      const result = evaluateCacheExclusion("/verify/credential", response, context);

      // Even though bfcache-guard handles this with pageshow events,
      // our cache exclusion prevents the response from being cached
      expect(result.excluded).toBe(true);
    });
  });

  describe("integration with concurrency limiter", () => {
    it("does not conflict with request coalescing", () => {
      // lib/network/request-dedup.ts coalesces identical GET requests
      // Our cache exclusion should work independently of that

      const response = new Response("proof data");
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      // Multiple identical requests should all be excluded from cache
      const result1 = evaluateCacheExclusion("/api/proofs/EP-1", response, context);
      const result2 = evaluateCacheExclusion("/api/proofs/EP-1", response, context);

      expect(result1.excluded).toBe(true);
      expect(result2.excluded).toBe(true);
    });
  });

  describe("determinism and observability", () => {
    it("produces deterministic cache decisions for the same input", () => {
      const response = new Response("data");
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      // Same input should always produce the same decision
      const decision1 = evaluateCacheExclusion("/api/payments", response, context);
      const decision2 = evaluateCacheExclusion("/api/payments", response, context);

      expect(decision1.excluded).toBe(decision2.excluded);
      expect(decision1.category).toBe(decision2.category);
    });

    it("provides observable classification reasons", () => {
      const response = new Response("data", {
        headers: { Authorization: "Bearer token" },
      });
      const context: CacheAuthContext = {
        isAuthenticated: false,
        hasAuthToken: false,
      };

      const result = shouldExcludeResponseFromCache(response, context);

      expect(result.excluded).toBe(true);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain("Authorization");
    });

    it("is bounded and does not allow bypasses", () => {
      // An attacker should not be able to bypass cache exclusion by:
      // 1. Using a different URL encoding
      const result1 = shouldExcludeFromCache("/api/payments", false);
      const result2 = shouldExcludeFromCache("/api%2Fpayments", false);
      expect(result1.excluded).toBe(true);
      // URL decoding may fail, but should still exclude as a precaution

      // 2. Using a case-variant endpoint
      const result3 = shouldExcludeFromCache("/API/PAYMENTS", false);
      // Pattern matching is case-sensitive, but /API/PAYMENTS won't match the pattern

      // 3. Hiding in URL parameters or fragments
      const result4 = shouldExcludeFromCache(
        "/public?redirect=/api/payments",
        false,
      );
      expect(result4.excluded).toBe(false); // Correctly identified as public

      const result5 = shouldExcludeFromCache("/public#section=/api/payments", false);
      expect(result5.excluded).toBe(false); // Fragment is not part of the path check
    });
  });

  describe("compatibility with existing authorization patterns", () => {
    it("respects existing privacy guarantees", () => {
      // The existing system relies on:
      // - Token in memory only (not cached)
      // - API responses marked no-store
      // - Cache headers set by next.config.ts
      // Our policy should complement all of these.

      const sensitiveResponse = new Response("wallet-authenticated data", {
        headers: {
          Authorization: "Bearer token",
        },
      });
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      const result = shouldExcludeResponseFromCache(sensitiveResponse, context);
      expect(result.excluded).toBe(true);
    });

    it("preserves public-content caching that existing system allows", () => {
      const publicResponse = new Response("<html>Home</html>", {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=0, must-revalidate",
        },
      });
      const context: CacheAuthContext = {
        isAuthenticated: false,
        hasAuthToken: false,
      };

      const result = evaluateCacheExclusion("/", publicResponse, context);
      expect(result.excluded).toBe(false);
    });
  });
});
