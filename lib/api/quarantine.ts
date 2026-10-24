import { apiClient, bearer, retryRead, retryMutation } from "./client";

/**
 * Quarantine reasons describe why a credential was isolated from normal verification.
 */
export type QuarantineReason =
  | "malformed_structure"
  | "unknown_issuer"
  | "conflicting_trust_data"
  | "schema_version_mismatch"
  | "signature_verification_failed"
  | "expired_before_review"
  | "revoked_before_review"
  | "replay_attack_detected";

/**
 * Quarantine status tracks the lifecycle of a quarantined credential.
 */
export type QuarantineStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "auto_rejected";

/**
 * Safe metadata extracted from a quarantined credential for preview.
 * These fields are non-sensitive and can be displayed without risk.
 */
export interface QuarantineMetadata {
  credentialId: string;
  /** The original quarantined JSON, redacted to remove private claims */
  safePreview: string;
  /** Detected issue that triggered quarantine */
  reason: QuarantineReason;
  /** When the credential was quarantined */
  quarantinedAt: string;
  /** When the credential expires (from its own metadata) */
  expiresAt: string | null;
  /** Current quarantine status */
  status: QuarantineStatus;
  /** Who last reviewed this credential (user ID) */
  reviewedBy: string | null;
  /** When the credential was last reviewed */
  reviewedAt: string | null;
  /** Rejection reason if status is rejected */
  rejectionReason: string | null;
  /** Evidence of the issue (e.g., specific field that failed validation) */
  evidence: Record<string, unknown> | null;
}

/**
 * Request to approve a quarantined credential for normal verification.
 */
export interface ApproveQuarantineRequest {
  /** Optional notes about the approval decision */
  notes?: string;
}

/**
 * Request to reject a quarantined credential.
 */
export interface RejectQuarantineRequest {
  /** Required reason for rejection */
  reason: string;
  /** Optional additional context */
  context?: string;
}

/**
 * Request to refresh evidence for a quarantined credential.
 * Re-runs validation checks to see if the issue is transient.
 */
export interface RefreshQuarantineEvidenceRequest {
  /** Whether to force a full re-verification */
  forceFullReverification?: boolean;
}

/**
 * Response from refreshing quarantine evidence.
 */
export interface RefreshQuarantineEvidenceResponse {
  /** Updated metadata after refresh */
  metadata: QuarantineMetadata;
  /** Whether the issue was resolved by the refresh */
  resolved: boolean;
  /** New status if changed */
  newStatus: QuarantineStatus | null;
}

/**
 * Paginated list of quarantined credentials.
 */
export interface QuarantineListResponse {
  items: QuarantineMetadata[];
  nextCursor: string | null;
  previousCursor: string | null;
  totalCount: number;
}

/**
 * Fetches a paginated list of quarantined credentials.
 */
export async function getQuarantinedCredentials(
  token: string,
  pageSize: number = 20,
  nextCursor?: string,
  previousCursor?: string,
  status?: QuarantineStatus,
  signal?: AbortSignal
): Promise<QuarantineListResponse> {
  return retryRead(async (signal) => {
    const params = new URLSearchParams();
    params.append("limit", String(pageSize));
    if (nextCursor) params.append("next_cursor", nextCursor);
    if (previousCursor) params.append("previous_cursor", previousCursor);
    if (status) params.append("status", status);

    return apiClient<QuarantineListResponse>({
      path: `/quarantine?${params.toString()}`,
      method: "GET",
      headers: bearer(token),
      signal,
    });
  }, signal!);
}

/**
 * Fetches detailed metadata for a specific quarantined credential.
 */
export async function getQuarantineMetadata(
  token: string,
  credentialId: string,
  signal: AbortSignal
): Promise<QuarantineMetadata> {
  return retryRead(async (signal) => {
    return apiClient<QuarantineMetadata>({
      path: `/quarantine/${encodeURIComponent(credentialId)}`,
      method: "GET",
      headers: bearer(token),
      signal,
    });
  }, signal);
}

/**
 * Approves a quarantined credential, releasing it for normal verification.
 */
export async function approveQuarantinedCredential(
  token: string,
  credentialId: string,
  request: ApproveQuarantineRequest,
  signal: AbortSignal
): Promise<QuarantineMetadata> {
  return retryMutation(async (signal) => {
    return apiClient<QuarantineMetadata>({
      path: `/quarantine/${encodeURIComponent(credentialId)}/approve`,
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify(request),
      signal,
    });
  }, signal);
}

/**
 * Rejects a quarantined credential, permanently blocking it from verification.
 */
export async function rejectQuarantinedCredential(
  token: string,
  credentialId: string,
  request: RejectQuarantineRequest,
  signal: AbortSignal
): Promise<QuarantineMetadata> {
  return retryMutation(async (signal) => {
    return apiClient<QuarantineMetadata>({
      path: `/quarantine/${encodeURIComponent(credentialId)}/reject`,
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify(request),
      signal,
    });
  }, signal);
}

/**
 * Refreshes evidence for a quarantined credential to check if issues are transient.
 */
export async function refreshQuarantineEvidence(
  token: string,
  credentialId: string,
  request: RefreshQuarantineEvidenceRequest,
  signal: AbortSignal
): Promise<RefreshQuarantineEvidenceResponse> {
  return retryMutation(async (signal) => {
    return apiClient<RefreshQuarantineEvidenceResponse>({
      path: `/quarantine/${encodeURIComponent(credentialId)}/refresh`,
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify(request),
      signal,
    });
  }, signal);
}

/**
 * Deletes a quarantined credential record (soft delete/archival).
 */
export async function deleteQuarantineRecord(
  token: string,
  credentialId: string,
  signal: AbortSignal
): Promise<void> {
  return retryMutation(async (signal) => {
    await apiClient({
      path: `/quarantine/${encodeURIComponent(credentialId)}`,
      method: "DELETE",
      headers: bearer(token),
      signal,
    });
  }, signal);
}

/**
 * Human-readable descriptions for quarantine reasons.
 */
export function describeQuarantineReason(reason: QuarantineReason): string {
  switch (reason) {
    case "malformed_structure":
      return "Credential structure is malformed or missing required fields";
    case "unknown_issuer":
      return "Credential issuer is not recognized or trusted";
    case "conflicting_trust_data":
      return "Conflicting trust data detected between credential and public records";
    case "schema_version_mismatch":
      return "Schema version does not match expected format";
    case "signature_verification_failed":
      return "Cryptographic signature verification failed";
    case "expired_before_review":
      return "Credential expired before it could be reviewed";
    case "revoked_before_review":
      return "Credential was revoked before it could be reviewed";
    case "replay_attack_detected":
      return "Potential replay attack detected - credential may have been reused";
  }
}

/**
 * Status-specific styling and descriptions for UI display.
 */
export function getQuarantineStatusInfo(status: QuarantineStatus) {
  switch (status) {
    case "pending_review":
      return {
        label: "Pending Review",
        description: "Awaiting manual review before release",
        color: "amber",
      };
    case "approved":
      return {
        label: "Approved",
        description: "Released for normal verification",
        color: "emerald",
      };
    case "rejected":
      return {
        label: "Rejected",
        description: "Permanently blocked from verification",
        color: "rose",
      };
    case "expired":
      return {
        label: "Expired",
        description: "Quarantine period expired without review",
        color: "slate",
      };
    case "auto_rejected":
      return {
        label: "Auto-Rejected",
        description: "Automatically rejected due to policy violation",
        color: "rose",
      };
  }
}
