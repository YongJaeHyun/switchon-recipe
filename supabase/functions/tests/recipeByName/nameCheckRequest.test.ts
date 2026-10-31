import { describe, expect, it, vi } from 'vitest';
import { requestNameCheck } from '../../create-recipe-by-name/nameCheck.ts';
import { RECIPE_NAME_CHECK_MODEL } from '../../_shared/recipeNameCheck.ts';

const okResponse = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });

describe('requestNameCheck', () => {
  it('다른 기능과 같은 flash 텍스트 모델에 프롬프트만 보낸다 (이미지 없음)', async () => {
    expect(RECIPE_NAME_CHECK_MODEL).toBe('gemini-2.5-flash');
    expect(RECIPE_NAME_CHECK_MODEL).not.toMatch(/image/);
    const fetchFn = vi.fn(async () => okResponse('{"verdict":"ok"}'));
    const text = await requestNameCheck('프롬프트', 'KEY', fetchFn as unknown as typeof fetch);
    expect(text).toBe('{"verdict":"ok"}');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`models/${RECIPE_NAME_CHECK_MODEL}:generateContent?key=KEY`);
    const body = JSON.parse(init.body as string);
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: '프롬프트' }] }]);
    expect(body.generationConfig.responseModalities).toBeUndefined();
  });

  it('실패하면 키를 가린 오류', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('fetch failed: https://x/models/m?key=SECRET)');
    });
    await expect(
      requestNameCheck('p', 'SECRET', fetchFn as unknown as typeof fetch)
    ).rejects.toThrow(/key=\*\*\*/);
  });

  it('HTTP 오류·빈 응답은 던진다', async () => {
    await expect(
      requestNameCheck('p', 'K', (async () => new Response('quota', { status: 429 })) as never)
    ).rejects.toThrow('(429)');
    await expect(
      requestNameCheck('p', 'K', (async () => new Response('{}', { status: 200 })) as never)
    ).rejects.toThrow('텍스트가 없습니다');
  });
});
