const RECIPE_FILTERS = ['전체', '무탄수', '저탄수'] as const;

type RecipeFilterType = (typeof RECIPE_FILTERS)[number];

export { RECIPE_FILTERS, RecipeFilterType };
