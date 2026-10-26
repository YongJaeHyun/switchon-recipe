// 맞춤 레시피 추천의 필터·끼니 규칙: 순수 로직.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드된다. 런타임 import 없음(타입 import만).
import type { Cuisine, Method } from './recipeTags.ts';

export type Meal = 'breakfast' | 'lunch' | 'dinner';
export type MealKind = 'shake' | 'low' | 'zero';

export interface RecommendConditions {
  spicy?: boolean | null;
  cuisine?: Cuisine | null;
  method?: Method | null;
  maxMinutes?: 15 | 30 | null;
  meal?: Meal | null;
  mustInclude?: string[];
  exclude?: string[];
}

export interface RecipeRow {
  id: number;
  week: number;
  is_zero_carb: boolean;
  cooking_time: number;
  ingredients: { name: string }[];
  spicy: boolean | null;
  cuisine: string | null;
  method: string | null;
}

// hooks/useTodos와 같은 단계 계산. 4주차 이후(유지기)는 5단계.
// 미래 시작일이면 주차가 0 이하일 수 있어 1..5로 맞춘다 (mealKind가 던지지 않게)
export function stepOf(week: number, day: number): number {
  if (week === 1) return day <= 3 ? 1 : 2;
  return clampStep(week + 1);
}

const clampStep = (step: number): number => Math.min(Math.max(step, 1), 5);

// const/baseTodos.ts의 BASE_TODOS[step] 항목 0(아침)·1(점심)·3(저녁)에 대응.
// 앱 쪽 const/baseTodos.mealRule.test.ts가 문구와 일치하는지 검증한다.
const MEAL_KINDS: Record<number, Record<Meal, MealKind>> = {
  1: { breakfast: 'shake', lunch: 'shake', dinner: 'shake' },
  2: { breakfast: 'shake', lunch: 'low', dinner: 'shake' },
  3: { breakfast: 'shake', lunch: 'low', dinner: 'zero' },
  4: { breakfast: 'shake', lunch: 'low', dinner: 'zero' },
  5: { breakfast: 'shake', lunch: 'low', dinner: 'low' },
};

export function mealKind(step: number, meal: Meal): MealKind {
  return MEAL_KINDS[clampStep(step)][meal];
}

export function filterRecipes(
  rows: RecipeRow[],
  c: RecommendConditions,
  ctx: { week: number; day: number },
  normalize: (name: string) => string,
): RecipeRow[] {
  const maxWeek = Math.min(ctx.week, 4);
  let kind: MealKind | null = null;
  if (c.meal) {
    kind = mealKind(stepOf(ctx.week, ctx.day), c.meal);
    if (kind === 'shake') return [];
  }
  const exclude = (c.exclude ?? []).map(normalize);
  const must = (c.mustInclude ?? []).map(normalize);

  return rows.filter((r) => {
    if (r.week > maxWeek) return false;
    if (kind === 'zero' && !r.is_zero_carb) return false; // low는 무탄수도 허용
    if (c.spicy != null && r.spicy !== c.spicy) return false;
    if (c.cuisine != null && r.cuisine !== c.cuisine) return false;
    if (c.method != null && r.method !== c.method) return false;
    if (c.maxMinutes != null && r.cooking_time > c.maxMinutes) return false;
    const names = r.ingredients.map((i) => normalize(i.name));
    if (exclude.some((e) => names.includes(e))) return false;
    if (!must.every((m) => names.includes(m))) return false;
    return true;
  });
}

// Fisher–Yates 셔플 후 count개. 원본은 건드리지 않는다.
export function pickRecommendations<T>(rows: T[], count: number, random: () => number): T[] {
  const a = [...rows];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}
