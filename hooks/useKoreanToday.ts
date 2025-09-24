import { useEffect, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanToday, getWeekAndDay } from 'utils/date';

export default function useKoreanToday() {
  const startDate = useUserStore((state) => state.start_date);
  const { open, setWeek, isChecked } = useWeekCompletePopupStore();

  const [today, setToday] = useState(getKoreanToday());
  const { week: prevWeek } = getWeekAndDay(startDate ?? today);

  const revalidateToday = () => {
    const newDay = getKoreanToday();
    const { week } = getWeekAndDay(newDay);

    setToday(newDay);

    if (prevWeek < week && week < 5) {
      if (!isChecked) open();
      setWeek(week);
    }
  };

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const timeoutMs = nextMidnight.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      revalidateToday();

      const intervalId = setInterval(() => revalidateToday(), 24 * 60 * 60 * 1000);

      return () => clearInterval(intervalId);
    }, timeoutMs);

    return () => clearTimeout(timeoutId);
  }, []);

  return today;
}
