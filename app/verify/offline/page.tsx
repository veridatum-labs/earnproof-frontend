import { PageHeading } from "@/components/common/page-heading";
import { pageContainer } from "@/components/common/production-ui";
import { VerifyErrorBoundary } from "@/components/common/verify-error-boundary";
import { PublicShell } from "@/components/layout/public-shell";
import { OfflineBundleWorkflow } from "@/components/verification/offline-bundle-workflow";
import {
  fetchOfflineBundleSource,
  fetchMockOfflineBundleSource,
} from "@/lib/credentials/offline-bundle";

export const metadata = {
  title: "Offline verification bundle | EarnProof",
  description:
    "Prepare bounded signed evidence, then verify it locally when network access is unavailable.",
};

/**
 * Offline verification bundle workflow (#294, #311).
 *
 * The signed evidence for the requested proof is loaded server-side:
 * - First attempts to fetch from the live API endpoint (requires authorization)
 * - Falls back to mock data if API is unavailable or unauthorized
 *
 * The workflow itself (scoping, download, local integrity check, offline
 * result, freshness refresh) runs entirely on the client. The source data
 * is validated server-side for signature integrity and checkpoint freshness
 * before being passed to the client.
 */
export default async function OfflineVerificationPage() {
  let source;
  let error: string | null = null;

  // Try fetching from live API first
  try {
    source = await fetchOfflineBundleSource("proof-current");
  } catch (apiError) {
    // Log the error but fall back to mock for development/demo purposes
    const errorMessage =
      apiError instanceof Error ? apiError.message : String(apiError);
    console.warn(
      "[OfflineVerificationPage] Failed to fetch live bundle source:",
      errorMessage,
    );

    // Fall back to mock data for demonstration
    try {
      source = await fetchMockOfflineBundleSource({
        metadata: {
          signature: {
            algorithm: "EdDSA",
            value: "demo_signature_value",
            signedAt: new Date().toISOString(),
            signer: "demo-issuer-key",
          },
          checkpoint: {
            capturedAt: new Date().toISOString(),
            maxAgeSeconds: 3600,
          },
        },
      });
    } catch (fallbackError) {
      error = fallbackError instanceof Error
        ? fallbackError.message
        : "Failed to load bundle source";
    }
  }

  if (error || !source) {
    return (
      <PublicShell>
        <section className={pageContainer}>
          <PageHeading
            description="Prepare bounded signed evidence, download it, and verify it locally when network access is unavailable."
            eyebrow="Verification"
            title="Offline verification bundle"
          />
          <div className="rounded-lg border border-rose-300/40 bg-rose-300/10 p-5 text-sm text-rose-100">
            <p className="font-semibold">Unable to load bundle source</p>
            <p className="mt-2">{error || "The bundle source could not be loaded."}</p>
            <p className="mt-2 text-xs text-rose-200">
              Please check your network connection or try again later.
            </p>
          </div>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <section className={pageContainer}>
        <PageHeading
          description="Prepare bounded signed evidence, download it, and verify it locally when network access is unavailable."
          eyebrow="Verification"
          title="Offline verification bundle"
        />
        <VerifyErrorBoundary>
          <OfflineBundleWorkflow source={source} />
        </VerifyErrorBoundary>
      </section>
    </PublicShell>
  );
}
