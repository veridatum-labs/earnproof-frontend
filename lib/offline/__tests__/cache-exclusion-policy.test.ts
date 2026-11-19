/**
 * Tests for cache exclusion policy.
 *
 * Coverage:
 * - Positive tests: authenticated endpoints and pages are correctly identified
 * - Negative tests: public content is not excluded
 * - Boundary tests: edge cases in URL parsing and pattern matching
 * - Authorization tests: cache decisions respect auth context
 * - Regression tests: ensure existing cache behavior is preserved
 */

import {
  shouldExcludeFromCache,
  shouldExcludeResponseFromCache,
  evaluateCacheExclusion,
  isPublicCacheable,
  clearSensitiveServiceWorkerCaches,
  getCacheStoreNames,
  SENSITIVE_CACHE_STORE_NAMES,
  type CacheAuthContext,
} from "../cache-exclusion-policy";

describe("Cache Exclusion Policy", () => {
  describe("shouldExcludeFromCache", () => {
    describe("positive tests: authenticated endpoints", () => {
      const authenticatedEndpoints = [
        "/api/payments",
        "/api/payments/123",
        "/api/proofs",
        "/api/proofs/EP-1",
        "/api/proof-requests",
        "/api/account",
        "/api/users/me",
        "/api/organizations",
        "/api/organization-members",
        "/api/settings",
        "/api/api-keys",
        "/api/sessions",
        "/api/audit-log",
        "/api/auth",
        "/api/auth/verify",
        "/api/token",
        "/api/login",
        "/api/logout",
      ];

      it.each(authenticatedEndpoints)(
        "excludes authenticated API endpoint: %s",
        (endpoint) => {
          const result = shouldExcludeFromCache(endpoint, false);
          expect(result.excluded).toBe(true);
          expect(result.category).toBe("authenticated-api");
        },
      );
    });

    describe("positive tests: protected pages", () => {
      const protectedPages = [
        "/proofs",
        "/proofs/create",
        "/proofs/EP-1",
        "/settings",
        "/settings/api-keys",
        "/settings/sessions",
      ];

      it.each(protectedPages)(
        "excludes protected page when authenticated: %s",
        (page) => {
          const result = shouldExcludeFromCache(page, true);
          expect(result.excluded).toBe(true);
          expect(result.category).toBe("protected-page");
        },
      );

      it.each(protectedPages)(
        "does not exclude protected page when not authenticated: %s",
        (page) => {
          const result = shouldExcludeFromCache(page, false);
          expect(result.excluded).toBe(false);
        },
      );
    });

    describe("negative tests: public content", () => {
      const publicEndpoints = [
        "/",
        "/how-it-works",
        "/developers",
        "/faq",
        "/about",
        "/privacy",
        "/security",
        "/contact",
        "/proof-types",
        "/issuers",
      ];

      it.each(publicEndpoints)(
        "does not exclude public endpoint: %s",
        (endpoint) => {
          const result = shouldExcludeFromCache(endpoint, false);
          expect(result.excluded).toBe(false);
        },
      );

      it.each(publicEndpoints)(
        "does not exclude public endpoint when authenticated: %s",
        (endpoint) => {
          const result = shouldExcludeFromCache(endpoint, true);
          expect(result.excluded).toBe(false);
        },
      );
    });

    describe("boundary tests: URL parsing", () => {
      it("handles full URLs with protocol", () => {
        const result = shouldExcludeFromCache(
          "https://api.example.com/api/payments",
          false,
        );
        expect(result.excluded).toBe(true);
      });

      it("handles URLs with query parameters", () => {
        const result = shouldExcludeFromCache(
          "/api/proofs?limit=10&offset=0",
          false,
        );
        expect(result.excluded).toBe(true);
      });

      it("handles URLs with fragments", () => {
        const result = shouldExcludeFromCache("/api/payments#section", false);
        expect(result.excluded).toBe(true);
      });

      it("handles URLs with trailing slashes", () => {
        const result = shouldExcludeFromCache("/api/payments/", false);
        expect(result.excluded).toBe(true);
      });

      it("handles relative paths", () => {
        const result = shouldExcludeFromCache("api/payments", false);
        expect(result.excluded).toBe(true);
      });

      it("gracefully handles unparseable URLs", () => {
        const result = shouldExcludeFromCache("", false);
        expect(result.excluded).toBe(true);
        expect(result.reason).toContain("URL parsing failed");
      });
    });

    describe("authorization tests", () => {
      it("differs cache decisions based on auth status", () => {
        const unauthenticated = shouldExcludeFromCache("/settings", false);
        const authenticated = shouldExcludeFromCache("/settings", true);

        expect(unauthenticated.excluded).toBe(false);
        expect(authenticated.excluded).toBe(true);
      });

      it("always excludes API endpoints regardless of auth status", () => {
        const unauthenticated = shouldExcludeFromCache("/api/payments", false);
        const authenticated = shouldExcludeFromCache("/api/payments", true);

        expect(unauthenticated.excluded).toBe(true);
        expect(authenticated.excluded).toBe(true);
      });
    });
  });

  describe("shouldExcludeResponseFromCache", () => {
    describe("positive tests: sensitive headers", () => {
      it.each(["authorization", "x-auth-token", "x-api-key", "set-cookie"])(
        "excludes response with sensitive header: %s",
        (headerName) => {
          const response = new Response("body", {
            headers: {
              [headerName]: "secret-value",
            },
          });
          const context: CacheAuthContext = {
            isAuthenticated: true,
            hasAuthToken: true,
          };

          const result = shouldExcludeResponseFromCache(response, context);
          expect(result.excluded).toBe(true);
          expect(result.category).toBe("credentials");
        },
      );
    });

    describe("positive tests: cache directives", () => {
      it("excludes response with Cache-Control: no-store", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "no-store",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(true);
        expect(result.reason).toContain("no-store");
      });

      it("excludes response with no-store in combined directives", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(true);
      });

      it("excludes authenticated response with private directive", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "private",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: true,
          hasAuthToken: true,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(true);
      });

      it("allows non-authenticated response with private directive", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "private",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(false);
      });
    });

    describe("negative tests: cacheable responses", () => {
      it("allows response without sensitive headers", () => {
        const response = new Response("body", {
          headers: {
            "Content-Type": "application/json",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(false);
      });

      it("allows response with Cache-Control: public", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "public, max-age=3600",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(false);
      });
    });

    describe("boundary tests: header case-sensitivity", () => {
      it("detects authorization header regardless of case", () => {
        const response = new Response("body", {
          headers: {
            "Authorization": "Bearer token",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: true,
          hasAuthToken: true,
        };

        const result = shouldExcludeResponseFromCache(response, context);
        expect(result.excluded).toBe(true);
      });
    });
  });

  describe("evaluateCacheExclusion", () => {
    describe("comprehensive cache decisions", () => {
      it("excludes API endpoint even if response looks cacheable", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "public, max-age=3600",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = evaluateCacheExclusion("/api/payments", response, context);
        expect(result.excluded).toBe(true);
        expect(result.category).toBe("authenticated-api");
      });

      it("excludes protected page when authenticated even if response allows caching", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "public, max-age=3600",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: true,
          hasAuthToken: true,
        };

        const result = evaluateCacheExclusion("/settings", response, context);
        expect(result.excluded).toBe(true);
      });

      it("allows public page with cacheable response", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "public, max-age=3600",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = evaluateCacheExclusion("/", response, context);
        expect(result.excluded).toBe(false);
      });

      it("respects response no-store over URL classification", () => {
        const response = new Response("body", {
          headers: {
            "Cache-Control": "no-store",
          },
        });
        const context: CacheAuthContext = {
          isAuthenticated: false,
          hasAuthToken: false,
        };

        const result = evaluateCacheExclusion("/", response, context);
        expect(result.excluded).toBe(true);
      });
    });
  });

  describe("isPublicCacheable", () => {
    describe("positive tests: known public paths", () => {
      const publicPaths = [
        "/",
        "/how-it-works",
        "/developers",
        "/faq",
        "/about",
        "/privacy",
        "/security",
        "/accessibility",
        "/contact",
        "/proof-types",
        "/issuers",
      ];

      it.each(publicPaths)("identifies public path as cacheable: %s", (path) => {
        expect(isPublicCacheable(path)).toBe(true);
      });
    });

    describe("positive tests: static assets", () => {
      const assets = [
        "/app.js",
        "/style.css",
        "/image.png",
        "/logo.svg",
        "/font.woff2",
      ];

      it.each(assets)(
        "identifies static asset as cacheable: %s",
        (assetPath) => {
          expect(isPublicCacheable(assetPath)).toBe(true);
        },
      );
    });

    describe("negative tests: authenticated paths", () => {
      const protectedPaths = [
        "/proofs",
        "/settings",
        "/api/payments",
        "/account",
      ];

      it.each(protectedPaths)(
        "does not identify protected path as cacheable: %s",
        (path) => {
          expect(isPublicCacheable(path)).toBe(false);
        },
      );
    });

    describe("boundary tests: URL parsing", () => {
      it("handles URLs with query strings", () => {
        expect(isPublicCacheable("/how-it-works?tab=1")).toBe(true);
      });

      it("handles URLs with fragments", () => {
        expect(isPublicCacheable("/faq#question-1")).toBe(true);
      });

      it("gracefully handles unparseable URLs", () => {
        expect(isPublicCacheable("")).toBe(false);
      });
    });
  });

  describe("cache clearing functions", () => {
    describe("clearSensitiveServiceWorkerCaches", () => {
      it("gracefully handles missing caches API", async () => {
        const originalCaches = (global as any).caches;
        delete (global as any).caches;

        await expect(
          clearSensitiveServiceWorkerCaches(),
        ).resolves.not.toThrow();

        (global as any).caches = originalCaches;
      });

      it("calls caches.delete for sensitive cache names", async () => {
        const mockDelete = jest.fn().mockResolvedValue(true);
        const mockKeys = jest.fn().mockResolvedValue([
          "earnproof-api",
          "earnproof-payments",
          "other-cache",
        ]);

        (global as any).caches = {
          keys: mockKeys,
          delete: mockDelete,
        };

        await clearSensitiveServiceWorkerCaches();

        expect(mockKeys).toHaveBeenCalled();
        expect(mockDelete).toHaveBeenCalledWith("earnproof-api");
        expect(mockDelete).toHaveBeenCalledWith("earnproof-payments");
        expect(mockDelete).not.toHaveBeenCalledWith("other-cache");
      });

      it("clears caches matching sensitive patterns", async () => {
        const mockDelete = jest.fn().mockResolvedValue(true);
        const mockKeys = jest.fn().mockResolvedValue([
          "v1-api-cache",
          "auth-responses",
          "user-data",
          "public-assets",
        ]);

        (global as any).caches = {
          keys: mockKeys,
          delete: mockDelete,
        };

        await clearSensitiveServiceWorkerCaches();

        expect(mockDelete).toHaveBeenCalledWith("v1-api-cache");
        expect(mockDelete).toHaveBeenCalledWith("auth-responses");
        expect(mockDelete).not.toHaveBeenCalledWith("public-assets");
      });
    });

    describe("getCacheStoreNames", () => {
      it("returns empty array when caches API is unavailable", async () => {
        const originalCaches = (global as any).caches;
        delete (global as any).caches;

        const names = await getCacheStoreNames();
        expect(names).toEqual([]);

        (global as any).caches = originalCaches;
      });

      it("returns cache store names when available", async () => {
        const mockKeys = jest
          .fn()
          .mockResolvedValue(["cache-1", "cache-2"]);
        (global as any).caches = { keys: mockKeys };

        const names = await getCacheStoreNames();
        expect(names).toEqual(["cache-1", "cache-2"]);
      });
    });
  });

  describe("SENSITIVE_CACHE_STORE_NAMES constant", () => {
    it("includes known sensitive cache store prefixes", () => {
      expect(SENSITIVE_CACHE_STORE_NAMES).toContain("earnproof-api");
      expect(SENSITIVE_CACHE_STORE_NAMES).toContain(
        "earnproof-authenticated",
      );
      expect(SENSITIVE_CACHE_STORE_NAMES).toContain("earnproof-payments");
      expect(SENSITIVE_CACHE_STORE_NAMES).toContain("earnproof-proofs");
      expect(SENSITIVE_CACHE_STORE_NAMES).toContain("earnproof-settings");
    });
  });

  describe("regression tests", () => {
    it("does not regress no-store policy from API client", () => {
      // The API client already sets no-store; ensure our policy respects it
      const response = new Response("body", {
        headers: {
          "Cache-Control": "no-store",
        },
      });
      const context: CacheAuthContext = {
        isAuthenticated: false,
        hasAuthToken: false,
      };

      const result = shouldExcludeResponseFromCache(response, context);
      expect(result.excluded).toBe(true);
    });

    it("respects existing cache-headers.ts authenticated routes", () => {
      // config/cache-headers.ts marks /proofs and /settings as no-store
      const proofsResult = shouldExcludeFromCache("/proofs", true);
      const settingsResult = shouldExcludeFromCache("/settings", true);

      expect(proofsResult.excluded).toBe(true);
      expect(settingsResult.excluded).toBe(true);
    });

    it("preserves bfcache guard compatibility", () => {
      // bfcache-guard.ts watches for pageshow event; our cache clearing
      // should not interfere with that mechanism
      const response = new Response("body");
      const context: CacheAuthContext = {
        isAuthenticated: true,
        hasAuthToken: true,
      };

      const result = evaluateCacheExclusion("/proofs", response, context);
      expect(result.excluded).toBe(true);
    });
  });
});
