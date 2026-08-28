"use client";

import { DataPanel, MetricGrid, StatusBadge, pageContainer } from "@/components/common/production-ui";
import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";
import { useHealthCheck } from "@/lib/health-check";
import { defineMessages, formatRelativeTime, formatTime } from "@/lib/i18n";

/**
 * Every user-facing string on this route, owned in one place under a stable
 * namespace. Punctuation that belongs to a label (the colon after "Last
 * checked") lives in the message, because its form and spacing are
 * locale-specific - French, for instance, sets a space before the colon.
 */
const messages = defineMessages("status", {
  title: "System status",
  description:
    "Live health for the EarnProof API, indexer, Stellar providers, contracts, and webhooks.",
  retry: "Retry",
  timeout: "Timeout",
  unreachable: "Unreachable",
  servicesOnline: "Services online",
  openIncidents: "Open incidents",
  apiStatus: "API status",
  up: "Up",
  degraded: "Degraded",
  lastCheckedLabel: "Last checked:",
  apiTimestampLabel: "API timestamp:",
  never: "Never",
  justNow: "Just now",
  lastSeen: "Last seen",
  unknown: "Unknown",
  active: "Active",
  errored: "Error",
  serviceApi: "EarnProof API",
  serviceDatabase: "Database",
  serviceIndexer: "Stellar indexer",
  serviceContracts: "Smart contracts",
  serviceWebhooks: "Webhook delivery",
  regionGlobal: "Global",
  regionTestnet: "Testnet",
  columnService: "Service",
  columnRegion: "Region",
  columnChecked: "Checked",
  columnStatus: "Status",
  searchPlaceholder: "Search services",
});

type StatusRow = {
  primary: string;
  secondary: string;
  tertiary: string;
  status: string;
  tone?: "success" | "warning";
};

function deriveStatusRow(
  label: string,
  region: string,
  value: string | null,
): StatusRow {
  if (value === null) {
    return {
      primary: label,
      secondary: region,
      tertiary: messages.unknown,
      status: messages.unknown,
      tone: "warning",
    };
  }
  const ok = value === "ok";
  return {
    primary: label,
    secondary: region,
    tertiary: messages.justNow,
    status: ok ? messages.active : messages.errored,
    tone: ok ? undefined : "warning",
  };
}

/**
 * Relative time comes from `Intl.RelativeTimeFormat` rather than a
 * hand-assembled `${n}m ago`: the unit word, its plural form and the word
 * order are all locale-specific, and none of them can be expressed by
 * concatenating a number with a suffix.
 */
function formatRelative(date: Date | null): string {
  return date ? formatRelativeTime(date) : messages.never;
}

export default function StatusPage() {
  const {
    data,
    loading,
    error,
    lastChecked,
    lastUpdated,
    refetch,
  } = useHealthCheck();

  const isOperational =
    data !== null &&
    data.status === "ok" &&
    data.database === "ok" &&
    !error;

  const httpStatus = deriveStatusRow(
    messages.serviceApi,
    messages.regionGlobal,
    data?.status ?? null,
  );

  const dbStatus = deriveStatusRow(
    messages.serviceDatabase,
    messages.regionGlobal,
    data?.database ?? null,
  );

  const stellarStatus: StatusRow = {
    primary: messages.serviceIndexer,
    secondary: messages.regionTestnet,
    tertiary: data?.timestamp ? messages.lastSeen : messages.unknown,
    status: data?.timestamp ? messages.active : messages.unknown,
    tone: data?.timestamp ? undefined : "warning",
  };

  const contractsStatus: StatusRow = {
    primary: messages.serviceContracts,
    secondary: messages.regionTestnet,
    tertiary: messages.unknown,
    status: messages.unknown,
    tone: "warning",
  };

  const webhooksStatus: StatusRow = {
    primary: messages.serviceWebhooks,
    secondary: messages.regionGlobal,
    tertiary: messages.unknown,
    status: messages.unknown,
    tone: "warning",
  };

  const allRows: StatusRow[] = [
    httpStatus,
    dbStatus,
    stellarStatus,
    contractsStatus,
    webhooksStatus,
  ];

  const activeCount = allRows.filter(
    (r) => r.status === messages.active,
  ).length;
  const totalCount = allRows.length;

  const metricValue = loading && !data
    ? "..."
    : `${activeCount}/${totalCount}`;

  return (
    <PublicShell>
      <div className={pageContainer}>
        <PageHeading title={messages.title} description={messages.description} />

        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3">
            <StatusBadge tone="warning">
              {error === "Request timed out" ? messages.timeout : messages.unreachable}
            </StatusBadge>
            <span className="text-sm text-slate-300">{error}</span>
            <button
              className="ml-auto rounded-lg border border-white/15 px-3 py-1 text-sm font-medium transition hover:bg-white/10"
              onClick={refetch}
              type="button"
            >
              {messages.retry}
            </button>
          </div>
        )}

        <MetricGrid
          items={[
            { value: metricValue, label: messages.servicesOnline },
            {
              value: isOperational ? "0" : data ? "1" : "...",
              label: messages.openIncidents,
            },
            {
              value: isOperational ? messages.up : data ? messages.degraded : "...",
              label: messages.apiStatus,
            },
          ]}
        />

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>
            {messages.lastCheckedLabel} {formatRelative(lastChecked)}
          </span>
          {lastUpdated && (
            <span>
              {messages.apiTimestampLabel}{" "}
              {formatTime(data?.timestamp ?? lastUpdated)}
            </span>
          )}
        </div>

        <DataPanel
          headers={[
            messages.columnService,
            messages.columnRegion,
            messages.columnChecked,
            messages.columnStatus,
          ]}
          rows={allRows}
          searchPlaceholder={messages.searchPlaceholder}
        />
      </div>
    </PublicShell>
  );
}
