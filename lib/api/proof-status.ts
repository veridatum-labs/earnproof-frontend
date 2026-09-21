import { apiClient } from "./client";
import type { VerifyProofResponse } from "./generated/v1";

/**
 * Client-side lifecycle view of a proof. The API's verification endpoint
 * reports a smaller set of states today (`valid`, `expired`, `revoked`,
 * `unknown`, `invalid`); `pending` and `anchored` are normalized from the
 * creation/pre-anchoring vocabulary so callers have one vocabulary to reason
 * about regardless of which endpoint answered.
 */
export type ProofStatus =
  | "pending"
  | "anchored"
  | "valid"
  | "expired"
  | "revoked"
  | "invalid"
  | "unknown";

/**
 * A proof in one of these states will not move again, so a refresh loop can
 * stop. `unknown` is deliberately excluded: a proof identifier can resolve
 * later (e.g. right after creation), so it is still worth re-checking. The
 * same applies to `valid`, which can still expire or be revoked.
 */
const TERMINAL_PROOF_STATUSES: ReadonlySet<ProofStatus> = new Set([
  "expired",
  "revoked",
  "invalid",
]);

export const DEFAULT_PROOF_STATUS_POLL_INTERVAL_MS = 15_000;
export const DEFAULT_PROOF_STATUS_MAX_BACKOFF_MS = 120_000;

export type ProofStatusSnapshot = {
  proofId: string;
  status: ProofStatus;
  revokedAt: string | null;
  /** The unmodified verification payload the snapshot was derived from. */
  raw: VerifyProofResponse;
};

/**
 * Maps any status string the API may return (verification or creation
 * vocabulary) onto the shared {@link ProofStatus} union. Unknown strings map
 * to `unknown` rather than throwing, so a future server state degrades to
 * "keep refreshing" instead of crashing the proof page.
 */
export function normalizeProofStatus(status: string | null | undefined): ProofStatus {
  switch ((status ?? "").trim().toLowerCase()) {
    case "pending":
    case "issued":
    case "submitted":
    case "anchoring":
      return "pending";
    case "anchored":
    case "confirmed":
      return "anchored";
    case "valid":
    case "active":
      return "valid";
    case "expired":
      return "expired";
    case "revoked":
      return "revoked";
    case "invalid":
    case "invalid_signature":
      return "invalid";
    default:
      return "unknown";
  }
}

export function isTerminalProofStatus(status: string | null | undefined): boolean {
  return TERMINAL_PROOF_STATUSES.has(normalizeProofStatus(status));
}

/**
 * Bounded exponential backoff. `failureCount` is the number of consecutive
 * failed refreshes (1 after the first failure). Delays grow
 * `base, 2*base, 4*base, ...` and never exceed `maxMs`, so a sustained
 * outage cannot produce unbounded gaps between checks.
 */
export function computeBackoffDelayMs(
  failureCount: number,
  { baseMs, maxMs }: { baseMs: number; maxMs: number },
): number {
  const safeBase = Math.max(1, Math.floor(baseMs));
  const safeMax = Math.max(safeBase, Math.floor(maxMs));
  const attempt = Math.min(Math.max(0, Math.floor(failureCount)), 30);
  const delay = safeBase * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, safeMax);
}

/**
 * Fetches the current state of a single proof and normalizes it for the
 * refresh hook. The caller's `signal` is forwarded so navigation or
 * supersession can cancel the request.
 */
export async function fetchProofStatus(
  proofId: string,
  signal?: AbortSignal,
): Promise<ProofStatusSnapshot> {
  const response = await apiClient<VerifyProofResponse>({
    path: `/proofs/${encodeURIComponent(proofId)}/verify`,
    method: "GET",
    signal,
  });

  return {
    proofId,
    status: normalizeProofStatus(response.status),
    revokedAt: response.proof?.revokedAt ?? null,
    raw: response,
  };
}
