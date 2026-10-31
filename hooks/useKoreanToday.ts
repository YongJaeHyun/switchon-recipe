import { addDays, startOfDay } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDate, getKoreanDateString } from 'utils/date';
import { revalidateTodayPlan } from 'utils/programStart';
import { useFasting } from './useFasting';
import { useTodos } from './useTodos';

export default function useKoreanToday() {
  const { isHydrated } = useWeekCompletePopupStore();
  const userId = useUserStore((state) => state.id);
  const start_date = useUserStore((state) => state.start_date);
  const { resetTodos } = useTodos();
  const { resetFasting } = useFasting();

  const [today, setToday] = useState(getKoreanDateString({ formatType: 'date' }));

  const revalidateToday = useCallback(() => {
    const {
      open,
      close,
      week: prevWeek,
      day: prevDay,
      setWeek,
      setDay,
      isChecked,
    } = useWeekCompletePopupStore.getState();
    const newDay = getKoreanDateString({ formatType: 'date' });
    setToday(newDay);

    // 시작 전에는 주차 팝업을 열지 않고 일차를 '시작 전'으로 둔다 (서버 초기화 없음) → 시작일에 할 일이 초기화된다.
    // 시작일을 아직 모르면(유저를 불러오기 전) 아무것도 하지 않는다: 빈 시작일을 1주차로 보면 저장 주차가 1로
    // 내려갔다가 진짜 시작일에서 다시 올라가 할 일·단식을 지우고 이미 본 주차 팝업을 다시 연다
    const next = revalidateTodayPlan({
      userId,
      startDate: start_date,
      today: newDay,
      prevWeek,
      prevDay,
      isChecked,
    });
    if (!next) return;

    if (next.weekChanged) {
      setWeek(next.week);
      if (next.resetFasting) resetFasting();
      if (next.closePopup) close();
    }
    if (next.dayChanged) setDay(next.day);
    // 한 주 더 하기처럼 같은 날 주차만 바뀌어도 할 일을 초기화한다
    if (next.resetTodos) resetTodos();
    if (next.openPopup) open();
  }, [userId, start_date, resetFasting, resetTodos]);

  // 매일 자정에 다시 검증. 정리 함수를 돌려줘 언마운트·의존성 변경 시 타이머가 남지 않게 함
  const revalidateTodayInterval = useCallback(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextMidnight = () => {
      const now = getKoreanDate();
      const nextMidnight = startOfDay(addDays(now, 1));

      timeoutId = setTimeout(() => {
        revalidateToday();
        scheduleNextMidnight();
      }, nextMidnight.getTime() - now.getTime());
    };

    scheduleNextMidnight();

    return () => clearTimeout(timeoutId);
  }, [revalidateToday]);

  useEffect(() => {
    if (!isHydrated) return;
    revalidateToday(); // 초기 검증

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        revalidateToday();
      }
    });

    const clearMidnightTimer = revalidateTodayInterval();

    return () => {
      subscription.remove();
      clearMidnightTimer();
    };
  }, [isHydrated, revalidateToday, revalidateTodayInterval]);

  return today;
}
