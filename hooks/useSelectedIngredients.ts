import { useMutation } from '@tanstack/react-query';
import { SelectedIngredientAPI } from 'api/SelectedIngredientAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { RecipeType } from 'types/database';
import { useCallback } from 'react';
import { Ingredient } from 'types/recipe';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { orEmptyArray } from 'utils/stableDefaults';
import { rehydrateSelectedIngredients } from 'utils/rehydrateSelectedIngredients';
import { showInfoToast } from 'utils/showToast';
import { useQueryWith402Retry } from './useCustomQuery';
import { useIngredients } from './useIngredients';

interface UseSelectedIngredientsProps {
  type: RecipeType;
}

export const useSelectedIngredients = ({ type }: UseSelectedIngredientsProps) => {
  const { ingredients } = useIngredients();
  const { data: savedData, isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.selectedIngredients, type],
    queryFn: failFastWhenOffline(() => SelectedIngredientAPI.selectAll(type)),
    staleTime: Infinity,
  });

  const savedIngredients = orEmptyArray(savedData);

  // 저장된 선택 재료를 현재 재료 목록 기준으로 복원 (목록 로딩 전에는 그대로 사용)
  const rehydrate = (saved: Ingredient[]) =>
    ingredients.length > 0 ? rehydrateSelectedIngredients(saved, ingredients) : saved;

  const selectedIngredients = rehydrate(savedIngredients);

  // 시작 화면(app/index.tsx) effect의 의존성이라 렌더마다 새로 만들면 초기화가 반복 실행됨
  const prefetch = useCallback(
    async () =>
      await queryClient.prefetchQuery({
        queryKey: [QueryKey.selectedIngredients, type],
        queryFn: failFastWhenOffline(() => SelectedIngredientAPI.selectAll(type)),
      }),
    [type]
  );

  const { mutate: resetIngredients } = useMutation({
    mutationFn: () => SelectedIngredientAPI.reset(type),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: [QueryKey.selectedIngredients, type],
      });

      const previousData =
        queryClient.getQueryData<Ingredient[]>([QueryKey.selectedIngredients, type]) || [];

      queryClient.setQueryData([QueryKey.selectedIngredients, type], []);

      return { previousData };
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.selectedIngredients, type], context.previousData);
      }
    },
  });

  const { mutate: upsertIngredients } = useMutation({
    mutationFn: (ingredients: Ingredient[]) => SelectedIngredientAPI.upsert(type, ingredients),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: [QueryKey.selectedIngredients, type] });

      const previousData =
        queryClient.getQueryData<Ingredient[]>([QueryKey.selectedIngredients, type]) || [];

      queryClient.setQueryData([QueryKey.selectedIngredients, type], () => newData);

      return { previousData };
    },
    onError: (err, newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.selectedIngredients, type], context.previousData);
      }
    },
  });

  const toggleIngredient = (ingredient: Ingredient) => {
    const selectedIngredients = rehydrate(
      queryClient.getQueryData<Ingredient[]>([QueryKey.selectedIngredients, type]) || []
    );

    const isSelected = selectedIngredients.some((i) => i.name === ingredient.name);

    const updatedIngredients = isSelected
      ? selectedIngredients.filter((i) => i.name !== ingredient.name)
      : [...selectedIngredients, ingredient];

    if (selectedIngredients.length < 10 || (selectedIngredients.length === 10 && isSelected)) {
      upsertIngredients(updatedIngredients);
    } else {
      showInfoToast({ textType: 'EXCEED_MAXIMUM_INGREDIENT_SELECTED' });
    }
  };

  return {
    selectedIngredients,
    isLoading,
    toggleIngredient,
    resetIngredients,
    prefetch,
    upsertIngredients,
  };
};
