import { useMutation } from '@tanstack/react-query';
import { SearchHistoryAPI } from 'api/SearchHistoryAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import { useQueryWith402Retry } from './useCustomQuery';

export const useRecentKeywords = () => {
  const userId = useUserStore((state) => state.id);

  const { data, isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.recentKeywords, userId],
    queryFn: SearchHistoryAPI.getRecent,
  });

  const { mutate: insertKeyword } = useMutation({
    mutationFn: SearchHistoryAPI.insert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKey.recentKeywords] });
    },
  });

  const { mutate: deleteKeyword } = useMutation({
    mutationFn: (id: number) => SearchHistoryAPI.deleteOne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKey.recentKeywords] });
    },
  });

  const { mutate: deleteAllKeywords } = useMutation({
    mutationFn: SearchHistoryAPI.deleteAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKey.recentKeywords] });
    },
  });

  return { data, insertKeyword, deleteKeyword, deleteAllKeywords, isLoading };
};
