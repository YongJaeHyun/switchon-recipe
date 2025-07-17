import { useMutation } from '@tanstack/react-query';
import { fetchGemini } from '../api/gemini';

export const useGemini = () => {
  return useMutation({
    mutationFn: fetchGemini,
  });
};
