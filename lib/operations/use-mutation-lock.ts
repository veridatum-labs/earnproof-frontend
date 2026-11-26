"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  acquireMutationLock,
  releaseMutationLock,
  queryMutationLock,
  getOrCreateTabId,
  type MutationLockRecord,
  type LockAcquisitionResult,
} from "@/lib/operations/mutation-lock";

export interface UseMutationLockOptions {
  lockId: string;
  resourceLabel?: string;
  ttlMs?: number;
  autoAcquire?: boolean;
}

export interface UseMutationLockReturn {
  isLockedByOtherTab: boolean;
  hasOwnLease: boolean;
  conflictDetails: LockAcquisitionResult extends { success: false } ? LockAcquisitionResult["conflict"] : null;
  acquire: () => boolean;
  release: (force?: boolean) => boolean;
  refresh: () => void;
}

/**
 * React hook to observe and manage origin-scoped cross-tab mutation locks for destructive actions.
 */
export function useMutationLock({
  lockId,
  resourceLabel = "destructive operation",
  ttlMs = 15_000,
  autoAcquire = false,
}: UseMutationLockOptions): UseMutationLockReturn {
  const [hasOwnLease, setHasOwnLease] = useState(false);
  const [conflictDetails, setConflictDetails] = useState<
    (LockAcquisitionResult & { success: false })["conflict"] | null
  >(null);
  const tabId = useRef(getOrCreateTabId()).current;

  const checkStatus = useCallback(() => {
    const existing = queryMutationLock(lockId);
    if (!existing) {
      setConflictDetails(null);
      setHasOwnLease(false);
      return;
    }
    if (existing.ownerTabId === tabId) {
      setHasOwnLease(true);
      setConflictDetails(null);
    } else {
      setHasOwnLease(false);
      const remainingMs = Math.max(0, existing.expiresAt - Date.now());
      setConflictDetails({
        lockId: existing.lockId,
        ownerTabId: existing.ownerTabId,
        resourceLabel: existing.resourceLabel,
        expiresInMs: remainingMs,
        acquiredAt: existing.acquiredAt,
        conflictMessage: `Another browser tab is currently modifying ${existing.resourceLabel}. Please wait or verify changes before proceeding.`,
      });
    }
  }, [lockId, tabId]);

  const acquire = useCallback(() => {
    const res = acquireMutationLock({
      lockId,
      ownerTabId: tabId,
      resourceLabel,
      ttlMs,
    });
    if (res.success) {
      setHasOwnLease(true);
      setConflictDetails(null);
      return true;
    } else {
      setHasOwnLease(false);
      setConflictDetails(res.conflict);
      return false;
    }
  }, [lockId, resourceLabel, tabId, ttlMs]);

  const release = useCallback(
    (force = false) => {
      const res = releaseMutationLock(lockId, tabId, force);
      setHasOwnLease(false);
      setConflictDetails(null);
      return res;
    },
    [lockId, tabId]
  );

  useEffect(() => {
    if (autoAcquire) {
      acquire();
    } else {
      checkStatus();
    }

    // Listen to storage events across tabs
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key.includes(lockId)) {
        checkStatus();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      if (hasOwnLease) {
        releaseMutationLock(lockId, tabId, false);
      }
    };
  }, [autoAcquire, acquire, checkStatus, hasOwnLease, lockId, tabId]);

  return {
    isLockedByOtherTab: Boolean(conflictDetails),
    hasOwnLease,
    conflictDetails,
    acquire,
    release,
    refresh: checkStatus,
  };
}
