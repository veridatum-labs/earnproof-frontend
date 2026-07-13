import { InfoSection } from "@/components/common/info-section";
import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";

export default function DevelopersPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PageHeading
          description="The developer surface will expose verification APIs, credential schemas, webhook events, and a future TypeScript SDK."
          eyebrow="Developer platform"
          title="Integrate income proof verification"
        />
        <InfoSection
          items={[
            "Verify a public proof by ID through the versioned API.",
            "Submit a credential payload for machine-readable verification.",
            "Register webhooks for proof revocation, expiration, and verification events.",
            "Use shared schemas for proof types, claims, disclosure policies, and status responses.",
          ]}
          title="Planned surfaces"
        />
      </section>
    </PublicShell>
  );
}
