"use client";

import { useCallback } from "react";
import { WalletRotationFlow } from "./wallet-rotation-flow";
import { readStoredSession } from "@/lib/session";
import { useSessionToken } from "@/lib/use-session";

export function WalletRotationManagement() {
  const token = useSessionToken();
  const session = token ? readStoredSession() : null;
  const completed = useCallback(() => window.location.replace("/proofs"), []);

  if (!session) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Authentication Required</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Please authenticate with a Stellar wallet to rotate your account&apos;s
          wallet address.
        </p>
        <a
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-cyan-300 px-4 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
          href="/proofs"
        >
          Connect Wallet
        </a>
      </div>
    );
  }

  return (
    <WalletRotationFlow
      key={`${token}:${session.user.walletAddress}`}
      currentWalletAddress={session.user.walletAddress}
      onRotationCompleted={completed}
    />
  );
}
