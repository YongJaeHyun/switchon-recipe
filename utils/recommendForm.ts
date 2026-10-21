// 맞춤 레시피 추천 화면의 끼니 규칙·선택지·"새로 만들기" 명령문 (순수 함수).
// stepOf·mealKind는 서버 supabase/functions/_shared/recommend.ts의 앱 쪽 복사본이다.
// 어긋나지 않는지는 recommendForm.test.ts가 BASE_TODOS·서버 모듈과 비교한다
import type { RecipeCategory, RecipeMethod } from 'types/recipe';
import {
  type Cuisine,
  type MaxMinutes,
  type Meal,
  type MealKind,
  type MealOption,
  type Method,
  type RecommendConditions,
  SHAKE_MEAL_REASON,
} from 'types/recommend';

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner'];
export const MAX_MUST_INCLUDE = 2;
export const MAX_EXCLUDE = 30;

// hooks/useTodos와 같은 단계 계산. 4주차 이후(유지기)는 5단계
export function stepOf(week: number, day: number): number {
  if (week === 1) return day <= 3 ? 1 : 2;
  return Math.min(week + 1, 5);
}

// const/baseTodos.ts의 BASE_TODOS[step] 항목 0(아침)·1(점심)·3(저녁)
const MEAL_KINDS: Record<number, Record<Meal, MealKind>> = {
  1: { breakfast: 'shake', lunch: 'shake', dinner: 'shake' },
  2: { breakfast: 'shake', lunch: 'low', dinner: 'shake' },
  3: { breakfast: 'shake', lunch: 'low', dinner: 'zero' },
  4: { breakfast: 'shake', lunch: 'low', dinner: 'zero' },
  5: { breakfast: 'shake', lunch: 'low', dinner: 'low' },
};

export function mealKind(step: number, meal: Meal): MealKind {
  return MEAL_KINDS[step][meal];
}

export function availableMeals(week: number, day: number): MealOption[] {
  const step = stepOf(week, day);
  return MEALS.map((meal) =>
    mealKind(step, meal) === 'shake'
      ? { meal, enabled: false, reason: SHAKE_MEAL_REASON }
      : { meal, enabled: true }
  );
}

// 모든 끼니가 쉐이크인 단계(1주차 1~3일)
export function isRecommendLocked(week: number, day: number): boolean {
  return availableMeals(week, day).every((m) => !m.enabled);
}

// ---- 화면 선택지 (라벨은 스펙 §5.2) ----

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export const SPICY_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: '매운 것' },
  { value: false, label: '안 매운 것' },
];

export const CUISINE_OPTIONS: { value: Cuisine; label: string; category: RecipeCategory }[] = [
  { value: 'korean', label: '한식', category: '한식' },
  { value: 'western', label: '양식', category: '양식' },
  { value: 'chinese', label: '중식', category: '중식' },
  { value: 'japanese', label: '일식', category: '일식' },
];

export const METHOD_OPTIONS: { value: Method; label: string; method: RecipeMethod }[] = [
  { value: 'stir_fry', label: '볶음', method: '볶음류' },
  { value: 'grill', label: '구이', method: '구이류' },
  { value: 'soup', label: '국·탕', method: '탕/국류' },
  { value: 'steam', label: '찜', method: '찜류' },
  { value: 'salad', label: '샐러드', method: '샐러드류' },
  { value: 'rice_bowl', label: '덮밥', method: '덮밥류' },
];

export const MAX_MINUTES_OPTIONS: { value: MaxMinutes; label: string }[] = [
  { value: 15, label: '15분 이내' },
  { value: 30, label: '30분 이내' },
];

// 쿼리 파라미터 meal(breakfast|lunch|dinner) 해석. 그 밖의 값은 null
export function parseMealParam(value: unknown): Meal | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && (MEALS as readonly string[]).includes(v) ? (v as Meal) : null;
}

// ---- "이 조건으로 새로 만들기" ----

// 생성 레시피의 주차 (기존 low/zero 화면과 같이 3으로 묶는다)
export function recipeWeekOf(week: number): number {
  return Math.min(week, 3);
}

// 새로 만들 레시피가 무탄수인지. 끼니가 있으면 그 끼니 규칙. 끼니가 없거나 쉐이크면,
// 지금 단계의 저녁이 무탄수인 경우 무탄수(더 엄격한 쪽), 아니면 저탄수
export function isZeroCarbMeal(meal: Meal | null | undefined, week: number, day: number): boolean {
  const step = stepOf(week, day);
  const kind = meal ? mealKind(step, meal) : 'shake';
  if (kind !== 'shake') return kind === 'zero';
  return mealKind(step, 'dinner') === 'zero';
}

// 기존 low/zero 생성 화면의 명령문 형식(영어 지시문 + 카테고리·방식 줄 + 고정 꼬리 줄)에
// 맛·시간·꼭 넣을/뺄 재료 줄을 더한다
export function buildRecipeCommand(
  c: RecommendConditions,
  ctx: { week: number; day: number }
): { command: string; isZeroCarb: boolean } {
  const isZeroCarb = isZeroCarbMeal(c.meal, ctx.week, ctx.day);
  const carb = isZeroCarb ? 'zero-carb' : 'low-carb';
  const availableWeek = Math.min(ctx.week, 4);

  const lines = [
    `find a delicious ${carb} recipe randomly that can be eaten during Switch-On week ${availableWeek}.`,
  ];
  const category = CUISINE_OPTIONS.find((o) => o.value === c.cuisine)?.category;
  const method = METHOD_OPTIONS.find((o) => o.value === c.method)?.method;
  if (category) lines.push(`Cooking category: ${category}`);
  if (method) lines.push(`Cooking method: ${method}`);
  if (c.spicy === true) lines.push('Taste: spicy');
  if (c.spicy === false) lines.push('Taste: not spicy (no chili, gochujang or gochugaru)');
  if (c.maxMinutes) lines.push(`Cooking time: within ${c.maxMinutes} minutes`);
  const must = (c.mustInclude ?? []).filter(Boolean);
  const exclude = (c.exclude ?? []).filter(Boolean);
  if (must.length > 0) lines.push(`Must include these ingredients: ${must.join(', ')}`);
  if (exclude.length > 0) lines.push(`Do not use these ingredients: ${exclude.join(', ')}`);
  lines.push('Remove Switch-On week or carbohydrate from the recipe name.');
  lines.push('You may freely use sauces or seasonings.');

  return { command: lines.join('\n'), isZeroCarb };
}
