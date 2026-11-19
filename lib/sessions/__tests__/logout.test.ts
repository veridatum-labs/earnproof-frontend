import { purgeRevokedSession } from "../logout";
import { clearStoredSession } from "@/lib/session";
import { clearPendingRequests } from "@/lib/network/request-dedup";
jest.mock("@/lib/session", () => ({ clearStoredSession: jest.fn() }));
jest.mock("@/lib/network/request-dedup", () => ({ clearPendingRequests: jest.fn() }));
it("clears legacy/protected app data, pending requests and origin caches before resolving", async () => {
  localStorage.setItem("earnproof.private-proof-cache", "synthetic"); sessionStorage.setItem("earnproof:wallet-draft", "synthetic"); localStorage.setItem("another-app-preference", "preserved");
  const remove = jest.fn(async () => true);
  Object.defineProperty(window, "caches", { configurable: true, value: { keys: async () => ["api-cache"], delete: remove } });
  await purgeRevokedSession();
  expect(clearStoredSession).toHaveBeenCalled(); expect(clearPendingRequests).toHaveBeenCalled(); expect(localStorage.getItem("earnproof.private-proof-cache")).toBeNull(); expect(sessionStorage.getItem("earnproof:wallet-draft")).toBeNull(); expect(localStorage.getItem("another-app-preference")).toBe("preserved"); expect(remove).toHaveBeenCalledWith("api-cache");
  Reflect.deleteProperty(window, "caches");
});
