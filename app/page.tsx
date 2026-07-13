import { NetworkBadge } from "@/components/common/network-badge";

const flowSteps = [
  "Connect Freighter on Stellar testnet",
  "Classify eligible incoming payments",
  "Create a selective income proof",
  "Share a verification link",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <NetworkBadge />

        <div className="mt-10 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
            Veridatum Labs
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-6xl">
            EarnProof
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Prove qualifying Stellar income without exposing full wallet history,
            exact earnings, unrelated payments, or total balance.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {flowSteps.map((step, index) => (
            <div
              className="rounded-lg border border-white/10 bg-white/[0.04] p-5"
              key={step}
            >
              <p className="text-sm font-semibold text-cyan-300">
                Phase {index + 1}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-200">{step}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
