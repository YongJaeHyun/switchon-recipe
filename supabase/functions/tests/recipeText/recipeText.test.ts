import { describe, expect, it, vi } from 'vitest';
import { COOKING_STEPS_PROMPT, requestRecipeText } from '../../_shared/recipeText.ts';

// 조리 순서 문장 형식 요청 (운영자 2026-11-04): 형식은 문자열 배열 그대로(옛 앱 호환), 프롬프트에 문장 규칙
describe('requestRecipeText 조리 순서 요청', () => {
  const capture = async () => {
    const fetchFn = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"cookingSteps":["물을 끓여요."]}' }] } }],
          })
        )
    );
    const result = await requestRecipeText('두부 요리', 'KEY', fetchFn as unknown as typeof fetch);
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    return { body, result };
  };

  it('cookingSteps는 문자열 배열로 받는다', async () => {
    const { body, result } = await capture();
    const schema = body.generationConfig.responseSchema.properties.cookingSteps;
    expect(schema.type).toBe('ARRAY');
    expect(schema.items).toEqual({ type: 'STRING' });
    expect(result).toEqual({ cookingSteps: ['물을 끓여요.'] });
  });

  it('system instruction에 조리 순서 문장 규칙이 들어간다', async () => {
    const { body } = await capture();
    const text: string = body.system_instruction.parts[0].text;
    expect(text).toContain(COOKING_STEPS_PROMPT);
    for (const rule of ['짧은 문장 1~3개', '동작 하나', '숫자로', '괄호 하나', '~해요']) {
      expect(COOKING_STEPS_PROMPT).toContain(rule);
    }
  });
});
