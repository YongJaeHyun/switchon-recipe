// similar-recipes 엣지 함수 응답 해석 (순수 함수)
import type { RecipeWithIsSavedDB } from 'types/database';

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// 서버 행을 RecipeCard(components/recipes)가 받는 recipe_with_is_saved 행 모양으로.
// 카드·상세 화면이 재료 JSON을 바로 파싱하므로 재료가 없는 행은 뺀다
const toRecipe = (value: unknown): RecipeWithIsSavedDB | null => {
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
    created_at: str(r.created_at),
    uid: str(r.uid),
    is_saved: r.is_saved === true,
    saved_at: str(r.saved_at),
    saved_count: num(r.saved_count) ?? 0,
  };
};

// 200 응답 본문 → 카드 행 목록. 모양이 맞지 않으면 null
export function parseSimilarResponse(body: unknown): RecipeWithIsSavedDB[] | null {
  const b = asObject(body);
  if (!b || !Array.isArray(b.recipes)) return null;
  return b.recipes.map(toRecipe).filter((r): r is RecipeWithIsSavedDB => r !== null);
}
