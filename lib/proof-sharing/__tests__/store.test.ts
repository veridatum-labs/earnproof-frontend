import { apiClient } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { listShareLinks, createShareLink, revokeShareLink, getShareLinkAccessSummary } from "../store";
jest.mock("@/lib/api/client", () => ({ apiClient: jest.fn(), bearer: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
jest.mock("@/lib/session", () => ({ readStoredSession: jest.fn() }));
const api = jest.mocked(apiClient);
const record = { id: "share-1", proofId: "proof-1", expiresInHours: 24, expiresAt: "2099-01-02T00:00:00.000Z", createdAt: "2099-01-01T00:00:00.000Z", revokedAt: null, discloseAmount: false, discloseSender: false };
const input = { proofId: "proof-1", expiresInHours: 24, discloseAmount: false, discloseSender: false };
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  jest.mocked(readStoredSession).mockReturnValue({ token: "synthetic-auth", user: { id: "user-1", role: "WORKER", walletAddress: "synthetic-wallet", walletHash: "synthetic-hash" } });
});
it("reads the server on every listing and ignores forged local records", async () => {
  localStorage.setItem("earnproof.proof-share-links.user-1", JSON.stringify([{ ...record, id: "forged" }]));
  api.mockResolvedValue({ links: [{ ...record, token: "must-be-stripped" }] });
  expect(await listShareLinks("user-1", "proof-1")).toEqual([{ ...record, status: "ACTIVE" }]);
  api.mockResolvedValueOnce({ links: [{ ...record, revokedAt: "2099-01-01T00:00:00.000Z" }] });
  expect((await listShareLinks("user-1", "proof-1"))[0].status).toBe("REVOKED");
  expect(api).toHaveBeenCalledTimes(2);
  expect(api.mock.calls[0][0]).toMatchObject({ path: "/proofs/proof-1/share-links", headers: { Authorization: "Bearer synthetic-auth" } });
});
it("returns the one-time token without persisting it and binds creation retries to the supplied key", async () => {
  api.mockResolvedValue({ record, token: "synthetic-one-time-token" });
  expect((await createShareLink("user-1", input, undefined, "intent-1")).token).toBe("synthetic-one-time-token");
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "intent-1" }) }));
  expect(localStorage.length).toBe(0);
});
it("does not interpret a replay without a token as a fresh creation", async () => {
  api.mockResolvedValue({ record });
  await expect(createShareLink("user-1", input)).rejects.toThrow();
});
it("rejects a broader disclosure or a longer expiry than the user approved", async () => {
  for (const patch of [{ discloseAmount: true }, { discloseSender: true }, { expiresInHours: 168 }, { expiresAt: "2099-01-03T00:00:00.000Z" }]) {
    api.mockResolvedValue({ token: "synthetic-private-token", record: { ...record, ...patch } });
    await expect(createShareLink("user-1", input)).rejects.toThrow("policy");
  }
  expect(localStorage.length).toBe(0);
});
it("validates policy before sending and rejects wrong proof scopes", async () => {
  await expect(createShareLink("user-1", { ...input, expiresInHours: -1 })).rejects.toThrow();
  expect(api).not.toHaveBeenCalled();
  api.mockResolvedValue({ links: [{ ...record, proofId: "other-proof" }] });
  await expect(listShareLinks("user-1", "proof-1")).rejects.toThrow("scope mismatch");
});
it("fails closed on invalid timestamps and exact expiry", async () => {
  api.mockResolvedValue({ links: [{ ...record, expiresAt: "invalid" }] });
  await expect(listShareLinks("user-1", "proof-1")).rejects.toThrow();
  jest.spyOn(Date, "now").mockReturnValue(Date.parse(record.expiresAt));
  api.mockResolvedValue({ links: [record] });
  expect((await listShareLinks("user-1", "proof-1"))[0].status).toBe("EXPIRED");
  jest.restoreAllMocks();
});
it("rejects unauthorized users without a request and propagates server authorization errors", async () => {
  await expect(listShareLinks("other-user", "proof-1")).rejects.toThrow("Authentication required");
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValue(new Error("Forbidden"));
  await expect(listShareLinks("user-1", "proof-1")).rejects.toThrow("Forbidden");
});
it("forwards cancellation and does not retry a mutation", async () => {
  const c = new AbortController();
  api.mockRejectedValue(new DOMException("Aborted", "AbortError"));
  await expect(revokeShareLink("user-1", "proof-1", "share-1", c.signal)).rejects.toThrow();
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ signal: c.signal, method: "DELETE", allowEmptyBody: true }));
});
it("loads only validated server access summaries", async () => {
  const summary = { shareLinkId: "share-1", totalAttempts: 3, acceptedCount: 0, expiredCount: 0, rejectedCount: 3, recent: [], rawToken: "private" };
  api.mockResolvedValue(summary);
  const result = await getShareLinkAccessSummary("user-1", "proof-1", record);
  expect(result.flaggedAsSuspicious).toBe(true); expect(result).not.toHaveProperty("rawToken");
  api.mockResolvedValue({ ...summary, totalAttempts: 99 });
  await expect(getShareLinkAccessSummary("user-1", "proof-1", record)).rejects.toThrow();
});
