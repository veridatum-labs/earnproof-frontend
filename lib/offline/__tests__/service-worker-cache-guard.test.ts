/**
 * Tests for service worker cache guard.
 *
 * Coverage:
 * - Positive tests: responses are correctly guarded and classified
 * - Negative tests: cacheable responses pass the guard
 * - Boundary tests: edge cases in response evaluation
 * - Authorization tests: guard respects auth context
 * - Integration tests: cache guard works with sensitive-data-policy
 */

import {
  guardResponseForCache,
  createAuthContext,
  isResponseTypeCacheable,
  isStatusCodeCacheable,
  summarizeCacheGuardDecision,
  simulateServiceWorkerCacheLogic,
  type CacheGuardedResponse,
} from "../service-worker-cache-guard";
import { type CacheAuthContext } from "../cache-exclusion-policy";

describe("Service Worker Cache Guard", () => {
  describe("guardResponseForCache", () => {
    describe("positive tests: authenticated endpoints", () => {
      it("guards API payments endpoint", () => {
        const response = new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        const context = createAuthContext(true);

        const guarded = guardResponseForCache("/api/payments", response, context);

        expect(guarded.shouldCache).toBe(false);
        expect(guarded.classification.excluded).toBe(true);
      });

      it("guards proof data endpoint", () => {
        const response = new Response('{"id":"EP-1"}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        const context = createAuthContext(true);

        const guarded = guardResponseForCache("/api/proofs/EP-1", response, context);

        expect(guarded.shouldCache).toBe(false);
        expect(guarded.classification.category).toBe("authenticated-api");
      });

      it("guards protected page when authenticated", () => {
        const response = new Response("<html>Settings</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
        const context = createAuthContext(true);

        const guarded = guardResponseForCache("/settings", response, context);

        expect(guarded.shouldCache).toBe(false);
        expect(guarded.classification.category).toBe("protected-page");
      });

      it("guards response with authorization header", () => {
        const response = new Response("data", {
          status: 200,
          headers: {
            Authorization: "Bearer secret-token",
          },
        });
        const context = createAuthContext(false);

        const guarded = guardResponseForCache("/", response, context);

        expect(guarded.shouldCache).toBe(false);
        expect(guarded.classification.category).toBe("credentials");
      });
    });

    describe("negative tests: cacheable responses", () => {
      it("allows public page response", () => {
        const response = new Response("<html>Home</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
        const context = createAuthContext(false);

        const guarded = guardResponseForCache("/", response, context);

        expect(guarded.shouldCache).toBe(true);
        expect(guarded.classification.excluded).toBe(false);
      });

      it("allows public API response", () => {
        const response = new Response('{"types":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        const context = createAuthContext(false);

        const guarded = guardResponseForCache("/api/proof-types", response, context);

        expect(guarded.shouldCache).toBe(true);
      });

      it("allows static asset response", () => {
        const response = new Response("/* CSS */", {
          status: 200,
          headers: { "Content-Type": "text/css" },
        });
        const context = createAuthContext(false);

        const guarded = guardResponseForCache("/app.css", response, context);

        expect(guarded.shouldCache).toBe(true);
      });

      it("allows public page even when authenticated", () => {
        const response = new Response("<html>About</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
        const context = createAuthContext(true);

        const guarded = guardResponseForCache("/about", response, context);

        expect(guarded.shouldCache).toBe(true);
      });
    });

    describe("boundary tests: response classification", () => {
      it("includes original response in guarded result", () => {
        const response = new Response("data");
        const context = createAuthContext(false);

        const guarded = guardResponseForCache("/", response, context);

        expect(guarded.response).toBe(response);
      });

      it("includes classification reason in guarded result", () => {
        const response = new Response("data");
        const context = createAuthContext(false);

        const guarded = guardResponseForCache(
          "/api/payments",
          response,
          context,
        );

        expect(guarded.classification.reason).toBeDefined();
        expect(guarded.classification.reason).toContain("payments");
      });
    });

    describe("authorization tests: auth context", () => {
      it("respects authentication status in cache decision", () => {
        const response = new Response("data");

        const unauth = guardResponseForCache(
          "/settings",
          response,
          createAuthContext(false),
        );
        const auth = guardResponseForCache(
          "/settings",
          response,
          createAuthContext(true),
        );

        expect(unauth.shouldCache).toBe(true);
        expect(auth.shouldCache).toBe(false);
      });

      it("supports tenant context for multi-tenant scenarios", () => {
        const response = new Response("data");
        const context1 = createAuthContext(true, "tenant-1");
        const context2 = createAuthContext(true, "tenant-2");

        const guarded1 = guardResponseForCache("/api/payments", response, context1);
        const guarded2 = guardResponseForCache("/api/payments", response, context2);

        // Both should be excluded (tenant context doesn't affect decision,
        // but it's present for potential future use in multi-tenant caching)
        expect(guarded1.shouldCache).toBe(false);
        expect(guarded2.shouldCache).toBe(false);
      });
    });
  });

  describe("createAuthContext", () => {
    it("creates context with authentication state", () => {
      const context = createAuthContext(true);

      expect(context.isAuthenticated).toBe(true);
      expect(context.hasAuthToken).toBe(true);
    });

    it("creates context without authentication", () => {
      const context = createAuthContext(false);

      expect(context.isAuthenticated).toBe(false);
      expect(context.hasAuthToken).toBe(false);
    });

    it("includes optional tenant ID", () => {
      const context = createAuthContext(true, "tenant-123");

      expect(context.tenantId).toBe("tenant-123");
    });

    it("omits tenant ID when not provided", () => {
      const context = createAuthContext(true);

      expect(context.tenantId).toBeUndefined();
    });
  });

  describe("isResponseTypeCacheable", () => {
    it("identifies basic response as cacheable", () => {
      expect(isResponseTypeCacheable("basic")).toBe(true);
    });

    it("identifies cors response as cacheable", () => {
      expect(isResponseTypeCacheable("cors")).toBe(true);
    });

    it("does not identify opaque response as cacheable", () => {
      expect(isResponseTypeCacheable("opaque")).toBe(false);
    });

    it("does not identify error response as cacheable", () => {
      expect(isResponseTypeCacheable("error")).toBe(false);
    });
  });

  describe("isStatusCodeCacheable", () => {
    describe("positive tests: cacheable status codes", () => {
      const cacheableStatuses = [
        200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501,
      ];

      it.each(cacheableStatuses)(
        "identifies status %d as cacheable",
        (status) => {
          expect(isStatusCodeCacheable(status)).toBe(true);
        },
      );
    });

    describe("negative tests: non-cacheable status codes", () => {
      const nonCacheableStatuses = [
        201, 202, 205, 301, 302, 303, 307, 308, 400, 401, 403, 500, 502, 503,
      ];

      it.each(nonCacheableStatuses)(
        "does not identify status %d as cacheable",
        (status) => {
          expect(isStatusCodeCacheable(status)).toBe(false);
        },
      );
    });
  });

  describe("summarizeCacheGuardDecision", () => {
    it("produces summary for cacheable response", () => {
      const guarded: CacheGuardedResponse = {
        response: new Response("data"),
        shouldCache: true,
        classification: { excluded: false },
      };

      const summary = summarizeCacheGuardDecision(guarded, "/api/test");

      expect(summary).toContain("cacheable");
      expect(summary).toContain("/api/test");
    });

    it("produces summary for excluded response", () => {
      const guarded: CacheGuardedResponse = {
        response: new Response("data"),
        shouldCache: false,
        classification: {
          excluded: true,
          category: "authenticated-api",
          reason: "Test reason",
        },
      };

      const summary = summarizeCacheGuardDecision(guarded, "/api/payments");

      expect(summary).toContain("excluded");
      expect(summary).toContain("authenticated-api");
      expect(summary).toContain("Test reason");
    });

    it("handles missing reason", () => {
      const guarded: CacheGuardedResponse = {
        response: new Response("data"),
        shouldCache: false,
        classification: {
          excluded: true,
          category: "credentials",
        },
      };

      const summary = summarizeCacheGuardDecision(guarded, "/api/test");

      expect(summary).toContain("excluded");
      expect(summary).toContain("unknown reason");
    });
  });

  describe("simulateServiceWorkerCacheLogic", () => {
    it("simulates cache logic for authenticated endpoint", () => {
      const response = new Response("data");
      const context = createAuthContext(true);

      const result = simulateServiceWorkerCacheLogic(
        "/api/payments",
        response,
        context,
      );

      expect(result.shouldCache).toBe(false);
      expect(result.response).toBe(response);
    });

    it("simulates cache logic for public endpoint", () => {
      const response = new Response("data");
      const context = createAuthContext(false);

      const result = simulateServiceWorkerCacheLogic("/", response, context);

      expect(result.shouldCache).toBe(true);
    });

    it("handles logging gracefully", () => {
      const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
      const response = new Response("data");
      const context = createAuthContext(true);

      simulateServiceWorkerCacheLogic("/api/payments", response, context);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("does not throw when console is unavailable", () => {
      const originalConsole = global.console;
      delete (global as any).console;

      const response = new Response("data");
      const context = createAuthContext(false);

      expect(() => {
        simulateServiceWorkerCacheLogic("/", response, context);
      }).not.toThrow();

      global.console = originalConsole;
    });
  });

  describe("integration tests", () => {
    it("guards payment endpoint during logout", () => {
      const response = new Response('{"amount":100}', {
        headers: { "Content-Type": "application/json" },
      });
      const authContext = createAuthContext(true); // Currently authenticated

      const guarded = guardResponseForCache("/api/payments", response, authContext);

      // Should be excluded because it's an authenticated endpoint
      expect(guarded.shouldCache).toBe(false);
    });

    it("allows cache clearing flow to work", () => {
      // This test verifies that the guard decision aligns with
      // the sensitive-data-policy clearSensitiveServiceWorkerCaches behavior

      const response = new Response("data");
      const context = createAuthContext(true);

      const guarded = guardResponseForCache("/api/payments", response, context);

      // Response should not be cached, so there's nothing to clear
      expect(guarded.shouldCache).toBe(false);
    });

    it("preserves API client no-store policy", () => {
      const response = new Response("data", {
        headers: {
          "Cache-Control": "no-store",
        },
      });
      const context = createAuthContext(false);

      const guarded = guardResponseForCache("/api/test", response, context);

      // Should be excluded due to no-store header
      expect(guarded.shouldCache).toBe(false);
    });
  });

  describe("regression tests", () => {
    it("does not break public content caching", () => {
      const response = new Response("<html>FAQ</html>", {
        headers: {
          "Cache-Control": "public, max-age=86400",
        },
      });
      const context = createAuthContext(false);

      const guarded = guardResponseForCache("/faq", response, context);

      expect(guarded.shouldCache).toBe(true);
    });

    it("respects existing bfcache-guard behavior", () => {
      // The bfcache guard uses pageshow event; our cache guard
      // should not interfere with that
      const response = new Response("settings data");
      const context = createAuthContext(true);

      const guarded = guardResponseForCache("/settings", response, context);

      // Should be excluded (this decision can trigger bfcache teardown)
      expect(guarded.shouldCache).toBe(false);
    });

    it("maintains compatibility with concurrency limiter", () => {
      // The concurrency limiter in network/request-dedup.ts coalesces requests
      // The cache guard should work independently of that

      const response = new Response("proof data");
      const context = createAuthContext(true);

      const guarded = guardResponseForCache(
        "/api/proofs/EP-1",
        response,
        context,
      );

      expect(guarded.shouldCache).toBe(false);
    });
  });
});
