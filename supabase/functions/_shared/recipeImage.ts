// 레시피 대표 이미지 생성 요청. 레시피 생성 함수와 통합 테스트가 같이 쓴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

// lite: 1K 기준 $0.034/장으로 flash($0.067)의 절반, 생성도 3배 빠름 (2026-10-30 비교 후 운영자 결정)
export const RECIPE_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

// 성공하면 이미지(PNG) base64 문자열을 돌려준다
export async function requestRecipeImage(
  recipeName: string,
  geminiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const imageRes = await fetchFn(
    `https://generativelanguage.googleapis.com/v1beta/models/${RECIPE_IMAGE_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Generate a food photo taken with a macro lens of 100mm using the following information.

    name: ${recipeName}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          // lite는 비율을 안 주면 가끔 세로로 만든다 → 기존 레시피 이미지와 같은 가로 16:9로 고정
          imageConfig: { aspectRatio: '16:9' },
        },
      }),
    }
  );

  if (!imageRes.ok) {
    const error = await imageRes.text();
    throw new Error(`Gemini 이미지 요청 실패 (${imageRes.status})\n\nError: ${error}`);
  }

  const imageJson = await imageRes.json();
  const imageBase64 = imageJson.candidates?.[0]?.content?.parts?.find(
    // deno-lint-ignore no-explicit-any
    (part: any) => part.inlineData
  )?.inlineData.data;

  if (!imageBase64) {
    throw new Error('Gemini 이미지 생성 실패');
  }

  return imageBase64;
}
