import { useMutation } from '@tanstack/react-query';
import { FastingResultAPI, type FastingResult } from 'api/FastingResultAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

// 단식(시작일 KST 날짜 day)의 결과. day가 없으면 조회하지 않는다
export const useFastingResult = (day: string | null) => {
  const uid = useUserStore((state) => state.id);
  const queryKey = [QueryKey.fastingResult, uid, day];

  const query = useQueryWith402Retry<FastingResult | null>({
    queryKey,
    queryFn: failFastWhenOffline(() => FastingResultAPI.selectOne(day as string)),
    enabled: !!uid && !!day,
  });

  const { mutate: saveResult, isPending: isSaving } = useMutation({
    mutationFn: (result: FastingResult) => FastingResultAPI.upsert({ day: day as string, result }),
    onSuccess: (row) => {
      if (row) queryClient.setQueryData(queryKey, row.result as FastingResult);
    },
  });

  return { result: query.data ?? null, isLoading: query.isLoading, saveResult, isSaving };
};
