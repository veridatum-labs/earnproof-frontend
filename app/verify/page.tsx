import { PageHeading } from "@/components/common/page-heading";
import { PublicShell } from "@/components/layout/public-shell";

export default function VerifyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <PageHeading
          description="Public verification will show proof status, disclosed claim, issuer, network, asset, creation date, expiration date, and revocation state."
          eyebrow="Verification"
          title="Check an EarnProof credential"
        />
        <form className="mt-10 grid max-w-2xl gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <label className="text-sm font-medium text-slate-200" htmlFor="proof">
            Proof ID or verification URL
          </label>
          <input
            className="rounded-md border border-white/10 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500"
            id="proof"
            placeholder="proof_01JXYZ123"
            type="text"
          />
          <button
            className="w-fit rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
            type="button"
          >
            Verify proof
          </button>
        </form>
      </section>
    </PublicShell>
  );
}
