// 편의점 판정: 프롬프트 생성과 Gemini 응답 해석을 담당하는 순수 로직.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export type FoodCheckInput =
  | { type: 'front' | 'label'; imageBase64: string; mimeType: string }
  | { type: 'text'; text: string };

export interface FoodCheckResult {
  productName: string;
  score: number;
  verdict: 'ok' | 'avoid';
  basis: 'estimate' | 'label';
  reasons: string[];
  alternatives: string[];
}

export type ParsedFoodCheck =
  | { status: 'ok'; result: FoodCheckResult }
  | { status: 'unrecognized' }
  | { status: 'invalid' };

export function verdictOf(score: number): 'ok' | 'avoid' {
  return score >= 5 ? 'ok' : 'avoid';
}

export function basisOf(type: FoodCheckInput['type']): 'estimate' | 'label' {
  return type === 'label' ? 'label' : 'estimate';
}

// 앱의 WEEK_CHANGES(utils/dietGuide.ts)와 BASE_TODOS(const/baseTodos.ts)를 요약한 주차별 규칙.
const WEEK_RULES: Record<1 | 2 | 3 | 4, string> = {
  1: [
    '1주차: 하루 4번 프로틴쉐이크가 식사를 대신해요.',
    '쉐이크 외에는 두부, 계란, 닭가슴살 같은 단백질 위주 기본 식품만 가볍게 허용돼요.',
    '밥, 빵, 면, 과자, 설탕 든 음료·간식은 피해야 해요.',
  ].join('\n'),
  2: [
    '2주차: 쉐이크 2번 + 일반식 2끼(점심 저탄수, 저녁 무탄수).',
    '블랙커피(오전 1잔), 견과류, 우유, 치즈를 먹을 수 있어요.',
    '주 1회 24시간 단식을 해요.',
    '밥, 빵, 면, 과자, 설탕 든 음료·간식은 피해야 해요.',
  ].join('\n'),
  3: [
    '3주차: 2주차 규칙에 더해 단호박, 토마토, 바나나, 베리류를 먹을 수 있어요.',
    '쉐이크 + 저탄수 점심 + 무탄수 저녁, 단식은 주 2회예요.',
    '단식 후 첫 끼는 고단백이 좋아요.',
    '정제 탄수화물과 당이 많은 음식은 피해야 해요.',
  ].join('\n'),
  4: [
    '4주차: 3주차 규칙에 더해 과일을 하루 1개 정도(아침 추천) 먹을 수 있어요.',
    '저녁도 저탄수식이 가능하고 단식은 주 3회예요.',
    '정제 탄수화물과 당이 많은 음식은 피해야 해요.',
  ].join('\n'),
};

export function weekRuleText(week: number): string {
  const w = Number.isFinite(week) && week >= 1 ? Math.floor(week) : 1;
  if (w >= 5) return `${WEEK_RULES[4]}\n5주차 이후 유지기: 정제 탄수화물·당 주의`;
  return WEEK_RULES[w as 1 | 2 | 3 | 4];
}

export function buildFoodCheckPrompt(input: FoodCheckInput, week: number): string {
  const w = Number.isFinite(week) && week >= 1 ? Math.floor(week) : 1;
  const source =
    input.type === 'text'
      ? `입력된 상품 이름: "${input.text}"`
      : input.type === 'front'
        ? '첨부된 이미지는 상품의 앞면(포장) 사진이에요. 포장을 보고 상품을 파악해 추정하세요.'
        : '첨부된 이미지는 상품의 영양성분표(라벨) 사진이에요. 표기된 수치를 근거로 판단하세요.';

  return [
    `당신은 스위치온 다이어트 ${w}주차 사용자가 편의점 상품을 먹어도 되는지 판정해 주는 도우미예요.`,
    '',
    '[이번 주차 규칙]',
    weekRuleText(w),
    '',
    '[판정 대상]',
    source,
    '',
    '위 규칙에 얼마나 맞는지 1~10점(정수)으로 점수를 매기세요. 5점 이상이면 먹어도 되는 상품이에요.',
    '식품 상품을 식별할 수 없으면 recognized를 false로 하세요.',
    '의료적 조언(진단, 치료, 약, 질환 관련 조언)은 하지 마세요.',
    '',
    '반드시 아래 키만 가진 JSON 객체 하나로만 답하세요. 설명문이나 코드블록은 쓰지 마세요.',
    '{',
    '  "recognized": true 또는 false,',
    '  "productName": "상품 이름",',
    '  "score": 1~10 사이 정수,',
    '  "reasons": ["짧은 한국어 문장 1~2개"],',
    '  "alternatives": ["점수가 4 이하일 때만, 이번 주차에 먹을 수 있는 흔한 한국 편의점 상품 2~3개. 그 외에는 빈 배열"]',
    '}',
  ].join('\n');
}

const cleanStrings = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, max)
    : [];

export function parseFoodCheckResponse(
  text: string,
  type: FoodCheckInput['type']
): ParsedFoodCheck {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return { status: 'invalid' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { status: 'invalid' };
  }

  const d = data as Record<string, unknown>;
  if (d.recognized === false) return { status: 'unrecognized' };

  const { score } = d;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) {
    return { status: 'invalid' };
  }
  const productName = typeof d.productName === 'string' ? d.productName.trim() : '';
  const reasons = cleanStrings(d.reasons, 2);
  if (!productName || reasons.length === 0) return { status: 'invalid' };

  const verdict = verdictOf(score);
  return {
    status: 'ok',
    result: {
      productName,
      score,
      verdict,
      basis: basisOf(type),
      reasons,
      alternatives: verdict === 'ok' ? [] : cleanStrings(d.alternatives, 3),
    },
  };
}
