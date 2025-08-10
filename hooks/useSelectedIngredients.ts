import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SelectedIngredientAPI } from 'api/SelectedIngredientAPI';
import { QueryKey } from 'const/queryKey';
import { IIngredient } from 'types/recipe';

export const useSelectedIngredients = () => {
  const queryClient = useQueryClient();

  const { data: selectedIngredients = [], isLoading } = useQuery({
    queryKey: [QueryKey.selectedIngredients],
    queryFn: SelectedIngredientAPI.selectAll,
    staleTime: Infinity,
  });

  const prefetch = async () =>
    await queryClient.prefetchQuery({
      queryKey: [QueryKey.selectedIngredients],
      queryFn: SelectedIngredientAPI.selectAll,
    });

  const { mutate: resetIngredients } = useMutation({
    mutationFn: SelectedIngredientAPI.reset,
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: [QueryKey.selectedIngredients],
      });

      const previousData =
        queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients]) || [];

      queryClient.setQueryData([QueryKey.selectedIngredients], []);

      return { previousData };
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.selectedIngredients], context.previousData);
      }
    },
  });

  const { mutate: upsertIngredients } = useMutation({
    mutationFn: SelectedIngredientAPI.upsert,
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: [QueryKey.selectedIngredients] });

      const previousData =
        queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients]) || [];

      queryClient.setQueryData([QueryKey.selectedIngredients], () => newData);

      return { previousData };
    },
    onError: (err, newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.selectedIngredients], context.previousData);
      }
    },
  });

  const toggleIngredient = (ingredient: IIngredient) => {
    const selectedIngredients =
      queryClient.getQueryData<IIngredient[]>([QueryKey.selectedIngredients]) || [];

    const isSelected = selectedIngredients.some((i) => i.name === ingredient.name);

    const updatedIngredients = isSelected
      ? selectedIngredients.filter((i) => i.name !== ingredient.name)
      : [...selectedIngredients, ingredient];

    upsertIngredients(updatedIngredients);
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
