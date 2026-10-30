import { addDays, startOfDay } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDate, getKoreanDateString } from 'utils/date';
import { programWeekAndDay, todayRevalidation } from 'utils/programStart';
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
    const { week, day, beforeStart } = programWeekAndDay(start_date, newDay);
    // 시작 전에는 주차 팝업을 열지 않고 일차를 '시작 전'으로 둔다 (서버 초기화 없음) → 시작일에 할 일이 초기화된다
    const next = todayRevalidation({ week, day, beforeStart, prevWeek, prevDay, isChecked });

    setToday(newDay);

    if (next.weekChanged) {
      setWeek(next.week);
      if (next.resetFasting) resetFasting();
      if (next.closePopup) close();
    }
    if (next.dayChanged) {
      setDay(next.day);
      if (next.resetTodos) resetTodos();
    }
    if (next.openPopup) open();
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
