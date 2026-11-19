/**
 * Jest tests for useObjectURL React hook.
 *
 * Covers:
 * - Positive: hook creation, auto-revocation on unmount, manual revocation
 * - Negative: null/undefined blobs, revocation errors
 * - Boundary: dependency changes trigger new URL
 * - Integration: integration with BlobURLManager
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useObjectURL } from "@/lib/hooks/use-object-url";
import {
  clearBlobURLTracking,
  getActiveBlobURLMetadata,
  getBlobURLMetadata,
} from "@/lib/blob-url-manager";

describe("useObjectURL", () => {
  beforeEach(() => {
    clearBlobURLTracking();
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("creates a blob URL for a valid blob", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      expect(result.current).not.toBeNull();
      expect(result.current?.url).toMatch(/^blob:/);
      expect(result.current?.metadata.purposeLabel).toBe("test-hook");
    });

    it("returns null for undefined blob", () => {
      const { result } = renderHook(() =>
        useObjectURL(undefined, { purposeLabel: "test-hook" })
      );

      expect(result.current).toBeNull();
    });

    it("returns null for null blob", () => {
      const { result } = renderHook(() =>
        useObjectURL(null, { purposeLabel: "test-hook" })
      );

      expect(result.current).toBeNull();
    });

    it("provides metadata with creation timestamp", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      expect(result.current?.metadata.createdAt).toBeInstanceOf(Date);
      expect(result.current?.metadata.revokedAt).toBeNull();
    });

    it("provides manual revoke function", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      const urlBefore = result.current?.url;
      const metaBefore = getBlobURLMetadata(urlBefore!);

      expect(metaBefore?.revokedAt).toBeNull();

      result.current?.revoke();

      const metaAfter = getBlobURLMetadata(urlBefore!);
      expect(metaAfter?.revokedAt).not.toBeNull();
    });

    it("provides isActive function", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      expect(result.current?.isActive()).toBe(true);

      result.current?.revoke();

      expect(result.current?.isActive()).toBe(false);
    });
  });

  describe("auto-revocation on unmount", () => {
    it("revokes URL on component unmount by default", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result, unmount } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      const url = result.current?.url;
      expect(getBlobURLMetadata(url!)?.revokedAt).toBeNull();

      unmount();

      expect(getBlobURLMetadata(url!)?.revokedAt).not.toBeNull();
    });

    it("skips auto-revocation if manual mode is enabled", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result, unmount } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook", manual: true })
      );

      const url = result.current?.url;
      expect(getBlobURLMetadata(url!)?.revokedAt).toBeNull();

      unmount();

      // Should still be active
      expect(getBlobURLMetadata(url!)?.revokedAt).toBeNull();
    });

    it("handles revocation errors gracefully", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const { unmount } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      // Mock URL.revokeObjectURL to throw
      jest.spyOn(URL, "revokeObjectURL").mockImplementationOnce(() => {
        throw new Error("revoke failed");
      });

      // Should not throw
      expect(() => unmount()).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("dependency changes", () => {
    it("creates new URL when blob changes", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      const { result, rerender } = renderHook(
        ({ blob, options }) =>
          useObjectURL(blob, options),
        {
          initialProps: {
            blob: blob1,
            options: { purposeLabel: "test-hook" },
          },
        }
      );

      const url1 = result.current?.url;

      rerender({
        blob: blob2,
        options: { purposeLabel: "test-hook" },
      });

      const url2 = result.current?.url;

      expect(url1).not.toBe(url2);

      // Old URL should be revoked
      expect(getBlobURLMetadata(url1!)?.revokedAt).not.toBeNull();
      // New URL should be active
      expect(getBlobURLMetadata(url2!)?.revokedAt).toBeNull();
    });

    it("creates new URL when purposeLabel changes", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result, rerender } = renderHook(
        ({ blob, options }) =>
          useObjectURL(blob, options),
        {
          initialProps: {
            blob,
            options: { purposeLabel: "label-1" },
          },
        }
      );

      const url1 = result.current?.url;

      rerender({
        blob,
        options: { purposeLabel: "label-2" },
      });

      const url2 = result.current?.url;

      expect(url1).not.toBe(url2);
      expect(result.current?.metadata.purposeLabel).toBe("label-2");
    });

    it("creates new URL when scopeId changes", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result, rerender } = renderHook(
        ({ blob, options }) =>
          useObjectURL(blob, options),
        {
          initialProps: {
            blob,
            options: { purposeLabel: "test-hook", scopeId: "scope-1" },
          },
        }
      );

      const url1 = result.current?.url;
      expect(result.current?.metadata.scopeId).toBe("scope-1");

      rerender({
        blob,
        options: { purposeLabel: "test-hook", scopeId: "scope-2" },
      });

      const url2 = result.current?.url;

      expect(url1).not.toBe(url2);
      expect(result.current?.metadata.scopeId).toBe("scope-2");
    });

    it("revokes old URL when blob changes in manual mode", () => {
      const blob1 = new Blob(["test1"], { type: "text/plain" });
      const blob2 = new Blob(["test2"], { type: "text/plain" });

      const { result, rerender } = renderHook(
        ({ blob, options }) =>
          useObjectURL(blob, options),
        {
          initialProps: {
            blob: blob1,
            options: { purposeLabel: "test-hook", manual: true },
          },
        }
      );

      const url1 = result.current?.url;

      rerender({
        blob: blob2,
        options: { purposeLabel: "test-hook", manual: true },
      });

      const url2 = result.current?.url;

      // Old URL should be revoked on dependency change even in manual mode
      expect(getBlobURLMetadata(url1!)?.revokedAt).not.toBeNull();
      expect(getBlobURLMetadata(url2!)?.revokedAt).toBeNull();
    });
  });

  describe("manual revocation", () => {
    it("can be revoked multiple times without error", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook", manual: true })
      );

      expect(() => result.current?.revoke()).not.toThrow();
      expect(() => result.current?.revoke()).not.toThrow();
    });

    it("revoke function does nothing after unmount in manual mode", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result, unmount } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook", manual: true })
      );

      const revokeFunc = result.current?.revoke;
      unmount();

      // Should not throw even though hook is unmounted
      expect(() => revokeFunc?.()).not.toThrow();
    });
  });

  describe("integration with BlobURLManager", () => {
    it("tracks URLs in manager", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      const activeMeta = getActiveBlobURLMetadata();
      expect(activeMeta).toHaveLength(1);
      expect(activeMeta[0].url).toBe(result.current?.url);
    });

    it("integrates with scope tracking", () => {
      const blob = new Blob(["test"], { type: "text/plain" });

      const { result } = renderHook(() =>
        useObjectURL(blob, {
          purposeLabel: "test-hook",
          scopeId: "tenant-123",
        })
      );

      const meta = getBlobURLMetadata(result.current?.url!);
      expect(meta?.scopeId).toBe("tenant-123");
    });
  });

  describe("error handling", () => {
    it("handles createBlobURL errors gracefully", () => {
      const blob = new Blob(["test"], { type: "text/plain" });
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      // Mock createBlobURL to throw
      jest.spyOn(URL, "createObjectURL").mockImplementationOnce(() => {
        throw new Error("create failed");
      });

      const { result } = renderHook(() =>
        useObjectURL(blob, { purposeLabel: "test-hook" })
      );

      expect(result.current).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create blob URL:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
