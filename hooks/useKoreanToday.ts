import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDateString, getWeekAndDay } from 'utils/date';
import { useFasting } from './useFasting';
import { useTodos } from './useTodos';

export default function useKoreanToday() {
  const { isHydrated } = useWeekCompletePopupStore();
  const { start_date } = useUserStore();
  const { resetTodos } = useTodos();
  const { resetFasting } = useFasting();

  const [today, setToday] = useState(getKoreanDateString());

  const revalidateToday = useCallback(() => {
    const {
      open,
      week: prevWeek,
      day: prevDay,
      setWeek,
      setDay,
      isChecked,
    } = useWeekCompletePopupStore.getState();
    const newDay = getKoreanDateString();
    const { week, day } = getWeekAndDay(start_date ?? newDay);
    const isEnteringNewWeek = prevWeek < week && week < 5;

    setToday(newDay);

    if (week !== prevWeek) {
      setWeek(week);
      resetFasting();
    }
    if (day !== prevDay) {
      setDay(day);
      resetTodos();
    }
    if (isEnteringNewWeek && !isChecked) {
      open();
    }
  }, [start_date, resetFasting, resetTodos]);

  const revalidateTodayInterval = useCallback(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);

    const timeoutMs = nextMidnight.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      revalidateToday();
      const intervalId = setInterval(revalidateToday, 24 * 60 * 60 * 1000);

      return () => clearInterval(intervalId);
    }, timeoutMs);

    return timeoutId;
  }, [revalidateToday]);

  useEffect(() => {
    if (!isHydrated) return;
    revalidateToday(); // 초기 검증

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        revalidateToday();
      }
    });

    const timeoutId = revalidateTodayInterval();

    return () => {
      subscription.remove();
      clearTimeout(timeoutId);
    };
  }, [isHydrated, revalidateToday, revalidateTodayInterval]);

  return today;
}
