import { FastingPlanAPI } from 'api/FastingPlanAPI';
import type { FastingTime } from 'const/fastingDays';
import { QueryKey } from 'const/queryKey';
import { useUserStore } from 'stores/userStore';
import type { FastingPlanDB } from 'types/database';
import { getWeekAndDay } from 'utils/date';
import { previousFastingWeek, type PreviousFastingPlan } from 'utils/dietGuide';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

// 지난 주차 단식 계획. 주차가 바뀌어 단식 설정이 초기화돼도 지난 주 마지막 날 단식에 응답할 수 있게 한다.
// 없거나 불러오지 못하면 null (응답 창만 좁아질 뿐 화면은 그대로)
export const usePreviousFastingPlan = (): PreviousFastingPlan | null => {
  const uid = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);
  const { week } = getWeekAndDay(startDate);
  const previous = previousFastingWeek(startDate, week);
  const start = startDate ? startDate.slice(0, 10) : '';

  const { data } = useQueryWith402Retry<FastingPlanDB | null>({
    queryKey: [QueryKey.fastingPlan, uid, start, previous?.weekIndex],
    queryFn: failFastWhenOffline(() =>
      FastingPlanAPI.selectOne({ start_date: start, week_index: previous!.weekIndex })
    ),
    enabled: !!uid && !!previous,
  });

  if (!previous || !data) return null;
  return {
    days: data.days,
    startTime: data.start_time as FastingTime | null,
    to: previous.to,
  };
};
