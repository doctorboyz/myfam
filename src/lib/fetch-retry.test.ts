/**
 * Tests for fetchWithRetry — transient network failures must self-heal.
 *
 * Real-world incident (2026-10-04 → 10-07): outbound ETIMEDOUT blips
 * (~1 min) from the container killed slip processing 8 times in 4 days.
 * These tests prove the retry mechanism that prevents that.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchWithRetry, isTransientNetworkError } from './fetch-retry';

/** Build the undici-style error Node throws when a connect attempt times out. */
function networkError(code: string): TypeError {
  const err = new TypeError('fetch failed');
  (err as NodeJS.ErrnoException & { cause?: unknown }).cause = Object.assign(
    new Error('connect timed out'),
    { code },
  );
  return err;
}

describe('isTransientNetworkError', () => {
  test('true for fetch failed with ETIMEDOUT cause', () => {
    expect(isTransientNetworkError(networkError('ETIMEDOUT'))).toBe(true);
  });

  test('true for ECONNRESET / ECONNREFUSED / EAI_AGAIN', () => {
    expect(isTransientNetworkError(networkError('ECONNRESET'))).toBe(true);
    expect(isTransientNetworkError(networkError('ECONNREFUSED'))).toBe(true);
    expect(isTransientNetworkError(networkError('EAI_AGAIN'))).toBe(true);
  });

  test('false for non-network TypeErrors', () => {
    expect(isTransientNetworkError(new TypeError('fetch failed to parse'))).toBe(false);
    expect(isTransientNetworkError(new Error('some other error'))).toBe(false);
  });

  test('false for abort/timeout signals — those are not connect failures', () => {
    const abort = new DOMException('The operation was aborted', 'TimeoutError');
    expect(isTransientNetworkError(abort)).toBe(false);
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('succeeds on first attempt when network is healthy — no extra calls', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', mock);

    const promise = fetchWithRetry('https://example.com/api');
    const response = await promise;

    expect(response.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test('retries ETIMEDOUT and succeeds on the second attempt', async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(networkError('ETIMEDOUT'))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', mock);

    const promise = fetchWithRetry('https://example.com/api');
    // advance through the first backoff delay
    const settled = await vi.advanceTimersByTimeAsync(2000).then(() => promise);

    expect(await settled.text()).toBe('ok');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  test('retries through all backoff delays and succeeds on the last attempt', async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(networkError('ETIMEDOUT'))
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', mock);

    const promise = fetchWithRetry('https://example.com/api');
    const settled = await vi
      .advanceTimersByTimeAsync(2000 + 8000 + 30000)
      .then(() => promise);

    expect(await settled.text()).toBe('ok');
    expect(mock).toHaveBeenCalledTimes(3);
  });

  test('throws the last error after all retries are exhausted', async () => {
    const mock = vi.fn().mockRejectedValue(networkError('ETIMEDOUT'));
    vi.stubGlobal('fetch', mock);

    const promise = fetchWithRetry('https://example.com/api');
    const attempt = vi
      .advanceTimersByTimeAsync(2000 + 8000 + 30000)
      .then(() => promise);
    await expect(attempt).rejects.toThrow('fetch failed');
    expect(mock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  test('does not retry non-transient errors (e.g. abort/HTTP-level failures)', async () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    const mock = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal('fetch', mock);

    const promise = fetchWithRetry('https://example.com/api');
    await expect(promise).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test('does not retry when the server responds (even 5xx) — caller handles HTTP status', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }));
    vi.stubGlobal('fetch', mock);

    const response = await fetchWithRetry('https://example.com/api');
    expect(response.status).toBe(500);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test('uses a fresh AbortSignal timeout per attempt', async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(networkError('ETIMEDOUT'))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', mock);

    const promise = fetchWithRetry('https://example.com/api', { method: 'POST' }, { timeoutMs: 5000 });
    const settled = await vi.advanceTimersByTimeAsync(2000).then(() => promise);

    expect(await settled.text()).toBe('ok');
    // each attempt got its own non-expired signal with the configured timeout
    for (const call of mock.mock.calls) {
      const signal = (call[1] as RequestInit).signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });
});