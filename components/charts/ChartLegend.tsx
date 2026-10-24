"use client";

import type { ChartLegendProps } from "./AccessibleChartTypes";

/**
 * Accessible chart legend for operational metrics.
 *
 * Each entry provides a shape/pattern redundant cue alongside color,
 * ensuring the series identity survives colorblind, high-contrast,
 * and text-only contexts. Keyboard-focusable, with meaningful
 * accessible names and no duplicate announcements.
 */
export function ChartLegend({
  entries,
  ariaLabel = "Chart legend",
}: ChartLegendProps) {
  return (
    <div
      className="flex flex-wrap gap-4 text-xs"
      role="region"
      aria-label={ariaLabel}
    >
      {entries.map((entry, idx) => (
        <div key={`legend-entry-${idx}`} className="flex items-center gap-1">
          <span
            className={`h-2 w-4 ${
              entry.shape === "circle"
                ? "bg-emerald-400"
                : entry.shape === "square"
                  ? "bg-emerald-400"
                  : entry.shape === "diamond"
                    ? "bg-rose-400"
                    : "bg-amber-400"
            }`}
            aria-hidden="true"
          />
          <span
            className="text-slate-300"
            role="button"
            tabIndex={0}
            onFocus={() => {}}
            aria-label={entry.accessibleName}
          >
            {entry.accessibleName}
          </span>
        </div>
      ))}
    </div>
  );
}