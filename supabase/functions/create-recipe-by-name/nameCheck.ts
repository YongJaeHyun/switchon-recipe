// 음식 이름 판정 Gemini 요청 (텍스트만, flash-lite). fetchFn은 index.ts가 장애 알림 fetch(providerAlert)를 넘긴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

import { RECIPE_NAME_CHECK_MODEL } from '../_shared/recipeNameCheck.ts';

const TIMEOUT_MS = 20_000;

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

// 성공하면 응답 텍스트(JSON 문자열)를 돌려준다. 해석은 parseNameCheckResponse가 한다
export async function requestNameCheck(
  prompt: string,
  geminiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${RECIPE_NAME_CHECK_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            // 짧은 판정이라 생각(thinking) 없이 바로 답하게 한다
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 512,
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini 이름 판정 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: unknown }) => (typeof p.text === 'string' ? p.text : ''))
      .join('');
    if (!text) {
      throw new Error(
        `Gemini 이름 판정 응답에 텍스트가 없습니다: ${JSON.stringify(data).slice(0, 300)}`
      );
    }
    return text;
  } catch (error) {
    throw new Error(redactKey(error instanceof Error ? error.message : String(error)));
  } finally {
    clearTimeout(timer);
  }
}
