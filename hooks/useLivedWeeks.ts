import { FastingPlanAPI } from 'api/FastingPlanAPI';
import { QueryKey } from 'const/queryKey';
import { useMemo } from 'react';
import { useUserStore } from 'stores/userStore';
import { getKoreanDateString } from 'utils/date';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { livedPeriodsOf, type LivedWeeks } from 'utils/weight';
import { useQueryWith402Retry } from './useCustomQuery';
import { useWeeklyReports } from './useWeeklyReports';

// 체중 기록의 "실제로 지낸 주차"를 세는 기록: 모든 단식 계획 키와 주간 리포트(표시 주차).
// 못 불러오면 빈 기록 (weekOfLog가 시작일·회차 시작일로만 센다). 무효화는 [QueryKey.fastingHistory] 접두어
export const useLivedWeeks = (): LivedWeeks => {
  const uid = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);
  const start = startDate ? startDate.slice(0, 10) : '';

  const { data: plans } = useQueryWith402Retry({
    queryKey: [QueryKey.fastingHistory, uid, 'livedWeeks', start],
    queryFn: failFastWhenOffline(FastingPlanAPI.selectEvery),
    enabled: !!uid && !!start,
  });
  const { reports } = useWeeklyReports();
  const today = getKoreanDateString({ formatType: 'date' });

  return useMemo(
    () => ({ periods: livedPeriodsOf({ plans: plans ?? [], reports }), today }),
    [plans, reports, today]
  );
};
