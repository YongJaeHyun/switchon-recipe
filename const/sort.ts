const RECIPE_SORTS = ['최신순', '저장 많은 순', '조리시간 빠른 순'] as const;

type RecipeSortType = (typeof RECIPE_SORTS)[number];

export { RECIPE_SORTS, RecipeSortType };
