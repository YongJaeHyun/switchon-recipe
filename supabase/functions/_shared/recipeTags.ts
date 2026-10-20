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
  if (typeof cuisine !== 'string' || !(CUISINES as readonly string[]).includes(cuisine)) return null;
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
