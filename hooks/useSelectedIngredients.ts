import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SelectedIngredientAPI } from 'api/SelectedIngredientAPI';
import { QueryKey } from 'const/queryKey';
import { RecipeType } from 'types/database';
import { IIngredient } from 'types/recipe';
import { showInfoToast } from 'utils/showToast';

interface UseSelectedIngredientsProps {
  type: RecipeType;
}

export const useSelectedIngredients = ({ type }: UseSelectedIngredientsProps) => {
  const queryClient = useQueryClient();

  const { data: selectedIngredients = [], isLoading } = useQuery({
    queryKey: [QueryKey.selectedIngredients, type],
    queryFn: () => SelectedIngredientAPI.selectAll(type),
    staleTime: Infinity,
  });

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
        queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients, type]) || [];

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
    mutationFn: (ingredients: IIngredient[]) => SelectedIngredientAPI.upsert(type, ingredients),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: [QueryKey.selectedIngredients, type] });

      const previousData =
        queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients, type]) || [];

      queryClient.setQueryData([QueryKey.selectedIngredients, type], () => newData);

      return { previousData };
    },
    onError: (err, newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.selectedIngredients, type], context.previousData);
      }
    },
  });

  const toggleIngredient = (ingredient: IIngredient) => {
    const selectedIngredients =
      queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients, type]) || [];

    const isSelected = selectedIngredients.some((i) => i.name === ingredient.name);

    const updatedIngredients = isSelected
      ? selectedIngredients.filter((i) => i.name !== ingredient.name)
      : [...selectedIngredients, ingredient];

    if (selectedIngredients.length < 10 || (selectedIngredients.length === 10 && isSelected)) {
      upsertIngredients(updatedIngredients);
    } else {
      showInfoToast({
        text1: '최대 선택 갯수 초과',
        text2: '재료는 최대 10개까지 선택할 수 있어요!',
      });
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
