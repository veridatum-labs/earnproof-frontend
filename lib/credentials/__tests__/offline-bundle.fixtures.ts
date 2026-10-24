/**
 * Test fixtures for offline verification bundle workflow (#294, #311).
 * Provides synthetic data for positive, negative, authorization, and
 * boundary test cases.
 */

import {
  type OfflineBundleSource,
  type BundleSourceSignature,
  type BundleSourceCheckpoint,
  type OfflineBundleRequest,
  type OfflineBundlePolicy,
  DEFAULT_OFFLINE_BUNDLE_POLICY,
  OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
  OFFLINE_BUNDLE_MIN_VALIDITY_HOURS,
} from "@/lib/credentials/offline-bundle";

/** Valid bundle source with complete metadata. */
export const VALID_BUNDLE_SOURCE: OfflineBundleSource = {
  proofId: "proof-test-001",
  network: "testnet",
  contractId: "C" + "A".repeat(55),
  public: {
    type: "income-threshold",
    schemaVersion: "1.0.0",
    issuer: "test-issuer",
  },
  private: {
    subject: { walletHash: "hash_test_001" },
    amount: { thresholdAmount: "5000000", assetCode: "USDC" },
    sender: { sourceAddress: "GTEST001" },
  },
  metadata: {
    signature: {
      algorithm: "EdDSA",
      value: "sig_valid_test_001",
      signedAt: new Date("2025-01-15T10:00:00Z").toISOString(),
      signer: "test-issuer-key-001",
    },
    checkpoint: {
      capturedAt: new Date("2025-01-15T09:00:00Z").toISOString(),
      maxAgeSeconds: 3600,
    },
  },
};

/** Bundle source with missing private fields. */
export const MINIMAL_BUNDLE_SOURCE: OfflineBundleSource = {
  proofId: "proof-test-minimal",
  network: "testnet",
  contractId: "C" + "B".repeat(55),
  public: {
    type: "employment-verification",
    schemaVersion: "1.0.0",
    issuer: "minimal-issuer",
  },
  metadata: {
    signature: {
      algorithm: "ES256",
      value: "sig_minimal_test",
      signedAt: new Date("2025-01-15T10:00:00Z").toISOString(),
      signer: "minimal-issuer-key",
    },
    checkpoint: {
      capturedAt: new Date("2025-01-15T09:00:00Z").toISOString(),
      maxAgeSeconds: 1800,
    },
  },
};

/** Bundle source without metadata (simulates mock/fixture data). */
export const SOURCE_WITHOUT_METADATA: OfflineBundleSource = {
  proofId: "proof-demo-001",
  network: "testnet",
  contractId: "C" + "A".repeat(55),
  public: {
    type: "income-threshold",
    schemaVersion: "1.0.0",
    issuer: "demo-issuer",
  },
  private: {
    subject: { walletHash: "hash_demo" },
    amount: { thresholdAmount: "5000000", assetCode: "USDC" },
    sender: { sourceAddress: "GDEMO" },
  },
};

/** Stale checkpoint (evidence captured too long ago). */
export const STALE_CHECKPOINT: BundleSourceCheckpoint = {
  capturedAt: new Date("2025-01-01T00:00:00Z").toISOString(),
  maxAgeSeconds: 3600, // 1 hour max age
};

/** Fresh checkpoint (just captured). */
export const FRESH_CHECKPOINT: BundleSourceCheckpoint = {
  capturedAt: new Date("2025-01-15T10:00:00Z").toISOString(),
  maxAgeSeconds: 86400, // 24 hours max age
};

/** Future checkpoint (should fail validation). */
export const FUTURE_CHECKPOINT: BundleSourceCheckpoint = {
  capturedAt: new Date("2099-01-01T00:00:00Z").toISOString(),
  maxAgeSeconds: 3600,
};

/** Valid signature metadata. */
export const VALID_SIGNATURE: BundleSourceSignature = {
  algorithm: "EdDSA",
  value: "sig_valid_complete",
  signedAt: new Date("2025-01-15T10:00:00Z").toISOString(),
  signer: "test-signer-001",
};

/** Signature with missing algorithm. */
export const INVALID_SIGNATURE_NO_ALGO: BundleSourceSignature = {
  algorithm: "",
  value: "sig_test",
  signedAt: new Date().toISOString(),
  signer: "test-signer",
};

/** Signature with missing value. */
export const INVALID_SIGNATURE_NO_VALUE: BundleSourceSignature = {
  algorithm: "EdDSA",
  value: "",
  signedAt: new Date().toISOString(),
  signer: "test-signer",
};

/** Valid request for public scope only. */
export const PUBLIC_ONLY_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public"],
  requestedValidityHours: 24,
};

/** Valid request with multiple scopes. */
export const MULTI_SCOPE_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public", "subject", "amount"],
  requestedValidityHours: 48,
};

/** Request with maximum validity window. */
export const MAX_VALIDITY_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public"],
  requestedValidityHours: OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
};

/** Request with minimum validity window. */
export const MIN_VALIDITY_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public"],
  requestedValidityHours: OFFLINE_BUNDLE_MIN_VALIDITY_HOURS,
};

/** Request with invalid (too high) validity. */
export const INVALID_VALIDITY_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public"],
  requestedValidityHours: OFFLINE_BUNDLE_MAX_VALIDITY_HOURS + 1,
};

/** Request with invalid (too low) validity. */
export const INVALID_LOW_VALIDITY_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public"],
  requestedValidityHours: OFFLINE_BUNDLE_MIN_VALIDITY_HOURS - 1,
};

/** Request with invalid (non-integer) validity. */
export const INVALID_NON_INTEGER_VALIDITY_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["public"],
  requestedValidityHours: 24.5,
};

/** Request with missing proofId. */
export const INVALID_NO_PROOF_ID_REQUEST: OfflineBundleRequest = {
  proofId: "",
  scopes: ["public"],
  requestedValidityHours: 24,
};

/** Request without public scope. */
export const INVALID_NO_PUBLIC_SCOPE_REQUEST: OfflineBundleRequest = {
  proofId: "proof-test-001",
  scopes: ["subject", "amount"],
  requestedValidityHours: 24,
};

/** Default authorization policy (all allowed). */
export const PERMISSIVE_POLICY: OfflineBundlePolicy = DEFAULT_OFFLINE_BUNDLE_POLICY;

/** Restrictive policy: no bundles allowed. */
export const RESTRICTIVE_NO_BUNDLES_POLICY: OfflineBundlePolicy = {
  canCreateBundles: false,
  maxValidityHours: 0,
};

/** Restrictive policy: limited validity window. */
export const RESTRICTIVE_LIMITED_VALIDITY_POLICY: OfflineBundlePolicy = {
  canCreateBundles: true,
  maxValidityHours: 12,
  requiredScopes: ["public"],
};

/** Restrictive policy: only public scope allowed. */
export const RESTRICTIVE_SCOPE_POLICY: OfflineBundlePolicy = {
  canCreateBundles: true,
  maxValidityHours: OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
  requiredScopes: ["public"],
};

/** Restrictive policy: specific proof denied. */
export const RESTRICTIVE_PROOF_DENIED_POLICY: OfflineBundlePolicy = {
  canCreateBundles: true,
  maxValidityHours: OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
  proofPermissions: {
    "proof-denied-001": {
      allowed: false,
      reason: "This proof is archived and cannot be bundled.",
    },
  },
};

/** Helper to create a custom bundle source for testing. */
export function createBundleSource(
  overrides: Partial<OfflineBundleSource> = {},
): OfflineBundleSource {
  return { ...VALID_BUNDLE_SOURCE, ...overrides };
}

/** Helper to create a custom request for testing. */
export function createRequest(
  overrides: Partial<OfflineBundleRequest> = {},
): OfflineBundleRequest {
  return { ...PUBLIC_ONLY_REQUEST, ...overrides };
}

/** Helper to create a custom policy for testing. */
export function createPolicy(
  overrides: Partial<OfflineBundlePolicy> = {},
): OfflineBundlePolicy {
  return { ...PERMISSIVE_POLICY, ...overrides };
}
