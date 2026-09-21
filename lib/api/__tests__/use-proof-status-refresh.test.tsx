import { act, renderHook } from "@testing-library/react";
import {
  useProofStatusRefresh,
  type ProofStatusFetcher,
} from "@/lib/api/use-proof-status-refresh";
import type { ProofStatus, ProofStatusSnapshot } from "@/lib/api/proof-status";

function snapshot(status: ProofStatus): ProofStatusSnapshot {
  return {
    proofId: "ep_1",
    status,
    revokedAt: status === "revoked" ? "2026-08-25T10:00:00.000Z" : null,
    raw: {
      result: status === "revoked" ? "REVOKED" : "VALID",
      status: "valid",
    },
  };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

const FAST = { pollIntervalMs: 1000, maxBackoffMs: 4000 };

describe("useProofStatusRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    setHidden(false);
    jest.restoreAllMocks();
  });

  it("performs an initial refresh and schedules the next poll", async () => {
    const fetcher: ProofStatusFetcher = jest.fn().mockResolvedValue(snapshot("pending"));

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );

    expect(result.current.isRefreshing).toBe(true);

    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("pending");
    expect(result.current.isLive).toBe(true);
    expect(result.current.isPolling).toBe(true);
    expect(result.current.error).toBeNull();

    await advance(1000);
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps exactly one refresh loop per proof", async () => {
    const fetcher: ProofStatusFetcher = jest.fn().mockResolvedValue(snapshot("pending"));

    renderHook(() => useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }));
    await flush();

    // Five intervals in fixed steps; a duplicated timer would over-count.
    for (let i = 0; i < 5; i += 1) {
      await advance(1000);
      await flush();
    }

    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("pauses polling while hidden and refreshes immediately when visible again", async () => {
    const fetcher: ProofStatusFetcher = jest.fn().mockResolvedValue(snapshot("pending"));

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(result.current.isPolling).toBe(false);

    await advance(60_000);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("pending");

    await act(async () => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(2);

    await advance(1000);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not start polling while mounted in a hidden tab", async () => {
    setHidden(true);
    const fetcher: ProofStatusFetcher = jest.fn().mockResolvedValue(snapshot("pending"));

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isPolling).toBe(false);

    await act(async () => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores a late response that resolves after a newer one", async () => {
    let resolveFirst: (value: ProofStatusSnapshot) => void = () => {};
    let resolveSecond: (value: ProofStatusSnapshot) => void = () => {};
    const fetcher: ProofStatusFetcher = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ProofStatusSnapshot>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ProofStatusSnapshot>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );

    act(() => {
      result.current.refresh();
    });

    await act(async () => {
      resolveSecond(snapshot("revoked"));
      await Promise.resolve();
    });
    expect(result.current.status).toBe("revoked");

    // The superseded request resolves last with older data and must lose.
    await act(async () => {
      resolveFirst(snapshot("valid"));
      await Promise.resolve();
    });
    expect(result.current.status).toBe("revoked");
    expect(result.current.isLive).toBe(true);
  });

  it("cancels the superseded request when a refresh starts", async () => {
    const signals: AbortSignal[] = [];
    const fetcher: ProofStatusFetcher = jest.fn(
      (_proofId: string, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise<ProofStatusSnapshot>(() => {});
      },
    );

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );

    act(() => {
      result.current.refresh();
    });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it.each(["revoked", "expired", "invalid"] as const)(
    "stops polling at the terminal %s state",
    async (terminalStatus) => {
      const fetcher: ProofStatusFetcher = jest
        .fn()
        .mockResolvedValue(snapshot(terminalStatus));

      const { result } = renderHook(() =>
        useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
      );
      await flush();

      expect(result.current.status).toBe(terminalStatus);
      expect(result.current.isPolling).toBe(false);

      await advance(120_000);
      await flush();

      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("backs off with an upper bound and preserves the last confirmed snapshot", async () => {
    const fetcher: ProofStatusFetcher = jest
      .fn()
      .mockResolvedValueOnce(snapshot("pending"))
      .mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );
    await flush();

    const confirmedUpdatedAt = result.current.lastUpdated;
    expect(result.current.status).toBe("pending");
    expect(fetcher).toHaveBeenCalledTimes(1);

    await advance(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("pending");
    expect(result.current.isLive).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.lastUpdated).toBe(confirmedUpdatedAt);
    expect(result.current.failureCount).toBe(1);

    await advance(1000);
    expect(fetcher).toHaveBeenCalledTimes(3);

    await advance(2000);
    expect(fetcher).toHaveBeenCalledTimes(4);

    await advance(4000);
    expect(fetcher).toHaveBeenCalledTimes(5);

    // Bounded at maxBackoffMs: the next retry is another 4s, not 8s.
    await advance(4000);
    expect(fetcher).toHaveBeenCalledTimes(6);

    expect(result.current.status).toBe("pending");
    expect(result.current.lastUpdated).toBe(confirmedUpdatedAt);
  });

  it("recovers to the steady interval after a successful retry", async () => {
    const fetcher: ProofStatusFetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(snapshot("anchored"))
      .mockResolvedValue(snapshot("anchored"));

    const { result } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );
    await flush();

    await advance(1000);
    await flush();

    expect(result.current.isLive).toBe(true);
    expect(result.current.status).toBe("anchored");
    expect(result.current.failureCount).toBe(0);

    await advance(1000);
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("clears timers and aborts in-flight work on unmount", async () => {
    const fetcher: ProofStatusFetcher = jest.fn().mockResolvedValue(snapshot("pending"));

    const { unmount } = renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", ...FAST, fetcher }),
    );
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);

    unmount();
    await advance(60_000);
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not poll when disabled or when no proof id is provided", async () => {
    const fetcher: ProofStatusFetcher = jest.fn().mockResolvedValue(snapshot("pending"));

    renderHook(() =>
      useProofStatusRefresh({ proofId: "ep_1", enabled: false, ...FAST, fetcher }),
    );
    renderHook(() =>
      useProofStatusRefresh({ proofId: null, ...FAST, fetcher }),
    );
    renderHook(() =>
      useProofStatusRefresh({ proofId: undefined, ...FAST, fetcher }),
    );

    await advance(60_000);
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
  });
});
