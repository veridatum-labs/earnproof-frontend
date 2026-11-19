"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readStoredSession } from "@/lib/session";
import { useSessionToken } from "@/lib/use-session";
import { purgeRevokedSession } from "@/lib/sessions/logout";
import { listActiveSessions, listRecentlyRevokedSessions, type SessionRecord } from "@/lib/sessions/store";
import { SessionRiskHistory } from "./session-risk-history";
import { SessionList } from "./session-list";
import { RecentAuthExplainer } from "@/components/auth/recent-auth-explainer";

export interface SessionManagementProps { organizationId?: string; viewerOrganizationId?: string; lastVerifiedAtMs?: number | null }
export function SessionManagement(props: SessionManagementProps = {}) {
  const token = useSessionToken();
  return token ? <SessionWorkspace key={token} {...props} /> : <p role="alert">Authentication required. Connect your wallet to view sessions.</p>;
}
function SessionWorkspace({ lastVerifiedAtMs, organizationId, viewerOrganizationId }: SessionManagementProps) {
  const [session] = useState(() => readStoredSession()!);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [revoked, setRevoked] = useState<SessionRecord[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort(); const c = new AbortController(); request.current = c;
    setLoading(true); setError(null);
    setSessions([]); setRevoked([]); setVisibleCount(10);
    try {
      const [activeRows, revokedRows] = await Promise.all([listActiveSessions(session.user.id, c.signal), organizationId ? listRecentlyRevokedSessions(session.user.id, c.signal) : Promise.resolve([])]);
      if (c.signal.aborted) return;
      setSessions(activeRows); setRevoked(revokedRows);
    } catch {
      if (!c.signal.aborted) { setSessions([]); setError("Could not load server sessions. Refresh to retry."); }
    } finally { if (!c.signal.aborted) setLoading(false); }
  }, [session.user.id, organizationId]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    const focus = () => void load(); window.addEventListener("focus", focus);
    return () => { active = false; request.current?.abort(); window.removeEventListener("focus", focus); };
  }, [load]);
  function logout() {
    request.current?.abort();
    // Replace the document so no protected React or other module cache survives.
    void purgeRevokedSession().then(() => window.location.replace("/proofs"));
  }
  return <div className="grid gap-6" aria-busy={loading}>
    <RecentAuthExplainer lastVerifiedAtMs={lastVerifiedAtMs ?? null} />
    <h2 className="text-xl font-semibold text-white">Active Sessions</h2>
    <button type="button" disabled={loading} onClick={() => void load()}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading sessions...</p>}
    <SessionList userId={session.user.id} sessions={sessions.slice(0, visibleCount)} loading={loading} onSessionsChanged={() => void load()} onCurrentSessionRevoked={logout} />
    <p role="status">Showing {Math.min(visibleCount, sessions.length)} of {sessions.length} server sessions.</p>
    {visibleCount < sessions.length && <button type="button" disabled={loading} onClick={() => setVisibleCount(count => count + 10)}>Load more sessions</button>}
    {organizationId && <SessionRiskHistory userId={session.user.id} organizationId={organizationId} viewerOrganizationId={viewerOrganizationId ?? organizationId} activeSessions={sessions} revokedSessions={revoked} onRemoteSignOutCompleted={() => void load()} />}
  </div>;
}
