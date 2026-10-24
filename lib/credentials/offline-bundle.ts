/**
 * Offline verification bundle workflow (#294).
 * ============================================
 *
 * Users need to prepare and verify *bounded* signed evidence when temporary
 * network access is unavailable. The lifecycle is:
 *
 *   1. request a bundle (choose disclosure scopes + a validity window),
 *   2. download it,
 *   3. check its integrity locally (SHA-256 over the exact bytes),
 *   4. verify it offline, and
 *   5. refresh its freshness/revocation state once back online.
 *
 * Three invariants are baked into the types and functions here:
 *
 *   - **Time-bounded.** A bundle carries `validUntil`; verification past it is
 *     `expired`, never `verified-offline`.
 *   - **No revocation claims offline.** Offline verification always reports
 *     `revocation: "not-checked-offline"` — it can never assert current
 *     revocation state. Only `refreshOfflineBundle()` (online) may do that.
 *   - **Scoped disclosure.** Only the requested private scopes are copied into
 *     the payload; everything else is left out.
 *
 * Fail-closed: an unsupported schema version, a digest mismatch, or a replayed
 * bundle all resolve to a non-verified status rather than a pass.
 *
 * Live bundle source API (#311):
 * =============================
 *
 * The bundle source (public and private fields) is fetched from a live API
 * endpoint: GET /proofs/{proofId}/offline-bundle-source. The endpoint returns
 * signed metadata with:
 *
 *   - Scope-based fields (public, subject, amount, sender)
 *   - Signature proof of authorization and integrity
 *   - Checkpoint freshness (timestamp when evidence was captured)
 *
 * The bundle source is fetched server-side during page load, validated for
 * authorization and freshness, then passed to the client workflow. The client
 * never calls the API directly — it works entirely offline after receiving
 * the source.
 */

export const OFFLINE_BUNDLE_SCHEMA_VERSION = 1;

export const OFFLINE_BUNDLE_MIN_VALIDITY_HOURS = 1;
export const OFFLINE_BUNDLE_MAX_VALIDITY_HOURS = 72;

export const OFFLINE_DISCLOSURE_SCOPES = ["public", "subject", "amount", "sender"] as const;

export type OfflineDisclosureScope = (typeof OFFLINE_DISCLOSURE_SCOPES)[number];

/**
 * Authorization and capability policy for offline bundle operations.
 */
export type OfflineBundlePolicy = {
  /** Whether the user/token is authorized to create offline bundles. */
  canCreateBundles: boolean;
  /** Maximum validity window allowed (in hours). Defaults to OFFLINE_BUNDLE_MAX_VALIDITY_HOURS. */
  maxValidityHours?: number;
  /** Required scopes for authorization. Empty array means all scopes are allowed. */
  requiredScopes?: OfflineDisclosureScope[];
  /** Proof-specific permissions (if null, inherits policy; if defined, overrides). */
  proofPermissions?: Record<string, { allowed: boolean; reason?: string }>;
};

/** Default authorization policy: bundles are allowed with standard constraints. */
export const DEFAULT_OFFLINE_BUNDLE_POLICY: OfflineBundlePolicy = {
  canCreateBundles: true,
  maxValidityHours: OFFLINE_BUNDLE_MAX_VALIDITY_HOURS,
  requiredScopes: [],
};

/** Unauthorized policy: bundles are not allowed. */
export const UNAUTHORIZED_OFFLINE_BUNDLE_POLICY: OfflineBundlePolicy = {
  canCreateBundles: false,
  maxValidityHours: 0,
};

/** Checks if a proof is authorized for offline bundle creation under the given policy. */
export function isProofAuthorizedForOfflineBundle(
  proofId: string,
  policy: OfflineBundlePolicy,
): { authorized: boolean; reason?: string } {
  if (!policy.canCreateBundles) {
    return {
      authorized: false,
      reason: "Offline bundle creation is not enabled for your account.",
    };
  }

  if (policy.proofPermissions?.[proofId]) {
    const permission = policy.proofPermissions[proofId];
    return {
      authorized: permission.allowed,
      reason: permission.reason,
    };
  }

  return { authorized: true };
}

/** Checks if requested scopes are allowed under the given policy. */
export function areScopesAuthorizedForOfflineBundle(
  scopes: readonly OfflineDisclosureScope[],
  policy: OfflineBundlePolicy,
): { authorized: boolean; reason?: string } {
  if (policy.requiredScopes && policy.requiredScopes.length > 0) {
    const disallowed = scopes.filter((scope) => !policy.requiredScopes!.includes(scope));
    if (disallowed.length > 0) {
      return {
        authorized: false,
        reason: `Offline bundle scopes ${disallowed.join(", ")} are not authorized for your account.`,
      };
    }
  }

  return { authorized: true };
}

/** Checks if requested validity hours are allowed under the given policy. */
export function isValidityAuthorizedForOfflineBundle(
  requestedHours: number,
  policy: OfflineBundlePolicy,
): { authorized: boolean; reason?: string } {
  const maxHours = policy.maxValidityHours ?? OFFLINE_BUNDLE_MAX_VALIDITY_HOURS;

  if (requestedHours > maxHours) {
    return {
      authorized: false,
      reason: `Requested validity window (${requestedHours}h) exceeds maximum allowed (${maxHours}h).`,
    };
  }

  return { authorized: true };
}

export function isOfflineDisclosureScope(value: unknown): value is OfflineDisclosureScope {
  return (
    typeof value === "string" &&
    (OFFLINE_DISCLOSURE_SCOPES as readonly string[]).includes(value)
  );
}

/** Private scopes are the ones that disclose more than the public record. */
export const PRIVATE_DISCLOSURE_SCOPES: readonly OfflineDisclosureScope[] = [
  "subject",
  "amount",
  "sender",
];

export type OfflineBundleRequest = {
  proofId: string;
  scopes: OfflineDisclosureScope[];
  requestedValidityHours: number;
  reason?: string;
};

/** Metadata signature proving authorization and integrity of bundle source. */
export type BundleSourceSignature = {
  /** The signature algorithm used (e.g., "EdDSA", "ES256"). */
  algorithm: string;
  /** The signature value (hex-encoded or base64). */
  value: string;
  /** When the signature was created (ISO 8601). */
  signedAt: string;
  /** Public key or key ID used for verification. */
  signer: string;
};

/** Checkpoint proof that evidence was captured within acceptable bounds. */
export type BundleSourceCheckpoint = {
  /** When the proof evidence was captured (ISO 8601). */
  capturedAt: string;
  /** Maximum age of evidence before it's considered stale (in seconds). */
  maxAgeSeconds: number;
};

/** The bundle source with signed metadata and freshness proof. */
export type OfflineBundleSource = {
  proofId: string;
  network: string;
  contractId: string;
  /** Always-included public fields (never more than the public record). */
  public: Record<string, unknown>;
  /** Optional private disclosures, keyed by scope. */
  private?: Partial<Record<"subject" | "amount" | "sender", Record<string, unknown>>>;
  /** Proof that this source is authorized and fresh (required for live API). */
  metadata?: {
    signature: BundleSourceSignature;
    checkpoint: BundleSourceCheckpoint;
  };
};

export type BundleValidationSeverity = "error" | "warning";

export type BundleValidationIssue = {
  field: string;
  message: string;
  severity: BundleValidationSeverity;
};

/** Validates that bundle source metadata is fresh and within acceptable bounds. */
export function validateBundleSourceCheckpoint(
  checkpoint: BundleSourceCheckpoint,
  now?: Date,
): BundleValidationIssue[] {
  const issues: BundleValidationIssue[] = [];
  const currentTime = now ?? new Date();

  if (!checkpoint.capturedAt) {
    issues.push({
      field: "checkpoint.capturedAt",
      message: "Checkpoint capture time is required.",
      severity: "error",
    });
    return issues;
  }

  try {
    const capturedTime = new Date(checkpoint.capturedAt);
    if (isNaN(capturedTime.getTime())) {
      throw new Error("Invalid date");
    }

    const ageSeconds = (currentTime.getTime() - capturedTime.getTime()) / 1000;

    if (ageSeconds < 0) {
      issues.push({
        field: "checkpoint.capturedAt",
        message: "Checkpoint capture time is in the future.",
        severity: "error",
      });
    } else if (ageSeconds > checkpoint.maxAgeSeconds) {
      issues.push({
        field: "checkpoint",
        message: `Evidence is stale: captured ${Math.round(ageSeconds)} seconds ago (max: ${checkpoint.maxAgeSeconds}s).`,
        severity: "error",
      });
    }
  } catch {
    issues.push({
      field: "checkpoint.capturedAt",
      message: "Invalid checkpoint capture time format.",
      severity: "error",
    });
  }

  return issues;
}

/** Validates that bundle source signature is properly formed. */
export function validateBundleSourceSignature(
  signature: BundleSourceSignature,
): BundleValidationIssue[] {
  const issues: BundleValidationIssue[] = [];

  if (!signature.algorithm || signature.algorithm.trim().length === 0) {
    issues.push({
      field: "signature.algorithm",
      message: "Signature algorithm is required.",
      severity: "error",
    });
  }

  if (!signature.value || signature.value.trim().length === 0) {
    issues.push({
      field: "signature.value",
      message: "Signature value is required.",
      severity: "error",
    });
  }

  if (!signature.signedAt) {
    issues.push({
      field: "signature.signedAt",
      message: "Signature timestamp is required.",
      severity: "error",
    });
  } else {
    try {
      const signedTime = new Date(signature.signedAt);
      if (isNaN(signedTime.getTime())) {
        throw new Error("Invalid date");
      }
    } catch {
      issues.push({
        field: "signature.signedAt",
        message: "Invalid signature timestamp format.",
        severity: "error",
      });
    }
  }

  if (!signature.signer || signature.signer.trim().length === 0) {
    issues.push({
      field: "signature.signer",
      message: "Signer identifier is required.",
      severity: "error",
    });
  }

  return issues;
}

/** Validates complete bundle source metadata for production readiness. */
export function validateBundleSourceMetadata(
  metadata: OfflineBundleSource["metadata"],
  now?: Date,
): BundleValidationIssue[] {
  const issues: BundleValidationIssue[] = [];

  if (!metadata) {
    issues.push({
      field: "metadata",
      message: "Bundle source metadata is required for production use.",
      severity: "error",
    });
    return issues;
  }

  issues.push(...validateBundleSourceSignature(metadata.signature));
  issues.push(...validateBundleSourceCheckpoint(metadata.checkpoint, now));

  return issues;
}

export function validateOfflineBundleRequest(
  request: OfflineBundleRequest,
  policy?: OfflineBundlePolicy,
): BundleValidationIssue[] {
  const issues: BundleValidationIssue[] = [];
  const effectivePolicy = policy ?? DEFAULT_OFFLINE_BUNDLE_POLICY;

  if (!request.proofId || request.proofId.trim().length === 0) {
    issues.push({
      field: "proofId",
      message: "A proof ID is required to prepare a bundle.",
      severity: "error",
    });
  } else if (!effectivePolicy.canCreateBundles) {
    issues.push({
      field: "proofId",
      message: "Offline bundle creation is not authorized for your account.",
      severity: "error",
    });
  } else {
    const proofAuth = isProofAuthorizedForOfflineBundle(request.proofId, effectivePolicy);
    if (!proofAuth.authorized) {
      issues.push({
        field: "proofId",
        message: proofAuth.reason ?? "This proof is not authorized for offline bundles.",
        severity: "error",
      });
    }
  }

  if (
    !Number.isInteger(request.requestedValidityHours) ||
    request.requestedValidityHours < OFFLINE_BUNDLE_MIN_VALIDITY_HOURS
  ) {
    issues.push({
      field: "requestedValidityHours",
      message: `Bundles must be valid for at least ${OFFLINE_BUNDLE_MIN_VALIDITY_HOURS} hour(s).`,
      severity: "error",
    });
  } else if (request.requestedValidityHours > (effectivePolicy.maxValidityHours ?? OFFLINE_BUNDLE_MAX_VALIDITY_HOURS)) {
    issues.push({
      field: "requestedValidityHours",
      message: `Bundles may be valid for at most ${effectivePolicy.maxValidityHours ?? OFFLINE_BUNDLE_MAX_VALIDITY_HOURS} hours.`,
      severity: "error",
    });
  }

  if (!request.scopes.includes("public")) {
    issues.push({
      field: "scopes",
      message: "The public scope is always included.",
      severity: "error",
    });
  }

  for (const scope of request.scopes) {
    if (!isOfflineDisclosureScope(scope)) {
      issues.push({
        field: "scopes",
        message: `Unknown disclosure scope "${String(scope)}".`,
        severity: "error",
      });
    }
  }

  const scopeAuth = areScopesAuthorizedForOfflineBundle(request.scopes, effectivePolicy);
  if (!scopeAuth.authorized) {
    issues.push({
      field: "scopes",
      message: scopeAuth.reason ?? "Some requested scopes are not authorized.",
      severity: "error",
    });
  }

  return issues;
}

export function isOfflineBundleRequestValid(request: OfflineBundleRequest): boolean {
  return !validateOfflineBundleRequest(request).some((issue) => issue.severity === "error");
}

export type OfflineVerificationBundle = {
  schemaVersion: number;
  bundleId: string;
  createdAt: string;
  validUntil: string;
  network: string;
  contractId: string;
  scopes: OfflineDisclosureScope[];
  /** Only the requested scopes' fields. */
  payload: Record<string, unknown>;
  digest: { algorithm: "SHA-256"; value: string };
  /** A bundle prepared offline can never carry a current revocation claim. */
  revocation: {
    checkedAt: string;
    state: "unknown-offline";
    authority: string;
  };
  /** Unique per bundle; used to detect replay within a session. */
  nonce: string;
};

/**
 * Builds the scoped payload: the public record plus only those private scopes
 * that were requested *and* are present in the source.
 */
export function scopedPayload(
  source: OfflineBundleSource,
  scopes: readonly OfflineDisclosureScope[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = { public: source.public };
  for (const scope of PRIVATE_DISCLOSURE_SCOPES) {
    if (!scopes.includes(scope)) {
      continue;
    }
    const disclosed = source.private?.[scope as "subject" | "amount" | "sender"];
    if (disclosed) {
      payload[scope] = disclosed;
    }
  }
  return payload;
}

export function buildOfflineBundle(args: {
  request: OfflineBundleRequest;
  source: OfflineBundleSource;
  digestValue: string;
  nonce: string;
  now?: Date;
}): OfflineVerificationBundle {
  const { request, source, digestValue, nonce, now = new Date() } = args;

  const validUntil = new Date(
    now.getTime() + request.requestedValidityHours * 60 * 60 * 1000,
  );

  return {
    schemaVersion: OFFLINE_BUNDLE_SCHEMA_VERSION,
    bundleId: `${source.proofId}:${nonce}`,
    createdAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    network: source.network,
    contractId: source.contractId,
    scopes: [...request.scopes],
    payload: scopedPayload(source, request.scopes),
    digest: { algorithm: "SHA-256", value: digestValue },
    revocation: {
      checkedAt: now.toISOString(),
      state: "unknown-offline",
      authority: "none-offline",
    },
    nonce,
  };
}

/** The field paths a bundle actually discloses. */
export function includedFields(bundle: OfflineVerificationBundle): string[] {
  const fields: string[] = [];
  for (const [scope, value] of Object.entries(bundle.payload)) {
    if (value && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        fields.push(`${scope}.${key}`);
      }
    }
  }
  return fields;
}

/**
 * The exact text the bundle's SHA-256 digest is computed over: every field
 * except `digest` itself (which would be circular). Both creation and local
 * verification use this so the digest is reproducible offline.
 */
export function bundleDigestInput(bundle: OfflineVerificationBundle): string {
  const copy: Record<string, unknown> = { ...bundle };
  delete copy.digest;
  return JSON.stringify(copy);
}

/** The portable JSON representation written to disk for a bundle. */
export function serializeOfflineBundle(bundle: OfflineVerificationBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export type OfflineVerificationStatus =
  | "verified-offline"
  | "expired"
  | "integrity-failed"
  | "replayed"
  | "unsupported-schema";

export type OfflineVerificationResult = {
  status: OfflineVerificationStatus;
  evaluatedAt: string;
  validUntil: string;
  fresh: boolean;
  /** Offline verification can never assert current revocation state. */
  revocation: "not-checked-offline";
  scopes: OfflineDisclosureScope[];
  message: string;
};

/**
 * Verifies a bundle offline. Deterministic check order:
 * schema → integrity → expiry → replay. `actualDigest` is computed by the
 * caller over the exact bytes being verified.
 */
export function verifyOfflineBundle(args: {
  bundle: OfflineVerificationBundle;
  actualDigest: string;
  now?: Date;
  seenNonces?: readonly string[];
}): OfflineVerificationResult {
  const { bundle, actualDigest, now = new Date(), seenNonces = [] } = args;

  const base = {
    evaluatedAt: now.toISOString(),
    validUntil: bundle.validUntil,
    revocation: "not-checked-offline" as const,
    scopes: bundle.scopes,
  };

  if (bundle.schemaVersion !== OFFLINE_BUNDLE_SCHEMA_VERSION) {
    return {
      ...base,
      status: "unsupported-schema",
      fresh: false,
      message: "This bundle was created by an unsupported version.",
    };
  }

  if (
    typeof actualDigest !== "string" ||
    actualDigest.toLowerCase() !== bundle.digest.value.toLowerCase()
  ) {
    return {
      ...base,
      status: "integrity-failed",
      fresh: false,
      message: "Integrity check failed: the bundle contents do not match its digest.",
    };
  }

  const expired = now.getTime() > new Date(bundle.validUntil).getTime();
  if (expired) {
    return {
      ...base,
      status: "expired",
      fresh: false,
      message: "This bundle has expired and can no longer be verified offline.",
    };
  }

  if (seenNonces.includes(bundle.nonce)) {
    return {
      ...base,
      status: "replayed",
      fresh: true,
      message: "This bundle was already verified in this session.",
    };
  }

  return {
    ...base,
    status: "verified-offline",
    fresh: true,
    message: "Verified offline. Revocation state was not checked and is not asserted.",
  };
}

export type FreshnessRefreshResult = {
  status: "refreshed" | "offline" | "revoked" | "expired";
  checkedAt: string;
  /** Only an online refresh may report a current revocation state. */
  revocation: "current" | "unknown";
  message: string;
};

/**
 * Refreshes a bundle's freshness/revocation state. Without connectivity this
 * can only report `offline` with `revocation: "unknown"` — it never guesses.
 */
export function refreshOfflineBundle(args: {
  bundle: OfflineVerificationBundle;
  isOnline: boolean;
  revoked?: boolean;
  now?: Date;
}): FreshnessRefreshResult {
  const { bundle, isOnline, revoked = false, now = new Date() } = args;

  if (!isOnline) {
    return {
      status: "offline",
      checkedAt: now.toISOString(),
      revocation: "unknown",
      message: "Still offline — revocation state cannot be refreshed yet.",
    };
  }

  if (revoked) {
    return {
      status: "revoked",
      checkedAt: now.toISOString(),
      revocation: "current",
      message: "The proof was revoked after this bundle was created.",
    };
  }

  if (now.getTime() > new Date(bundle.validUntil).getTime()) {
    return {
      status: "expired",
      checkedAt: now.toISOString(),
      revocation: "current",
      message: "The bundle is expired; prepare a fresh one.",
    };
  }

  return {
    status: "refreshed",
    checkedAt: now.toISOString(),
    revocation: "current",
    message: "Freshness and revocation state refreshed.",
  };
}

export async function fetchMockOfflineBundleSource(
  overrides: Partial<OfflineBundleSource> = {},
): Promise<OfflineBundleSource> {
  return {
    proofId: "proof-demo-001",
    network: "testnet",
    contractId: `C${"A".repeat(55)}`,
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
    ...overrides,
  };
}

/** Fetches live offline bundle source from the API with authorization and validation. */
export async function fetchOfflineBundleSource(
  proofId: string,
  token?: string,
  signal?: AbortSignal,
): Promise<OfflineBundleSource> {
  // Dynamic import to avoid circular dependencies with API client in SSR context
  const { apiClient } = await import("@/lib/api/client");
  const { bearer } = await import("@/lib/api/client");

  try {
    const headers = token ? bearer(token) : {};

    const source = await apiClient<OfflineBundleSource>({
      path: `/proofs/${encodeURIComponent(proofId)}/offline-bundle-source`,
      method: "GET",
      headers,
      signal,
    });

    // Validate that live API response includes required metadata
    const metadataIssues = validateBundleSourceMetadata(source.metadata);
    const errors = metadataIssues.filter((issue) => issue.severity === "error");

    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      throw new Error(`Bundle source validation failed: ${errorMessages}`);
    }

    return source;
  } catch (error) {
    // Re-throw API errors and validation errors as-is
    if (error instanceof Error && error.message.includes("validation failed")) {
      throw error;
    }
    // Wrap other errors in a descriptive message
    throw new Error(
      `Failed to fetch offline bundle source for proof "${proofId}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
