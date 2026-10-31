import { weekRepeatToast } from 'const/weekRepeat';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { addDaysToDay } from 'utils/programStart';
import { weekRepeatAdvice, weekRepeatKey } from 'utils/weekRepeat';
import { useChangeStartDate } from './useChangeStartDate';
import { useWeights } from './useWeights';

// 주차 진입 팝업의 '지난 주 돌아보기': 판정과 "한 주 더 하기"(시작일 +7일)
export function useWeekRepeat(enteringWeek: number) {
  const startDate = useUserStore((state) => state.start_date);
  const programStart = useUserStore((state) => state.program_start);
  const markRepeatAsked = useWeekCompletePopupStore((state) => state.markRepeatAsked);
  const { logs, isLoading, isLogsFetched } = useWeights();
  const { changeStartDate } = useChangeStartDate();

  // 기록을 못 받았으면(오프라인 등) 판정은 기록 없음과 같지만, 문구는 "없어요" 대신 못 불러왔다고 한다
  const loadFailed = !isLoading && !isLogsFetched;
  const advice = weekRepeatAdvice({
    logs: isLogsFetched ? logs : [],
    startDate,
    programStart,
    enteringWeek,
  });

  const markAsked = () => {
    if (startDate) markRepeatAsked(weekRepeatKey(startDate, enteringWeek));
  };

  // 시작일을 7일 미뤄 직전 주차의 같은 일차로 돌아간다. 정리(재료·통계)는 useChangeStartDate가 한다. 성공하면 true
  const repeatWeek = async (): Promise<boolean> => {
    if (!startDate) return false;
    const newStartDate = addDaysToDay(startDate.slice(0, 10), 7);
    return changeStartDate(newStartDate, {
      kind: 'repeat',
      toast: weekRepeatToast(enteringWeek - 1, newStartDate),
      onSaved: () => markRepeatAsked(weekRepeatKey(startDate, enteringWeek)),
    });
  };

  return { advice, isLoading: isLoading && !isLogsFetched, loadFailed, markAsked, repeatWeek };
}
