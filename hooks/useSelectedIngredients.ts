import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SelectedIngredientAPI } from 'api/SelectedIngredientAPI';
import { QueryKey } from 'const/queryKey';
import { IIngredient } from 'types/recipe';

export const useSelectedIngredients = () => {
  const queryClient = useQueryClient();

  const { data: selectedIngredients = [], isLoading } = useQuery({
    queryKey: [QueryKey.selectedIngredients],
    queryFn: SelectedIngredientAPI.selectAll,
  });

  const prefetch = async () =>
    await queryClient.prefetchQuery({
      queryKey: [QueryKey.selectedIngredients],
      queryFn: SelectedIngredientAPI.selectAll,
    });

  const { mutate: resetIngredients } = useMutation({
    mutationFn: SelectedIngredientAPI.reset,
    onSuccess: () => {
      queryClient.setQueryData<IIngredient[]>([QueryKey.selectedIngredients], () => []);
    },
  });

  const { mutate: upsertIngredients } = useMutation({
    mutationFn: SelectedIngredientAPI.upsert,
    onSuccess: (newData) => {
      queryClient.setQueryData<IIngredient[]>([QueryKey.selectedIngredients], () => newData);
    },
  });

  const toggleIngredient = (ingredient: IIngredient) => {
    const selectedIngredients =
      queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients]) || [];

    const isSelected = selectedIngredients.some((i) => i.name === ingredient.name);

    if (isSelected) {
      const filteredIngredient = selectedIngredients.filter((i) => i.name !== ingredient.name);
      upsertIngredients(filteredIngredient);
    } else {
      upsertIngredients([...selectedIngredients, ingredient]);
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
