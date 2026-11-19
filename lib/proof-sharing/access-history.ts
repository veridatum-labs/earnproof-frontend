import type { ShareLinkStatus } from "@/lib/validation/proof-sharing";

// Display models only. Access evidence comes exclusively from the authenticated
// server summary endpoint; browser-local access logs are no longer read or written.
export type AccessOutcome = "ACCEPTED" | "EXPIRED" | "REJECTED";
export type AccessEvent = { id: string; shareLinkId: string; outcome: AccessOutcome; occurredAt: string };
export type ShareLinkAccessSummary = {
  shareLinkId: string; status: ShareLinkStatus; totalAttempts: number;
  acceptedCount: number; expiredCount: number; rejectedCount: number;
  recent: AccessEvent[]; flaggedAsSuspicious: boolean;
};
