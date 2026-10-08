/**
 * fetch with retry for transient network failures.
 *
 * Why: the host/container occasionally loses outbound connectivity for
 * seconds to ~1 minute (ETIMEDOUT on both Telegram API and Ollama, observed
 * 2026-10-04 → 10-07 — 8 failed slips in 4 days). The Telegram webhook acks
 * 200 before processing, so a failed update is never redelivered: without
 * retry, one blip loses the slip permanently.
 *
 * Retry shape: 3 retries with backoff 2s → 8s → 30s (~55s window with
 * connect timeouts) — enough to outlast the observed blips without making
 * the bot feel stuck. HTTP-level failures (4xx/5xx responses) are NOT
 * retried here; the caller decides how to handle those.
 */

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EPIPE',
  'EAI_AGAIN',
]);

const DEFAULT_DELAYS_MS = [2_000, 8_000, 30_000];

export interface FetchRetryOptions {
  /** Per-attempt timeout (fresh AbortSignal.timeout per attempt). Default: none. */
  timeoutMs?: number;
  /** Backoff delays between attempts. Default: [2000, 8000, 30000]. */
  delaysMs?: number[];
}

/** True when the error looks like a transient connect failure worth retrying. */
export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError) || !error.message.includes('fetch failed')) return false;
  const cause = (error as NodeJS.ErrnoException & { cause?: unknown }).cause;
  if (!cause) return false;
  // undici wraps dual-stack connect failures in AggregateError
  if (cause instanceof AggregateError) return true;
  const code = (cause as NodeJS.ErrnoException).code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch() that retries transient network failures with backoff. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;

  // Each attempt gets a fresh timeout signal — an already-expired signal
  // from a failed attempt must not poison the next one.
  const attempt = (): Promise<Response> => {
    const signal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
    return fetch(url, { ...init, signal });
  };

  let lastError: unknown;
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
      lastError = error;
      if (i < delays.length) await sleep(delays[i]!);
    }
  }
  throw lastError;
}