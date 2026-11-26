import { z } from "zod";
import { apiClient, bearer } from "@/lib/api/client";
import { readStoredSession } from "@/lib/session";
import { validateApiResponse } from "@/lib/validation/runtime-response";

// Both response shapes are implemented by auth.controller.ts in the backend.
// Neither deviceFingerprint nor any raw token/IP/UA is admitted by this schema.
const wireSession = z.object({ id: z.string().min(1), deviceLabel: z.string().max(500).optional(),
  firstSeenAt: z.iso.datetime().nullable().optional(), lastSeenAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime().nullable().optional(), lastUsedAt: z.iso.datetime().nullable().optional(),
  expiresAt: z.iso.datetime(), revokedAt: z.iso.datetime().nullable().optional(), current: z.boolean().optional(), isCurrent: z.boolean().optional(),
});
const rows = z.array(wireSession).max(10000);
const inventory = z.union([rows, z.object({ sessions: rows, total: z.number().int().nonnegative() })]);
export interface SessionRecord { id: string; deviceLabel: string; createdAt: string | null; lastUsedAt: string | null; expiresAt: string; isCurrent: boolean; revokedAt: string | null }
function headers(userId: string) {
  const session = readStoredSession();
  if (!session || session.user.id !== userId) throw new Error("Authentication required.");
  return bearer(session.token);
}
function coarseLabel(label?: string): string {
  if (label && /^(iOS|Android|macOS|Windows|Linux|Unknown device) - (Chrome|Firefox|Safari|Edge|Opera|Unknown browser)$/.test(label)) return label;
  const match = /^(Chrome|Firefox|Safari|Edge|Opera) on (iOS|Android|macOS|Windows|Linux) on (Desktop|Mobile|Tablet)$/.exec(label ?? "");
  return match ? `${match[2]} - ${match[1]}` : "Unknown device - Unknown browser";
}
async function listInventory(userId: string, signal?: AbortSignal): Promise<SessionRecord[]> {
  const result = validateApiResponse(inventory, await apiClient<unknown>({ path: "/auth/sessions", headers: headers(userId), signal }));
  const records = Array.isArray(result) ? result : result.sessions;
  if (!Array.isArray(result) && result.total !== records.length) throw new Error("Incomplete server inventory.");
  if (new Set(records.map(item => item.id)).size !== records.length) throw new Error("Duplicate session identity.");
  return records.map(item => {
    if ((item.current === undefined && item.isCurrent === undefined) || (item.current !== undefined && item.isCurrent !== undefined && item.current !== item.isCurrent)) throw new Error("Ambiguous current-session identity.");
    const createdAt = item.createdAt ?? item.firstSeenAt ?? null;
    return { id: item.id, deviceLabel: coarseLabel(item.deviceLabel), createdAt, lastUsedAt: item.lastUsedAt ?? item.lastSeenAt ?? createdAt, expiresAt: item.expiresAt, revokedAt: item.revokedAt ?? null, isCurrent: item.isCurrent ?? item.current ?? false };
  });
}
export async function listActiveSessions(userId: string, signal?: AbortSignal): Promise<SessionRecord[]> {
  const active = (await listInventory(userId, signal)).filter(item => item.revokedAt === null && Date.now() < Date.parse(item.expiresAt));
  if (active.length && active.filter(item => item.isCurrent).length !== 1) throw new Error("Ambiguous current-session identity.");
  return active;
}
export async function listRecentlyRevokedSessions(userId: string, signal?: AbortSignal): Promise<SessionRecord[]> {
  return (await listInventory(userId, signal)).filter(item => item.revokedAt !== null);
}
export async function revokeSession(userId: string, id: string, signal?: AbortSignal, isCurrent = false) {
  if (isCurrent) {
    validateApiResponse(z.object({ status: z.literal("ok") }), await apiClient<unknown>({ path: "/auth/logout", method: "POST", headers: headers(userId), signal }));
    return { revokedSessionId: id, currentSessionRevoked: true };
  }
  const result = validateApiResponse(z.object({ status: z.literal("ok"), revokedSessionId: z.string().min(1) }), await apiClient<unknown>({ path: `/auth/sessions/${encodeURIComponent(id)}/revoke`, method: "POST", headers: headers(userId), signal }));
  if (result.revokedSessionId !== id) throw new Error("Revocation scope mismatch.");
  return { revokedSessionId: result.revokedSessionId, currentSessionRevoked: false };
}
export async function revokeAllOtherSessions(userId: string, signal?: AbortSignal): Promise<number> {
  const result = validateApiResponse(z.object({ status: z.literal("ok"), revokedCount: z.number().int().nonnegative() }), await apiClient<unknown>({ path: "/auth/sessions/revoke-all-other", method: "POST", headers: headers(userId), signal }));
  return result.revokedCount;
}
