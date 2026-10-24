/**
 * @jest-environment node
 * Comprehensive tests for offline verification bundle workflow (#294, #311).
 * Covers validation, authorization, metadata verification, and error handling.
 */

import {
  buildOfflineBundle,
  validateOfflineBundleRequest,
  validateBundleSourceCheckpoint,
  validateBundleSourceSignature,
  validateBundleSourceMetadata,
  verifyOfflineBundle,
  refreshOfflineBundle,
  isProofAuthorizedForOfflineBundle,
  areScopesAuthorizedForOfflineBundle,
  isValidityAuthorizedForOfflineBundle,
  bundleDigestInput,
  scopedPayload,
  includedFields,
  OFFLINE_BUNDLE_SCHEMA_VERSION,
  OFFLINE_BUNDLE_MIN_VALIDITY_HOURS,
  OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
} from "@/lib/credentials/offline-bundle";
import {
  VALID_BUNDLE_SOURCE,
  MINIMAL_BUNDLE_SOURCE,
  SOURCE_WITHOUT_METADATA,
  STALE_CHECKPOINT,
  FRESH_CHECKPOINT,
  FUTURE_CHECKPOINT,
  INVALID_SIGNATURE_NO_ALGO,
  INVALID_SIGNATURE_NO_VALUE,
  PUBLIC_ONLY_REQUEST,
  MULTI_SCOPE_REQUEST,
  MAX_VALIDITY_REQUEST,
  MIN_VALIDITY_REQUEST,
  INVALID_VALIDITY_REQUEST,
  INVALID_LOW_VALIDITY_REQUEST,
  INVALID_NO_PROOF_ID_REQUEST,
  INVALID_NO_PUBLIC_SCOPE_REQUEST,
  PERMISSIVE_POLICY,
  RESTRICTIVE_NO_BUNDLES_POLICY,
  RESTRICTIVE_LIMITED_VALIDITY_POLICY,
  RESTRICTIVE_SCOPE_POLICY,
  RESTRICTIVE_PROOF_DENIED_POLICY,
  createBundleSource,
  createRequest,
  createPolicy,
} from "./offline-bundle.fixtures";

describe("Offline Bundle Validation", () => {
  describe("validateBundleSourceCheckpoint", () => {
    it("accepts fresh checkpoint", () => {
      const issues = validateBundleSourceCheckpoint(FRESH_CHECKPOINT);
      expect(issues).toHaveLength(0);
    });

    it("rejects stale checkpoint", () => {
      const now = new Date("2025-01-01T02:00:00Z"); // 2 hours later
      const issues = validateBundleSourceCheckpoint(STALE_CHECKPOINT, now);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "checkpoint",
          severity: "error",
          message: expect.stringContaining("stale"),
        }),
      );
    });

    it("rejects future checkpoint", () => {
      const issues = validateBundleSourceCheckpoint(FUTURE_CHECKPOINT);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "checkpoint.capturedAt",
          severity: "error",
          message: expect.stringContaining("future"),
        }),
      );
    });

    it("rejects invalid date format", () => {
      const issues = validateBundleSourceCheckpoint({
        capturedAt: "invalid-date",
        maxAgeSeconds: 3600,
      });
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "checkpoint.capturedAt",
          severity: "error",
        }),
      );
    });

    it("rejects missing capturedAt", () => {
      const issues = validateBundleSourceCheckpoint({
        capturedAt: "",
        maxAgeSeconds: 3600,
      });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("error");
    });
  });

  describe("validateBundleSourceSignature", () => {
    it("accepts valid signature", () => {
      const issues = validateBundleSourceSignature({
        algorithm: "EdDSA",
        value: "sig_valid",
        signedAt: new Date().toISOString(),
        signer: "key-001",
      });
      expect(issues).toHaveLength(0);
    });

    it("rejects missing algorithm", () => {
      const issues = validateBundleSourceSignature(INVALID_SIGNATURE_NO_ALGO);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "signature.algorithm",
          severity: "error",
        }),
      );
    });

    it("rejects missing value", () => {
      const issues = validateBundleSourceSignature(INVALID_SIGNATURE_NO_VALUE);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "signature.value",
          severity: "error",
        }),
      );
    });

    it("rejects missing signedAt", () => {
      const issues = validateBundleSourceSignature({
        algorithm: "EdDSA",
        value: "sig_test",
        signedAt: "",
        signer: "key-001",
      });
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "signature.signedAt",
          severity: "error",
        }),
      );
    });

    it("rejects missing signer", () => {
      const issues = validateBundleSourceSignature({
        algorithm: "EdDSA",
        value: "sig_test",
        signedAt: new Date().toISOString(),
        signer: "",
      });
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "signature.signer",
          severity: "error",
        }),
      );
    });
  });

  describe("validateBundleSourceMetadata", () => {
    it("accepts valid metadata", () => {
      const issues = validateBundleSourceMetadata({
        signature: {
          algorithm: "EdDSA",
          value: "sig_valid",
          signedAt: new Date().toISOString(),
          signer: "key-001",
        },
        checkpoint: {
          capturedAt: new Date().toISOString(),
          maxAgeSeconds: 3600,
        },
      });
      expect(issues).toHaveLength(0);
    });

    it("rejects missing metadata", () => {
      const issues = validateBundleSourceMetadata(undefined);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "metadata",
          severity: "error",
        }),
      );
    });

    it("rejects stale metadata", () => {
      const now = new Date("2025-01-01T02:00:00Z");
      const issues = validateBundleSourceMetadata(
        {
          signature: {
            algorithm: "EdDSA",
            value: "sig_test",
            signedAt: new Date().toISOString(),
            signer: "key-001",
          },
          checkpoint: STALE_CHECKPOINT,
        },
        now,
      );
      expect(issues.length).toBeGreaterThan(0);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("stale"),
        }),
      );
    });
  });

  describe("validateOfflineBundleRequest", () => {
    it("accepts valid public-only request", () => {
      const issues = validateOfflineBundleRequest(PUBLIC_ONLY_REQUEST);
      expect(issues).toHaveLength(0);
    });

    it("accepts valid multi-scope request", () => {
      const issues = validateOfflineBundleRequest(MULTI_SCOPE_REQUEST);
      expect(issues).toHaveLength(0);
    });

    it("rejects request with no proofId", () => {
      const issues = validateOfflineBundleRequest(INVALID_NO_PROOF_ID_REQUEST);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "proofId",
          severity: "error",
        }),
      );
    });

    it("rejects request without public scope", () => {
      const issues = validateOfflineBundleRequest(
        INVALID_NO_PUBLIC_SCOPE_REQUEST,
      );
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "scopes",
          severity: "error",
          message: expect.stringContaining("public"),
        }),
      );
    });

    it("rejects request with excessive validity", () => {
      const issues = validateOfflineBundleRequest(INVALID_VALIDITY_REQUEST);
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "requestedValidityHours",
          severity: "error",
        }),
      );
    });

    it("rejects request with insufficient validity", () => {
      const issues = validateOfflineBundleRequest(
        INVALID_LOW_VALIDITY_REQUEST,
      );
      expect(issues).toContainEqual(
        expect.objectContaining({
          field: "requestedValidityHours",
          severity: "error",
        }),
      );
    });

    describe("with authorization policy", () => {
      it("allows request with permissive policy", () => {
        const issues = validateOfflineBundleRequest(
          PUBLIC_ONLY_REQUEST,
          PERMISSIVE_POLICY,
        );
        expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
      });

      it("rejects request with no-bundles policy", () => {
        const issues = validateOfflineBundleRequest(
          PUBLIC_ONLY_REQUEST,
          RESTRICTIVE_NO_BUNDLES_POLICY,
        );
        expect(issues).toContainEqual(
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("not authorized"),
          }),
        );
      });

      it("rejects request exceeding policy validity limit", () => {
        const issues = validateOfflineBundleRequest(
          MAX_VALIDITY_REQUEST,
          RESTRICTIVE_LIMITED_VALIDITY_POLICY,
        );
        expect(issues).toContainEqual(
          expect.objectContaining({
            field: "requestedValidityHours",
            severity: "error",
          }),
        );
      });

      it("rejects request with unauthorized scopes", () => {
        const request = createRequest({ scopes: ["public", "subject"] });
        const issues = validateOfflineBundleRequest(
          request,
          RESTRICTIVE_SCOPE_POLICY,
        );
        expect(issues).toContainEqual(
          expect.objectContaining({
            field: "scopes",
            severity: "error",
          }),
        );
      });

      it("rejects request for denied proof", () => {
        const request = createRequest({ proofId: "proof-denied-001" });
        const issues = validateOfflineBundleRequest(
          request,
          RESTRICTIVE_PROOF_DENIED_POLICY,
        );
        expect(issues).toContainEqual(
          expect.objectContaining({
            field: "proofId",
            severity: "error",
          }),
        );
      });
    });
  });
});

describe("Authorization Checks", () => {
  describe("isProofAuthorizedForOfflineBundle", () => {
    it("authorizes proof with permissive policy", () => {
      const result = isProofAuthorizedForOfflineBundle(
        "proof-test-001",
        PERMISSIVE_POLICY,
      );
      expect(result.authorized).toBe(true);
    });

    it("denies proof with no-bundles policy", () => {
      const result = isProofAuthorizedForOfflineBundle(
        "proof-test-001",
        RESTRICTIVE_NO_BUNDLES_POLICY,
      );
      expect(result.authorized).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("denies specifically listed proof", () => {
      const result = isProofAuthorizedForOfflineBundle(
        "proof-denied-001",
        RESTRICTIVE_PROOF_DENIED_POLICY,
      );
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain("archived");
    });
  });

  describe("areScopesAuthorizedForOfflineBundle", () => {
    it("authorizes all scopes with permissive policy", () => {
      const result = areScopesAuthorizedForOfflineBundle(
        ["public", "subject", "amount", "sender"],
        PERMISSIVE_POLICY,
      );
      expect(result.authorized).toBe(true);
    });

    it("denies non-public scopes with restrictive policy", () => {
      const result = areScopesAuthorizedForOfflineBundle(
        ["public", "subject"],
        RESTRICTIVE_SCOPE_POLICY,
      );
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain("not authorized");
    });

    it("authorizes public scope with restrictive policy", () => {
      const result = areScopesAuthorizedForOfflineBundle(
        ["public"],
        RESTRICTIVE_SCOPE_POLICY,
      );
      expect(result.authorized).toBe(true);
    });
  });

  describe("isValidityAuthorizedForOfflineBundle", () => {
    it("authorizes max validity with permissive policy", () => {
      const result = isValidityAuthorizedForOfflineBundle(
        OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
        PERMISSIVE_POLICY,
      );
      expect(result.authorized).toBe(true);
    });

    it("denies excessive validity with restrictive policy", () => {
      const result = isValidityAuthorizedForOfflineBundle(
        24,
        RESTRICTIVE_LIMITED_VALIDITY_POLICY,
      );
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain("exceeds maximum");
    });

    it("authorizes within policy limit", () => {
      const result = isValidityAuthorizedForOfflineBundle(
        12,
        RESTRICTIVE_LIMITED_VALIDITY_POLICY,
      );
      expect(result.authorized).toBe(true);
    });
  });
});

describe("Bundle Building and Serialization", () => {
  it("builds bundle with correct fields", () => {
    const nonce = "test-nonce-001";
    const bundle = buildOfflineBundle({
      request: PUBLIC_ONLY_REQUEST,
      source: VALID_BUNDLE_SOURCE,
      digestValue: "abc123",
      nonce,
    });

    expect(bundle.bundleId).toBe(`${VALID_BUNDLE_SOURCE.proofId}:${nonce}`);
    expect(bundle.schemaVersion).toBe(OFFLINE_BUNDLE_SCHEMA_VERSION);
    expect(bundle.scopes).toEqual(["public"]);
    expect(bundle.nonce).toBe(nonce);
    expect(bundle.revocation.state).toBe("unknown-offline");
  });

  it("includes requested scopes in payload", () => {
    const bundle = buildOfflineBundle({
      request: MULTI_SCOPE_REQUEST,
      source: VALID_BUNDLE_SOURCE,
      digestValue: "abc123",
      nonce: "test-nonce",
    });

    expect(bundle.payload).toHaveProperty("public");
    expect(bundle.payload).toHaveProperty("subject");
    expect(bundle.payload).toHaveProperty("amount");
    expect(bundle.payload).not.toHaveProperty("sender");
  });

  it("excludes unrequested scopes from payload", () => {
    const bundle = buildOfflineBundle({
      request: PUBLIC_ONLY_REQUEST,
      source: VALID_BUNDLE_SOURCE,
      digestValue: "abc123",
      nonce: "test-nonce",
    });

    expect(bundle.payload).toHaveProperty("public");
    expect(bundle.payload).not.toHaveProperty("subject");
    expect(bundle.payload).not.toHaveProperty("amount");
    expect(bundle.payload).not.toHaveProperty("sender");
  });

  it("omits unavailable private scopes", () => {
    const bundle = buildOfflineBundle({
      request: MULTI_SCOPE_REQUEST,
      source: MINIMAL_BUNDLE_SOURCE,
      digestValue: "abc123",
      nonce: "test-nonce",
    });

    expect(bundle.payload).toHaveProperty("public");
    expect(bundle.payload).not.toHaveProperty("subject");
    expect(bundle.payload).not.toHaveProperty("amount");
  });

  it("includes correct fields in digest input", () => {
    const bundle = buildOfflineBundle({
      request: PUBLIC_ONLY_REQUEST,
      source: VALID_BUNDLE_SOURCE,
      digestValue: "",
      nonce: "test-nonce",
    });

    const digestInput = bundleDigestInput(bundle);
    const parsed = JSON.parse(digestInput);

    expect(parsed).not.toHaveProperty("digest");
    expect(parsed).toHaveProperty("bundleId");
    expect(parsed).toHaveProperty("payload");
    expect(parsed).toHaveProperty("schemaVersion");
  });

  it("lists included fields correctly", () => {
    const bundle = buildOfflineBundle({
      request: MULTI_SCOPE_REQUEST,
      source: VALID_BUNDLE_SOURCE,
      digestValue: "abc123",
      nonce: "test-nonce",
    });

    const fields = includedFields(bundle);
    expect(fields).toContain("public.type");
    expect(fields).toContain("public.issuer");
    expect(fields).toContain("subject.walletHash");
    expect(fields).toContain("amount.thresholdAmount");
    expect(fields).not.toContain("sender.sourceAddress");
  });
});

describe("Offline Verification", () => {
  const validBundle = buildOfflineBundle({
    request: PUBLIC_ONLY_REQUEST,
    source: VALID_BUNDLE_SOURCE,
    digestValue: "abc123def456",
    nonce: "test-nonce-verify",
    now: new Date("2025-01-15T10:00:00Z"),
  });

  it("verifies bundle with correct digest", () => {
    const result = verifyOfflineBundle({
      bundle: validBundle,
      actualDigest: "abc123def456",
      now: new Date("2025-01-15T10:00:00Z"),
    });

    expect(result.status).toBe("verified-offline");
    expect(result.fresh).toBe(true);
    expect(result.revocation).toBe("not-checked-offline");
  });

  it("rejects bundle with mismatched digest", () => {
    const result = verifyOfflineBundle({
      bundle: validBundle,
      actualDigest: "wrong_digest",
      now: new Date("2025-01-15T10:00:00Z"),
    });

    expect(result.status).toBe("integrity-failed");
    expect(result.fresh).toBe(false);
  });

  it("rejects expired bundle", () => {
    const result = verifyOfflineBundle({
      bundle: validBundle,
      actualDigest: "abc123def456",
      now: new Date("2025-02-01T00:00:00Z"),
    });

    expect(result.status).toBe("expired");
    expect(result.fresh).toBe(false);
  });

  it("rejects replayed bundle", () => {
    const result = verifyOfflineBundle({
      bundle: validBundle,
      actualDigest: "abc123def456",
      now: new Date("2025-01-15T10:00:00Z"),
      seenNonces: ["test-nonce-verify"],
    });

    expect(result.status).toBe("replayed");
    expect(result.fresh).toBe(true);
  });

  it("rejects bundle with unsupported schema version", () => {
    const bundleWithBadSchema = {
      ...validBundle,
      schemaVersion: 999,
    };

    const result = verifyOfflineBundle({
      bundle: bundleWithBadSchema,
      actualDigest: "abc123def456",
      now: new Date("2025-01-15T10:00:00Z"),
    });

    expect(result.status).toBe("unsupported-schema");
  });

  it("checks schema before digest", () => {
    const bundleWithBadSchema = {
      ...validBundle,
      schemaVersion: 999,
    };

    const result = verifyOfflineBundle({
      bundle: bundleWithBadSchema,
      actualDigest: "wrong_digest",
    });

    expect(result.status).toBe("unsupported-schema");
  });

  it("checks digest before expiry", () => {
    const result = verifyOfflineBundle({
      bundle: validBundle,
      actualDigest: "wrong_digest",
      now: new Date("2025-02-01T00:00:00Z"),
    });

    expect(result.status).toBe("integrity-failed");
  });
});

describe("Freshness Refresh", () => {
  const validBundle = buildOfflineBundle({
    request: PUBLIC_ONLY_REQUEST,
    source: VALID_BUNDLE_SOURCE,
    digestValue: "abc123",
    nonce: "test-nonce-refresh",
  });

  it("returns refreshed status when online and valid", () => {
    const result = refreshOfflineBundle({
      bundle: validBundle,
      isOnline: true,
      revoked: false,
    });

    expect(result.status).toBe("refreshed");
    expect(result.revocation).toBe("current");
  });

  it("returns offline status when not online", () => {
    const result = refreshOfflineBundle({
      bundle: validBundle,
      isOnline: false,
    });

    expect(result.status).toBe("offline");
    expect(result.revocation).toBe("unknown");
  });

  it("returns revoked status when proof is revoked", () => {
    const result = refreshOfflineBundle({
      bundle: validBundle,
      isOnline: true,
      revoked: true,
    });

    expect(result.status).toBe("revoked");
    expect(result.revocation).toBe("current");
  });

  it("returns expired status when bundle has expired", () => {
    const now = new Date("2025-02-01T00:00:00Z");
    const result = refreshOfflineBundle({
      bundle: validBundle,
      isOnline: true,
      revoked: false,
      now,
    });

    expect(result.status).toBe("expired");
    expect(result.revocation).toBe("current");
  });
});

describe("Scoped Payload", () => {
  it("includes public fields", () => {
    const payload = scopedPayload(VALID_BUNDLE_SOURCE, ["public"]);
    expect(payload).toHaveProperty("public");
    expect(payload.public).toEqual(VALID_BUNDLE_SOURCE.public);
  });

  it("includes requested private scopes", () => {
    const payload = scopedPayload(VALID_BUNDLE_SOURCE, [
      "public",
      "subject",
      "amount",
    ]);
    expect(payload).toHaveProperty("subject");
    expect(payload).toHaveProperty("amount");
    expect(payload).not.toHaveProperty("sender");
  });

  it("omits unrequested private scopes", () => {
    const payload = scopedPayload(VALID_BUNDLE_SOURCE, ["public"]);
    expect(payload).not.toHaveProperty("subject");
    expect(payload).not.toHaveProperty("amount");
    expect(payload).not.toHaveProperty("sender");
  });

  it("omits unavailable private scopes", () => {
    const payload = scopedPayload(MINIMAL_BUNDLE_SOURCE, [
      "public",
      "subject",
      "amount",
    ]);
    expect(payload).toHaveProperty("public");
    expect(payload).not.toHaveProperty("subject");
    expect(payload).not.toHaveProperty("amount");
  });
});
