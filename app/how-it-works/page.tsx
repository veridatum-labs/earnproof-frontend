import { InfoSection } from "@/components/common/info-section";
import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PageHeading
          description="EarnProof turns qualifying Stellar payment activity into a signed claim that can be checked without exposing the worker's full wallet history."
          eyebrow="Protocol flow"
          title="A private proof from wallet payment to verification link"
        />
        <InfoSection
          items={[
            "A worker connects Freighter and signs a short-lived authentication challenge.",
            "The backend indexes incoming Stellar testnet payments and normalizes supported assets.",
            "The worker classifies which payments qualify as income and chooses a proof type.",
            "EarnProof evaluates the condition, signs a credential, and creates a shareable verification link.",
            "A verifier checks signature, expiration, revocation, issuer, network, asset, and claim result.",
            "The verifier only sees the fields the proof intentionally discloses.",
          ]}
          title="MVP steps"
        />
      </section>
    </PublicShell>
  );
}
