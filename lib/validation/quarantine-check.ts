/**
 * Validation for quarantined credentials.
 *
 * Detects credentials that should be quarantined based on malformed structure,
 * unknown issuers, conflicting trust data, or other security concerns.
 */

import type { ImportedCredentialSummary } from "@/lib/credentials/public-state-comparison";
import type { VerifyProofResponse } from "@/components/verification/verification-panel";
import type { QuarantineReason } from "@/lib/api/quarantine";

export interface QuarantineCheckResult {
  /** Whether the credential should be quarantined */
  shouldQuarantine: boolean;
  /** The reason for quarantine, if applicable */
  reason: QuarantineReason | null;
  /** Evidence supporting the quarantine decision */
  evidence: Record<string, unknown> | null;
}

/**
 * Checks if a credential should be quarantined based on its import summary
 * and verification response.
 *
 * This is a client-side check that mirrors server-side quarantine logic.
 * The server is the source of truth, but this check provides immediate
 * feedback and prevents quarantined credentials from entering normal verification.
 */
export function checkCredentialQuarantine(
  imported: ImportedCredentialSummary | null,
  response: VerifyProofResponse | null
): QuarantineCheckResult {
  // Malformed or missing imported summary
  if (!imported) {
    return {
      shouldQuarantine: true,
      reason: "malformed_structure",
      evidence: { error: "Could not parse credential structure" },
    };
  }

  // If verification failed with specific errors, quarantine
  if (response) {
    const result = response.result;

    // Signature verification failed
    if (result === "INVALID_SIGNATURE") {
      return {
        shouldQuarantine: true,
        reason: "signature_verification_failed",
        evidence: { verificationResult: result },
      };
    }

    // Unknown issuer
    if (result === "UNVERIFIED_ISSUER") {
      return {
        shouldQuarantine: true,
        reason: "unknown_issuer",
        evidence: { verificationResult: result, issuer: imported.issuer },
      };
    }

    // Unknown proof type
    if (result === "UNKNOWN_PROOF") {
      return {
        shouldQuarantine: true,
        reason: "malformed_structure",
        evidence: { verificationResult: result, credentialId: imported.id },
      };
    }

    // Expired credential
    if (result === "EXPIRED") {
      return {
        shouldQuarantine: true,
        reason: "expired_before_review",
        evidence: { verificationResult: result, expiresAt: imported.expiresAt },
      };
    }

    // Revoked credential
    if (result === "REVOKED") {
      return {
        shouldQuarantine: true,
        reason: "revoked_before_review",
        evidence: { verificationResult: result },
      };
    }

    // Field mismatches detected in public state comparison
    if (response.proof && imported) {
      const mismatches = detectFieldMismatches(imported, response);
      if (mismatches.length > 0) {
        return {
          shouldQuarantine: true,
          reason: "conflicting_trust_data",
          evidence: { mismatches },
        };
      }
    }
  }

  // No quarantine trigger
  return {
    shouldQuarantine: false,
    reason: null,
    evidence: null,
  };
}

/**
 * Detects field mismatches between imported credential and public proof record.
 */
function detectFieldMismatches(
  imported: ImportedCredentialSummary,
  response: VerifyProofResponse
): Array<{ field: string; imported: string | null; current: string | null }> {
  const mismatches: Array<{ field: string; imported: string | null; current: string | null }> = [];
  const proof = response.proof;
  const credential = response.credential;

  if (!proof || !credential) {
    return mismatches;
  }

  // Schema version mismatch
  if (imported.schemaVersion && proof.schemaVersion !== imported.schemaVersion) {
    mismatches.push({
      field: "schemaVersion",
      imported: imported.schemaVersion,
      current: proof.schemaVersion,
    });
  }

  // Proof type mismatch
  if (imported.proofType && proof.type !== imported.proofType) {
    mismatches.push({
      field: "proofType",
      imported: imported.proofType,
      current: proof.type,
    });
  }

  // Expiry mismatch
  if (imported.expiresAt && proof.expiresAt !== imported.expiresAt) {
    mismatches.push({
      field: "expiresAt",
      imported: imported.expiresAt,
      current: proof.expiresAt,
    });
  }

  return mismatches;
}

/**
 * Redacts private claims from credential JSON for safe preview.
 * Only retains non-sensitive fields: id, issuer, schemaVersion, type, issuedAt, expiresAt.
 */
export function redactCredentialForPreview(raw: unknown): string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return JSON.stringify({ error: "Invalid credential structure" }, null, 2);
  }

  const obj = raw as Record<string, unknown>;
  const safePreview: Record<string, unknown> = {
    id: obj.id || null,
    issuer: obj.issuer || null,
    schemaVersion: obj.schemaVersion || null,
    type: obj.type || null,
    issuedAt: obj.issuedAt || null,
    expiresAt: obj.expiresAt || null,
    _redacted: "Private claims have been removed for security",
  };

  return JSON.stringify(safePreview, null, 2);
}
