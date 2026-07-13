import { InfoSection } from "@/components/common/info-section";
import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";

export default function IssuersPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PageHeading
          description="The issuer directory will list approved organizations that can create higher-trust payment attestations for workers."
          eyebrow="Issuer directory"
          title="Registered income issuers"
        />
        <InfoSection
          items={[
            "Issuer profile, website, public metadata, and Stellar issuer address.",
            "Current issuer status from the registry: active, suspended, or revoked.",
            "Trust labels that distinguish EarnProof-signed self-generated proofs from issuer-backed proofs.",
          ]}
          title="Directory scope"
        />
      </section>
    </PublicShell>
  );
}
