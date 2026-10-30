import { useMutation } from '@tanstack/react-query';
import { FastingPlanAPI } from 'api/FastingPlanAPI';
import { FastingResultAPI } from 'api/FastingResultAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { fastingHistory } from 'utils/fastingHistory';
import { programStartOf } from 'utils/programStart';
import { useQueryWith402Retry } from './useCustomQuery';

interface HistoryData {
  plans: Awaited<ReturnType<typeof FastingPlanAPI.selectEvery>>;
  results: Awaited<ReturnType<typeof FastingResultAPI.selectSince>>;
}

// 기록 탭 > 단식 칸: 지금 회차·지난 회차의 단식 기록과 (지금 회차) 결과 고치기.
// 무효화는 [QueryKey.fastingHistory] 접두어로 한다
export const useFastingHistory = () => {
  const uid = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);
  const programStart = useUserStore((state) => state.program_start);
  const start = startDate ? startDate.slice(0, 10) : '';
  const program = programStartOf(programStart, start);

  const query = useQueryWith402Retry<HistoryData>({
    queryKey: [QueryKey.fastingHistory, uid, start, program],
    queryFn: failFastWhenOffline(async () => {
      const plans = await FastingPlanAPI.selectEvery();
      // 가장 이른 계획 시작일부터의 결과 (지난 회차 포함)
      const from = [
        program ?? start,
        ...plans.map((plan) => plan.start_date.slice(0, 10)),
      ].sort()[0];
      const results = await FastingResultAPI.selectSince(from);
      return { plans, results };
    }),
    enabled: !!uid && !!start,
  });

  // 기록 탭은 계속 떠 있어서, 탭에 돌아올 때마다 기준 시각을 새로 잡는다 (그새 시작된 단식도 보이게)
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));

  const history = useMemo(
    () =>
      query.data && start
        ? fastingHistory({ startDate: start, programStart, ...query.data, now })
        : { current: [], previous: [] },
    [query.data, start, programStart, now]
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
    items: history.current,
    previous: history.previous,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    saveResult,
    isSaving,
  };
};
