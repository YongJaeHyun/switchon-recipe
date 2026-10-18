import { JudgementParseError, MAX_CANDIDATES, parseJudgement } from './core.ts';
import { fetchWithRetry, type RetryOptions } from './http.ts';
import { SWITCHON_RULES } from './rules.ts';
import type { ExistingIngredient, Judgement } from './types.ts';

const MODEL = 'gemini-2.5-flash';

const formatExisting = (existing: ExistingIngredient[]) =>
  existing
    .map((i) => {
      const keywords = i.subKeywords.length ? ` (별칭: ${i.subKeywords.join(', ')})` : '';
      const carb = i.isCarbohydrate ? ', 탄수화물' : '';
      const hidden = i.isActive ? '' : ', 숨김';
      return `- ${i.name}${keywords} [week ${i.week}${carb}${hidden}]`;
    })
    .join('\n');

export const buildJudgePrompt = (requestName: string, existing: ExistingIngredient[]) => `
당신은 스위치온 다이어트 레시피 앱의 재료 관리자입니다.
유저가 앱에 없는 재료를 요청했습니다. 아래 기준 문서와 Google 검색 결과를 근거로, 이 재료를 앱에 추가할지 판단하세요.

${SWITCHON_RULES}

## 현재 앱에 등록된 재료 (숨김 포함)
중복 여부는 **이 목록만** 기준으로 판단합니다. 위 기준 문서의 "주차 배정 참고 사례"는 주차/탄수화물 판단을 위한 참고 자료일 뿐이며, 그 사례에 있다고 해서 이미 등록된 재료가 아닙니다.
${formatExisting(existing)}

## 중복/유사 규칙
| 경우 | 예 | 처리 |
|---|---|---|
| 같은 재료, 표기만 다름 | 치아씨드 ↔ 치아시드 | duplicate (matchedName = 기존 재료명) |
| 더 구체적인 재료가 이미 있는데 포괄적인 재료 요청 | 소고기 있음 → "고기" 요청 | duplicate |
| 포괄적인 재료가 있는데 더 구체적인 재료 요청 | 닭고기 있음 → "닭다리살" 요청 | add. 기존 재료는 그대로 둠 |
| 위 경우에 다이어트에 흔히 쓰는 다른 부위/종류도 없음 | 닭안심 등이 없다면 | 그 부위도 함께 add |

## 판단 규칙
- 확신이 낮거나 애매하면 reject 합니다. 잘못 추가하는 것이 추가하지 않는 것보다 나쁩니다.
- 음식 재료가 아니거나, 장난성/부적절한 입력이거나, 완성된 요리 이름이면 reject 합니다.
- add 후보는 최대 ${MAX_CANDIDATES}개입니다. 요청한 재료를 가장 먼저 넣습니다. 이미 등록된 재료는 넣지 않습니다.
- name은 기존 재료와 같은 스타일의 일반적인 한국어 명칭으로 씁니다 (불필요한 띄어쓰기 없이, 브랜드명 없이).
- 유저가 오타를 냈다면 올바른 이름으로 고칩니다.
- week는 1, 2, 3 중 하나입니다 (그 재료를 처음 먹을 수 있는 주차, 3 = 3주차 이후).
- subKeywords는 검색에 쓸 다른 이름이나 표기입니다. 없으면 빈 배열입니다.
- imageQueryEn은 무료 사진 사이트에서 이 재료 사진을 찾을 영어 검색어입니다 (예: "raw chicken thigh").
- reason은 한국어로 1~2문장, 판단 근거를 씁니다.

## 출력 형식
설명 없이 아래 형태의 JSON 하나만 \`\`\`json 코드 블록으로 출력하세요.

추가: {"decision":"add","reason":"...","ingredients":[{"name":"...","week":1,"isCarbohydrate":false,"subKeywords":[],"imageQueryEn":"...","reason":"..."}]}
거절: {"decision":"reject","reason":"..."}
중복: {"decision":"duplicate","reason":"...","matchedName":"기존 재료명"}

## 요청 재료
${requestName}
`;

const requestJudgement = async (prompt: string, apiKey: string, options: RetryOptions) => {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
    },
    options
  );

  if (!res.ok) throw new Error(`Gemini 판단 요청 실패 (${res.status}): ${await res.text()}`);

  const json = await res.json();
  const parts: { text?: string }[] = json?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
};

export const judgeIngredient = async (
  requestName: string,
  existing: ExistingIngredient[],
  apiKey: string,
  options: RetryOptions = {}
): Promise<Judgement> => {
  const prompt = buildJudgePrompt(requestName, existing);

  try {
    return parseJudgement(await requestJudgement(prompt, apiKey, options), existing);
  } catch (error) {
    if (!(error instanceof JudgementParseError)) throw error;
    return parseJudgement(await requestJudgement(prompt, apiKey, options), existing);
  }
};
