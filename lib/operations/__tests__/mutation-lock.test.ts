import {
  acquireMutationLock,
  releaseMutationLock,
  queryMutationLock,
  getOrCreateTabId,
  MAX_LOCK_TTL_MS,
  LOCK_STORAGE_PREFIX,
} from "../mutation-lock";

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("Cross-Tab Mutation Locks (#373)", () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  describe("acquireMutationLock", () => {
    it("successfully acquires an available lock lease", () => {
      const result = acquireMutationLock({
        lockId: "revoke-proof:ep_123",
        ownerTabId: "tab_A",
        resourceLabel: "Proof ep_123",
        ttlMs: 5000,
        storage: mockStorage,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lease.lockId).toBe("revoke-proof:ep_123");
        expect(result.lease.ownerTabId).toBe("tab_A");
        expect(result.lease.resourceLabel).toBe("Proof ep_123");
        expect(result.lease.expiresAt).toBeGreaterThan(Date.now());
      }
    });

    it("prevents another tab from acquiring an active lock", () => {
      // Tab A acquires lock
      acquireMutationLock({
        lockId: "revoke-proof:ep_123",
        ownerTabId: "tab_A",
        resourceLabel: "Proof ep_123",
        ttlMs: 10000,
        storage: mockStorage,
      });

      // Tab B tries to acquire same lock
      const conflictResult = acquireMutationLock({
        lockId: "revoke-proof:ep_123",
        ownerTabId: "tab_B",
        resourceLabel: "Proof ep_123",
        ttlMs: 10000,
        storage: mockStorage,
      });

      expect(conflictResult.success).toBe(false);
      if (!conflictResult.success) {
        expect(conflictResult.conflict.ownerTabId).toBe("tab_A");
        expect(conflictResult.conflict.conflictMessage).toContain("Another browser tab");
        expect(conflictResult.conflict.expiresInMs).toBeGreaterThan(0);
      }
    });

    it("allows the SAME owner tab to renew or extend its own lease", () => {
      acquireMutationLock({
        lockId: "revoke-proof:ep_123",
        ownerTabId: "tab_A",
        ttlMs: 5000,
        storage: mockStorage,
      });

      const renewResult = acquireMutationLock({
        lockId: "revoke-proof:ep_123",
        ownerTabId: "tab_A",
        ttlMs: 10000,
        storage: mockStorage,
      });

      expect(renewResult.success).toBe(true);
    });

    it("allows another tab to acquire the lock after expiry (stale lock recovery)", () => {
      // Create expired lock
      const key = `${LOCK_STORAGE_PREFIX}${encodeURIComponent("revoke-proof:ep_123")}`;
      mockStorage.setItem(
        key,
        JSON.stringify({
          lockId: "revoke-proof:ep_123",
          ownerTabId: "tab_stale",
          resourceLabel: "Stale Operation",
          acquiredAt: Date.now() - 20000,
          expiresAt: Date.now() - 5000, // expired 5 seconds ago
        })
      );

      const result = acquireMutationLock({
        lockId: "revoke-proof:ep_123",
        ownerTabId: "tab_fresh",
        resourceLabel: "Proof ep_123",
        ttlMs: 5000,
        storage: mockStorage,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lease.ownerTabId).toBe("tab_fresh");
      }
    });

    it("caps ttlMs at MAX_LOCK_TTL_MS to prevent unbounded lock retention", () => {
      const now = Date.now();
      const result = acquireMutationLock({
        lockId: "delete-key:key_1",
        ownerTabId: "tab_A",
        ttlMs: 999_999_999, // very large request
        storage: mockStorage,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lease.expiresAt - now).toBeLessThanOrEqual(MAX_LOCK_TTL_MS + 100);
      }
    });
  });

  describe("releaseMutationLock", () => {
    it("releases the lock when called by owner", () => {
      acquireMutationLock({
        lockId: "delete-key:key_1",
        ownerTabId: "tab_A",
        storage: mockStorage,
      });

      const released = releaseMutationLock("delete-key:key_1", "tab_A", false, mockStorage);
      expect(released).toBe(true);
      expect(queryMutationLock("delete-key:key_1", mockStorage)).toBeNull();
    });

    it("refuses to release lock when called by a non-owner without force", () => {
      acquireMutationLock({
        lockId: "delete-key:key_1",
        ownerTabId: "tab_A",
        storage: mockStorage,
      });

      const released = releaseMutationLock("delete-key:key_1", "tab_B", false, mockStorage);
      expect(released).toBe(false);
      expect(queryMutationLock("delete-key:key_1", mockStorage)).not.toBeNull();
    });

    it("forcibly releases lock when force=true (user override / recovery)", () => {
      acquireMutationLock({
        lockId: "delete-key:key_1",
        ownerTabId: "tab_A",
        storage: mockStorage,
      });

      const released = releaseMutationLock("delete-key:key_1", "tab_B", true, mockStorage);
      expect(released).toBe(true);
      expect(queryMutationLock("delete-key:key_1", mockStorage)).toBeNull();
    });
  });

  describe("queryMutationLock", () => {
    it("returns null for non-existent lock", () => {
      expect(queryMutationLock("non-existent", mockStorage)).toBeNull();
    });

    it("returns lock record for active lock", () => {
      acquireMutationLock({
        lockId: "action_1",
        ownerTabId: "tab_1",
        resourceLabel: "Action 1",
        storage: mockStorage,
      });

      const queried = queryMutationLock("action_1", mockStorage);
      expect(queried).not.toBeNull();
      expect(queried?.lockId).toBe("action_1");
    });
  });

  describe("Security guarantee: lock payload isolation", () => {
    it("verifies locks contain NO tokens or credentials", () => {
      const result = acquireMutationLock({
        lockId: "revoke:test",
        ownerTabId: "tab_test",
        storage: mockStorage,
      });

      if (result.success) {
        const storedJson = mockStorage.getItem(`${LOCK_STORAGE_PREFIX}revoke%3Atest`)!;
        const record = JSON.parse(storedJson);
        expect(record).not.toHaveProperty("token");
        expect(record).not.toHaveProperty("authorization");
        expect(record).not.toHaveProperty("bearer");
        expect(record).not.toHaveProperty("secret");
      }
    });
  });
});
