// 레시피 맛·종류·방식 태그: 값 목록과 검증을 담당하는 순수 로직.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export type Cuisine = 'korean' | 'western' | 'chinese' | 'japanese' | 'other';
export type Method = 'stir_fry' | 'grill' | 'soup' | 'steam' | 'salad' | 'rice_bowl' | 'other';

export interface RecipeTags {
  spicy: boolean;
  cuisine: Cuisine;
  method: Method;
}

export const CUISINES: readonly Cuisine[] = ['korean', 'western', 'chinese', 'japanese', 'other'];
export const METHODS: readonly Method[] = [
  'stir_fry',
  'grill',
  'soup',
  'steam',
  'salad',
  'rice_bowl',
  'other',
];

// 값 목록 밖이거나 타입이 다르면 null (문자열 "true" 등도 허용하지 않는다)
export function parseRecipeTags(raw: unknown): RecipeTags | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { spicy, cuisine, method } = raw as Record<string, unknown>;
  if (typeof spicy !== 'boolean') return null;
  if (typeof cuisine !== 'string' || !(CUISINES as readonly string[]).includes(cuisine))
    return null;
  if (typeof method !== 'string' || !(METHODS as readonly string[]).includes(method)) return null;
  return { spicy, cuisine: cuisine as Cuisine, method: method as Method };
}

// 생성·태깅 프롬프트에 붙일 설명
export const RECIPE_TAG_SCHEMA_PROMPT = [
  'Also classify the recipe with three tags:',
  '- spicy: true if the dish is noticeably spicy (uses chili, gochujang, gochugaru, etc.), otherwise false.',
  `- cuisine: one of ${CUISINES.join(', ')}.`,
  `- method: the main cooking method, one of ${METHODS.join(', ')} (stir_fry = pan-fried or sauteed, grill = grilled or baked, soup = soup or stew, steam = steamed or boiled, salad = salad or raw, rice_bowl = rice bowl or rice dish, other = anything else).`,
].join('\n');

// ---- 기존 레시피 태깅(tag-recipes) 배치용 ----

export interface RecipeTagInput {
  id: number;
  name: string;
  ingredients: string[];
  steps: string[];
}

const parseJsonArray = (raw: string | null): unknown[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// recipe 행(ingredients·cooking_steps는 JSON 문자열)을 태깅 입력으로 바꾼다.
// 재료는 옛 형식(문자열)과 새 형식({ name }) 모두 받는다. 조리 단계는 앞 3개만 (비용 절감)
export function recipeTagInputOf(row: {
  id: number;
  recipe_name: string | null;
  ingredients: string | null;
  cooking_steps: string | null;
}): RecipeTagInput {
  const ingredients = parseJsonArray(row.ingredients)
    .map((i) =>
      typeof i === 'string'
        ? i
        : typeof i === 'object' && i !== null && typeof (i as { name?: unknown }).name === 'string'
          ? (i as { name: string }).name
          : ''
    )
    .filter((n) => n.length > 0);
  const steps = parseJsonArray(row.cooking_steps)
    .filter((s): s is string => typeof s === 'string')
    .slice(0, 3);
  return { id: row.id, name: row.recipe_name ?? '', ingredients, steps };
}

// 여러 레시피를 한 번에 태깅하는 프롬프트
export function buildRecipeTagBatchPrompt(recipes: RecipeTagInput[]): string {
  return [
    'You are tagging Korean diet recipes.',
    RECIPE_TAG_SCHEMA_PROMPT,
    '',
    'Recipes (one JSON object per line; steps are the first few cooking steps):',
    ...recipes.map((r) =>
      JSON.stringify({ id: r.id, name: r.name, ingredients: r.ingredients, steps: r.steps })
    ),
    '',
    'Respond with only a JSON array with one object per recipe, in the form',
    '[{"id": <recipe id>, "spicy": true|false, "cuisine": "<cuisine>", "method": "<method>"}].',
  ].join('\n');
}

// Gemini 응답에서 이 배치 id에 해당하고 parseRecipeTags를 통과한 항목만 돌려준다 (id 중복은 첫 항목만)
export function parseRecipeTagBatchResponse(
  text: string,
  ids: number[]
): { id: number; tags: RecipeTags }[] {
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
  const result: { id: number; tags: RecipeTags }[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'number' || !wanted.has(id) || seen.has(id)) continue;
    seen.add(id);
    const tags = parseRecipeTags(item);
    if (tags) result.push({ id, tags });
  }
  return result;
}

// 생성(createRecipe.ts) responseSchema에 넣는 태그 필드. 값 목록은 위 CUISINES·METHODS 그대로
export const RECIPE_TAG_RESPONSE_PROPERTIES = {
  spicy: { type: 'BOOLEAN' },
  cuisine: { type: 'STRING', enum: [...CUISINES] },
  method: { type: 'STRING', enum: [...METHODS] },
};
export const RECIPE_TAG_REQUIRED = ['spicy', 'cuisine', 'method'] as const;

// Gemini responseSchema: 배치 응답을 {id, spicy, cuisine, method} 배열로 강제한다 (검증은 그래도 parse에서 한다)
export const RECIPE_TAG_BATCH_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'INTEGER' },
      spicy: { type: 'BOOLEAN' },
      cuisine: { type: 'STRING', enum: [...CUISINES] },
      method: { type: 'STRING', enum: [...METHODS] },
    },
    required: ['id', 'spicy', 'cuisine', 'method'],
  },
};
