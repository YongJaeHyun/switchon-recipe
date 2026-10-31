// 레시피 기준 인분(servings): 재료 양이 몇 인분 기준인지. 값 범위·프롬프트·검증을 담당하는 순수 로직.
// Deno 엣지 함수(create-recipe-by-gemini, estimate-recipe-servings)와 Vitest(node) 양쪽에서 로드되므로
// 외부 import를 두지 않는다. DB 열은 1~10을 허용하지만(recipe_servings_range) AI에게는 1~8만 받는다.

import { recipeTagInputOf, type RecipeTagInput } from './recipeTags.ts';

export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 8;

// 1~8 정수만 인분으로 받는다 (문자열 "2", 1.5 등은 null)
export function parseServings(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= SERVINGS_MIN &&
    raw <= SERVINGS_MAX
    ? raw
    : null;
}

// 레시피 생성 system instruction에 붙일 설명
export const RECIPE_SERVINGS_PROMPT =
  `먼저 이 레시피의 기준 인분(servings, ${SERVINGS_MIN}~${SERVINGS_MAX} 정수)을 정하고 재료량을 그 인분에 맞춰 적으세요. ` +
  '다이어트 식단 앱이므로 기본은 1인분으로 하고, 찌개·전골·찜·통닭처럼 원래 여럿이 나눠 먹는 요리일 때만 2인분 이상으로 하세요.';

// 생성(createRecipe.ts) responseSchema에 넣는 필드
export const RECIPE_SERVINGS_RESPONSE_PROPERTY = {
  servings: {
    type: 'INTEGER',
    description: `재료량이 기준으로 하는 인분 (${SERVINGS_MIN}~${SERVINGS_MAX})`,
  },
};

// ---- 기존 레시피 인분 추정(estimate-recipe-servings) 배치용 ----

// 태깅 입력과 모양은 같고, ingredients에 양까지 붙는다 ("재료 이름 양", 양을 보고 인분을 가늠한다)
export type ServingsInput = RecipeTagInput;

const parseJsonArray = (raw: string | null): unknown[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// recipe 행을 추정 입력으로 바꾼다. 재료는 이름과 양을 함께 ("돼지고기 앞다리살 200g"), 옛 형식(문자열)은 그대로.
// 조리 단계는 앞 3개만 (recipeTagInputOf와 같게, 비용 절감)
export function servingsInputOf(row: {
  id: number;
  recipe_name: string | null;
  ingredients: string | null;
  cooking_steps: string | null;
}): ServingsInput {
  const ingredients = parseJsonArray(row.ingredients)
    .map((i) => {
      if (typeof i === 'string') return i;
      if (typeof i !== 'object' || i === null) return '';
      const { name, amount } = i as { name?: unknown; amount?: unknown };
      if (typeof name !== 'string') return '';
      return typeof amount === 'string' && amount ? `${name} ${amount}` : name;
    })
    .filter((n) => n.length > 0);
  return { ...recipeTagInputOf(row), ingredients };
}

export function buildServingsBatchPrompt(recipes: ServingsInput[]): string {
  return [
    'You are reading Korean diet recipes and estimating how many servings the listed ingredient amounts make.',
    `For each recipe, return servings as an integer from ${SERVINGS_MIN} to ${SERVINGS_MAX}.`,
    'Judge from the ingredient amounts (e.g. 100-200g of meat or one block of tofu for one person is typical for this diet app) and the dish type.',
    'Most recipes in this app are written for one person; use 2 or more only when the amounts clearly feed more people or the dish is inherently shared (stew, hot pot, whole chicken).',
    '',
    'Recipes (one JSON object per line; ingredients include amounts; steps are the first few cooking steps):',
    ...recipes.map((r) =>
      JSON.stringify({ id: r.id, name: r.name, ingredients: r.ingredients, steps: r.steps })
    ),
    '',
    'Respond with only a JSON array with one object per recipe, in the form [{"id": <recipe id>, "servings": <integer>}].',
  ].join('\n');
}

// Gemini 응답에서 이 배치 id에 해당하고 parseServings를 통과한 항목만 (id 중복은 첫 항목만)
export function parseServingsBatchResponse(
  text: string,
  ids: number[]
): { id: number; servings: number }[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const wanted = new Set(ids);
  const seen = new Set<number>();
  const result: { id: number; servings: number }[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'number' || !wanted.has(id) || seen.has(id)) continue;
    seen.add(id);
    const servings = parseServings((item as { servings?: unknown }).servings);
    if (servings !== null) result.push({ id, servings });
  }
  return result;
}

// Gemini responseSchema: 배치 응답을 {id, servings} 배열로 강제한다 (검증은 그래도 parse에서 한다)
export const RECIPE_SERVINGS_BATCH_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'INTEGER' },
      servings: { type: 'INTEGER' },
    },
    required: ['id', 'servings'],
  },
};
