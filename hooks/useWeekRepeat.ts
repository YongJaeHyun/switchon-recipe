import { PassAPI } from 'api/PassAPI';
import { QueryKey } from 'const/queryKey';
import { weekRepeatToast } from 'const/weekRepeat';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { extendPassAfterRepeat } from 'utils/passExtension';
import { addDaysToDay } from 'utils/programStart';
import { showSuccessToast } from 'utils/showToast';
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

  // 시작일을 7일 미뤄 직전 주차의 같은 일차로 돌아간다. 정리(재료·통계)는 useChangeStartDate가 한다.
  // 성공하면 패스도 7일 늘려 달라고 서버에 묻는다 (패스는 한 회차 전체를 책임진다). 연장 실패는 한 주 더 하기 결과를
  // 바꾸지 않는다. ok: 한 주 더 하기 성공, passExtended: 패스도 늘었음 (토스트를 그 문구로 다시 띄움)
  const repeatWeek = async (): Promise<{ ok: boolean; passExtended: boolean }> => {
    if (!startDate) return { ok: false, passExtended: false };
    const newStartDate = addDaysToDay(startDate.slice(0, 10), 7);
    const repeatedWeek = enteringWeek - 1;
    const ok = await changeStartDate(newStartDate, {
      kind: 'repeat',
      toast: weekRepeatToast(repeatedWeek, newStartDate),
      onSaved: () => markRepeatAsked(weekRepeatKey(startDate, enteringWeek)),
    });
    if (!ok) return { ok, passExtended: false };

    const passExtended = await extendPassAfterRepeat(newStartDate, {
      extend: PassAPI.extendForWeekRepeat,
      onExtended: () => {
        void queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
        showSuccessToast({
          textType: 'CUSTOM',
          ...weekRepeatToast(repeatedWeek, newStartDate, { passExtended: true }),
        });
      },
    });
    return { ok, passExtended };
  };

  return { advice, isLoading: isLoading && !isLogsFetched, loadFailed, markAsked, repeatWeek };
}
