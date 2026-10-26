import { addDays, startOfDay } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDate, getKoreanDateString, getWeekAndDay } from 'utils/date';
import { shouldOpenWeekPopup } from 'utils/weekPopup';
import { useFasting } from './useFasting';
import { useTodos } from './useTodos';

export default function useKoreanToday() {
  const { isHydrated } = useWeekCompletePopupStore();
  const { start_date } = useUserStore();
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
    const { week, day } = getWeekAndDay(start_date);

    const shouldOpen = shouldOpenWeekPopup({ prevWeek, week, isChecked });

    setToday(newDay);

    if (week !== prevWeek) {
      setWeek(week);
      resetFasting();
      // 시작일을 뒤로 미뤄 주차가 줄었으면 그 주차 팝업은 이미 본 것으로 둔다
      if (week < prevWeek) close();
    }
    if (day !== prevDay) {
      setDay(day);
      resetTodos();
    }
    if (shouldOpen) open();
  }, [start_date, resetFasting, resetTodos]);

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
