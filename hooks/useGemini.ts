import { useMutation } from '@tanstack/react-query';
import { createRecipe } from '../api/gemini';

export const useGemini = () => {
  return useMutation({
    mutationFn: createRecipe,
  });
};
