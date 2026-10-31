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

describe('fetchWithRetry onFinalResponse (장애 알림)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('재시도로 넘어간 중간 503은 넘기지 않고 최종 응답만 한 번 넘긴다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('overloaded', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onFinalResponse = vi.fn();

    const res = await fetchWithRetry('https://x', {}, { retryDelayMs: 0, onFinalResponse });

    expect(res.status).toBe(200);
    expect(onFinalResponse).toHaveBeenCalledTimes(1);
    expect(onFinalResponse).toHaveBeenCalledWith('https://x', res);
  });

  it('재시도하지 않는 402와 마지막 시도의 503을 넘긴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 402 }))
    );
    const onFinalResponse = vi.fn();
    await fetchWithRetry('https://x', {}, { retryDelayMs: 0, onFinalResponse });
    expect(onFinalResponse.mock.calls.map(([, r]) => r.status)).toEqual([402]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );
    const onFinal503 = vi.fn();
    await fetchWithRetry('https://x', {}, { retryDelayMs: 0, onFinalResponse: onFinal503 });
    expect(onFinal503.mock.calls.map(([, r]) => r.status)).toEqual([503]);
  });
});

describe('fetchWithRetry onFinalResponse 오류 격리', () => {
  it('onFinalResponse가 던져도 재시도하지 않고 응답을 그대로 돌려준다', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await fetchWithRetry(
      'https://x',
      {},
      {
        retryDelayMs: 0,
        onFinalResponse: () => {
          throw new Error('clone failed');
        },
      }
    );

    expect(res.status).toBe(402);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
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
