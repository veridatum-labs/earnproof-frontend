"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROOF_STATUS_MAX_BACKOFF_MS,
  DEFAULT_PROOF_STATUS_POLL_INTERVAL_MS,
  computeBackoffDelayMs,
  fetchProofStatus,
  isTerminalProofStatus,
  type ProofStatus,
  type ProofStatusSnapshot,
} from "./proof-status";

export type ProofStatusFetcher = (
  proofId: string,
  signal: AbortSignal,
) => Promise<ProofStatusSnapshot>;

export type UseProofStatusRefreshOptions = {
  /** The proof to track. Passing `null`/`undefined` disables the loop. */
  proofId: string | null | undefined;
  /** Master switch, e.g. for gating on authentication. Defaults to `true`. */
  enabled?: boolean;
  /** Steady-state interval between successful refreshes. */
  pollIntervalMs?: number;
  /** Upper bound for exponential backoff after repeated failures. */
  maxBackoffMs?: number;
  /** Injectable fetch for tests; defaults to {@link fetchProofStatus}. */
  fetcher?: ProofStatusFetcher;
};

export type ProofStatusRefreshState = {
  /** Last confirmed snapshot. Preserved across transient failures. */
  snapshot: ProofStatusSnapshot | null;
  status: ProofStatus | null;
  /** True while a request is in flight. */
  isRefreshing: boolean;
  /** True when the most recent attempt succeeded. */
  isLive: boolean;
  /** Error from the most recent attempt, cleared on the next success. */
  error: unknown;
  lastUpdated: Date | null;
  lastAttempt: Date | null;
  failureCount: number;
  /** False once polling has stopped (terminal state, hidden tab, disposal). */
  isPolling: boolean;
};

export type ProofStatusRefreshResult = ProofStatusRefreshState & {
  /** Forces an immediate refresh and resets backoff. */
  refresh: () => void;
};

const INITIAL_STATE: ProofStatusRefreshState = {
  snapshot: null,
  status: null,
  isRefreshing: false,
  isLive: false,
  error: null,
  lastUpdated: null,
  lastAttempt: null,
  failureCount: 0,
  isPolling: false,
};

/**
 * Refreshes a proof's mutable status (pending anchoring, revocation) while
 * the page is visible.
 *
 * Guarantees, one per acceptance criterion:
 * - A single self-rescheduling timeout loop, never overlapping requests, so
 *   there is exactly one refresh loop per proof.
 * - `visibilitychange` clears the pending timer while hidden and refreshes
 *   immediately when the tab becomes visible again.
 * - Every attempt is tagged with a monotonically increasing sequence; a
 *   response only commits if it is still the newest, so a late response can
 *   never overwrite a newer state.
 * - Failures back off exponentially (bounded by `maxBackoffMs`) and leave the
 *   last confirmed snapshot in place. Polling stops for terminal states.
 */
export function useProofStatusRefresh(
  options: UseProofStatusRefreshOptions,
): ProofStatusRefreshResult {
  const {
    proofId,
    enabled = true,
    pollIntervalMs = DEFAULT_PROOF_STATUS_POLL_INTERVAL_MS,
    maxBackoffMs = DEFAULT_PROOF_STATUS_MAX_BACKOFF_MS,
    fetcher = fetchProofStatus,
  } = options;

  const [state, setState] = useState<ProofStatusRefreshState>(INITIAL_STATE);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled || !proofId) {
      return;
    }

    const trackedProofId: string = proofId;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let sequence = 0;
    let failureCount = 0;
    let activeProofId: string | null = null;

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function isHidden() {
      return typeof document !== "undefined" && document.hidden === true;
    }

    async function run() {
      if (disposed) {
        return;
      }

      // Cancel any pending timer and supersede any in-flight request so at
      // most one loop's worth of work is ever outstanding.
      clearTimer();
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const seq = ++sequence;
      const isCurrent = () => !disposed && seq === sequence;

      if (activeProofId !== trackedProofId) {
        activeProofId = trackedProofId;
        failureCount = 0;
        setState({ ...INITIAL_STATE, isRefreshing: true, isPolling: true });
      } else {
        setState((prev) => ({ ...prev, isRefreshing: true }));
      }

      try {
        const snapshot = await fetcher(trackedProofId, current.signal);
        if (!isCurrent()) {
          return;
        }

        failureCount = 0;
        const terminal = isTerminalProofStatus(snapshot.status);
        setState({
          snapshot,
          status: snapshot.status,
          isRefreshing: false,
          isLive: true,
          error: null,
          lastUpdated: new Date(),
          lastAttempt: new Date(),
          failureCount: 0,
          isPolling: !terminal,
        });

        if (terminal) {
          clearTimer();
          return;
        }
        schedule(pollIntervalMs);
      } catch (error) {
        if (!isCurrent()) {
          return;
        }

        // Preserve the last confirmed snapshot: only the freshness metadata
        // and error change, so a transient outage never blanks the page.
        failureCount += 1;
        setState((prev) => ({
          ...prev,
          isRefreshing: false,
          isLive: false,
          error,
          lastAttempt: new Date(),
          failureCount,
          isPolling: true,
        }));
        schedule(
          computeBackoffDelayMs(failureCount, {
            baseMs: pollIntervalMs,
            maxMs: maxBackoffMs,
          }),
        );
      }
    }

    function schedule(delayMs: number) {
      clearTimer();
      if (disposed) {
        return;
      }
      if (isHidden()) {
        setState((prev) => (prev.isPolling ? { ...prev, isPolling: false } : prev));
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    }

    refreshRef.current = () => {
      failureCount = 0;
      void run();
    };

    const onVisibilityChange = () => {
      if (isHidden()) {
        clearTimer();
        setState((prev) => (prev.isPolling ? { ...prev, isPolling: false } : prev));
        return;
      }
      // Becoming visible is a fresh signal: drop accumulated backoff and
      // refresh right away instead of waiting out the last delay.
      failureCount = 0;
      void run();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!isHidden()) {
      void run();
    }

    return () => {
      disposed = true;
      // Invalidate any in-flight response so it cannot commit after disposal.
      sequence += 1;
      clearTimer();
      controller?.abort();
      controller = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      refreshRef.current = () => {};
    };
  }, [enabled, proofId, pollIntervalMs, maxBackoffMs, fetcher]);

  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  return { ...state, refresh };
}
