import { z } from "zod";
import { apiClient, bearer } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { appConfig } from "@/config/app";
import { validateApiResponse } from "@/lib/validation/runtime-response";

const address = z.string().regex(/^G[A-Z2-7]{55}$/);
const network = z.enum(["testnet", "public"]);
export type WalletRole = "current" | "replacement";
const roleSchema = z.enum(["current", "replacement"]);
const proofSchema = z.object({ intentId: z.string().min(1), network, walletAddress: address, role: roleSchema, challengeId: z.string().min(1), expiresAt: z.iso.datetime(), verified: z.literal(true) });
export const rotationIntentSchema = z.object({
  id: z.string().min(1), previousAddress: address, newAddress: address, network,
  status: z.enum(["PENDING", "READY", "COMPLETED", "CANCELLED", "EXPIRED"]), version: z.number().int().positive(),
  expiresAt: z.iso.datetime(), completedAt: z.iso.datetime().nullable(),
  currentProof: proofSchema.nullable(), replacementProof: proofSchema.nullable(),
});
export type WalletRotationIntent = z.infer<typeof rotationIntentSchema>;
const challengeSchema = z.object({ id: z.string().min(1), intentId: z.string().min(1), network, walletAddress: address, role: roleSchema, message: z.string().min(1), expiresAt: z.iso.datetime() });
export type RotationChallenge = z.infer<typeof challengeSchema>;
function headers(previousAddress: string) {
  const session = readStoredSession();
  if (!session || session.user.walletAddress !== previousAddress) throw new Error("Authenticate with the current wallet.");
  return bearer(session.token);
}
const path = (id: string) => `/wallet-rotations/${encodeURIComponent(id)}`;
const match = (intent: WalletRotationIntent) => ({ "If-Match": `"${intent.version}"` });
export function areBothChallengesValid(currentExpiresAt: string, replacementExpiresAt: string, now = Date.now()): boolean {
  return Number.isFinite(Date.parse(currentExpiresAt)) && Number.isFinite(Date.parse(replacementExpiresAt)) && now < Date.parse(currentExpiresAt) && now < Date.parse(replacementExpiresAt);
}
function checked(value: unknown, previousAddress: string): WalletRotationIntent {
  const intent = validateApiResponse(rotationIntentSchema, value);
  if (intent.previousAddress !== previousAddress || intent.newAddress === previousAddress || intent.network !== appConfig.stellarNetwork) throw new Error("Rotation scope mismatch.");
  for (const role of ["current", "replacement"] as const) {
    const proof = role === "current" ? intent.currentProof : intent.replacementProof;
    if (proof && (proof.intentId !== intent.id || proof.network !== intent.network || proof.role !== role || proof.walletAddress !== (role === "current" ? intent.previousAddress : intent.newAddress) || Date.parse(proof.expiresAt) > Date.parse(intent.expiresAt))) throw new Error("Rotation proof scope mismatch.");
  }
  if (intent.status === "COMPLETED" && (!intent.completedAt || !intent.currentProof || !intent.replacementProof)) throw new Error("Completion was not confirmed.");
  if (intent.status === "READY" && (!intent.currentProof || !intent.replacementProof)) throw new Error("Rotation proofs are incomplete.");
  return intent;
}
function active(intent: WalletRotationIntent) {
  if (!["PENDING", "READY"].includes(intent.status) || Date.now() >= Date.parse(intent.expiresAt)) throw new Error("Rotation is expired or no longer active. Refresh server state.");
}
function sameIntent(value: unknown, intent: WalletRotationIntent) {
  const result = checked(value, intent.previousAddress);
  if (result.id !== intent.id || result.newAddress !== intent.newAddress || result.version <= intent.version) throw new Error("Rotation changed. Refresh server state.");
  return result;
}
export async function getRotationIntent(previousAddress: string, signal?: AbortSignal): Promise<WalletRotationIntent | null> {
  const response = validateApiResponse(z.object({ intent: rotationIntentSchema.nullable() }), await apiClient<unknown>({ path: "/wallet-rotations/current", headers: headers(previousAddress), signal, skipCoalescing: true }));
  return response.intent ? checked(response.intent, previousAddress) : null;
}
export async function createRotationIntent(previousAddress: string, newAddress: string, idempotencyKey: string, signal?: AbortSignal): Promise<WalletRotationIntent> {
  address.parse(newAddress);
  if (previousAddress === newAddress) throw new Error("Choose a different replacement wallet.");
  const intent = checked(await apiClient<unknown>({ path: "/wallet-rotations", method: "POST", headers: { ...headers(previousAddress), "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ newAddress, network: appConfig.stellarNetwork }), signal }), previousAddress);
  if (intent.newAddress !== newAddress || intent.status !== "PENDING") throw new Error("Unexpected rotation intent.");
  active(intent); return intent;
}
export function rotationChallengeMessage(challenge: Omit<RotationChallenge, "message">): string {
  return JSON.stringify({ purpose: "earnproof.wallet-rotation.v1", intentId: challenge.intentId, network: challenge.network, role: challenge.role, walletAddress: challenge.walletAddress, challengeId: challenge.id, expiresAt: challenge.expiresAt });
}
function checkChallenge(intent: WalletRotationIntent, role: WalletRole, challenge: RotationChallenge) {
  active(intent);
  if ((role === "current" ? intent.currentProof : intent.replacementProof) !== null) throw new Error("This wallet proof has already been accepted.");
  if (challenge.intentId !== intent.id || challenge.network !== intent.network || challenge.role !== role || challenge.walletAddress !== (role === "current" ? intent.previousAddress : intent.newAddress) || Date.now() >= Date.parse(challenge.expiresAt) || Date.parse(challenge.expiresAt) > Date.parse(intent.expiresAt) || challenge.message !== rotationChallengeMessage(challenge)) throw new Error("Invalid or expired rotation challenge.");
}
export async function createRotationChallenge(intent: WalletRotationIntent, role: WalletRole, signal?: AbortSignal): Promise<RotationChallenge> {
  active(intent);
  if ((role === "current" ? intent.currentProof : intent.replacementProof) !== null) throw new Error("This wallet proof has already been accepted.");
  const challenge = validateApiResponse(challengeSchema, await apiClient<unknown>({ path: `${path(intent.id)}/challenges`, method: "POST", headers: { ...headers(intent.previousAddress), ...match(intent) }, body: JSON.stringify({ role }), signal }));
  checkChallenge(intent, role, challenge); return challenge;
}
export async function submitRotationProof(intent: WalletRotationIntent, challenge: RotationChallenge, signature: string, signal?: AbortSignal): Promise<WalletRotationIntent> {
  checkChallenge(intent, challenge.role, challenge);
  if (!signature) throw new Error("A wallet signature is required.");
  const result = sameIntent(await apiClient<unknown>({ path: `${path(intent.id)}/proofs`, method: "POST", headers: { ...headers(intent.previousAddress), ...match(intent) }, body: JSON.stringify({ role: challenge.role, challengeId: challenge.id, signature, network: intent.network }), signal }), intent);
  const proof = challenge.role === "current" ? result.currentProof : result.replacementProof;
  if (!proof || proof.challengeId !== challenge.id || proof.expiresAt !== challenge.expiresAt) throw new Error("Wallet proof was not confirmed.");
  active(result); return result;
}
export async function completeWalletRotation(intent: WalletRotationIntent, signal?: AbortSignal): Promise<WalletRotationIntent> {
  active(intent);
  if (intent.status !== "READY" || !intent.currentProof || !intent.replacementProof || !areBothChallengesValid(intent.currentProof.expiresAt, intent.replacementProof.expiresAt)) throw new Error("Both wallet proofs must still be valid.");
  const result = sameIntent(await apiClient<unknown>({ path: `${path(intent.id)}/complete`, method: "POST", headers: { ...headers(intent.previousAddress), ...match(intent) }, signal }), intent);
  if (result.status !== "COMPLETED") throw new Error("Rotation completion was not confirmed."); return result;
}
export async function cancelRotationIntent(intent: WalletRotationIntent, signal?: AbortSignal): Promise<void> {
  const result = sameIntent(await apiClient<unknown>({ path: `${path(intent.id)}/cancel`, method: "POST", headers: { ...headers(intent.previousAddress), ...match(intent) }, signal }), intent);
  if (result.status !== "CANCELLED") throw new Error("Cancellation was not confirmed.");
}
