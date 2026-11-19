import { z } from "zod";
import { apiClient, bearer } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { validateApiResponse } from "@/lib/validation/runtime-response";
import { createShareLinkSchema, computeShareLinkStatus, type ShareLinkStatus } from "@/lib/validation/proof-sharing";

// v1 server lifecycle contract. Unsupported endpoints fail closed, without a local fallback.
export const shareLinkSchema = z.object({
  id: z.string().min(1), proofId: z.string().min(1),
  expiresInHours: z.number().positive(), expiresAt: z.iso.datetime(),
  discloseAmount: z.boolean(), discloseSender: z.boolean(),
  createdAt: z.iso.datetime(), revokedAt: z.iso.datetime().nullable(),
});
export type ShareLinkRecord = z.infer<typeof shareLinkSchema>;
export type ShareLinkWithStatus = ShareLinkRecord & { status: ShareLinkStatus };

function headers(userId: string) {
  const session = readStoredSession();
  if (!session || session.user.id !== userId) throw new Error("Authentication required.");
  return bearer(session.token);
}
const root = (proofId: string) => `/proofs/${encodeURIComponent(proofId)}/share-links`;
function recordForProof(record: ShareLinkRecord, proofId: string) {
  if (record.proofId !== proofId) throw new Error("Share link scope mismatch.");
  return record;
}

export async function listShareLinks(userId: string, proofId: string, signal?: AbortSignal): Promise<ShareLinkWithStatus[]> {
  const page = validateApiResponse(z.object({ links: z.array(shareLinkSchema) }), await apiClient<unknown>({
    path: root(proofId), headers: headers(userId), signal, skipCoalescing: true,
  }));
  return page.links.map((item) => {
    const record = recordForProof(item, proofId);
    return { ...record, status: computeShareLinkStatus(record.expiresAt, record.revokedAt) };
  });
}

export async function createShareLink(userId: string, input: z.infer<typeof createShareLinkSchema>, signal?: AbortSignal, idempotencyKey = crypto.randomUUID()): Promise<{ token: string; record: ShareLinkRecord }> {
  const body = createShareLinkSchema.parse(input);
  const result = validateApiResponse(z.object({ token: z.string().min(1), record: shareLinkSchema }), await apiClient<unknown>({
    path: root(body.proofId), method: "POST", signal,
    headers: { ...headers(userId), "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body),
  }));
  recordForProof(result.record, body.proofId);
  if (result.record.discloseAmount !== body.discloseAmount || result.record.discloseSender !== body.discloseSender || result.record.expiresInHours !== body.expiresInHours || Date.parse(result.record.expiresAt) > Date.parse(result.record.createdAt) + body.expiresInHours * 3_600_000) throw new Error("Created link policy does not match the requested disclosure.");
  if (computeShareLinkStatus(result.record.expiresAt, result.record.revokedAt) !== "ACTIVE") throw new Error("Created link is not usable.");
  // Only the immediate caller receives the token; no cache, storage or telemetry.
  return result;
}

export async function revokeShareLink(userId: string, proofId: string, id: string, signal?: AbortSignal): Promise<void> {
  await apiClient<void>({ path: `${root(proofId)}/${encodeURIComponent(id)}`, method: "DELETE", headers: headers(userId), signal, allowEmptyBody: true });
}

const accessSchema = z.object({
  shareLinkId: z.string().min(1), totalAttempts: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(), expiredCount: z.number().int().nonnegative(), rejectedCount: z.number().int().nonnegative(),
  recent: z.array(z.object({ id: z.string().min(1), shareLinkId: z.string().min(1), outcome: z.enum(["ACCEPTED", "EXPIRED", "REJECTED"]), occurredAt: z.iso.datetime() })).max(10),
});
export async function getShareLinkAccessSummary(userId: string, proofId: string, record: Pick<ShareLinkRecord, "id" | "proofId" | "expiresAt" | "revokedAt">, signal?: AbortSignal) {
  const result = validateApiResponse(accessSchema, await apiClient<unknown>({ path: `${root(proofId)}/${encodeURIComponent(record.id)}/access-summary`, headers: headers(userId), signal }));
  if (result.shareLinkId !== record.id || result.recent.some(event => event.shareLinkId !== record.id) || result.totalAttempts !== result.acceptedCount + result.expiredCount + result.rejectedCount) throw new Error("Invalid access summary.");
  return { ...result, status: computeShareLinkStatus(record.expiresAt, record.revokedAt), flaggedAsSuspicious: result.rejectedCount >= 3 };
}
