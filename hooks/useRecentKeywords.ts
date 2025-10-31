import { useMutation, useQuery } from '@tanstack/react-query';
import { SearchHistoryAPI } from 'api/SearchHistoryAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';

export const useRecentKeywords = () => {
  const { data, isLoading } = useQuery({
    queryKey: [QueryKey.recentKeywords],
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
