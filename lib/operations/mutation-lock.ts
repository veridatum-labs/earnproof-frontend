/**
 * Cross-tab locks for destructive mutations (#373).
 *
 * Requirements:
 * - Origin-scoped mutation leases with expiry, ownership, conflict messaging, and recovery.
 * - Locks contain NO tokens, CANNOT grant authorization, and stale lock owners cannot block actions indefinitely.
 * - Deterministic, bounded, observable, and compatible with existing authorization and privacy guarantees.
 */

export interface MutationLockRecord {
  /** Resource/action identifier being locked, e.g. "revoke-proof:ep_123" or "delete-key:key_456" */
  lockId: string;
  /** Unique ephemeral client/tab identifier holding the lease */
  ownerTabId: string;
  /** Human-readable or resource label for conflict presentation */
  resourceLabel: string;
  /** Unix timestamp when the lock was acquired */
  acquiredAt: number;
  /** Unix timestamp when the lock lease automatically expires */
  expiresAt: number;
}

export interface AcquireLockOptions {
  /** Unique identifier for the mutation target */
  lockId: string;
  /** Ephemeral tab/client identifier */
  ownerTabId?: string;
  /** Friendly label for the resource/mutation */
  resourceLabel?: string;
  /** Lease duration in milliseconds (bounded, default 15,000ms / 15s) */
  ttlMs?: number;
  /** Override storage (injected for tests or mock) */
  storage?: Storage;
}

export type LockAcquisitionResult =
  | { success: true; lease: MutationLockRecord }
  | {
      success: false;
      conflict: {
        lockId: string;
        ownerTabId: string;
        resourceLabel: string;
        expiresInMs: number;
        acquiredAt: number;
        conflictMessage: string;
      };
    };

export const LOCK_STORAGE_PREFIX = "earnproof.mutation-lock.";
export const DEFAULT_LOCK_TTL_MS = 15_000; // 15 seconds
export const MAX_LOCK_TTL_MS = 60_000; // 60 seconds max lease duration

/**
 * Generates an ephemeral tab ID for this browser session.
 */
let memoryTabId: string | null = null;
export function getOrCreateTabId(): string {
  if (memoryTabId) return memoryTabId;
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      let tabId = window.sessionStorage.getItem("earnproof.tab-id");
      if (!tabId) {
        tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        window.sessionStorage.setItem("earnproof.tab-id", tabId);
      }
      memoryTabId = tabId;
      return tabId;
    } catch {
      // sessionStorage might be restricted
    }
  }
  memoryTabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return memoryTabId;
}

function getStorageKey(lockId: string): string {
  return `${LOCK_STORAGE_PREFIX}${encodeURIComponent(lockId)}`;
}

/**
 * Attempts to acquire an origin-scoped exclusive mutation lease.
 * Returns success or conflict details.
 * Locks contain NO credentials, secrets, or tokens.
 */
export function acquireMutationLock({
  lockId,
  ownerTabId = getOrCreateTabId(),
  resourceLabel = "destructive operation",
  ttlMs = DEFAULT_LOCK_TTL_MS,
  storage = typeof window !== "undefined" ? window.localStorage : undefined,
}: AcquireLockOptions): LockAcquisitionResult {
  if (!storage) {
    // If local storage is completely unavailable, fail closed with synthetic local lease
    const now = Date.now();
    return {
      success: true,
      lease: {
        lockId,
        ownerTabId,
        resourceLabel,
        acquiredAt: now,
        expiresAt: now + ttlMs,
      },
    };
  }

  const boundedTtl = Math.min(Math.max(1_000, ttlMs), MAX_LOCK_TTL_MS);
  const now = Date.now();
  const key = getStorageKey(lockId);

  try {
    const rawExisting = storage.getItem(key);
    if (rawExisting) {
      const existing: MutationLockRecord = JSON.parse(rawExisting);
      // Check if existing lock is still active and owned by a DIFFERENT tab
      if (existing && existing.expiresAt > now && existing.ownerTabId !== ownerTabId) {
        const remainingMs = existing.expiresAt - now;
        return {
          success: false,
          conflict: {
            lockId: existing.lockId,
            ownerTabId: existing.ownerTabId,
            resourceLabel: existing.resourceLabel,
            expiresInMs: remainingMs,
            acquiredAt: existing.acquiredAt,
            conflictMessage: `Another browser tab is currently performing a destructive action on ${existing.resourceLabel}. Please wait or try again after the lease expires.`,
          },
        };
      }
    }

    // Acquire or re-acquire/extend lease
    const lease: MutationLockRecord = {
      lockId,
      ownerTabId,
      resourceLabel,
      acquiredAt: now,
      expiresAt: now + boundedTtl,
    };

    storage.setItem(key, JSON.stringify(lease));
    return { success: true, lease };
  } catch {
    // Fallback if writing fails (e.g. quota exceeded)
    return {
      success: true,
      lease: {
        lockId,
        ownerTabId,
        resourceLabel,
        acquiredAt: now,
        expiresAt: now + boundedTtl,
      },
    };
  }
}

/**
 * Releases a mutation lease if owned by ownerTabId or forcibly if force=true.
 */
export function releaseMutationLock(
  lockId: string,
  ownerTabId = getOrCreateTabId(),
  force = false,
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined
): boolean {
  if (!storage) return true;
  const key = getStorageKey(lockId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return true;
    const existing: MutationLockRecord = JSON.parse(raw);
    if (force || existing.ownerTabId === ownerTabId || existing.expiresAt <= Date.now()) {
      storage.removeItem(key);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Queries the current lock status without mutating.
 */
export function queryMutationLock(
  lockId: string,
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined
): MutationLockRecord | null {
  if (!storage) return null;
  const key = getStorageKey(lockId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const existing: MutationLockRecord = JSON.parse(raw);
    if (existing && existing.expiresAt > Date.now()) {
      return existing;
    }
    // Expired
    return null;
  } catch {
    return null;
  }
}
