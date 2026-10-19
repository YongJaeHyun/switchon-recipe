import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, redactSecrets } from '../../process-ingredient-request/http.ts';

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

describe('redactSecrets', () => {
  it('removes API keys from URLs in messages', () => {
    expect(
      redactSecrets('error sending request for url (https://x/api/?key=AIza123&q=salmon)')
    ).toBe('error sending request for url (https://x/api/?key=***&q=salmon)');
  });
});

describe('fetchWithRetry errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not leak the key when the request keeps failing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        throw new TypeError(`error sending request for url (${url})`);
      })
    );

    await expect(fetchWithRetry('https://x/?key=SECRET', {}, { retryDelayMs: 0 })).rejects.toThrow(
      /key=\*\*\*/
    );
  });
});
