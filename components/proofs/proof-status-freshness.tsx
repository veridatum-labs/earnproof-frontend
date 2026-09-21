"use client";

import { defineMessages, formatMessage, formatTime } from "@/lib/i18n";
import type { ProofStatusRefreshState } from "@/lib/api/use-proof-status-refresh";

const messages = defineMessages("proofStatusFreshness", {
  checking: "Checking proof status…",
  current: "Status is current as of {time}.",
  currentUnknown: "Status is current.",
  refreshing: "Refreshing status. Last confirmed at {time}.",
  refreshingUnknown: "Refreshing status…",
  stale:
    "Showing the last confirmed status as of {time}. Reconnecting automatically.",
  staleUnknown:
    "The proof status could not be refreshed. Reconnecting automatically.",
  final: "Final status. Last confirmed at {time}.",
  finalUnknown: "Final status.",
});

type ProofStatusFreshnessProps = Pick<
  ProofStatusRefreshState,
  "isRefreshing" | "isLive" | "isPolling" | "lastUpdated" | "error"
>;

/**
 * Accessible freshness notice for a proof status that refreshes in the
 * background. It never hides the last confirmed status: during a transient
 * failure it says so explicitly rather than presenting stale data as current.
 */
export function ProofStatusFreshness({
  isRefreshing,
  isLive,
  isPolling,
  lastUpdated,
  error,
}: ProofStatusFreshnessProps) {
  const checkedAt = lastUpdated ? formatTime(lastUpdated) : null;
  const hasError = Boolean(error);
  const isPaused = !isPolling && isLive && !hasError;

  let message: string;
  if (isRefreshing && !checkedAt) {
    message = messages.checking;
  } else if (hasError) {
    message = checkedAt
      ? formatMessage(messages.stale, { time: checkedAt })
      : messages.staleUnknown;
  } else if (isPaused) {
    message = checkedAt
      ? formatMessage(messages.final, { time: checkedAt })
      : messages.finalUnknown;
  } else if (isRefreshing) {
    message = checkedAt
      ? formatMessage(messages.refreshing, { time: checkedAt })
      : messages.refreshingUnknown;
  } else {
    message = checkedAt
      ? formatMessage(messages.current, { time: checkedAt })
      : messages.currentUnknown;
  }

  return (
    <p
      aria-live="polite"
      className="text-xs text-slate-400"
      data-testid="proof-status-freshness"
    >
      {message}
    </p>
  );
}
