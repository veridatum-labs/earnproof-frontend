"use client";

import type {
  ThresholdIndicatorProps,
} from "./AccessibleChartTypes";

/**
 * Accessible threshold indicator for operational metrics.
 *
 * Renders a visual threshold boundary with redundant cues:
 * position + text label + style class. Never communicates state
 * through color alone. Includes an accessible table cell with exact
 * values for screen readers and high-contrast mode.
 */
export function ThresholdIndicator({
  value,
  limit,
  label,
  description,
}: ThresholdIndicatorProps) {
  const level = limit !== null
    ? value !== null && value >= limit
      ? "critical"
      : value !== null && value >= limit * 0.8
        ? "warning"
        : "nominal"
    : "unlimited";

  const levelLabels: Record<string, string> = {
    nominal: "Within limit",
    warning: "Near limit",
    critical: "Limit exceeded",
    unlimited: "Unlimited",
  };

  

  return (
    <div
      className="rounded border bg-slate-900/50 p-4"
      aria-label={label}
      aria-describedby={`${label}-description`}
    >
      <h4 className="text-sm font-semibold text-white mb-2">
        {label}
      </h4>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-400">Threshold</span>
          <p className="text-slate-200 font-medium">{levelLabels[level]}</p>
        </div>

        <div>
          <span className="text-slate-400">Current value</span>
          <p className="text-slate-200 font-medium">
            {value !== null
              ? `${value}${limit !== null ? ` / ${limit}` : ""}`
              : "N/A"}
          </p>
        </div>
      </div>

      {description && (
        <p className="mt-3 text-xs text-slate-400" id={`${label}-description`}>
          {description}
        </p>
      )}

      {/* Accessible numeric table fallback with exact boundary behavior */}
      <div
        className="mt-4 grid grid-cols-2 gap-2 text-xs"
        aria-label={`${label} exact values`}
      >
        <div>
          <span className="text-slate-400">Below threshold</span>
          <span className="text-slate-200">{value !== null && value < (limit ?? Infinity) ? "yes" : "n/a"}</span>
        </div>
        <div>
          <span className="text-slate-400">At/above threshold</span>
          <span className="text-slate-200">
            {value !== null && limit !== null
              ? `${value >= limit ? "yes" : "no"} (value: ${value}, limit: ${limit})`
              : "n/a"}
          </span>
        </div>
      </div>
    </div>
  );
}