import { useInfiniteQuery } from '@tanstack/react-query';
import { RecipeAPI } from 'api/RecipeAPI';
import { RecipeFilterType } from 'const/filter';
import { QueryKey } from 'const/queryKey';
import { RecipeSortType } from 'const/sort';

export function useInfiniteRecipeCards(
  week: number,
  sortType: RecipeSortType,
  filterType: RecipeFilterType,
  pageSize = 10
) {
  return useInfiniteQuery({
    queryKey: [QueryKey.recipeCards, week, sortType, filterType],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      (await RecipeAPI.selectAllByWeekWithPagination(week, pageParam, sortType, filterType)) ?? [],
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    refetchInterval: 5 * 60 * 1000,
  });
}
