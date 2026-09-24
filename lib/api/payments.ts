import { apiClient, bearer, retryRead, retryMutation } from "./client";
import type { Payment } from "./generated/v1";

export type { Payment };

export async function listPayments(token: string, signal: AbortSignal): Promise<Payment[]> {
  return retryRead(async (signal) => {
    return apiClient<Payment[]>({
      path: "/payments",
      method: "GET",
      headers: bearer(token),
      signal,
    });
  }, signal);
}

export interface PaymentSyncResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * POST /payments/sync (#171). The real endpoint takes no parameters and
 * runs a full, unbounded, synchronous sync — it has no concept of a ledger
 * range, a queued/async job, or resumable progress. See
 * lib/payment-backfill/store.ts for how the bounded-range request/job
 * lifecycle this issue asks for is layered on top of this call.
 */
export async function syncPayments(token: string, signal: AbortSignal): Promise<PaymentSyncResult> {
  return retryMutation(async (signal) => {
    return apiClient<PaymentSyncResult>({
      path: "/payments/sync",
      method: "POST",
      headers: bearer(token),
      signal,
    });
  }, signal);
}
