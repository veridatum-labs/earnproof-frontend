/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import {
  LineChart,
  BarChart,
  ThresholdIndicator,
  ChartLegend,
  EmptyState,
  DataTableFallback,
} from "../";
import {
  trendData,
  forecastData,
  nearExhaustionTrendData,
  exceededCapacityTrendData,
  unlimitedTrendData,
  staleTrendData,
  quickExhaustionForecast,
  noExhaustionForecast,
} from "@/lib/api/__tests__/organization-usage.fixtures";

describe("LineChart", () => {
  it("renders line chart with title and data points", () => {
    const trend = trendData();
    const { container } = render(<LineChart data={trend} />);
    const h3 = container.querySelector("h3");
    expect(h3).toBeInTheDocument();
    expect(h3.textContent).toContain("Proofs");
  });

  it("displays stale indicator when data is stale", () => {
    const trend = staleTrendData();
    render(<LineChart data={trend} />);
    const article = screen.getByRole("article");
    expect(article).toBeInTheDocument();
    expect(article.textContent).toContain("Stale");
  });

  it("does not show stale indicator for fresh data", () => {
    const trend = trendData({ isStale: false });
    render(<LineChart data={trend} />);
    const article = screen.getByRole("article");
    expect(article).toBeInTheDocument();
    expect(article.textContent).not.toContain("Stale");
  });

  it("renders SVG chart container", () => {
    const trend = trendData();
    const { container } = render(<LineChart data={trend} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("displays warning threshold annotation (80%)", () => {
    const trend = trendData();
    const { container } = render(
      <LineChart data={trend} thresholds={[{ label: "Warning", position: 0.8, styleClass: "warning" }]} />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg.textContent).toContain("Warning at 80%");
  });

  it("handles near exhaustion (95%+)", () => {
    const trend = nearExhaustionTrendData();
    render(<LineChart data={trend} />);
    const article = screen.getByRole("article");
    expect(article.textContent).toContain("Near Limit");
  });

  it("handles exceeded capacity (>100%)", () => {
    const trend = exceededCapacityTrendData();
    render(<LineChart data={trend} />);
    const article = screen.getByRole("article");
    expect(article.textContent).toContain("Exceeded");
  });

  it("displays message when no data points available", () => {
    const trend = trendData({ points: [] });
    render(<LineChart data={trend} />);
    expect(screen.getByText(/No data available/)).toBeInTheDocument();
  });

  it("renders data point markers in SVG", () => {
    const trend = trendData();
    const { container } = render(<LineChart data={trend} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThan(0);
  });

  it("provides accessible point announcements via title elements", () => {
    const trend = trendData();
    const { container } = render(<LineChart data={trend} />);
    const titles = container.querySelectorAll("title");
    expect(titles.length).toBeGreaterThan(0);
    expect(titles[0].textContent?.length).toBeGreaterThan(0);
  });

  it("data table fallback has min/max spans", () => {
    const trend = trendData();
    const { container } = render(<LineChart data={trend} />);
    const minSpans = container.querySelectorAll(".text-slate-400");
    expect(minSpans.length).toBeGreaterThan(0);
    expect(minSpans[0].textContent).toContain("Min");
    const maxSpans = container.querySelectorAll(".text-slate-400");
    expect(maxSpans.length).toBeGreaterThan(0);
    expect(maxSpans[1].textContent).toContain("Max");
  });

  it("accessible data table has row/column headers", () => {
    const trend = trendData();
    render(<LineChart data={trend} />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    const headers = table.querySelectorAll("th");
    expect(headers.length).toBeGreaterThan(0);
  });
});

describe("BarChart", () => {
  it("renders bar chart with title and data points", () => {
    const trend = trendData();
    const { container } = render(<BarChart data={trend} />);
    const h3 = container.querySelector("h3");
    expect(h3).toBeInTheDocument();
    expect(h3.textContent).toContain("Proofs");
  });

  it("displays stale indicator when data is stale", () => {
    const trend = staleTrendData();
    render(<BarChart data={trend} />);
    const article = screen.getByRole("article");
    expect(article).toBeInTheDocument();
    expect(article.textContent).toContain("Stale");
  });

  it("renders SVG bar chart container", () => {
    const trend = trendData();
    const { container } = render(<BarChart data={trend} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders bars with redundant shape + label cues", () => {
    const trend = trendData();
    const { container } = render(<BarChart data={trend} />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(0);
  });

  it("data table fallback has min/max/avg spans", () => {
    const trend = trendData();
    const { container } = render(<BarChart data={trend} />);
    const minSpans = container.querySelectorAll(".text-slate-400");
    expect(minSpans.length).toBeGreaterThan(0);
    expect(minSpans[0].textContent).toContain("Min");
    const maxSpans = container.querySelectorAll(".text-slate-400");
    expect(maxSpans.length).toBeGreaterThan(0);
    expect(maxSpans[1].textContent).toContain("Max");
    const avgSpans = container.querySelectorAll(".text-slate-400");
    expect(avgSpans.length).toBeGreaterThan(0);
    expect(avgSpans[2].textContent).toContain("Avg");
  });

  it("accessible data table has row/column headers", () => {
    const trend = trendData();
    render(<BarChart data={trend} />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    const headers = table.querySelectorAll("th");
    expect(headers.length).toBeGreaterThan(0);
  });
});

describe("ThresholdIndicator", () => {
  it("renders threshold indicator below limit with labels", () => {
    render(
      <ThresholdIndicator
        value={60}
        limit={100}
        label="Capacity threshold"
        description="Usage is within safe bounds"
        severity="warning"
      />
    );
    const label = screen.getByLabelText("Capacity threshold");
    expect(label).toBeInTheDocument();
    expect(label.textContent).toContain("Within limit");
    expect(label.textContent).toContain("60");
  });

  it("renders threshold indicator at limit (critical)", () => {
    render(
      <ThresholdIndicator
        value={100}
        limit={100}
        label="Capacity threshold"
        severity="critical"
      />
    );
    const label = screen.getByLabelText("Capacity threshold");
    expect(label).toBeInTheDocument();
    expect(label.textContent).toContain("Limit exceeded");
    expect(label.textContent).toContain("100");
  });

  it("renders threshold indicator above limit (exceeded)", () => {
    render(
      <ThresholdIndicator
        value={110}
        limit={100}
        label="Capacity threshold"
        severity="critical"
      />
    );
    const label = screen.getByLabelText("Capacity threshold");
    expect(label).toBeInTheDocument();
    expect(label.textContent).toContain("Limit exceeded");
    expect(label.textContent).toContain("110");
  });

  it("renders threshold indicator for unlimited limit", () => {
    render(
      <ThresholdIndicator
        value={50}
        limit={null}
        label="Capacity threshold"
        severity="info"
      />
    );
    const label = screen.getByLabelText("Capacity threshold");
    expect(label).toBeInTheDocument();
    expect(label.textContent).toContain("Unlimited");
    expect(label.textContent).toContain("50");
  });

  it("renders exact boundary behavior deterministically at 80%", () => {
    render(
      <ThresholdIndicator
        value={80}
        limit={100}
        label="Usage threshold"
        severity="warning"
      />
    );
    const label = screen.getByLabelText("Usage threshold");
    expect(label).toBeInTheDocument();
    expect(label.textContent).toContain("Near limit");
    expect(label.textContent).toContain("80");
  });
});

describe("ChartLegend", () => {
  it("renders legend with shape + name entries", () => {
    const entries = [
      {
        seriesId: "series-1",
        accessibleName: "Active users",
        shape: "circle",
        swatchClass: "rgb(34, 197, 94)",
      },
      {
        seriesId: "series-2",
        accessibleName: "Inactive users",
        shape: "square",
        swatchClass: "rgb(251, 146, 60)",
      },
    ];
    
    render(<ChartLegend entries={entries} />);
    const legendDiv = screen.getByRole("region", { name: "Chart legend" });
    expect(legendDiv).toBeInTheDocument();
  });

  it("each legend entry has accessible name", () => {
    const entries = [
      {
        seriesId: "s1",
        accessibleName: "Series One",
        shape: "circle",
        swatchClass: "rgb(34, 197, 94)",
      },
    ];
    
    render(<ChartLegend entries={entries} ariaLabel="Chart series legend" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Series One");
  });
});

describe("EmptyState", () => {
  it("renders empty state with title and description", () => {
    render(
      <EmptyState
        title="No data available"
        description="There are no observations to display."
      />
    );
    
    expect(screen.getByText("No data available")).toBeInTheDocument();
    expect(screen.getByText("There are no observations to display.")).toBeInTheDocument();
  });

  it("renders empty state with action button", () => {
    const onAction = jest.fn();
    
    render(
      <EmptyState
        title="No data available"
        description="There are no observations to display."
        actionLabel="Refresh"
        onAction={onAction}
      />
    );
    
    expect(screen.getByText("Refresh")).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    
    screen.getByText("Refresh").click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("empty state is focusable", () => {
    render(
      <EmptyState title="No observations" description="No data to display." />
    );
    
    const heading = screen.getByRole("heading", { name: "No observations" });
    expect(heading).toBeInTheDocument();
  });
});

describe("DataTableFallback", () => {
  it("renders data table with headers and rows", () => {
    const headers = ["Period", "Usage"];
    const rows = [
      ["2024-01-01", "75%"],
      ["2024-01-02", "80%"],
    ];
    
    render(
      <DataTableFallback
        headers={headers}
        rows={rows}
        unit="%"
        ariaLabel="Usage data table"
        caption="Monthly usage observations"
      />
    );
    
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    const headerCells = table.querySelectorAll("th");
    expect(headerCells.length).toBe(2);
  });

  it("data table cells include unit label", () => {
    const headers = ["Usage"];
    const rows = [["75%"]];
    
    render(
      <DataTableFallback
        headers={headers}
        rows={rows}
        unit="%"
        ariaLabel="Usage percentage table"
      />
    );
    
    const table = screen.getByRole("table");
    const dataCell = table.querySelector("td");
    expect(dataCell).toBeInTheDocument();
    expect(dataCell.textContent).toContain("%");
  });

  it("data table has no unit when unit prop is omitted", () => {
    const headers = ["Usage"];
    const rows = [["75"]];
    
    render(
      <DataTableFallback
        headers={headers}
        rows={rows}
        ariaLabel="Raw usage table"
      />
    );
    
    const table = screen.getByRole("table");
    const dataCell = table.querySelector("td");
    expect(dataCell).toBeInTheDocument();
    expect(dataCell.textContent).not.toContain("%");
  });
});