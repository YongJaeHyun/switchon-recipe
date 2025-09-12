const savedRecipeFilters = ['전체', '무탄수', '저탄수'] as const;

type SavedRecipeFilter = (typeof savedRecipeFilters)[number];

export { SavedRecipeFilter, savedRecipeFilters };
