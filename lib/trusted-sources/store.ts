import { z } from "zod";
import { apiClient, bearer } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { readStoredOrganizationId } from "@/lib/organization-context/store";
import { appConfig } from "@/config/app";
import { validateApiResponse } from "@/lib/validation/runtime-response";
import { createTrustedSourceSchema, updateTrustedSourceSchema } from "@/lib/validation/trusted-sources";

export const trustedSourceSchema = z.object({
  id: z.string().min(1), organizationId: z.string().min(1), name: z.string().min(2).max(100), issuerId: z.string().min(1),
  network: z.enum(["testnet", "public"]), status: z.enum(["ACTIVE", "DISABLED", "DELETED"]), version: z.number().int().positive(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type TrustedSourceRecord = z.infer<typeof trustedSourceSchema>;
function scope(userId: string) {
  const session = readStoredSession(); const organizationId = readStoredOrganizationId();
  if (!session || session.user.id !== userId || !organizationId) throw new Error("Select an organization and authenticate.");
  if (session.user.role !== "ADMIN" && session.user.role !== "ISSUER") throw new Error("Not authorized.");
  return { organizationId, root: `/organizations/${encodeURIComponent(organizationId)}/trusted-sources`, headers: { ...bearer(session.token), "X-Stellar-Network": appConfig.stellarNetwork } };
}
function checked(value: unknown, organizationId: string, issuerId?: string) {
  const record = validateApiResponse(trustedSourceSchema, value);
  if (readStoredOrganizationId() !== organizationId || record.organizationId !== organizationId || record.network !== appConfig.stellarNetwork || (issuerId && record.issuerId !== issuerId)) throw new Error("Trusted source scope mismatch.");
  return record;
}
function versionHeader(version: number) { if (!Number.isSafeInteger(version) || version < 1) throw new Error("Refresh the source before editing."); return { "If-Match": `"${version}"` }; }
export function isTrustedSourceEligible(record: TrustedSourceRecord, issuerId: string): boolean {
  return record.status === "ACTIVE" && record.issuerId === issuerId && record.network === appConfig.stellarNetwork && record.organizationId === readStoredOrganizationId();
}
export async function listTrustedSources(userId: string, signal?: AbortSignal): Promise<TrustedSourceRecord[]> {
  const context = scope(userId);
  const page = validateApiResponse(z.object({ sources: z.array(trustedSourceSchema) }), await apiClient<unknown>({ path: context.root, headers: context.headers, signal, skipCoalescing: true }));
  return page.sources.map(item => checked(item, context.organizationId)).filter(item => item.status !== "DELETED");
}
export async function createTrustedSource(userId: string, input: z.infer<typeof createTrustedSourceSchema>, signal?: AbortSignal): Promise<TrustedSourceRecord> {
  const context = scope(userId); const body = createTrustedSourceSchema.parse(input);
  return checked(await apiClient<unknown>({ path: context.root, method: "POST", headers: context.headers, body: JSON.stringify({ ...body, network: appConfig.stellarNetwork }), signal }), context.organizationId, body.issuerId);
}
export async function updateTrustedSource(userId: string, id: string, patch: z.infer<typeof updateTrustedSourceSchema>, version: number, signal?: AbortSignal): Promise<TrustedSourceRecord> {
  const context = scope(userId); const body = updateTrustedSourceSchema.parse(patch);
  const record = checked(await apiClient<unknown>({ path: `${context.root}/${encodeURIComponent(id)}`, method: "PATCH", headers: { ...context.headers, ...versionHeader(version) }, body: JSON.stringify(body), signal }), context.organizationId, body.issuerId);
  if (record.id !== id || record.version <= version) throw new Error("Stale source update.");
  return record;
}
export async function disableTrustedSource(userId: string, id: string, version: number, signal?: AbortSignal): Promise<TrustedSourceRecord> {
  const context = scope(userId);
  const record = checked(await apiClient<unknown>({ path: `${context.root}/${encodeURIComponent(id)}/disable`, method: "POST", headers: { ...context.headers, ...versionHeader(version) }, signal }), context.organizationId);
  if (record.id !== id || record.status === "ACTIVE" || record.version <= version) throw new Error("Source disable was not confirmed.");
  return record;
}
// Backward-compatible action name, now an authorized, versioned server disable.
export const deleteTrustedSource = disableTrustedSource;
const historySchema = z.object({ organizationId: z.string().min(1), sourceId: z.string().min(1), events: z.array(z.object({ id: z.string().min(1), action: z.enum(["CREATE", "UPDATE", "DISABLE", "TEST"]), version: z.number().int().positive(), occurredAt: z.iso.datetime() })) });
export async function getTrustedSourceHistory(userId: string, id: string, signal?: AbortSignal) {
  const context = scope(userId);
  const result = validateApiResponse(historySchema, await apiClient<unknown>({ path: `${context.root}/${encodeURIComponent(id)}/history`, headers: context.headers, signal }));
  if (result.organizationId !== context.organizationId || result.sourceId !== id || readStoredOrganizationId() !== context.organizationId) throw new Error("History scope mismatch.");
  return result.events;
}
export async function testTrustedSource(userId: string, record: TrustedSourceRecord, signal?: AbortSignal) {
  const context = scope(userId);
  if (!isTrustedSourceEligible(record, record.issuerId)) throw new Error("Source is not eligible.");
  const result = validateApiResponse(z.object({ source: trustedSourceSchema, eligible: z.boolean(), testedAt: z.iso.datetime() }), await apiClient<unknown>({ path: `${context.root}/${encodeURIComponent(record.id)}/test`, method: "POST", headers: { ...context.headers, ...versionHeader(record.version) }, signal }));
  const source = checked(result.source, context.organizationId, record.issuerId);
  if (source.id !== record.id || source.version !== record.version || !isTrustedSourceEligible(source, record.issuerId)) throw new Error("Source changed during connection test. Refresh.");
  return { eligible: result.eligible, testedAt: result.testedAt };
}
