// 레시피 행의 JSON 문자열 칸 (ingredients·cooking_steps·nutrition) 읽기 (순수).
// 레시피 상세(app/recipeDetail)는 카톡 링크 등 밖에서 온 레시피도 열므로 모양이 틀려도 죽지 않게 빈 값으로 읽고,
// 카톡 링크 검사(utils/kakaoLink)는 모양이 맞는지만 본다

const parseJson = (text: unknown): unknown => {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type RawFields = { ingredients?: unknown; cooking_steps?: unknown; nutrition?: unknown };

export function hasRecipeFieldShapes(fields: RawFields): boolean {
  return (
    Array.isArray(parseJson(fields.ingredients)) &&
    Array.isArray(parseJson(fields.cooking_steps)) &&
    isPlainObject(parseJson(fields.nutrition))
  );
}

export function parseRecipeFields(fields: RawFields): {
  ingredients: unknown[];
  cookingSteps: unknown[];
  nutrition: Record<string, unknown>;
} {
  const ingredients = parseJson(fields.ingredients);
  const cookingSteps = parseJson(fields.cooking_steps);
  const nutrition = parseJson(fields.nutrition);
  return {
    ingredients: Array.isArray(ingredients) ? ingredients : [],
    cookingSteps: Array.isArray(cookingSteps) ? cookingSteps : [],
    nutrition: isPlainObject(nutrition) ? nutrition : {},
  };
}
