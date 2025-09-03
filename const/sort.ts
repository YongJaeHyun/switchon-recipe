const savedRecipeSorts = ['최신순', '조리시간순'] as const;

type SavedRecipeSort = (typeof savedRecipeSorts)[number];

export { SavedRecipeSort, savedRecipeSorts };
