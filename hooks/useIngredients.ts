import { IngredientAPI } from 'api/IngredientAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useMemo } from 'react';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { loadIngredientsWithCache } from 'utils/ingredientCache';
import {
  buildAllWeekLists,
  buildLowIngredientLists,
  buildZeroIngredientLists,
} from 'utils/ingredientLists';
import { getLatestIngredientNotice } from 'utils/latestIngredientNotice';
import { useQueryWith402Retry } from './useCustomQuery';

const STALE_TIME = 10 * 60 * 1000;

const ingredientsQuery = {
  queryKey: [QueryKey.ingredients],
  queryFn: () => loadIngredientsWithCache(failFastWhenOffline(IngredientAPI.selectAll)),
  staleTime: STALE_TIME,
};

export const prefetchIngredients = () => queryClient.fetchQuery(ingredientsQuery);

export const useIngredients = () => {
  const {
    data: ingredients = [],
    isLoading,
    isError,
    refetch,
  } = useQueryWith402Retry(ingredientsQuery);

  return useMemo(
    () => ({
      ingredients,
      lowLists: buildLowIngredientLists(ingredients),
      allWeekLists: buildAllWeekLists(ingredients),
      zeroLists: buildZeroIngredientLists(ingredients),
      latestNotice: getLatestIngredientNotice(ingredients),
      isLoading,
      isError,
      refetch,
    }),
    [ingredients, isLoading, isError, refetch]
  );
};
