"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOrganizationUsage,
  getUsageLevel,
  getUsageLevelLabel,
  getUsageLevelTone,
  getUsagePercentage,
  formatUsageResource,
  type OrganizationUsage,
  type ResourceUsage,
} from "@/lib/api/organization-usage";
import { getOrganizations } from "@/lib/api/organizations";
import { StatusBadge } from "@/components/common/production-ui";
import { formatDate, formatDateTime, formatMessage } from "@/lib/i18n";
import type { Organization } from "@/lib/api/generated/v1";

const SESSION_KEY = "earnproof.session";

type SessionData = {
  token: string;
  user: { id: string; role: string };
};

function readStoredSession(): SessionData | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as SessionData;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/** How stale is "stale"? Usage data older than this is flagged in the UI. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Organization quota and usage dashboard: current usage, configured
 * limits, and reset/window context for API keys, webhooks, proofs, and
 * synchronization, plus request rate limiting (reported separately from
 * quota — see `lib/api/organization-usage.ts`).
 *
 * Server-endpoint status: `/organizations/{id}/usage` does not exist in
 * the current backend. A failed fetch renders an explicit "unavailable"
 * state; it is never rendered as if usage were zero, since those are
 * different situations a user needs to be able to tell apart.
 */
export function OrganizationUsageDashboard() {
  const [session] = useState<SessionData | null>(() => readStoredSession());
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [usage, setUsage] = useState<OrganizationUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageCheckedAt, setUsageCheckedAt] = useState<number | null>(null);

  const token = session?.token ?? null;
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "ISSUER";

  const loadOrganizations = useCallback(async () => {
    if (!token) {
      return;
    }
    setOrganizationsError(null);
    try {
      const controller = new AbortController();
      const orgs = await getOrganizations(token, controller.signal);
      setOrganizations(orgs);
      setSelectedOrgId((current) => current ?? orgs[0]?.id ?? null);
    } catch {
      setOrganizationsError("Could not load organizations. Please try again.");
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        void loadOrganizations();
      }
    });
    return () => {
      active = false;
    };
  }, [loadOrganizations]);

  const loadUsage = useCallback(async () => {
    if (!token || !selectedOrgId) {
      return;
    }
    setLoading(true);
    setUsageError(null);
    try {
      const controller = new AbortController();
      const result = await getOrganizationUsage(token, selectedOrgId, controller.signal);
      setUsage(result);
      // Captured here, in an event/effect callback rather than during
      // render, so the component body stays a pure function of props and
      // state (no impure Date.now() read in render — see `isStale` below).
      setUsageCheckedAt(Date.now());
    } catch {
      setUsage(null);
      setUsageError(
        "Usage data is unavailable right now. The organization usage service could not be reached."
      );
    } finally {
      setLoading(false);
    }
  }, [token, selectedOrgId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        void loadUsage();
      }
    });
    return () => {
      active = false;
    };
  }, [loadUsage]);

  // Pure function of state: `usageCheckedAt` is captured once per fetch (in
  // loadUsage, not during render), so this never calls an impure API like
  // Date.now() from the render body.
  const isStale =
    usage && usageCheckedAt !== null
      ? usageCheckedAt - new Date(usage.generatedAt).getTime() > STALE_AFTER_MS
      : false;

  if (!session) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Authentication Required</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Please authenticate with a Stellar wallet to view organization usage.
        </p>
        <a
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-cyan-300 px-4 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
          href="/proofs"
        >
          Connect Wallet
        </a>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-5">
        <h2 className="text-xl font-semibold text-amber-100">Access Restricted</h2>
        <p className="mt-2 text-sm leading-6 text-amber-200">
          The usage dashboard requires administrative access. Contact your administrator if you need
          access.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-white">Usage &amp; Quotas</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Current usage, configured limits, and reset windows for this organization&apos;s API
              keys, webhooks, proofs, and payment synchronization.
            </p>
          </div>
          <button
            className="h-10 rounded-md border border-white/15 px-4 text-xs font-semibold text-white disabled:opacity-50"
            disabled={loading || !selectedOrgId}
            onClick={loadUsage}
            type="button"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {organizationsError && (
          <div className="rounded-md border border-rose-300/30 bg-rose-300/10 p-3">
            <p className="text-sm text-rose-200" role="alert">
              {organizationsError}
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-200" htmlFor="usage-org-select">
            Organization
          </label>
          <select
            className="mt-1 h-10 w-full max-w-md rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white disabled:opacity-50"
            disabled={organizations.length === 0}
            id="usage-org-select"
            onChange={(event) => setSelectedOrgId(event.target.value)}
            value={selectedOrgId ?? ""}
          >
            {organizations.length === 0 && <option value="">No organizations available</option>}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {usageError && (
        <div className="rounded-md border border-rose-300/30 bg-rose-300/10 p-4" role="alert">
          <p className="text-sm text-rose-200">{usageError}</p>
        </div>
      )}

      {loading && !usage && !usageError && (
        <p className="text-sm text-slate-400">Loading usage data...</p>
      )}

      {usage && (
        <section className="grid gap-4">
          {isStale && (
            <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3" role="status">
              <p className="text-sm text-amber-100">
                {formatMessage(
                  "This usage snapshot is from {generatedAt} and may be out of date. Refresh for current numbers.",
                  { generatedAt: formatDateTime(usage.generatedAt) }
                )}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {usage.resources.map((resource) => (
              <UsageCard key={resource.resource} usage={resource} />
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-semibold text-white">Request Rate Limit</h3>
            <p className="mt-1 text-xs text-slate-400">
              Rate limiting governs request bursts and is separate from the resource quotas above —
              you can be under quota and still be rate limited, or vice versa.
            </p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-400">Limit</dt>
                <dd className="text-slate-200">
                  {formatMessage("{limit} requests / minute", { limit: usage.rateLimit.limitPerMinute })}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Remaining in window</dt>
                <dd className="text-slate-200">{usage.rateLimit.remainingInWindow}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Window resets</dt>
                <dd className="text-slate-200">{formatDateTime(usage.rateLimit.windowResetAt)}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}

function UsageCard({ usage }: { usage: ResourceUsage }) {
  const level = getUsageLevel(usage);
  const percentage = getUsagePercentage(usage);
  const levelLabel = getUsageLevelLabel(level);
  const tone = getUsageLevelTone(level);

  return (
    <article className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{formatUsageResource(usage.resource)}</h3>
        <StatusBadge tone={tone}>
          {/* Icon/text alongside color so the level never relies on color alone. */}
          <span aria-hidden="true">{level === "exceeded" ? "⚠ " : level === "warning" ? "▲ " : ""}</span>
          {levelLabel}
        </StatusBadge>
      </div>

      <p className="text-2xl font-semibold text-white">
        {usage.limit === null
          ? formatMessage("{used} used", { used: usage.used })
          : formatMessage("{used} / {limit}", { used: usage.used, limit: usage.limit })}
      </p>

      {percentage !== null && (
        <div
          aria-label={formatMessage("{resource} usage: {percentage}% of quota", {
            resource: formatUsageResource(usage.resource),
            percentage,
          })}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percentage}
          className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
        >
          <div
            className={`h-full rounded-full ${
              level === "exceeded" ? "bg-rose-400" : level === "warning" ? "bg-amber-300" : "bg-emerald-400"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      <p className="text-xs text-slate-400">
        {formatMessage(
          usage.windowType === "ROLLING" ? "Rolling window resets {date}" : "Resets {date}",
          { date: formatDate(usage.windowResetAt) }
        )}
      </p>

      <a
        className="w-fit text-xs text-cyan-200 underline underline-offset-4"
        href={usage.resourceHref}
      >
        {formatMessage("View {resource}", { resource: formatUsageResource(usage.resource) })}
      </a>
    </article>
  );
}
