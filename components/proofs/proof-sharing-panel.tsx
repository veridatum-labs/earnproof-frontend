"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionToken } from "@/lib/use-session";
import { CreateShareLinkForm } from "./create-share-link-form";
import { ShareLinkTokenReveal } from "./share-link-token-reveal";
import { ShareLinkList } from "./share-link-list";
import { createShareLink, revokeShareLink, listShareLinks, type ShareLinkRecord, type ShareLinkWithStatus } from "@/lib/proof-sharing/store";
import { computeShareLinkStatus } from "@/lib/validation/proof-sharing";

export function ProofSharingPanel({ proofId, userId }: { proofId: string; userId: string }) {
  const token = useSessionToken();
  // Changing auth/proof scope unmounts all sensitive state and aborts its requests.
  return <SharingWorkspace key={`${userId}:${proofId}:${token ?? "signed-out"}`} proofId={proofId} userId={userId} authenticated={Boolean(token)} />;
}

function SharingWorkspace({ proofId, userId, authenticated }: { proofId: string; userId: string; authenticated: boolean }) {
  const [links, setLinks] = useState<ShareLinkWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<{ token: string; record: ShareLinkRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const intent = useRef<{ input: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    reading.current?.abort();
    const request = new AbortController();
    reading.current = request;
    setLinks([]); setRevealedToken(null); setLoading(true);
    try {
      const next = await listShareLinks(userId, proofId, request.signal);
      if (!request.signal.aborted) { setLinks(next); setError(null); return next; }
    } catch {
      if (!request.signal.aborted) setError("Could not load server share links. Refresh to retry.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [userId, proofId]);

  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    void Promise.resolve().then(() => {
      if (authenticated && !controller.signal.aborted) void refresh();
    });
    const onFocus = () => { if (!busy.current && authenticated) void refresh(); };
    window.addEventListener("focus", onFocus);
    // Expiry is inclusive and is re-evaluated without requiring a reload.
    const tick = window.setInterval(() => {
      setLinks(previous => previous.map(link => ({ ...link, status: computeShareLinkStatus(link.expiresAt, link.revokedAt) })));
      setRevealedToken(previous => previous && computeShareLinkStatus(previous.record.expiresAt, previous.record.revokedAt) === "ACTIVE" ? previous : null);
    }, 1000);
    return () => { controller.abort(); reading.current?.abort(); window.clearInterval(tick); window.removeEventListener("focus", onFocus); };
  }, [authenticated, refresh]);

  async function handleCreate(input: { expiresInHours: number; discloseAmount: boolean; discloseSender: boolean }) {
    if (busy.current) return;
    busy.current = true; setCreating(true); setError(null); reading.current?.abort();
    const fingerprint = JSON.stringify(input);
    if (intent.current?.input !== fingerprint) intent.current = { input: fingerprint, key: crypto.randomUUID() };
    const signal = lifecycle.current!.signal;
    try {
      const created = await createShareLink(userId, { proofId, ...input }, signal, intent.current!.key);
      if (signal.aborted) return;
      intent.current = null;
      const confirmed = await refresh();
      if (!signal.aborted && confirmed?.some(link => link.id === created.record.id && link.status === "ACTIVE")) setRevealedToken(created);
    } catch {
      if (!signal.aborted) { setLinks([]); setError("Creation was not confirmed. Refresh the server list before retrying; a retry of the same policy uses the same request key."); }
    } finally {
      busy.current = false; if (!signal.aborted) setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (busy.current) return;
    busy.current = true; setRevokingId(id); setError(null); reading.current?.abort();
    // Hide stale usability immediately; only a fresh server read can restore it.
    setLinks([]); setRevealedToken(null);
    const signal = lifecycle.current!.signal;
    try {
      await revokeShareLink(userId, proofId, id, signal);
      if (!signal.aborted) await refresh();
    } catch {
      if (!signal.aborted) setError("Revocation was not confirmed. Refresh to check the server state.");
    } finally {
      busy.current = false; if (!signal.aborted) setRevokingId(null);
    }
  }

  if (!authenticated) return <p role="alert">Connect your wallet to manage share links.</p>;
  return <div className="grid gap-6" aria-busy={loading || creating || Boolean(revokingId)}>
    {revealedToken ? <ShareLinkTokenReveal token={revealedToken.token} expiresAt={revealedToken.record.expiresAt} onDismiss={() => setRevealedToken(null)} /> : <CreateShareLinkForm onCreate={input => void handleCreate(input)} creating={creating || loading || Boolean(revokingId)} />}
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
    <button type="button" onClick={() => void refresh()} disabled={loading || creating || Boolean(revokingId)}>Refresh share links</button>
    <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-xl font-semibold text-white">Share links</h2>
      {loading ? <p role="status">Loading server share links...</p> : <ShareLinkList links={links} onRevoke={id => void handleRevoke(id)} revokingId={revokingId} userId={userId} />}
    </section>
  </div>;
}
