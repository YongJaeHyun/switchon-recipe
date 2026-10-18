import { afterEach, describe, expect, it, vi } from 'vitest';
import { judgeIngredient } from '../../process-ingredient-request/judge.ts';

const geminiResponse = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });

const rejectJson = '{"decision":"reject","reason":"금지 품목"}';

describe('judgeIngredient retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries transient Gemini errors', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response('unavailable', { status: 503 }))
      .mockImplementationOnce(async () => geminiResponse(rejectJson));
    vi.stubGlobal('fetch', fetchMock);

    expect(await judgeIngredient('라면', [], 'key', { retryDelayMs: 0 })).toMatchObject({
      decision: 'reject',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('bad', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(judgeIngredient('라면', [], 'key', { retryDelayMs: 0 })).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 transient failures', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('x', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(judgeIngredient('라면', [], 'key', { retryDelayMs: 0 })).rejects.toThrow('503');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
