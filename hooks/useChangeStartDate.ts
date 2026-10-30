import { StatisticsAPI } from 'api/StatisticsAPI';
import { UserAPI } from 'api/UserAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { getKoreanDateString } from 'utils/date';
import { startDateCleanup } from 'utils/programStart';
import { useSelectedIngredients } from './useSelectedIngredients';

interface ChangeStartDateOptions {
  toast?: { title: string; subtitle: string };
  // 시작일 저장이 성공한 직후, 정리(재료·통계)보다 먼저 (한 주 더 하기의 '이미 물어봄' 표시 등)
  onSaved?: () => void;
}

// 시작일을 바꾸는 단 하나의 길 (프로그램 설정 시트, 한 주 더 하기, 온보딩).
// 시작일 저장이 실패하면 아무것도 지우지 않는다. 성공하면 새 시작일 기준으로
// 그 주차보다 높은 선택 재료를 빼고, 오늘 주차·일차부터의 할 일 통계를 지운다.
// 주차 store·할 일·단식 초기화는 useKoreanToday 재검증이 한다
export function useChangeStartDate() {
  const { selectedIngredients: lowIngredients, upsertIngredients: upsertLowIngredients } =
    useSelectedIngredients({ type: 'low' });
  const { selectedIngredients: zeroIngredients, upsertIngredients: upsertZeroIngredients } =
    useSelectedIngredients({ type: 'zero' });

  const changeStartDate = async (
    newStart: string,
    options?: ChangeStartDateOptions
  ): Promise<boolean> => {
    const ok = await UserAPI.updateStartDate(newStart, { toast: options?.toast });
    if (!ok) return false;
    options?.onSaved?.();

    const plan = startDateCleanup({
      newStart,
      today: getKoreanDateString({ formatType: 'date' }),
      low: lowIngredients,
      zero: zeroIngredients,
    });
    if (plan.low) upsertLowIngredients(plan.low);
    if (plan.zero) upsertZeroIngredients(plan.zero);
    await StatisticsAPI.deleteFrom(plan.statisticsFrom.week, plan.statisticsFrom.day);
    void queryClient.invalidateQueries({ queryKey: [QueryKey.todoRateStatistics] });
    return true;
  };

  return { changeStartDate };
}
