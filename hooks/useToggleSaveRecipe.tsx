import { useMutation } from '@tanstack/react-query';
import { RecipeAPI } from 'api/RecipeAPI';
import { queryClient } from 'lib/queryClient';
import { askReviewAfterSave } from 'services/reviewPrompt';
import { requireOnline } from 'utils/network';

export function useToggleSaveRecipe({ id }: { id: number }) {
  const optimisticUpdate = (next: boolean) => {
    queryClient.setQueryData(['savedRecipe', id], next);
  };

  const rollback = (previous: boolean) => {
    queryClient.setQueryData(['savedRecipe', id], previous);
  };

  const saveMutation = useMutation({
    mutationFn: () => RecipeAPI.insertSaved(id),
    // 3개째 저장에 성공하면 리뷰를 묻는다
    onSuccess: (inserted) => void askReviewAfterSave(inserted),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['savedRecipe', id] });
      const prev = queryClient.getQueryData<boolean>(['savedRecipe', id]);
      optimisticUpdate(true);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) rollback(context.prev);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => RecipeAPI.deleteSaved(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['savedRecipe', id] });
      const prev = queryClient.getQueryData<boolean>(['savedRecipe', id]);
      optimisticUpdate(false);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) rollback(context.prev);
    },
  });

  const toggleIsSaved = requireOnline(() => {
    const current = queryClient.getQueryData<boolean>(['savedRecipe', id]) ?? false;
    if (current) {
      deleteMutation.mutate();
    } else {
      saveMutation.mutate();
    }
  });

  return { toggleIsSaved };
}
