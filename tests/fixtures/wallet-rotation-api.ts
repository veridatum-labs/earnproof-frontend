import type { WalletRotationIntent, RotationChallenge, WalletRole } from "@/lib/wallet-rotation/store";
export const CURRENT = `G${"A".repeat(55)}`;
export const REPLACEMENT = `G${"B".repeat(55)}`;
export function makeIntent(patch: Partial<WalletRotationIntent> = {}): WalletRotationIntent {
  return { id: "intent-1", previousAddress: CURRENT, newAddress: REPLACEMENT, network: "testnet", status: "PENDING", version: 1, expiresAt: "2099-01-02T00:00:00.000Z", completedAt: null, currentProof: null, replacementProof: null, ...patch };
}
export function makeProof(role: WalletRole) {
  return { intentId: "intent-1", network: "testnet" as const, walletAddress: role === "current" ? CURRENT : REPLACEMENT, role, challengeId: `challenge-${role}`, expiresAt: "2099-01-01T00:00:00.000Z", verified: true as const };
}
export function makeChallenge(role: WalletRole): RotationChallenge {
  const proof = makeProof(role);
  return { id: proof.challengeId, intentId: proof.intentId, network: proof.network, walletAddress: proof.walletAddress, role, expiresAt: proof.expiresAt, message: JSON.stringify({ purpose: "earnproof.wallet-rotation.v1", intentId: proof.intentId, network: proof.network, role, walletAddress: proof.walletAddress, challengeId: proof.challengeId, expiresAt: proof.expiresAt }) };
}
