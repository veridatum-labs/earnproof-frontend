import { apiClient } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { listActiveSessions, listRecentlyRevokedSessions, revokeSession, revokeAllOtherSessions } from "../store";
jest.mock("@/lib/api/client", () => ({ apiClient: jest.fn(), bearer: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
jest.mock("@/lib/session", () => ({ readStoredSession: jest.fn() }));
const api = jest.mocked(apiClient);
const record = { id: "session-1", deviceLabel: "Linux - Firefox", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-02T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, isCurrent: true };
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); jest.mocked(readStoredSession).mockReturnValue({ token: "synthetic-auth", user: { id: "user-1", role: "WORKER", walletAddress: "synthetic-wallet", walletHash: "synthetic-hash" } }); });
it("reads the actual envelope response and strips private metadata", async () => {
  localStorage.setItem("earnproof.sessions.user-1", "forged-data"); api.mockResolvedValue({ sessions: [{ ...record, token: "private", userAgent: "private", deviceFingerprint: "private", ipAddress: "private" }], total: 1 });
  expect(await listActiveSessions("user-1")).toEqual([record]); expect(api.mock.calls[0][0].path).toBe("/auth/sessions");
});
it("supports the backend array response with current/firstSeenAt/lastSeenAt", async () => {
  api.mockResolvedValue([{ id: record.id, current: true, firstSeenAt: record.createdAt, lastSeenAt: record.lastUsedAt, expiresAt: record.expiresAt, revokedAt: null, deviceLabel: "Firefox on Linux on Desktop" }]); expect(await listActiveSessions("user-1")).toEqual([record]);
});
it("replaces arbitrary device labels with a coarse unknown label", async () => {
  api.mockResolvedValue([{ ...record, deviceLabel: "Mozilla/5.0 private user agent or IP" }]); expect((await listActiveSessions("user-1"))[0].deviceLabel).toBe("Unknown device - Unknown browser");
});
it("rejects conflicting current identities, duplicates and incomplete envelopes", async () => {
  for (const data of [[{ ...record, current: false }], [record, record], { sessions: [record], total: 2 }]) { api.mockResolvedValue(data); await expect(listActiveSessions("user-1")).rejects.toThrow(); }
});
it("filters expiry at the exact boundary and preserves server revocation history", async () => {
  jest.spyOn(Date, "now").mockReturnValue(Date.parse(record.expiresAt)); api.mockResolvedValue([record]); expect(await listActiveSessions("user-1")).toEqual([]); jest.restoreAllMocks();
  api.mockResolvedValue([{ ...record, revokedAt: record.lastUsedAt }]); expect(await listActiveSessions("user-1")).toEqual([]); expect(await listRecentlyRevokedSessions("user-1")).toHaveLength(1);
});
it("rejects cross-account calls before sending", async () => {
  await expect(revokeSession("other-user", "session-1")).rejects.toThrow("Authentication"); expect(api).not.toHaveBeenCalled();
});
it("uses the actual remote revocation POST and forwards cancellation", async () => {
  const controller = new AbortController(); api.mockResolvedValue({ status: "ok", revokedSessionId: record.id }); expect((await revokeSession("user-1", record.id, controller.signal)).currentSessionRevoked).toBe(false);
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ path: "/auth/sessions/session-1/revoke", method: "POST", signal: controller.signal }));
});
it("revokes this device via logout rather than the remote-session endpoint", async () => {
  api.mockResolvedValue({ status: "ok" }); expect((await revokeSession("user-1", record.id, undefined, true)).currentSessionRevoked).toBe(true); expect(api.mock.calls[0][0].path).toBe("/auth/logout");
});
it("does not retry failed mutations and validates revoke-all-other responses", async () => {
  api.mockRejectedValue(new Error("Forbidden")); await expect(revokeAllOtherSessions("user-1")).rejects.toThrow("Forbidden"); expect(api).toHaveBeenCalledTimes(1);
  api.mockResolvedValue({ status: "ok", revokedCount: 2 }); expect(await revokeAllOtherSessions("user-1")).toBe(2); expect(api).toHaveBeenLastCalledWith(expect.objectContaining({ path: "/auth/sessions/revoke-all-other" }));
});
