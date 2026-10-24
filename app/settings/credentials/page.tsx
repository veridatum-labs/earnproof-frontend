"use client";

import { useState, useEffect, useRef } from "react";
import { useAuthSession } from "@/lib/auth/auth-context";
import {
  getQuarantinedCredentials,
  approveQuarantinedCredential,
  rejectQuarantinedCredential,
  refreshQuarantineEvidence,
  deleteQuarantineRecord,
  type QuarantineMetadata,
  type QuarantineStatus,
  describeQuarantineReason,
  getQuarantineStatusInfo,
} from "@/lib/api/quarantine";
import { PageHeading } from "@/components/common/page-heading";
import { pageContainer } from "@/components/common/production-ui";
import { SettingsNavigation } from "@/components/settings/settings-navigation";
import { PublicShell } from "@/components/layout/public-shell";

export default function CredentialQuarantinePage() {
  const { token } = useAuthSession();
  const [credentials, setCredentials] = useState<QuarantineMetadata[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<QuarantineMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuarantineStatus | "all">("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const loadCredentialsRef = useRef<((cursor?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    async function loadCredentials(cursor?: string) {
      if (!token) return;

      setIsLoading(true);
      setError(null);
      try {
        const response = await getQuarantinedCredentials(
          token,
          20,
          cursor === nextCursor ? nextCursor : undefined,
          cursor === previousCursor ? previousCursor : undefined,
          statusFilter === "all" ? undefined : statusFilter
        );
        setCredentials(response.items);
        setNextCursor(response.nextCursor);
        setPreviousCursor(response.previousCursor);
      } catch (err) {
        setError("Failed to load quarantined credentials");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    loadCredentialsRef.current = loadCredentials;
    loadCredentials();
  }, [token, statusFilter, nextCursor, previousCursor]);

  async function handleApprove(credentialId: string) {
    if (!token) return;
    setActionLoading(credentialId);
    try {
      await approveQuarantinedCredential(token, credentialId, {});
      await loadCredentialsRef.current?.();
      if (selectedCredential?.credentialId === credentialId) {
        setSelectedCredential(null);
      }
    } catch (err) {
      setError("Failed to approve credential");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(credentialId: string, reason: string) {
    if (!token) return;
    setActionLoading(credentialId);
    try {
      await rejectQuarantinedCredential(token, credentialId, { reason });
      await loadCredentialsRef.current?.();
      if (selectedCredential?.credentialId === credentialId) {
        setSelectedCredential(null);
      }
    } catch (err) {
      setError("Failed to reject credential");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefresh(credentialId: string) {
    if (!token) return;
    setActionLoading(credentialId);
    try {
      const response = await refreshQuarantineEvidence(token, credentialId, {});
      if (response.resolved) {
        await loadCredentialsRef.current?.();
      }
      if (selectedCredential?.credentialId === credentialId) {
        setSelectedCredential(response.metadata);
      }
    } catch (err) {
      setError("Failed to refresh evidence");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(credentialId: string) {
    if (!token) return;
    if (!confirm("Are you sure you want to delete this quarantine record?")) return;
    setActionLoading(credentialId);
    try {
      await deleteQuarantineRecord(token, credentialId);
      await loadCredentialsRef.current?.();
      if (selectedCredential?.credentialId === credentialId) {
        setSelectedCredential(null);
      }
    } catch (err) {
      setError("Failed to delete record");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <PublicShell>
      <section className={`${pageContainer} gap-8 sm:gap-10`}>
        <PageHeading
          description="Review and manage credentials quarantined due to malformed, unknown, or conflicting trust data."
          eyebrow="Credential Security"
          title="Credential Quarantine"
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SettingsNavigation />
          </div>

          <div className="lg:col-span-2 space-y-6">
            {/* Filter controls */}
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-sm font-semibold text-slate-300">
                  Filter by status:
                </label>
                <select
                  className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as QuarantineStatus | "all")}
                >
                  <option value="all">All</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                  <option value="auto_rejected">Auto-Rejected</option>
                </select>
              </div>
            </div>

            {/* Error display */}
            {error && (
              <div
                className="rounded-lg border border-rose-300/50 bg-rose-300/10 p-4 text-sm text-rose-200"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Credential list */}
            {isLoading ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-center text-slate-300">
                Loading quarantined credentials...
              </div>
            ) : credentials.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-center text-slate-300">
                No quarantined credentials found.
              </div>
            ) : (
              <div className="space-y-4">
                {credentials.map((credential) => {
                  const statusInfo = getQuarantineStatusInfo(credential.status);
                  return (
                    <div
                      key={credential.credentialId}
                      className={`rounded-lg border p-5 transition ${
                        selectedCredential?.credentialId === credential.credentialId
                          ? "border-cyan-300/50 bg-cyan-300/5"
                          : "border-white/10 bg-white/[0.04] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-medium text-white">
                              {credential.credentialId.slice(0, 16)}...
                            </h3>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                statusInfo.color === "emerald"
                                  ? "bg-emerald-300/10 text-emerald-200"
                                  : statusInfo.color === "amber"
                                    ? "bg-amber-300/10 text-amber-200"
                                    : statusInfo.color === "rose"
                                      ? "bg-rose-300/10 text-rose-200"
                                      : "bg-slate-300/10 text-slate-200"
                              }`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-300">
                            {describeQuarantineReason(credential.reason)}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            Quarantined: {new Date(credential.quarantinedAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                          onClick={() => setSelectedCredential(credential)}
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {(nextCursor || previousCursor) && (
              <div className="flex justify-between">
                <button
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!previousCursor || isLoading}
                  onClick={() => loadCredentialsRef.current?.(previousCursor || undefined)}
                >
                  Previous
                </button>
                <button
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!nextCursor || isLoading}
                  onClick={() => loadCredentialsRef.current?.(nextCursor || undefined)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Detail modal */}
        {selectedCredential && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Credential Review
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {selectedCredential.credentialId}
                  </p>
                </div>
                <button
                  className="rounded-lg border border-white/15 p-2 text-slate-300 transition-colors hover:text-white hover:border-white/30"
                  onClick={() => setSelectedCredential(null)}
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4">
                {/* Status */}
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-sm font-semibold text-slate-300">Status</h3>
                  <p className="mt-1 text-white">
                    {getQuarantineStatusInfo(selectedCredential.status).label}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {getQuarantineStatusInfo(selectedCredential.status).description}
                  </p>
                </div>

                {/* Reason */}
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-sm font-semibold text-slate-300">Quarantine Reason</h3>
                  <p className="mt-1 text-white">
                    {describeQuarantineReason(selectedCredential.reason)}
                  </p>
                </div>

                {/* Safe preview */}
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-sm font-semibold text-slate-300">Safe Metadata Preview</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Private claims have been redacted. This content is inert and cannot be executed.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-3 text-xs text-slate-300">
                    {selectedCredential.safePreview}
                  </pre>
                </div>

                {/* Evidence */}
                {selectedCredential.evidence && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <h3 className="text-sm font-semibold text-slate-300">Evidence</h3>
                    <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-3 text-xs text-slate-300">
                      {JSON.stringify(selectedCredential.evidence, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Timestamps */}
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-sm font-semibold text-slate-300">Timestamps</h3>
                  <div className="mt-2 space-y-1 text-sm text-slate-300">
                    <p>Quarantined: {new Date(selectedCredential.quarantinedAt).toLocaleString()}</p>
                    {selectedCredential.expiresAt && (
                      <p>Expires: {new Date(selectedCredential.expiresAt).toLocaleString()}</p>
                    )}
                    {selectedCredential.reviewedAt && (
                      <p>Reviewed: {new Date(selectedCredential.reviewedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {selectedCredential.status === "pending_review" && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={actionLoading === selectedCredential.credentialId}
                      onClick={() => handleApprove(selectedCredential.credentialId)}
                    >
                      {actionLoading === selectedCredential.credentialId ? "Approving..." : "Approve"}
                    </button>
                    <button
                      className="rounded-lg bg-rose-300 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={actionLoading === selectedCredential.credentialId}
                      onClick={() => {
                        const reason = prompt("Enter rejection reason:");
                        if (reason) {
                          handleReject(selectedCredential.credentialId, reason);
                        }
                      }}
                    >
                      {actionLoading === selectedCredential.credentialId ? "Rejecting..." : "Reject"}
                    </button>
                    <button
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={actionLoading === selectedCredential.credentialId}
                      onClick={() => handleRefresh(selectedCredential.credentialId)}
                    >
                      {actionLoading === selectedCredential.credentialId ? "Refreshing..." : "Refresh Evidence"}
                    </button>
                  </div>
                )}

                {/* Delete action */}
                <button
                  className="w-full rounded-lg border border-rose-300/30 px-4 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-300/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={actionLoading === selectedCredential.credentialId}
                  onClick={() => handleDelete(selectedCredential.credentialId)}
                >
                  {actionLoading === selectedCredential.credentialId ? "Deleting..." : "Delete Record"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </PublicShell>
  );
}
