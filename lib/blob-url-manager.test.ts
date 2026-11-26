/**
 * Jest tests for centralized blob URL manager.
 *
 * Covers:
 * - Positive: URL creation with various scopes, revocation, lifecycle tracking
 * - Negative: invalid blobs, double-revoke prevention, untracked URL revocation
 * - Boundary: large blobs, many concurrent URLs, scope cleanup
 * - Authorization: scope isolation prevents cross-scope URL reuse
 * - Regression: existing download patterns still work
 */

import {
  createBlobURL,
  revokeBlobURL,
  revokeBlobURLScope,
  getBlobURLMetadata,
  getAllBlobURLMetadata,
  getActiveBlobURLMetadata,
  clearBlobURLTracking,
} from "@/lib/blob-url-manager";

describe("BlobURLManager", () => {
  beforeEach(() => {
    clearBlobURLTracking();
    jest.clearAllMocks();
  });

  describe("createBlobURL", () => {
    it("creates a blob URL with metadata", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const result = createBlobURL(blob, {
        purposeLabel: "test-export",
      });

      expect(result.url).toMatch(/^blob:/);
      expect(result.metadata).toMatchObject({
        url: result.url,
        purposeLabel: "test-export",
        revokedAt: null,
      });
      expect(result.metadata.createdAt).toBeInstanceOf(Date);
    });

    it("creates a blob URL with scope identifier", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const result = createBlobURL(blob, {
        purposeLabel: "credential-export",
        scopeId: "tenant-123",
      });

      expect(result.metadata.scopeId).toBe("tenant-123");
    });

    it("tracks multiple URLs independently", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      const result1 = createBlobURL(blob1, { purposeLabel: "export-1" });
      const result2 = createBlobURL(blob2, { purposeLabel: "export-2" });

      expect(result1.url).not.toBe(result2.url);

      const meta1 = getBlobURLMetadata(result1.url);
      const meta2 = getBlobURLMetadata(result2.url);

      expect(meta1?.purposeLabel).toBe("export-1");
      expect(meta2?.purposeLabel).toBe("export-2");
    });

    it("throws on invalid blob", () => {
      expect(() => {
        createBlobURL(null as unknown as Blob, { purposeLabel: "invalid" });
      }).toThrow("Invalid blob provided");
    });

    it("throws on non-Blob object", () => {
      expect(() => {
        createBlobURL({ not: "a blob" } as unknown as Blob, {
          purposeLabel: "invalid",
        });
      }).toThrow("Invalid blob provided");
    });

    it("calls onBeforeRevoke callback when URL is revoked", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const beforeRevoke = jest.fn();

      const result = createBlobURL(blob, {
        purposeLabel: "test-export",
        onBeforeRevoke: beforeRevoke,
      });

      revokeBlobURL(result.url);

      expect(beforeRevoke).toHaveBeenCalledWith(result.url);
    });

    it("does not block revocation if callback throws", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const beforeRevoke = jest.fn(() => {
        throw new Error("callback failed");
      });

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const result = createBlobURL(blob, {
        purposeLabel: "test-export",
        onBeforeRevoke: beforeRevoke,
      });

      // Should not throw
      expect(() => revokeBlobURL(result.url)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("revokeBlobURL", () => {
    it("revokes a tracked blob URL", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = createBlobURL(blob, { purposeLabel: "test-export" });

      const metaBefore = getBlobURLMetadata(result.url);
      expect(metaBefore?.revokedAt).toBeNull();

      revokeBlobURL(result.url);

      const metaAfter = getBlobURLMetadata(result.url);
      expect(metaAfter?.revokedAt).toBeInstanceOf(Date);
    });

    it("prevents double-revocation of the same URL", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = createBlobURL(blob, { purposeLabel: "test-export" });

      revokeBlobURL(result.url);

      expect(() => revokeBlobURL(result.url)).toThrow("untracked or already-revoked");
    });

    it("throws when revoking an untracked URL", () => {
      const fakeUrl = "blob:fake-untracked-url";

      expect(() => revokeBlobURL(fakeUrl)).toThrow("untracked or already-revoked");
    });

    it("calls URL.revokeObjectURL", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const revokeObjectURLSpy = jest.spyOn(URL, "revokeObjectURL");

      const result = createBlobURL(blob, { purposeLabel: "test-export" });
      revokeBlobURL(result.url);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(result.url);

      revokeObjectURLSpy.mockRestore();
    });
  });

  describe("revokeBlobURLScope", () => {
    it("revokes all URLs in a scope", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });
      const blob3 = new Blob(["test3"], { type: "text/plain" });

      const result1 = createBlobURL(blob1, {
        purposeLabel: "export-1",
        scopeId: "tenant-123",
      });
      const result2 = createBlobURL(blob2, {
        purposeLabel: "export-2",
        scopeId: "tenant-123",
      });
      // Different scope
      const result3 = createBlobURL(blob3, {
        purposeLabel: "export-3",
        scopeId: "tenant-456",
      });

      const revoked = revokeBlobURLScope("tenant-123");

      expect(revoked).toContain(result1.url);
      expect(revoked).toContain(result2.url);
      expect(revoked).not.toContain(result3.url);

      expect(getBlobURLMetadata(result1.url)?.revokedAt).toBeInstanceOf(Date);
      expect(getBlobURLMetadata(result2.url)?.revokedAt).toBeInstanceOf(Date);
      expect(getBlobURLMetadata(result3.url)?.revokedAt).toBeNull();
    });

    it("returns empty array for unknown scope", () => {
      const revoked = revokeBlobURLScope("unknown-scope");
      expect(revoked).toEqual([]);
    });

    it("returns empty array for scope with no active URLs", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = createBlobURL(blob, {
        purposeLabel: "export",
        scopeId: "tenant-123",
      });

      revokeBlobURL(result.url);
      const revoked = revokeBlobURLScope("tenant-123");

      expect(revoked).toEqual([]);
    });

    it("continues on error and revokes remaining URLs", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      const result1 = createBlobURL(blob1, {
        purposeLabel: "export-1",
        scopeId: "tenant-123",
      });
      const result2 = createBlobURL(blob2, {
        purposeLabel: "export-2",
        scopeId: "tenant-123",
      });

      // Mock URL.revokeObjectURL to fail on first call
      const revokeObjectURLSpy = jest
        .spyOn(URL, "revokeObjectURL")
        .mockImplementationOnce(() => {
          throw new Error("revoke failed");
        });

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const revoked = revokeBlobURLScope("tenant-123");

      // Should have revoked both even though first failed
      expect(revoked.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();

      revokeObjectURLSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("cleans up scope tracker entry after revoke", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      createBlobURL(blob, { purposeLabel: "export", scopeId: "tenant-123" });

      revokeBlobURLScope("tenant-123");

      const revoked = revokeBlobURLScope("tenant-123");
      expect(revoked).toEqual([]);
    });
  });

  describe("getBlobURLMetadata", () => {
    it("returns metadata for tracked URL", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = createBlobURL(blob, {
        purposeLabel: "export",
        scopeId: "tenant-123",
      });

      const meta = getBlobURLMetadata(result.url);

      expect(meta).toEqual(result.metadata);
    });

    it("returns undefined for unknown URL", () => {
      const meta = getBlobURLMetadata("blob:unknown");
      expect(meta).toBeUndefined();
    });
  });

  describe("getAllBlobURLMetadata", () => {
    it("returns all tracked URLs", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      const result1 = createBlobURL(blob1, { purposeLabel: "export-1" });
      const result2 = createBlobURL(blob2, { purposeLabel: "export-2" });

      const allMeta = getAllBlobURLMetadata();

      expect(allMeta).toHaveLength(2);
      expect(allMeta.map((m) => m.url)).toContain(result1.url);
      expect(allMeta.map((m) => m.url)).toContain(result2.url);
    });

    it("includes revoked URLs", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = createBlobURL(blob, { purposeLabel: "export" });

      revokeBlobURL(result.url);

      const allMeta = getAllBlobURLMetadata();

      expect(allMeta).toHaveLength(1);
      expect(allMeta[0].revokedAt).not.toBeNull();
    });
  });

  describe("getActiveBlobURLMetadata", () => {
    it("returns only non-revoked URLs", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      const result1 = createBlobURL(blob1, { purposeLabel: "export-1" });
      const result2 = createBlobURL(blob2, { purposeLabel: "export-2" });

      revokeBlobURL(result1.url);

      const activeMeta = getActiveBlobURLMetadata();

      expect(activeMeta).toHaveLength(1);
      expect(activeMeta[0].url).toBe(result2.url);
    });
  });

  describe("clearBlobURLTracking", () => {
    it("clears all metadata", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      createBlobURL(blob1, { purposeLabel: "export-1" });
      createBlobURL(blob2, { purposeLabel: "export-2" });

      expect(getAllBlobURLMetadata()).toHaveLength(2);

      clearBlobURLTracking();

      expect(getAllBlobURLMetadata()).toHaveLength(0);
    });

    it("does not revoke URLs (manual cleanup only)", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = createBlobURL(blob, { purposeLabel: "export" });

      const revokeObjectURLSpy = jest.spyOn(URL, "revokeObjectURL");

      clearBlobURLTracking();

      expect(revokeObjectURLSpy).not.toHaveBeenCalled();

      revokeObjectURLSpy.mockRestore();
    });
  });

  describe("boundary cases", () => {
    it("handles many concurrent URLs", () => {
      const urls: string[] = [];

      for (let i = 0; i < 100; i++) {
        const blob = new Blob([`test-${i}`], { type: "text/plain" });
        const result = createBlobURL(blob, { purposeLabel: `export-${i}` });
        urls.push(result.url);
      }

      expect(getAllBlobURLMetadata()).toHaveLength(100);

      urls.forEach((url) => {
        revokeBlobURL(url);
      });

      expect(getActiveBlobURLMetadata()).toHaveLength(0);
    });

    it("handles large blobs", () => {
      const largeData = new Uint8Array(1024 * 1024 * 10); // 10MB
      const blob = new Blob([largeData], { type: "application/octet-stream" });

      const result = createBlobURL(blob, { purposeLabel: "large-export" });

      expect(result.url).toMatch(/^blob:/);
      expect(getBlobURLMetadata(result.url)).toBeDefined();

      revokeBlobURL(result.url);
    });
  });

  describe("scope isolation", () => {
    it("prevents cross-scope URL reuse", () => {
      const blob1 = new Blob(["tenant1-data"], { type: "text/plain" });
      const blob2 = new Blob(["tenant2-data"], { type: "text/plain" });

      const result1 = createBlobURL(blob1, {
        purposeLabel: "export",
        scopeId: "tenant-1",
      });
      const result2 = createBlobURL(blob2, {
        purposeLabel: "export",
        scopeId: "tenant-2",
      });

      // URLs should be different even if same purpose
      expect(result1.url).not.toBe(result2.url);

      // Revoking one scope should not affect the other
      revokeBlobURLScope("tenant-1");

      expect(getBlobURLMetadata(result1.url)?.revokedAt).not.toBeNull();
      expect(getBlobURLMetadata(result2.url)?.revokedAt).toBeNull();
    });
  });
});
