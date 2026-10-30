// 레시피 영양 정보는 적힌 재료 전체 양 기준이라, 기준 인분으로 나눠 1인분 값으로 보여 준다.
// 기준 인분을 모르거나 1인분이면 그대로
export function nutritionPerServing<T extends Record<string, unknown>>(
  nutrition: T,
  baseServings: number | null
): T {
  if (!baseServings || baseServings <= 1) return nutrition;
  return Object.fromEntries(
    Object.entries(nutrition).map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value / baseServings) : value,
    ])
  ) as T;
}
