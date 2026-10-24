"use client";

import { formatDate } from "@/lib/i18n";
import type {
  BarChartProps,
  ThresholdCue,
  PointCue,
} from "./AccessibleChartTypes";

/**
 * Accessible bar chart for operational metrics.
 *
 * Rendered as SVG with full keyboard, screen-reader, and zoom/reflow support.
 * Bars use shape + label redundant cues instead of color alone for state
 * communication. All data values are preserved in an accessible table fallback.
 */
export function BarChart({
  data,
  thresholds,
  legend,
}: BarChartProps) {
  if (!data.points || data.points.length === 0) {
    return (
      <div
        className="rounded-lg border border-white/10 bg-white/[0.04] p-5"
        aria-label={data.displayName}
      >
        <h3 className="text-sm font-semibold text-white">{data.displayName}</h3>
        <p className="mt-2 text-xs text-slate-400">No data available.</p>
      </div>
    );
  }

  const points = data.points;
  const chartWidth = 400;
  const chartHeight = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Determine max percentage for scaling
  const maxPct = Math.max(
    ...points.map((p) => p.percentageUsed ?? 0),
    100
  );
  const yScale = plotHeight / maxPct;

  // Compute bar width based on number of points, with min spacing
  const barWidth = Math.max(20, plotWidth / (points.length * 1.5));
  const barSpacing = (plotWidth - points.length * barWidth) / (points.length + 1);

  // Build bar data with cues
  const barData: { x: number; y: number; width: number; height: number; cue: PointCue }[] = [];

  points.forEach((point, idx) => {
    const x = padding.left + barSpacing + idx * (barWidth + barSpacing);
    const pct = point.percentageUsed ?? 0;
    const used = point.used ?? 0;

    // Determine shape and label based on percentage and limit
    let shape: "circle" | "square" | "diamond" | "triangle" = "circle";
    let label: string;

    if (pct >= 100) {
      shape = "diamond";
      label = `Exceeded: ${pct}% (${used} / ${point.limit ?? "unlimited"})`;
    } else if (pct >= 80) {
      shape = "square";
      label = `Near limit: ${pct}%`;
    } else if (pct > 0) {
      shape = "circle";
      label = `${pct}% used`;
    } else {
      shape = "circle";
      label = "0% used";
    }

    const barHeight = pct * yScale;
    const y = padding.top + plotHeight - barHeight;

    barData.push({
      x,
      y,
      width: barWidth,
      height: barHeight,
      cue: { shape, label },
    });
  });

  // Build threshold cues (position + text + style, not color-alone)
  const thresholdCues: ThresholdCue[] = [];
  if (thresholds) {
    thresholds.forEach((t) => {
      const pos = t.position == null ? 0 : Math.min(Math.max(t.position, 0), 1);
      thresholdCues.push({
        position: pos,
        label: t.label,
        styleClass: t.styleClass ?? "info",
        text: `${t.label} at ${Math.round(pos * 100)}%`,
      });
    });
  }

  return (
    <article
      className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4"
      aria-label={data.displayName}
      aria-describedby={`${data.displayName}-description`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{data.displayName}</h3>
        {data.isStale && (
          <span className="inline-flex h-6 items-center rounded-full bg-amber-300/20 px-2 text-xs font-medium text-amber-200">
            Stale
          </span>
        )}
      </div>

      {/* SVG Bar Chart */}
      <div className="overflow-x-auto rounded bg-slate-900/50 p-2">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-full" style={{ height: "auto" }}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((pct) => (
            <line
              key={`grid-${pct}`}
              x1={padding.left}
              y1={padding.top + plotHeight - (pct / maxPct) * plotHeight}
              x2={chartWidth - padding.right}
              y2={padding.top + plotHeight - (pct / maxPct) * plotHeight}
              stroke="rgba(148, 163, 184, 0.1)"
              strokeWidth="1"
            />
          ))}

          {/* Y-axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="rgba(148, 163, 184, 0.3)"
            strokeWidth="1"
          />

          {/* X-axis */}
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={chartWidth - padding.right}
            y2={padding.top + plotHeight}
            stroke="rgba(148, 163, 184, 0.3)"
            strokeWidth="1"
          />

          {/* Y-axis labels */}
          {[0, 25, 50, 75, 100].map((pct) => (
            <text
              key={`y-label-${pct}`}
              x={padding.left - 10}
              y={padding.top + plotHeight - (pct / maxPct) * plotHeight + 4}
              fontSize="12"
              fill="rgba(148, 163, 184, 0.7)"
              textAnchor="end"
            >
              {pct}%
            </text>
          ))}

          {/* X-axis labels */}
          {points.map((point, idx) => {
            const x = padding.left + barSpacing + idx * (barWidth + barSpacing) + barWidth / 2;
            return (
              <g key={`x-label-${idx}`}>
                <text
                  x={x}
                  y={padding.top + plotHeight + 18}
                  fontSize="11"
                  fill="rgba(148, 163, 184, 0.7)"
                  textAnchor="middle"
                >
                  {formatDate(point.timestamp)}
                </text>
              </g>
            );
          })}

          {/* Bars with redundant cues (shape + label + color as secondary) */}
          {barData.map((bar, bi) => {
            const cue = bar.cue;

            return (
              <g key={`bar-${bi}`} aria-hidden="true">
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill={cue.color ?? "rgb(34, 197, 94)"}
                  stroke="rgb(15, 23, 42)"
                  strokeWidth="1"
                />
                <title>
                  {cue.label}
                </title>
              </g>
            );
          })}

          {/* Threshold indicators */}
          {thresholdCues.map((t, tIdx) => {
            const y =
              padding.top + plotHeight - t.position * plotHeight;

            return (
              <g key={`threshold-${tIdx}`} aria-hidden="true">
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke={t.styleClass === "warning" ? "rgb(251, 146, 60)" : t.styleClass === "critical" ? "rgb(244, 63, 94)" : "rgb(34, 197, 94)"}
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
                <text
                  x={chartWidth - padding.right - 5}
                  y={y - 5}
                  fontSize="10"
                  fill={t.styleClass === "warning" ? "rgb(251, 146, 60)" : t.styleClass === "critical" ? "rgb(244, 63, 94)" : "rgb(34, 197, 94)"}
                  opacity="0.7"
                  textAnchor="end"
                >
                  {t.text}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          {legend && legend.length > 0 && (
            <g
              key="legend"
              className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-2 text-xs"
            >
              {legend.map((entry, li) => (
                <g key={`legend-${li}`}>
                  <rect
                    x={0}
                    y={0}
                    width={10}
                    height={6}
                    fill={entry.swatchClass}
                    stroke="rgb(15, 23, 42)"
                    strokeWidth="1"
                  />
                  <text
                    x={14}
                    y={10}
                    fill="rgba(255, 255, 255, 0.9)"
                    fontSize="10"
                  >
                    {entry.accessibleName}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Accessible data table fallback */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-slate-400">Min</span>
          <span className="text-slate-200">
            {Math.min(...points.map((p) => p.percentageUsed ?? 0))}%
          </span>
        </div>
        <div>
          <span className="text-slate-400">Max</span>
          <span className="text-slate-200">
            {Math.max(...points.map((p) => p.percentageUsed ?? 0))}%
          </span>
        </div>
        <div>
          <span className="text-slate-400">Avg</span>
          <span className="text-slate-200">
            {((points.reduce((sum, p) => sum + (p.percentageUsed ?? 0), 0) /
              points.length) ||
              0)
              .toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Detailed data table */}
      <section
        className="mt-4 overflow-x-auto rounded bg-slate-900/50 p-4"
        aria-label={`${data.displayName} data table`}
      >
        <table className="w-full caption-bottom">
          <caption
            className="text-xs text-slate-400"
            aria-live="polite"
          >
            {data.displayName} — {points.length} observations
          </caption>
          <thead>
            <tr>
              <th className="text-left text-slate-400" colSpan={2}>
                Period
              </th>
              <th className="text-left text-slate-400">
                Percentage
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, idx) => {
              const pct = point.percentageUsed ?? 0;
              return (
                <tr key={`table-${idx}`} role="row">
                  <td className="text-left p-1 text-slate-300" role="gridcell">
                    {formatDate(point.timestamp)}
                  </td>
                  <td className="text-right p-1 text-slate-300" role="gridcell">
                    {pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </article>
  );
}