"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectFreighterWallet, signFreighterMessage } from "@/lib/wallet/freighter-sign";
import { getRotationIntent, createRotationIntent, createRotationChallenge, submitRotationProof, completeWalletRotation, cancelRotationIntent, areBothChallengesValid, type WalletRotationIntent, type WalletRole } from "@/lib/wallet-rotation/store";
import { clearRotatedAccount } from "@/lib/wallet-rotation/cleanup";

export function WalletRotationFlow({ currentWalletAddress, onRotationCompleted }: { currentWalletAddress: string; onRotationCompleted: (newAddress: string) => void }) {
  const [intent, setIntent] = useState<WalletRotationIntent | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const creation = useRef<{ address: string; key: string } | null>(null);
  const finish = useCallback(async (confirmed: WalletRotationIntent) => {
    await clearRotatedAccount(); onRotationCompleted(confirmed.newAddress);
  }, [onRotationCompleted]);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    reading.current?.abort(); const c = new AbortController(); reading.current = c;
    setLoading(true); setError(null); setIntent(null);
    try {
      const recovered = await getRotationIntent(currentWalletAddress, c.signal);
      if (c.signal.aborted) return;
      if (recovered?.status === "COMPLETED") { await finish(recovered); return; }
      setIntent(recovered); setNeedsRefresh(false);
    } catch { if (!c.signal.aborted) { setNeedsRefresh(true); setError("Server recovery unavailable. Refresh before continuing."); } }
    finally { if (!c.signal.aborted) setLoading(false); }
  }, [currentWalletAddress, finish]);
  useEffect(() => {
    const c = new AbortController(); lifetime.current = c;
    void Promise.resolve().then(() => { if (!c.signal.aborted) void refresh(); });
    const focus = () => void refresh(); window.addEventListener("focus", focus);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { c.abort(); reading.current?.abort(); window.removeEventListener("focus", focus); window.clearInterval(timer); };
  }, [refresh]);
  async function mutate(action: (signal: AbortSignal) => Promise<void>) {
    if (busy.current || loading || needsRefresh) return;
    busy.current = true; setPending(true); setError(null); reading.current?.abort();
    const signal = lifetime.current!.signal;
    try { await action(signal); }
    catch { if (!signal.aborted) { setNeedsRefresh(true); setError("The server did not confirm this action. Refresh to recover its authoritative state before retrying."); } }
    finally { busy.current = false; if (!signal.aborted) setPending(false); }
  }
  const open = intent && ["PENDING", "READY"].includes(intent.status);
  const expired = Boolean(intent && now >= Date.parse(intent.expiresAt));
  const proofsValid = Boolean(intent?.currentProof && intent.replacementProof && areBothChallengesValid(intent.currentProof.expiresAt, intent.replacementProof.expiresAt, now));
  async function prove(role: WalletRole, signal: AbortSignal) {
    if (!intent) return;
    const expected = role === "current" ? intent.previousAddress : intent.newAddress;
    const address = await connectFreighterWallet(); if (signal.aborted) return;
    if (address !== expected) throw new Error("Connect the selected wallet.");
    const challenge = await createRotationChallenge(intent, role, signal); if (signal.aborted) return;
    const signature = await signFreighterMessage(challenge.message, expected); if (signal.aborted) return;
    if (!signature) throw new Error("Signing was cancelled.");
    const result = await submitRotationProof(intent, challenge, signature, signal);
    if (!signal.aborted) setIntent(result);
  }
  async function start(signal: AbortSignal) {
    const address = newAddress.trim();
    if (creation.current?.address !== address) creation.current = { address, key: crypto.randomUUID() };
    const result = await createRotationIntent(currentWalletAddress, address, creation.current!.key, signal);
    if (!signal.aborted) { setIntent(result); creation.current = null; }
  }
  return <section className="grid gap-4 rounded-lg border border-white/10 p-5" aria-busy={loading || pending}>
    <h2 className="text-xl font-semibold">Rotate Wallet Address</h2>
    <p>Both wallets must approve the same server intent and Stellar network. Your account changes only after the server confirms completion.</p>
    {loading && <p role="status">Recovering server rotation state...</p>}
    {pending && <p role="status">Waiting for wallet or server confirmation...</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={loading || pending} onClick={() => void refresh()}>Refresh rotation state</button>
    {!loading && !open && <form onSubmit={event => { event.preventDefault(); void mutate(start); }} className="grid gap-2">
      {intent && <p role="status">Previous server intent: {intent.status}</p>}
      <label htmlFor="rotation-replacement">Replacement wallet address</label>
      <input id="rotation-replacement" value={newAddress} onChange={event => setNewAddress(event.target.value)} autoComplete="off" required pattern="G[A-Z2-7]{55}" disabled={pending || needsRefresh} />
      <button type="submit" disabled={pending || needsRefresh}>Start rotation</button>
    </form>}
    {!loading && open && intent && <div className="grid gap-3">
      <p role="status">Server intent: {intent.status}. Expires {intent.expiresAt}.</p>
      <p>Current wallet: {shortAddress(intent.previousAddress)}. Replacement: {shortAddress(intent.newAddress)}. Network: {intent.network}.</p>
      {expired && <p role="alert">This rotation has expired. Refresh server state before starting another.</p>}
      {!expired && intent.status === "READY" && !proofsValid && <p role="alert">A wallet proof has expired. Cancel this intent and start another rotation.</p>}
      <button type="button" disabled={pending || needsRefresh || expired || Boolean(intent.currentProof)} onClick={() => void mutate(signal => prove("current", signal))}>{intent.currentProof ? "Current wallet verified" : "Verify current wallet"}</button>
      <button type="button" disabled={pending || needsRefresh || expired || !intent.currentProof || Boolean(intent.replacementProof)} onClick={() => void mutate(signal => prove("replacement", signal))}>{intent.replacementProof ? "Replacement wallet verified" : "Verify replacement wallet"}</button>
      <p>Confirming rotation will end your current session. Reconnect with the replacement wallet after completion.</p>
      <button type="button" disabled={pending || needsRefresh || expired || intent.status !== "READY" || !proofsValid} onClick={() => void mutate(async signal => { const result = await completeWalletRotation(intent, signal); if (!signal.aborted) await finish(result); })}>Confirm rotation</button>
      <button type="button" disabled={pending || needsRefresh} onClick={() => void mutate(async signal => { await cancelRotationIntent(intent, signal); if (!signal.aborted) setIntent(null); })}>Cancel rotation</button>
    </div>}
  </section>;
}
function shortAddress(value: string) { return `${value.slice(0, 6)}...${value.slice(-4)}`; }
