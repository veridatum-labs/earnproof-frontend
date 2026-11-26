import { clearStoredSession } from "@/lib/session";
import { clearPendingRequests } from "@/lib/network/request-dedup";
import { clearAllStorage } from "@/lib/storage";

/** Drop the old account's browser state only after server-confirmed rotation. */
export async function clearRotatedAccount(): Promise<void> {
  clearStoredSession("wallet_changed");
  clearPendingRequests();
  clearAllStorage();
  if (typeof window === "undefined") return;
  for (const getStore of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = getStore();
      const keys = Array.from({ length: store.length }, (_, index) => store.key(index));
      for (const key of keys) if (key && /^earnproof[.:]/.test(key)) store.removeItem(key);
    } catch { /* Storage may be disabled. */ }
  }
  if ("caches" in window) {
    try { await Promise.all((await window.caches.keys()).map(key => window.caches.delete(key))); }
    catch { /* API requests use no-store when browser cache access is disabled. */ }
  }
}
