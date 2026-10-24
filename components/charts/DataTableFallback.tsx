"use client";

import type { DataTableFallbackProps } from "./AccessibleChartTypes";

/**
 * Accessible data-table fallback for operational metrics charts.
 *
 * Preserves exact underlying data values with useful row/column headers
 * and units. Keyboard-navitable, screen-reader compatible, and designed
 * for zoom/reflow. Never communicates state through color alone.
 */
export function DataTableFallback({
  headers,
  rows,
  unit,
  ariaLabel,
  caption,
}: DataTableFallbackProps) {
  return (
    <section
      className="overflow-x-auto rounded bg-slate-900/50 p-4"
      aria-label={ariaLabel}
    >
      {caption && (
        <p className="text-xs text-slate-400 mb-3" aria-live="polite">
          {caption}
        </p>
      )}

      <table className="w-full caption-bottom">
        <caption
          className="text-xs text-slate-400"
          aria-live="polite"
        >
          {caption || "Data table"}
        </caption>
        <thead>
          <tr>
            {headers.map((header, hIdx) => (
              <th key={`thead-${hIdx}`} className="text-left text-slate-400 p-1">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => {
            return (
              <tr key={`table-${rIdx}`} role="row">
                {row.map((cell, cIdx) => {
                  const classes =
                    cIdx === 0
                      ? "text-left p-1 text-slate-300"
                      : "text-right p-1 text-slate-300";

                  return (
                    <td
                      key={`td-${rIdx}-${cIdx}`}
                      className={classes}
                      role="gridcell"
                    >
                      {cell}{unit ? ` ${unit}` : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}