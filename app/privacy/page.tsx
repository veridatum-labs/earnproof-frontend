import { InfoSection } from "@/components/common/info-section";
import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";

export default function PrivacyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PageHeading
          description="EarnProof is designed around selective disclosure. Proofs should reveal a claim result, not the worker's complete financial activity."
          eyebrow="Privacy model"
          title="Prove the fact, not the full wallet"
        />
        <InfoSection
          items={[
            "Exact income values are hidden by default unless a proof type explicitly requires disclosure.",
            "Source transactions and sender addresses are not shown on public verification pages by default.",
            "Wallet identifiers are represented through hashes in public proof payloads.",
            "Analytics and logs must avoid exact amounts, wallet addresses, employer names, and proof contents.",
            "Users choose the claim, expiration, and revocation state for each proof.",
            "On-chain records store commitments and status, not salary or raw payment history.",
          ]}
          title="Privacy requirements"
        />
      </section>
    </PublicShell>
  );
}
