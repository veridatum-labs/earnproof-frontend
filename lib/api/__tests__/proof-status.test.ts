import { apiClient } from "@/lib/api/client";
import {
  computeBackoffDelayMs,
  fetchProofStatus,
  isTerminalProofStatus,
  normalizeProofStatus,
} from "@/lib/api/proof-status";

jest.mock("@/lib/api/client");
const mockApiClient = apiClient as jest.MockedFunction<typeof apiClient>;

describe("normalizeProofStatus", () => {
  it.each([
    ["pending", "pending"],
    ["issued", "pending"],
    ["anchoring", "pending"],
    ["anchored", "anchored"],
    ["confirmed", "anchored"],
    ["valid", "valid"],
    ["active", "valid"],
    ["expired", "expired"],
    ["revoked", "revoked"],
    ["invalid", "invalid"],
    ["INVALID_SIGNATURE", "invalid"],
    ["unknown", "unknown"],
    ["something-new", "unknown"],
    ["", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
  ] as const)("maps %p to %p", (input, expected) => {
    expect(normalizeProofStatus(input)).toBe(expected);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeProofStatus("  ReVoKeD  ")).toBe("revoked");
  });
});

describe("isTerminalProofStatus", () => {
  it.each(["revoked", "expired", "invalid", "INVALID_SIGNATURE"])(
    "treats %p as terminal",
    (status) => {
      expect(isTerminalProofStatus(status)).toBe(true);
    },
  );

  it.each(["pending", "anchored", "valid", "unknown"])(
    "treats %p as non-terminal so refreshing continues",
    (status) => {
      expect(isTerminalProofStatus(status)).toBe(false);
    },
  );
});

describe("computeBackoffDelayMs", () => {
  const bounds = { baseMs: 1000, maxMs: 4000 };

  it("grows exponentially from the base delay", () => {
    expect(computeBackoffDelayMs(1, bounds)).toBe(1000);
    expect(computeBackoffDelayMs(2, bounds)).toBe(2000);
    expect(computeBackoffDelayMs(3, bounds)).toBe(4000);
  });

  it("never exceeds the maximum delay", () => {
    expect(computeBackoffDelayMs(4, bounds)).toBe(4000);
    expect(computeBackoffDelayMs(50, bounds)).toBe(4000);
  });

  it("handles boundary failure counts defensively", () => {
    expect(computeBackoffDelayMs(0, bounds)).toBe(1000);
    expect(computeBackoffDelayMs(-5, bounds)).toBe(1000);
  });

  it("keeps the maximum at least as large as the base", () => {
    expect(computeBackoffDelayMs(10, { baseMs: 5000, maxMs: 100 })).toBe(5000);
  });
});

describe("fetchProofStatus", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
  });

  it("encodes the proof id and normalizes the verification response", async () => {
    mockApiClient.mockResolvedValue({
      result: "REVOKED",
      status: "revoked",
      proof: {
        id: "ep_1",
        type: "MINIMUM_INCOME",
        schemaVersion: "1.0",
        network: "testnet",
        issuedAt: "2026-08-20T10:00:00.000Z",
        expiresAt: "2026-09-19T10:00:00.000Z",
        revokedAt: "2026-08-25T10:00:00.000Z",
      },
    });

    const controller = new AbortController();
    const snapshot = await fetchProofStatus("ep/1 & 2", controller.signal);

    expect(mockApiClient).toHaveBeenCalledWith({
      path: `/proofs/${encodeURIComponent("ep/1 & 2")}/verify`,
      method: "GET",
      signal: controller.signal,
    });
    expect(snapshot.proofId).toBe("ep/1 & 2");
    expect(snapshot.status).toBe("revoked");
    expect(snapshot.revokedAt).toBe("2026-08-25T10:00:00.000Z");
  });

  it("returns a null revocation date when the proof has not been revoked", async () => {
    mockApiClient.mockResolvedValue({ result: "VALID", status: "valid" });

    const snapshot = await fetchProofStatus("ep_2");

    expect(snapshot.status).toBe("valid");
    expect(snapshot.revokedAt).toBeNull();
  });

  it("propagates request failures so the caller can back off", async () => {
    const failure = new Error("EarnProof API request failed with 503");
    mockApiClient.mockRejectedValue(failure);

    await expect(fetchProofStatus("ep_3")).rejects.toBe(failure);
  });
});
