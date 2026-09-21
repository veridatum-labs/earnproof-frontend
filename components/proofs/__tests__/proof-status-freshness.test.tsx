import { render, screen } from "@testing-library/react";
import { ProofStatusFreshness } from "@/components/proofs/proof-status-freshness";

const NOW = new Date("2026-09-21T12:00:00.000Z");

describe("ProofStatusFreshness", () => {
  it("announces an initial check before anything is confirmed", () => {
    render(
      <ProofStatusFreshness
        error={null}
        isLive={false}
        isPolling
        isRefreshing
        lastUpdated={null}
      />,
    );

    expect(screen.getByText("Checking proof status…")).toBeInTheDocument();
    expect(screen.getByTestId("proof-status-freshness")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("reports a current status with its confirmation time", () => {
    render(
      <ProofStatusFreshness
        error={null}
        isLive
        isPolling
        isRefreshing={false}
        lastUpdated={NOW}
      />,
    );

    expect(screen.getByText(/Status is current as of/)).toBeInTheDocument();
  });

  it("indicates a refresh while keeping the confirmed timestamp visible", () => {
    render(
      <ProofStatusFreshness
        error={null}
        isLive
        isPolling
        isRefreshing
        lastUpdated={NOW}
      />,
    );

    expect(screen.getByText(/Refreshing status\. Last confirmed at/)).toBeInTheDocument();
  });

  it("preserves the last confirmed status during a transient failure", () => {
    render(
      <ProofStatusFreshness
        error={new Error("network")}
        isLive={false}
        isPolling
        isRefreshing={false}
        lastUpdated={NOW}
      />,
    );

    expect(
      screen.getByText(/Showing the last confirmed status as of/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reconnecting automatically/)).toBeInTheDocument();
  });

  it("reports a terminal status when polling has stopped", () => {
    render(
      <ProofStatusFreshness
        error={null}
        isLive
        isPolling={false}
        isRefreshing={false}
        lastUpdated={NOW}
      />,
    );

    expect(screen.getByText(/Final status\. Last confirmed at/)).toBeInTheDocument();
  });
});
