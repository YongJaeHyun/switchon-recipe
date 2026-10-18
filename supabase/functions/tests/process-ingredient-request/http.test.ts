import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../../process-ingredient-request/http.ts';

const hangingFetch = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aborts a request that does not respond within the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));

    await expect(
      fetchWithRetry('https://x', {}, { retryDelayMs: 0, timeoutMs: 10 })
    ).rejects.toThrow();
  });

  it('retries after a timeout and returns the next response', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(hangingFetch)
      .mockImplementationOnce(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x', {}, { retryDelayMs: 0, timeoutMs: 10 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
