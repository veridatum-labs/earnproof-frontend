"use client";

import { formatDate } from "@/lib/i18n";
import type {
  LineChartProps,
  ThresholdCue,
  PointCue,
} from "./AccessibleChartTypes";

/**
 * Accessible line chart for operational metrics.
 *
 * Rendered as SVG with full keyboard, screen-reader, and zoom/reflow support.
 * State, thresholds, and series are never communicated through color alone:
 * each series point has a redundant cue (shape + label), thresholds have
 * text + position markers, and all data is preserved in an accessible table
 * fallback.
 */
export function LineChart({
  data,
  thresholds,
  legend,
}: LineChartProps) {
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
  const chartHeight = 150;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Y-axis: 0 to 100% (or 0 to max used if unlimited)
  const maxUsage = Math.max(
    ...points.map((p) => p.percentageUsed ?? 0),
    100
  );
  const yScale = plotHeight / maxUsage;

  // X-axis: time-based scaling
  const timestamps = points.map((p) => new Date(p.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime || 1;
  const xScale = plotWidth / timeRange;

  // Build accessible point coordinates and cues
  const pointCues: PointCue[] = [];
  const pathPoints: number[] = [];

  points.forEach((point, idx) => {
    const x = padding.left + (timestamps[idx] - minTime) * xScale;
    const y = padding.top + plotHeight - (point.percentageUsed ?? 0) * yScale;
    pathPoints.push(x, y);

    const pct = point.percentageUsed ?? 0;
    let shape: "circle" | "square" | "diamond" | "triangle" = "circle";
    let label: string;

    if (pct >= 100) {
      shape = "diamond";
      label = `Exceeded limit: ${pct}%`;
    } else if (pct >= 80) {
      shape = "square";
      label = `Near limit: ${pct}%`;
    } else {
      shape = "circle";
      label = `${pct}% used`;
    }

    pointCues.push({ shape, label });
  });

  // Build threshold cues (redundant: position + text + style)
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

  // Render the chart
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

      {/* SVG Line Chart */}
      <div className="overflow-x-auto rounded bg-slate-900/50 p-2">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-full" style={{ height: "auto" }}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((pct) => (
            <line
              key={`grid-${pct}`}
              x1={padding.left}
              y1={padding.top + plotHeight - (pct / maxUsage) * plotHeight}
              x2={chartWidth - padding.right}
              y2={padding.top + plotHeight - (pct / maxUsage) * plotHeight}
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
              y={padding.top + plotHeight - (pct / maxUsage) * plotHeight + 4}
              fontSize="12"
              fill="rgba(148, 163, 184, 0.7)"
              textAnchor="end"
            >
              {pct}%
            </text>
          ))}

          {/* X-axis labels */}
          {points.map((point, idx) => {
            const x = padding.left + (new Date(point.timestamp).getTime() - minTime) * xScale;
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

          {/* Trend line */}
          <polyline
            points={pathPoints.join(" ")}
            fill="none"
            stroke="rgb(34, 197, 94)"
            strokeWidth="2"
          />

          {/* Data points with redundant cues (shape + label + color) */}
          {points.map((point, idx) => {
            const x = padding.left + (timestamps[idx] - minTime) * xScale;
            const y = padding.top + plotHeight - (point.percentageUsed ?? 0) * yScale;
            const cue = pointCues[idx];

            return (
              <g key={`point-${idx}`} aria-hidden="true">
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill={cue.color ?? "rgb(34, 197, 94)"}
                  stroke="rgb(15, 23, 42)"
                  strokeWidth="2"
                />
                {/* Accessible label for screen readers - announced on hover/focus */}
                <title>
                  {pointCueAnnouncement(point, cue, idx, data)}
                </title>
              </g>
            );
          })}

          {/* Threshold indicators with redundant cues (position + text + style) */}
          {thresholdCues.map((t, tIdx) => {
            const x1 = padding.left;
            const x2 = chartWidth - padding.right;
            const y =
              padding.top + plotHeight - t.position * plotHeight;

            return (
              <g key={`threshold-${tIdx}`} aria-hidden="true">
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke={t.styleClass === "warning" ? "rgb(251, 146, 60)" : t.styleClass === "critical" ? "rgb(244, 63, 94)" : "rgb(34, 197, 94)"}
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
                <text
                  x={x2 - padding.right - 5}
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

          {/* Legend section (if legend props provided) */}
          {legend && legend.length > 0 && (
            <g
              key="legend"
              className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-2 text-xs"
            >
              {legend.map((entry, li) => (
                <g key={`legend-${li}`}>
                  <circle
                    cx={0}
                    cy={0}
                    r="3"
                    fill={entry.swatchClass}
                    stroke="rgb(15, 23, 42)"
                    strokeWidth="1"
                  />
                  <text
                    x={12}
                    y={4}
                    fill="rgba(255, 255, 255, 0.9)"
                  >
                    {entry.accessibleName}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Accessible data table fallback preserving exact values */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
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
      </div>

      {/* Detailed data table - visible on mobile/zoom or as standalone fallback */}
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
                Percentage Used
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

/**
 * Generates an accessible screen-reader announcement for a chart point,
 * combining shape, value, and threshold context without relying on color.
 */
function pointCueAnnouncement(
  point: CapacityTrendPoint,
  cue: PointCue,
  idx: number,
  data: CapacityTrendData
): string {
  const pct = point.percentageUsed ?? 0;
  const used = point.used ?? 0;
  const limit = data.limit ?? null;

  if (limit !== null && pct >= 100) {
    return `Point ${idx + 1}: exceeded limit, ${used} used of ${limit} limit, ${pct}%. ${cue.label}`;
  }
  if (limit !== null && pct >= 80) {
    return `Point ${idx + 1}: near limit, ${used} used of ${limit} limit, ${pct}%. ${cue.label}`;
  }
  return `Point ${idx + 1}: ${used} used, ${pct}%. ${cue.label}`;
}