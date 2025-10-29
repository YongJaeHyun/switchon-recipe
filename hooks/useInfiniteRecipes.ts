import { useInfiniteQuery } from '@tanstack/react-query';
import { RecipeAPI } from 'api/RecipeAPI';
import { RecipeFilterType } from 'const/filter';
import { QueryKey } from 'const/queryKey';
import { RecipeSortType } from 'const/sort';

interface useInfiniteRecipeCardsProps {
  week: number;
  keyword?: string;
  sortType?: RecipeSortType;
  filterType?: RecipeFilterType;
  pageSize?: number;
}

export function useInfiniteRecipeCards({
  week,
  keyword,
  sortType = '최신순',
  filterType = '전체',
  pageSize = 10,
}: useInfiniteRecipeCardsProps) {
  return useInfiniteQuery({
    queryKey: [QueryKey.recipeCards, week, sortType, filterType, keyword],
    initialPageParam: 0,
    queryFn: async ({ pageParam: currentPage }) =>
      (await RecipeAPI.selectAllByWeekWithPagination({
        week,
        keyword,
        currentPage,
        sortType,
        filterType,
      })) ?? [],
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    refetchInterval: 5 * 60 * 1000,
  });
}
