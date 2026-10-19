export type CreationLoadingKind = 'recipe' | 'data' | null;

// 레시피 제작 로딩 화면은 실제로 레시피를 만들 때만, 재료 불러오는 중에는 단순 로딩 표시
export const getCreationLoadingKind = ({
  isRecipeLoading,
  isDataLoading,
}: {
  isRecipeLoading: boolean;
  isDataLoading: boolean;
}): CreationLoadingKind => {
  if (isRecipeLoading) return 'recipe';
  if (isDataLoading) return 'data';
  return null;
};
