import { StatisticsAPI } from 'api/StatisticsAPI';
import { UserAPI } from 'api/UserAPI';
import { QueryKey } from 'const/queryKey';
import { weekRepeatToast } from 'const/weekRepeat';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getWeekAndDay } from 'utils/date';
import { addDaysToDay } from 'utils/programStart';
import { weekRepeatAdvice, weekRepeatKey } from 'utils/weekRepeat';
import { useSelectedIngredients } from './useSelectedIngredients';
import { useWeights } from './useWeights';

// 주차 진입 팝업의 '지난 주 돌아보기': 판정과 "한 주 더 하기"(시작일 +7일)
export function useWeekRepeat(enteringWeek: number) {
  const startDate = useUserStore((state) => state.start_date);
  const markRepeatAsked = useWeekCompletePopupStore((state) => state.markRepeatAsked);
  const { logs, isLoading, isLogsFetched } = useWeights();
  const { selectedIngredients: lowIngredients, upsertIngredients: upsertLowIngredients } =
    useSelectedIngredients({ type: 'low' });
  const { selectedIngredients: zeroIngredients, upsertIngredients: upsertZeroIngredients } =
    useSelectedIngredients({ type: 'zero' });

  // 기록을 못 받았으면(오프라인 등) 기록 없음과 같게 측정 권유를 보여 준다
  const advice = weekRepeatAdvice({
    logs: isLogsFetched ? logs : [],
    startDate,
    enteringWeek,
  });

  const markAsked = () => {
    if (startDate) markRepeatAsked(weekRepeatKey(startDate, enteringWeek));
  };

  // 시작일을 7일 미뤄 직전 주차의 같은 일차로 돌아간다. 주차 store·할 일·단식 초기화는 useKoreanToday 재검증이 한다.
  // 시작일 변경 시트(StartDateBottomSheet)처럼 그 주차에 없는 선택 재료와 그 뒤 통계를 지운다. 성공하면 true
  const repeatWeek = async (): Promise<boolean> => {
    if (!startDate) return false;
    const newStartDate = addDaysToDay(startDate.slice(0, 10), 7);
    const ok = await UserAPI.updateStartDate(newStartDate, {
      toast: weekRepeatToast(enteringWeek - 1, newStartDate),
    });
    if (!ok) return false;
    markRepeatAsked(weekRepeatKey(startDate, enteringWeek));

    const { week, day } = getWeekAndDay(newStartDate);
    const low = lowIngredients.filter((ingredient) => ingredient.week <= week);
    if (low.length !== lowIngredients.length) upsertLowIngredients(low);
    const zero = zeroIngredients.filter((ingredient) => ingredient.week <= week);
    if (zero.length !== zeroIngredients.length) upsertZeroIngredients(zero);
    await StatisticsAPI.deleteFrom(week, day);
    void queryClient.invalidateQueries({ queryKey: [QueryKey.todoRateStatistics] });
    return true;
  };

  return { advice, isLoading: isLoading && !isLogsFetched, markAsked, repeatWeek };
}
