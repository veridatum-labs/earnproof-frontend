/**
 * Accessible chart primitives types for operational metrics.
 *
 * These types are designed to be compatible with the existing
 * `lib/api/organization-usage` types while adding accessibility
 * metadata (labels, descriptions, units) that survive color-free
 * communication of state, thresholds, and series.
 */
import type {
  CapacityTrendPoint,
  CapacityTrendData,
} from "@/lib/api/organization-usage";

/** Redundant cue for a data point: shape + text + color. */
export type PointCue = {
  /** CSS class or shape type for visual identification (circle, square, etc.). */
  shape: "circle" | "square" | "diamond" | "triangle";
  /** Accessible label announced by screen readers. */
  label: string;
  /** Optional contrasting text color (not sole means of state communication). */
  color?: string;
};

/** Redundant cue for a threshold boundary. */
export type ThresholdCue = {
  /** Position of the threshold (0.0 = min, 1.0 = max of chart domain). */
  position: number;
  /** Accessible label describing the threshold. */
  label: string;
  /** CSS class for visual styling (color + pattern/license). */
  styleClass: "warning" | "critical" | "info";
  /** Text to display inside the threshold marker. */
  text: string;
};

/** Accessible legend entry for a chart series. */
export type LegendEntry = {
  /** Series identifier (displayed in the chart title or table header). */
  seriesId: string;
  /** Accessible name announced by screen readers. */
  accessibleName: string;
  /** Visual shape/pattern used as redundant cue alongside color. */
  shape: "circle" | "square" | "diamond" | "triangle";
  /** CSS class for the swatch (color + optional pattern). */
  swatchClass: string;
};

/** Props for an accessible line chart. */
export type LineChartProps = {
  /** Historical trend data points (ascending by timestamp). */
  data: CapacityTrendData;
  /** Optional threshold cues that should appear on the chart. */
  thresholds?: ThresholdCue[];
  /** Optional legend entries for series. */
  legend?: LegendEntry[];
  /** Optional callback when a data point is interacted with (e.g. keyboard focus). */
  onPointSelect?: (point: CapacityTrendPoint) => void;
};

/** Props for an accessible bar chart. */
export type BarChartProps = {
  /** Aggregated data points for bar rendering. */
  data: CapacityTrendData;
  /** Optional threshold cues. */
  thresholds?: ThresholdCue[];
  /** Optional legend entries. */
  legend?: LegendEntry[];
  /** Optional callback when a bar is interacted with. */
  onBarSelect?: (point: CapacityTrendPoint) => void;
};

/** Props for an accessible threshold indicator. */
export type ThresholdIndicatorProps = {
  /** The threshold value as a percentage (0-100) or null for unlimited. */
  value: number | null;
  /** The configured limit (null for unlimited). */
  limit: number | null;
  /** Label announced by screen readers. */
  label: string;
  /** Tooltip / description text. */
  description?: string;
  /** Whether the threshold is a warning (80%) or critical (100%). */
  severity: "warning" | "critical";
};

/** Props for an accessible chart legend. */
export type ChartLegendProps = {
  /** Legend entries to render. */
  entries: LegendEntry[];
  /** ARIA-label for the legend container. */
  ariaLabel?: string;
};

/** Props for an accessible empty state. */
export type EmptyStateProps = {
  /** Title/heading text. */
  title: string;
  /** Secondary descriptive text. */
  description: string;
  /** Optional action label (e.g. "Refresh", "Connect Wallet"). */
  actionLabel?: string;
  /** Optional onClick for the action button. */
  onAction?: () => void;
  /** Optional icon name or SVG content. */
  icon?: string;
};

/** Props for an accessible data-table fallback. */
export type DataTableFallbackProps = {
  /** Column headers (names displayed in `<th>` elements). */
  headers: string[];
  /** Row data. Each string is a cell value; alignment is implied by column. */
  rows: string[][];
  /** Optional unit label applied to every cell (e.g. "%", "GB", "req/min"). */
  unit?: string;
  /** ARIA-label for the table. */
  ariaLabel?: string;
  /** Caption text below the table. */
  caption?: string;
};