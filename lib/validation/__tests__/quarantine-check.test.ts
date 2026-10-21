/**
 * Tests for quarantine check validation.
 *
 * Covers positive cases (credentials that should be quarantined),
 * negative cases (credentials that should pass), and boundary conditions.
 */

import { describe, it, expect } from "@jest/globals";
import {
  checkCredentialQuarantine,
  redactCredentialForPreview,
} from "../quarantine-check";
import type { ImportedCredentialSummary } from "@/lib/credentials/public-state-comparison";
import type { VerifyProofResponse } from "@/components/verification/verification-panel";

describe("checkCredentialQuarantine", () => {
  const validImportedSummary: ImportedCredentialSummary = {
    id: "cred-123",
    issuer: "issuer-abc",
    schemaVersion: "1.0",
    proofType: "minimum_income",
    expiresAt: "2025-12-31T23:59:59Z",
    issuedAt: "2024-01-01T00:00:00Z",
    claim: null,
  };

  const validVerifyResponse: VerifyProofResponse = {
    result: "VALID",
    status: "valid",
    credential: {
      id: "cred-123",
      schemaVersion: "1.0",
      issuer: "issuer-abc",
      subject: { walletHash: "hash-123" },
      claim: {
        operator: "gte",
        thresholdAmount: "1000",
        assetCode: "USD",
        assetIssuer: null,
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        qualifyingPaymentCount: 12,
        privacy: { exactIncomeHidden: false, sourceTransactionsHidden: false },
        issuedAt: "2024-01-01T00:00:00Z",
        expiresAt: "2025-12-31T23:59:59Z",
        proof: { type: "minimum_income", credentialHash: "hash", signature: "sig" },
      },
    },
    proof: {
      id: "cred-123",
      type: "minimum_income",
      schemaVersion: "1.0",
      network: "testnet",
      issuedAt: "2024-01-01T00:00:00Z",
      expiresAt: "2025-12-31T23:59:59Z",
    },
  };

  describe("positive cases - should quarantine", () => {
    it("should quarantine malformed credentials", () => {
      const result = checkCredentialQuarantine(null, null);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("malformed_structure");
      expect(result.evidence).toEqual({ error: "Could not parse credential structure" });
    });

    it("should quarantine credentials with invalid signature", () => {
      const response = { ...validVerifyResponse, result: "INVALID_SIGNATURE" as const };
      const result = checkCredentialQuarantine(validImportedSummary, response);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("signature_verification_failed");
      expect(result.evidence).toEqual({ verificationResult: "INVALID_SIGNATURE" });
    });

    it("should quarantine credentials from unknown issuers", () => {
      const response = { ...validVerifyResponse, result: "UNVERIFIED_ISSUER" as const };
      const result = checkCredentialQuarantine(validImportedSummary, response);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("unknown_issuer");
      expect(result.evidence).toEqual({
        verificationResult: "UNVERIFIED_ISSUER",
        issuer: "issuer-abc",
      });
    });

    it("should quarantine unknown proof types", () => {
      const response = { ...validVerifyResponse, result: "UNKNOWN_PROOF" as const };
      const result = checkCredentialQuarantine(validImportedSummary, response);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("malformed_structure");
      expect(result.evidence).toEqual({ verificationResult: "UNKNOWN_PROOF", credentialId: "cred-123" });
    });

    it("should quarantine expired credentials", () => {
      const response = { ...validVerifyResponse, result: "EXPIRED" as const };
      const result = checkCredentialQuarantine(validImportedSummary, response);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("expired_before_review");
      expect(result.evidence).toEqual({
        verificationResult: "EXPIRED",
        expiresAt: "2025-12-31T23:59:59Z",
      });
    });

    it("should quarantine revoked credentials", () => {
      const response = { ...validVerifyResponse, result: "REVOKED" as const };
      const result = checkCredentialQuarantine(validImportedSummary, response);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("revoked_before_review");
      expect(result.evidence).toEqual({ verificationResult: "REVOKED" });
    });

    it("should quarantine credentials with field mismatches", () => {
      const mismatchedImported: ImportedCredentialSummary = {
        ...validImportedSummary,
        schemaVersion: "0.9", // Different from response
      };
      const result = checkCredentialQuarantine(mismatchedImported, validVerifyResponse);
      expect(result.shouldQuarantine).toBe(true);
      expect(result.reason).toBe("conflicting_trust_data");
      expect(result.evidence?.mismatches).toHaveLength(1);
    });
  });

  describe("negative cases - should not quarantine", () => {
    it("should not quarantine valid credentials", () => {
      const result = checkCredentialQuarantine(validImportedSummary, validVerifyResponse);
      expect(result.shouldQuarantine).toBe(false);
      expect(result.reason).toBe(null);
      expect(result.evidence).toBe(null);
    });

    it("should not quarantine when response is null (server error)", () => {
      const result = checkCredentialQuarantine(validImportedSummary, null);
      expect(result.shouldQuarantine).toBe(false);
      expect(result.reason).toBe(null);
      expect(result.evidence).toBe(null);
    });
  });

  describe("boundary cases", () => {
    it("should handle missing proof in response", () => {
      const responseWithoutProof: VerifyProofResponse = {
        ...validVerifyResponse,
        proof: undefined,
      };
      const result = checkCredentialQuarantine(validImportedSummary, responseWithoutProof);
      expect(result.shouldQuarantine).toBe(false);
    });

    it("should handle missing credential in response", () => {
      const responseWithoutCredential: VerifyProofResponse = {
        ...validVerifyResponse,
        credential: undefined,
      };
      const result = checkCredentialQuarantine(validImportedSummary, responseWithoutCredential);
      expect(result.shouldQuarantine).toBe(false);
    });

    it("should handle null fields in imported summary", () => {
      const nullFieldsSummary: ImportedCredentialSummary = {
        id: "cred-123",
        issuer: null,
        schemaVersion: null,
        proofType: null,
        expiresAt: null,
        issuedAt: null,
        claim: null,
      };
      const result = checkCredentialQuarantine(nullFieldsSummary, validVerifyResponse);
      expect(result.shouldQuarantine).toBe(false);
    });
  });
});

describe("redactCredentialForPreview", () => {
  it("should redact private claims from valid credential", () => {
    const credential = {
      id: "cred-123",
      issuer: "issuer-abc",
      schemaVersion: "1.0",
      type: "minimum_income",
      issuedAt: "2024-01-01T00:00:00Z",
      expiresAt: "2025-12-31T23:59:59Z",
      subject: { walletHash: "private-hash" },
      claim: { thresholdAmount: "1000" },
    };

    const redacted = redactCredentialForPreview(credential);
    const parsed = JSON.parse(redacted);

    expect(parsed.id).toBe("cred-123");
    expect(parsed.issuer).toBe("issuer-abc");
    expect(parsed.subject).toBeUndefined();
    expect(parsed.claim).toBeUndefined();
    expect(parsed._redacted).toBe("Private claims have been removed for security");
  });

  it("should handle invalid credential structure", () => {
    const redacted = redactCredentialForPreview("invalid");
    const parsed = JSON.parse(redacted);

    expect(parsed.error).toBe("Invalid credential structure");
  });

  it("should handle null input", () => {
    const redacted = redactCredentialForPreview(null);
    const parsed = JSON.parse(redacted);

    expect(parsed.error).toBe("Invalid credential structure");
  });

  it("should handle array input", () => {
    const redacted = redactCredentialForPreview([1, 2, 3]);
    const parsed = JSON.parse(redacted);

    expect(parsed.error).toBe("Invalid credential structure");
  });

  it("should handle credential with missing safe fields", () => {
    const credential = {
      subject: { walletHash: "private-hash" },
      claim: { thresholdAmount: "1000" },
    };

    const redacted = redactCredentialForPreview(credential);
    const parsed = JSON.parse(redacted);

    expect(parsed.id).toBe(null);
    expect(parsed.issuer).toBe(null);
    expect(parsed.subject).toBeUndefined();
    expect(parsed.claim).toBeUndefined();
  });
});
