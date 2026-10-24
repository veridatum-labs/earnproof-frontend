"use client";

import type { EmptyStateProps } from "./AccessibleChartTypes";

/**
 * Accessible empty state for operational metrics charts.
 *
 * Provides a meaningful message with optional action trigger.
 * Uses large, high-contrast text and avoids color-as-only-cue
 * communication. Screen readers get a clear, single announcement.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div
      className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-center"
      aria-label={title}
    >
      {icon && (
        <div className="w-12 h-12 mx-auto mb-4 rounded-lg flex items-center justify-center" />
      )}

      <h3 className="text-lg font-semibold text-white mb-2">
        {title}
      </h3>

      <p className="text-slate-400 mb-6">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-cyan-300 px-4 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
          onClick={onAction}
          aria-label={actionLabel}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}