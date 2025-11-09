import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanToday, getWeekAndDay } from 'utils/date';

export default function useKoreanToday() {
  const { open, week: prevWeek, setWeek, isChecked, isHydrated } = useWeekCompletePopupStore();
  const { start_date } = useUserStore();

  const [today, setToday] = useState(getKoreanToday());

  const revalidateToday = useCallback(() => {
    const newDay = getKoreanToday();
    const { week } = getWeekAndDay(start_date ?? newDay);

    setToday(newDay);

    if (prevWeek < week && week < 5) {
      if (!isChecked) open();
      setWeek(week);
    }
  }, [isChecked, open, prevWeek, setWeek, start_date]);

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
