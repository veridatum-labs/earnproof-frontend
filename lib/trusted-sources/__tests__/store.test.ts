import { apiClient } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { listTrustedSources, createTrustedSource, updateTrustedSource, disableTrustedSource, testTrustedSource, getTrustedSourceHistory, isTrustedSourceEligible } from "../store";
jest.mock("@/lib/api/client", () => ({ apiClient: jest.fn(), bearer: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
jest.mock("@/lib/session", () => ({ readStoredSession: jest.fn() }));
const api = jest.mocked(apiClient);
const record = { id: "source-1", organizationId: "org-1", name: "Synthetic payroll", issuerId: "issuer-1", network: "testnet" as const, status: "ACTIVE" as const, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); localStorage.setItem("earnproof.current-organization-id", "org-1"); jest.mocked(readStoredSession).mockReturnValue({ token: "synthetic-auth", user: { id: "user-1", role: "ADMIN", walletAddress: "synthetic-wallet", walletHash: "synthetic-hash" } }); });
it("ignores local registry data and reads tenant-authorized server sources", async () => {
  localStorage.setItem("earnproof.trusted-sources.user-1", JSON.stringify([record])); api.mockResolvedValue({ sources: [] });
  expect(await listTrustedSources("user-1")).toEqual([]);
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ path: "/organizations/org-1/trusted-sources", headers: expect.objectContaining({ Authorization: "Bearer synthetic-auth" }) }));
});
it("rejects cross-tenant and wrong-network responses", async () => {
  for (const patch of [{ organizationId: "org-2" }, { network: "public" }]) { api.mockResolvedValue({ sources: [{ ...record, ...patch }] }); await expect(listTrustedSources("user-1")).rejects.toThrow("scope mismatch"); }
});
it("removes deleted entries and never treats disabled or mismatched issuers as eligible", async () => {
  api.mockResolvedValue({ sources: [{ ...record, status: "DELETED" }, { ...record, id: "source-2", status: "DISABLED" }] });
  const records = await listTrustedSources("user-1"); expect(records).toHaveLength(1); expect(isTrustedSourceEligible(records[0], "issuer-1")).toBe(false); expect(isTrustedSourceEligible(record, "other-issuer")).toBe(false);
});
it("validates creation and rejects server issuer substitution", async () => {
  api.mockResolvedValue({ ...record, issuerId: "other" }); await expect(createTrustedSource("user-1", { name: record.name, issuerId: "issuer-1" })).rejects.toThrow("scope mismatch");
  await expect(createTrustedSource("user-1", { name: "", issuerId: "" })).rejects.toThrow();
});
it("uses If-Match and requires a newer server version", async () => {
  api.mockResolvedValue({ ...record, version: 2 }); await updateTrustedSource("user-1", record.id, { name: record.name }, 1);
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "If-Match": '"1"' }) }));
  api.mockResolvedValue(record); await expect(updateTrustedSource("user-1", record.id, { name: record.name }, 1)).rejects.toThrow("Stale");
});
it("requires a confirmed disabled state and does not retry conflicts", async () => {
  api.mockResolvedValue({ ...record, version: 2, status: "DISABLED" }); expect((await disableTrustedSource("user-1", record.id, 1)).status).toBe("DISABLED");
  api.mockRejectedValue(new Error("Conflict")); await expect(disableTrustedSource("user-1", record.id, 1)).rejects.toThrow("Conflict"); expect(api).toHaveBeenCalledTimes(2);
});
it("fails before a request for missing tenant or unauthorized account", async () => {
  await expect(listTrustedSources("other-user")).rejects.toThrow(); localStorage.clear(); await expect(listTrustedSources("user-1")).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
});
it("validates test scope/version and only exposes allowlisted history", async () => {
  api.mockResolvedValue({ source: record, eligible: true, testedAt: "2026-01-02T00:00:00.000Z" }); expect((await testTrustedSource("user-1", record)).eligible).toBe(true);
  api.mockResolvedValue({ source: { ...record, version: 2 }, eligible: true, testedAt: "2026-01-02T00:00:00.000Z" }); await expect(testTrustedSource("user-1", record)).rejects.toThrow();
  api.mockResolvedValue({ organizationId: "org-1", sourceId: "source-1", events: [{ id: "event-1", action: "TEST", version: 1, occurredAt: "2026-01-02T00:00:00.000Z", secret: "private" }] }); expect((await getTrustedSourceHistory("user-1", record.id))[0]).not.toHaveProperty("secret");
});
it("forwards cancellation and rejects a tenant change during the request", async () => {
  const controller = new AbortController(); api.mockImplementationOnce(async () => { localStorage.setItem("earnproof.current-organization-id", "other"); return { sources: [record] }; });
  await expect(listTrustedSources("user-1", controller.signal)).rejects.toThrow("scope mismatch"); expect(api).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
});
