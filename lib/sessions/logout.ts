import { clearStoredSession } from "@/lib/session";
import { clearPendingRequests } from "@/lib/network/request-dedup";

/** Complete current-device logout after POST /auth/logout was confirmed. */
export async function purgeRevokedSession(): Promise<void> {
  clearStoredSession();
  clearPendingRequests();
  if (typeof window === "undefined") return;
  // Include legacy stores, which clearAllStorage's envelope-only list omits.
  for (const getStore of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = getStore();
      const keys = Array.from({ length: store.length }, (_, index) => store.key(index));
      for (const key of keys) if (key && /^earnproof[.:]/.test(key)) store.removeItem(key);
    } catch { /* Storage unavailable: it cannot be read by this document either. */ }
  }
  if ("caches" in window) {
    try { await Promise.all((await window.caches.keys()).map(key => window.caches.delete(key))); }
    catch { /* Browser cache access may be disabled; authenticated fetches use no-store. */ }
  }
}
