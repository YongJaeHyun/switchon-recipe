import { describe, expect, it, vi } from 'vitest';
import { RECIPE_IMAGE_MODEL, requestRecipeImage } from '../../_shared/recipeImage.ts';

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('requestRecipeImage', () => {
  it('레시피 이름으로 실서비스 이미지 모델을 호출하고 base64 이미지를 돌려준다', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({
        candidates: [{ content: { parts: [{ text: 'x' }, { inlineData: { data: 'AAA=' } }] } }],
      })
    );

    const base64 = await requestRecipeImage(
      '두부 계란찜',
      'KEY',
      fetchFn as unknown as typeof fetch
    );

    expect(base64).toBe('AAA=');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/models/${RECIPE_IMAGE_MODEL}:generateContent?key=KEY`);
    expect(String(init.body)).toContain('두부 계란찜');
  });

  it('lite 이미지 모델(v1beta)로 가로 16:9 이미지를 요청한다', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAA=' } }] } }] })
    );

    await requestRecipeImage('두부 계란찜', 'KEY', fetchFn as unknown as typeof fetch);

    expect(RECIPE_IMAGE_MODEL).toBe('gemini-3.1-flash-lite-image');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1beta/models/gemini-3.1-flash-lite-image:generateContent');
    expect(JSON.parse(String(init.body)).generationConfig).toEqual({
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    });
  });

  it('API 오류면 상태 코드와 함께 실패한다', async () => {
    const fetchFn = vi.fn(async () => new Response('not found', { status: 404 }));
    await expect(
      requestRecipeImage('x', 'KEY', fetchFn as unknown as typeof fetch)
    ).rejects.toThrow('404');
  });

  it('응답에 이미지가 없으면 실패한다', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({ candidates: [{ content: { parts: [{ text: 'x' }] } }] })
    );
    await expect(
      requestRecipeImage('x', 'KEY', fetchFn as unknown as typeof fetch)
    ).rejects.toThrow('Gemini 이미지 생성 실패');
  });
});
