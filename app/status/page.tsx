import { InfoSection } from "@/components/common/info-section";
import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";

export default function StatusPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PageHeading
          description="The status page will summarize API availability, Stellar testnet indexing, verification latency, and contract integration state."
          eyebrow="System status"
          title="EarnProof testnet status"
        />
        <InfoSection
          items={[
            "API health and verification endpoint status.",
            "Stellar Horizon or RPC availability for testnet indexing.",
            "Proof registry and issuer registry contract status.",
            "Webhook delivery and background job health once developer APIs are enabled.",
          ]}
          title="Tracked systems"
        />
      </section>
    </PublicShell>
  );
}
