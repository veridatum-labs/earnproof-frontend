"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/common/confirmation-dialog";
import {
  deleteTrustedSource,
  updateTrustedSource,
  testTrustedSource,
  getTrustedSourceHistory,
  type TrustedSourceRecord,
} from "@/lib/trusted-sources/store";
import { formatDate, formatMessage } from "@/lib/i18n";
import type { Issuer } from "@/lib/api/generated/v1";

export function TrustedSourceList({
  userId,
  trustedSources,
  issuers,
  loading,
  onTrustedSourceUpdated,
  onTrustedSourceDeleted,
}: {
  userId: string;
  trustedSources: TrustedSourceRecord[];
  issuers: Issuer[];
  loading: boolean;
  onTrustedSourceUpdated: (record: TrustedSourceRecord) => void;
  onTrustedSourceDeleted: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIssuerId, setEditIssuerId] = useState("");
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [userId]);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
    version: number;
  } | null>(null);

  // Remembers which row's delete button triggered the confirmation dialog,
  // so focus can return to that exact button once the dialog closes —
  // rather than falling back to document body (#135's "restore focus
  // predictably" acceptance criterion).
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);

  const issuerName = useCallback(
    (issuerId: string) => issuers.find((i) => i.id === issuerId)?.name ?? "Unknown issuer",
    [issuers],
  );

  const startEdit = (record: TrustedSourceRecord) => {
    setEditingId(record.id);
    setEditName(record.name);
    setEditIssuerId(record.issuerId);
    setEditVersion(record.version);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    if (busy.current || needsRefresh || editVersion === null) return;
    busy.current = true; setPending(true);
    setError(null);
    try {
      if (!editIssuerId) {
        setError("An issuer must be selected.");
        return;
      }
      const signal = lifetime.current!.signal;
      const updated = await updateTrustedSource(userId, id, {
        name: editName,
        issuerId: editIssuerId,
      }, editVersion, signal);
      if (signal.aborted) return;
      onTrustedSourceUpdated(updated);
      setEditingId(null);
    } catch {
      setNeedsRefresh(true);
      setError("Update was not confirmed or the source changed. Refresh before retrying.");
    } finally {
      busy.current = false; setPending(false);
    }
  };

  const handleDeleteClick = (
    record: TrustedSourceRecord,
    trigger: HTMLButtonElement,
  ) => {
    deleteTriggerRef.current = trigger;
    setConfirmDelete({ id: record.id, name: record.name, version: record.version });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || busy.current || needsRefresh) return;
    busy.current = true; setPending(true);
    try {
      const source = trustedSources.find(item => item.id === confirmDelete.id);
      if (!source) throw new Error("Refresh required");
      const signal = lifetime.current!.signal;
      await deleteTrustedSource(userId, confirmDelete.id, confirmDelete.version, signal);
      if (signal.aborted) return;
      onTrustedSourceDeleted(confirmDelete.id);
    } catch {
      setNeedsRefresh(true);
      setError("Disable was not confirmed. Refresh before retrying.");
    } finally {
      busy.current = false; setPending(false);
      setConfirmDelete(null);
      deleteTriggerRef.current?.focus();
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
    deleteTriggerRef.current?.focus();
  };

  if (loading && trustedSources.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-slate-950 p-4 text-center">
        <p className="text-sm text-slate-400">Loading trusted sources...</p>
      </div>
    );
  }

  if (trustedSources.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-slate-950 p-4 text-center">
        <p className="text-sm text-slate-400">
          No trusted sources yet. Add your first one above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3" aria-busy={pending}>
        {pending && <p role="status">Updating server source...</p>}
        {error && (
          <div className="rounded-md border border-rose-300/30 bg-rose-300/10 p-3">
            <p className="text-sm text-rose-200" role="alert">
              {error}
            </p>
          </div>
        )}

        <div className="hidden grid-cols-[2fr_1.5fr_1fr_auto] gap-4 border-b border-white/10 pb-2 text-xs font-semibold uppercase text-slate-400 md:grid">
          <div>Name</div>
          <div>Linked issuer</div>
          <div>Updated</div>
          <div>Actions</div>
        </div>

        {trustedSources.map((record) =>
          editingId === record.id ? (
            <div
              key={record.id}
              className="grid gap-3 rounded-md border border-cyan-300/30 bg-slate-950 p-4 text-sm md:grid-cols-[2fr_1.5fr_1fr_auto] md:items-center md:gap-4"
            >
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-label="Trusted source name"
                className="h-9 rounded-md border border-white/15 bg-slate-900 px-3 text-sm text-white focus:border-cyan-300/50 focus:outline-none"
              />
              <select
                value={editIssuerId}
                onChange={(e) => setEditIssuerId(e.target.value)}
                aria-label="Linked issuer"
                className="h-9 rounded-md border border-white/15 bg-slate-900 px-3 text-sm text-white focus:border-cyan-300/50 focus:outline-none"
              >
                {issuers.map((issuer) => (
                  <option key={issuer.id} value={issuer.id}>
                    {issuer.name}
                  </option>
                ))}
              </select>
              <div className="text-slate-400">
                {formatDate(record.updatedAt)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(record.id)}
                  disabled={pending || needsRefresh}
                  className="h-8 rounded border border-emerald-300/30 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-300/10 transition"
                  type="button"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="h-8 rounded border border-white/15 px-3 text-xs font-medium text-white hover:bg-white/5 transition"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={record.id}
              className="grid gap-3 rounded-md border border-white/10 bg-slate-950 p-4 text-sm md:grid-cols-[2fr_1.5fr_1fr_auto] md:items-center md:gap-4"
            >
              <div className="min-w-0 font-medium text-white">{record.name} <span>{record.status}</span><SourceDiagnostics key={`${record.id}:${record.version}`} userId={userId} record={record} /></div>
              <div className="min-w-0 text-slate-300">{issuerName(record.issuerId)}</div>
              <div className="text-slate-400">
                {formatDate(record.updatedAt)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(record)}
                  disabled={pending || needsRefresh || record.status !== "ACTIVE"}
                  className="h-8 rounded border border-cyan-300/30 px-3 text-xs font-medium text-cyan-200 hover:bg-cyan-300/10 transition"
                  type="button"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => handleDeleteClick(record, e.currentTarget)}
                  disabled={pending || needsRefresh || record.status !== "ACTIVE"}
                  className="h-8 rounded border border-rose-300/30 px-3 text-xs font-medium text-rose-200 hover:bg-rose-300/10 transition"
                  type="button"
                >
                  Disable
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {confirmDelete && (
        <ConfirmationDialog
          title="Disable Trusted Source"
          message={formatMessage(
            'Disable "{name}"? It will no longer be eligible for trust decisions.',
            { name: confirmDelete.name },
          )}
          confirmText="Disable"
          confirmVariant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </>
  );
}

function SourceDiagnostics({ userId, record }: { userId: string; record: TrustedSourceRecord }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  async function run(history: boolean) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(null);
    const signal = lifetime.current!.signal;
    try {
      const message = history
        ? (await getTrustedSourceHistory(userId, record.id, signal)).map(event => `${event.action} v${event.version} ${event.occurredAt}`).join("; ") || "No server history."
        : (await testTrustedSource(userId, record, signal)).eligible ? "Server connection test passed." : "Server connection test failed; source is not eligible.";
      if (!signal.aborted) setMessage(message);
    } catch { if (!signal.aborted) setMessage("Server diagnostics unavailable. Refresh the source before retrying."); }
    finally { busy.current = false; if (!signal.aborted) setPending(false); }
  }
  return <div className="grid gap-2 text-xs">
    <button type="button" disabled={pending || record.status !== "ACTIVE"} onClick={() => void run(false)}>Test source</button>
    <button type="button" disabled={pending} onClick={() => void run(true)}>View source history</button>
    <p role="status">{pending ? "Loading server diagnostics..." : message}</p>
  </div>;
}
