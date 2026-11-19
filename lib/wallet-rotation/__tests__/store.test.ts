import { apiClient } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { getRotationIntent, createRotationIntent, createRotationChallenge, submitRotationProof, completeWalletRotation, cancelRotationIntent, areBothChallengesValid } from "../store";
import { CURRENT, REPLACEMENT, makeIntent, makeProof, makeChallenge } from "@/tests/fixtures/wallet-rotation-api";
jest.mock("@/lib/api/client", () => ({ apiClient: jest.fn(), bearer: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
jest.mock("@/lib/session", () => ({ readStoredSession: jest.fn() }));
const api = jest.mocked(apiClient);
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); jest.mocked(readStoredSession).mockReturnValue({ token: "synthetic-auth", user: { id: "user-1", role: "WORKER", walletAddress: CURRENT, walletHash: "synthetic-hash" } }); });
it("recovers server state while ignoring forged browser completion records", async () => {
  localStorage.setItem("earnproof.wallet-rotations", JSON.stringify([{ newAddress: REPLACEMENT, completedAt: "forged" }])); api.mockResolvedValue({ intent: null }); expect(await getRotationIntent(CURRENT)).toBeNull();
  api.mockResolvedValue({ intent: { ...makeIntent(), signature: "private" } }); expect(await getRotationIntent(CURRENT)).not.toHaveProperty("signature");
});
it("creates an authenticated intent with an idempotency key without local completion", async () => {
  api.mockResolvedValue(makeIntent()); expect((await createRotationIntent(CURRENT, REPLACEMENT, "intent-key")).status).toBe("PENDING");
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "intent-key" }) })); expect(localStorage.length).toBe(0);
});
it("fails closed when recovery endpoints are unavailable and rejects incomplete completion records", async () => {
  api.mockRejectedValueOnce(new Error("404 unsupported"));
  await expect(getRotationIntent(CURRENT)).rejects.toThrow("404");
  api.mockResolvedValue({ intent: makeIntent({ status: "COMPLETED", completedAt: "2026-11-18T00:00:00.000Z" }) });
  await expect(getRotationIntent(CURRENT)).rejects.toThrow("not confirmed");
});
it("rejects wrong-wallet authentication and malformed replacement addresses before sending", async () => {
  await expect(createRotationIntent(CURRENT, "invalid", "key")).rejects.toThrow(); await expect(getRotationIntent(REPLACEMENT)).rejects.toThrow("Authenticate"); expect(api).not.toHaveBeenCalled();
});
it("rejects intent and network substitution", async () => {
  api.mockResolvedValue({ intent: { ...makeIntent(), network: "public" } }); await expect(getRotationIntent(CURRENT)).rejects.toThrow("scope mismatch");
  api.mockResolvedValue({ intent: { ...makeIntent(), currentProof: { ...makeProof("current"), intentId: "other" } } }); await expect(getRotationIntent(CURRENT)).rejects.toThrow("proof scope mismatch");
});
it("only signs canonical challenges bound to intent, role, network and address", async () => {
  const challenge = makeChallenge("current"); api.mockResolvedValue(challenge); expect(await createRotationChallenge(makeIntent(), "current")).toEqual(challenge);
  for (const patch of [{ intentId: "other" }, { network: "public" }, { walletAddress: REPLACEMENT }, { message: "Sign a different request" }]) { api.mockResolvedValue({ ...challenge, ...patch }); await expect(createRotationChallenge(makeIntent(), "current")).rejects.toThrow("Invalid"); }
});
it("blocks expiry at the exact boundary and rejects reused wallet proofs", async () => {
  const proof = makeProof("current"); expect(areBothChallengesValid(proof.expiresAt, proof.expiresAt, Date.parse(proof.expiresAt))).toBe(false);
  const ready = makeIntent({ currentProof: proof }); await expect(submitRotationProof(ready, makeChallenge("current"), "synthetic-signature")).rejects.toThrow("already been accepted"); expect(api).not.toHaveBeenCalled();
});
it("requires server confirmation of the exact submitted challenge", async () => {
  api.mockResolvedValue(makeIntent({ version: 2, currentProof: makeProof("current") })); expect((await submitRotationProof(makeIntent(), makeChallenge("current"), "synthetic-signature")).currentProof?.verified).toBe(true);
  api.mockResolvedValue(makeIntent({ version: 2, currentProof: { ...makeProof("current"), challengeId: "other" } })); await expect(submitRotationProof(makeIntent(), makeChallenge("current"), "synthetic-signature")).rejects.toThrow("not confirmed");
});
it("completes only a ready intent with two unexpired proofs and a completed server response", async () => {
  const ready = makeIntent({ version: 3, status: "READY", currentProof: makeProof("current"), replacementProof: makeProof("replacement") });
  await expect(completeWalletRotation(makeIntent())).rejects.toThrow("Both wallet proofs");
  api.mockResolvedValue({ ...ready, version: 4 }); await expect(completeWalletRotation(ready)).rejects.toThrow("not confirmed");
  api.mockResolvedValue({ ...ready, version: 4, status: "COMPLETED", completedAt: "2026-11-18T00:00:00.000Z" }); expect((await completeWalletRotation(ready)).status).toBe("COMPLETED");
  expect(api).toHaveBeenLastCalledWith(expect.objectContaining({ headers: expect.objectContaining({ "If-Match": '"3"' }) }));
});
it("cancels through the server and never automatically retries a failed mutation", async () => {
  const c = new AbortController(); api.mockResolvedValue(makeIntent({ status: "CANCELLED", version: 2 })); await cancelRotationIntent(makeIntent(), c.signal); expect(api).toHaveBeenCalledWith(expect.objectContaining({ signal: c.signal }));
  api.mockRejectedValue(new Error("Conflict")); await expect(cancelRotationIntent(makeIntent())).rejects.toThrow("Conflict"); expect(api).toHaveBeenCalledTimes(2);
});
