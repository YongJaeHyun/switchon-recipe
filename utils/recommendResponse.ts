// recommend-recipes 엣지 함수 응답 해석 (순수 함수)
import type { RecipeDB } from 'types/database';
import type { RecommendOutcome } from 'types/recommend';

export const RECOMMEND_ERROR_MESSAGE = '추천에 실패했어요. 잠시 후 다시 시도해 주세요';
const INVALID_FALLBACK = '조건을 확인해 주세요';

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// 서버 행(recipe_with_is_saved 모양)을 탐색 탭 RecipeCard가 받는 RecipeDB 모양으로.
// 응답에는 태그 열이 없으므로 null (재료 태그는 []). 카드가 재료 JSON을 바로 파싱하므로 재료가 없는 행은 뺀다
const toRecipe = (value: unknown): RecipeDB | null => {
  const r = asObject(value);
  if (!r || typeof r.id !== 'number' || typeof r.ingredients !== 'string') return null;
  return {
    id: r.id,
    recipe_name: str(r.recipe_name),
    image_uri: str(r.image_uri),
    ingredients: r.ingredients,
    cooking_steps: str(r.cooking_steps),
    cooking_time: num(r.cooking_time),
    nutrition: str(r.nutrition),
    is_zero_carb: typeof r.is_zero_carb === 'boolean' ? r.is_zero_carb : null,
    week: num(r.week),
    created_at: str(r.created_at) ?? '',
    uid: str(r.uid),
    spicy: null,
    cuisine: null,
    method: null,
    ingredient_tags: [],
    is_saved: r.is_saved === true,
    saved_count: num(r.saved_count) ?? 0,
  };
};

export function interpretRecommendResponse(status: number, body: unknown): RecommendOutcome {
  const b = asObject(body);

  if (status === 200) {
    if (b?.reason === 'shake') return { status: 'shake' };
    if (!b || !Array.isArray(b.recipes)) {
      return { status: 'error', message: RECOMMEND_ERROR_MESSAGE };
    }
    const recipes = b.recipes.map(toRecipe).filter((r): r is RecipeDB => r !== null);
    return { status: 'ok', recipes, totalMatches: num(b.totalMatches) ?? recipes.length };
  }
  if (status === 402) return { status: 'locked' };
  if (status === 400) {
    return { status: 'invalid', message: str(b?.error) || INVALID_FALLBACK };
  }
  return { status: 'error', message: RECOMMEND_ERROR_MESSAGE };
}

// recipeStore.isSavedMap에 합칠 저장 여부
export function savedEntriesOf(
  recipes: { id: number; is_saved: boolean }[]
): Record<number, boolean> {
  return Object.fromEntries(recipes.map((r) => [r.id, r.is_saved]));
}
