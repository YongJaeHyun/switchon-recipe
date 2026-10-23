import { useMutation } from '@tanstack/react-query';
import {
  FastingResultAPI,
  type FastingResult,
  type FastingResultRecord,
} from 'api/FastingResultAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

// 단식(시작일 KST 날짜 day)의 결과. day가 없으면 조회하지 않는다
export const useFastingResult = (day: string | null) => {
  const uid = useUserStore((state) => state.id);
  const queryKey = [QueryKey.fastingResult, uid, day];

  const query = useQueryWith402Retry<FastingResultRecord | null>({
    queryKey,
    queryFn: failFastWhenOffline(() => FastingResultAPI.selectOne(day as string)),
    enabled: !!uid && !!day,
  });

  // 일찍 끝냈으면 result 'broken' + 단식한 분(fastedMinutes). 성공이면 분은 저장하지 않는다
  const { mutate: saveResult, isPending: isSaving } = useMutation({
    mutationFn: ({ result, fastedMinutes }: { result: FastingResult; fastedMinutes?: number }) =>
      FastingResultAPI.upsert({ day: day as string, result, fastedMinutes }),
    onSuccess: (row) => {
      if (row) queryClient.setQueryData(queryKey, FastingResultAPI.recordOf(row));
      void queryClient.invalidateQueries({ queryKey: [QueryKey.fastingHistory] });
    },
  });

  // 진행 중에 일찍 끝낸 것을 취소: 결과를 지우면 오늘 탭은 다시 진행 줄을 보여준다
  const { mutate: cancelResult, isPending: isCancelling } = useMutation({
    mutationFn: () => FastingResultAPI.remove(day as string),
    onSuccess: (removed) => {
      if (removed) queryClient.setQueryData(queryKey, null);
      void queryClient.invalidateQueries({ queryKey: [QueryKey.fastingHistory] });
    },
  });

  return {
    result: query.data?.result ?? null,
    fastedMinutes: query.data?.fastedMinutes ?? null,
    isLoading: query.isLoading,
    saveResult,
    cancelResult,
    isSaving: isSaving || isCancelling,
  };
};
