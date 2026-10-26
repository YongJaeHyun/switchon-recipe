import { useMutation } from '@tanstack/react-query';
import { FastingPlanAPI } from 'api/FastingPlanAPI';
import { FastingResultAPI } from 'api/FastingResultAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { fastingHistory, type FastingHistoryItem } from 'utils/fastingHistory';
import { useQueryWith402Retry } from './useCustomQuery';

interface HistoryData {
  plans: Awaited<ReturnType<typeof FastingPlanAPI.selectAll>>;
  results: Awaited<ReturnType<typeof FastingResultAPI.selectSince>>;
}

// 기록 탭 > 단식 칸: 현재 시작일 이후의 단식 기록과 결과 고치기. 무효화는 [QueryKey.fastingHistory] 접두어로 한다
export const useFastingHistory = () => {
  const uid = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);
  const start = startDate ? startDate.slice(0, 10) : '';

  const query = useQueryWith402Retry<HistoryData>({
    queryKey: [QueryKey.fastingHistory, uid, start],
    queryFn: failFastWhenOffline(async () => {
      const [plans, results] = await Promise.all([
        FastingPlanAPI.selectAll(start),
        FastingResultAPI.selectSince(start),
      ]);
      return { plans, results };
    }),
    enabled: !!uid && !!start,
  });

  // 기록 탭은 계속 떠 있어서, 탭에 돌아올 때마다 기준 시각을 새로 잡는다 (그새 시작된 단식도 보이게)
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));

  const items = useMemo<FastingHistoryItem[]>(
    () => (query.data && start ? fastingHistory({ startDate: start, ...query.data, now }) : []),
    [query.data, start, now]
  );

  const { mutateAsync: saveResult, isPending: isSaving } = useMutation({
    mutationFn: FastingResultAPI.upsert,
    onSuccess: (row, { day }) => {
      if (!row) return;
      // 오늘 탭의 단식 결과 줄(useFastingResult)도 같은 값으로 맞춘다
      queryClient.setQueryData([QueryKey.fastingResult, uid, day], FastingResultAPI.recordOf(row));
      void queryClient.invalidateQueries({ queryKey: [QueryKey.fastingResult, uid, day] });
      void queryClient.invalidateQueries({ queryKey: [QueryKey.fastingHistory] });
    },
  });

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    saveResult,
    isSaving,
  };
};
