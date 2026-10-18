import { useMutation } from '@tanstack/react-query';
import { SelectedIngredientAPI } from 'api/SelectedIngredientAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { RecipeType } from 'types/database';
import { Ingredient } from 'types/recipe';
import { rehydrateSelectedIngredients } from 'utils/rehydrateSelectedIngredients';
import { showInfoToast } from 'utils/showToast';
import { useQueryWith402Retry } from './useCustomQuery';
import { useIngredients } from './useIngredients';

interface UseSelectedIngredientsProps {
  type: RecipeType;
}

export const useSelectedIngredients = ({ type }: UseSelectedIngredientsProps) => {
  const { ingredients } = useIngredients();
  const { data: savedIngredients = [], isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.selectedIngredients, type],
    queryFn: () => SelectedIngredientAPI.selectAll(type),
    staleTime: Infinity,
  });

  // 저장된 선택 재료를 현재 재료 목록 기준으로 복원 (목록 로딩 전에는 그대로 사용)
  const rehydrate = (saved: Ingredient[]) =>
    ingredients.length > 0 ? rehydrateSelectedIngredients(saved, ingredients) : saved;

  const selectedIngredients = rehydrate(savedIngredients);

  const prefetch = async () =>
    await queryClient.prefetchQuery({
      queryKey: [QueryKey.selectedIngredients, type],
      queryFn: () => SelectedIngredientAPI.selectAll(type),
    });

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
