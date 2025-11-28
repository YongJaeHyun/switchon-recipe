import { addDays, startOfDay } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDate, getKoreanDateString, getWeekAndDay } from 'utils/date';
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
      week: prevWeek,
      day: prevDay,
      setWeek,
      setDay,
      isChecked,
    } = useWeekCompletePopupStore.getState();
    const newDay = getKoreanDateString({ formatType: 'date' });
    const { week, day } = getWeekAndDay(start_date);

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
    const now = getKoreanDate();
    const nextMidnight = startOfDay(addDays(now, 1));

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
