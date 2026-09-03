import { appConfig } from "@/config/app";
import { categorizeError, reportClientError } from "@/lib/telemetry";

const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds

/**
 * The current route, for telemetry only. `toRoutePattern` reduces this to a
 * known static route (or "/other") and drops the query string entirely, so
 * no proof ID or wallet address can travel out through it.
 */
function currentPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

type ApiClientOptions = RequestInit & {
  path: string;
  timeoutMs?: number;
};

/**
 * Executes a fetch with:
 * - Bounded timeout (AbortController with timeout)
 * - Caller-provided signal for cancellation (navigation/unmount)
 * - Combined signal: request aborts if either times out OR caller cancels
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    ...rest
  } = options;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let signal: AbortSignal;
  if (callerSignal) {
    signal = AbortSignal.any([callerSignal, timeoutController.signal]);
  } else {
    signal = timeoutController.signal;
  }

  try {
    const response = await fetch(url, { ...rest, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Retry policy for READ requests only.
 * Mutations are NEVER retried automatically - see retryRead() vs retryMutation().
 *
 * Retryable: network errors, 429, 503, 504
 * Not retryable: 4xx (except 429), aborted requests, mutations
 */
export function isRetryable(error: unknown, response?: Response): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }

  if (response) {
    if (response.status === 429) return true;
    if (response.status === 503 || response.status === 504) return true;
    if (response.status >= 400 && response.status < 500) return false;
  }

  return !response && error instanceof TypeError;
}

export async function retryRead<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(signal);
    } catch (error) {
      const isLast = attempt === maxAttempts - 1;

      if (signal.aborted || !isRetryable(error)) {
        throw error;
      }

      if (isLast) {
        throw error;
      }

      const delay =
        baseDelayMs *
        Math.pow(2, attempt) *
        (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("retryRead: unreachable");
}

/**
 * Mutations are never retried - idempotency must be guaranteed externally.
 */
export async function retryMutation<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return fn(signal);
}

export async function apiClient<TResponse>({
  path,
  headers,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ...init
}: ApiClientOptions): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${appConfig.apiUrl}${path}`, {
      ...init,
      timeoutMs,
      // EarnProof API responses can include wallet-authenticated proof data.
      // Keep this client out of browser, proxy, and Next.js fetch caches.
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...headers,
      },
    });
  } catch (error) {
    reportClientError({
      error,
      category: categorizeError(error),
      pathname: currentPathname(),
    });
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`EarnProof API request failed with ${response.status}`);
    reportClientError({
      error,
      category: categorizeError(error, response),
      pathname: currentPathname(),
    });
    throw error;
  }

  return response.json() as Promise<TResponse>;
}

export function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
