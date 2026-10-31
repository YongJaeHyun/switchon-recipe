import { useEffect, useRef, useState } from 'react';
import { useFirstWeekStore } from 'stores/firstWeekStore';
import { shouldCelebrate } from 'utils/dailyReminder';

// 1주차 그날 할 일을 방금 100% 끝내면 완주 축하 시트를 하루 한 번 연다 (본 날은 firstWeekStore에 남김).
// currentRate = 오늘 체크가 오늘 것일 때의 완료율 (useTodos), 아니면 null.
// 돌려주는 day가 있으면 그 일차의 축하 시트를 보여준다
export function useDayCelebration({
  week,
  day,
  today,
  currentRate,
}: {
  week: number;
  day: number;
  today: string;
  currentRate: number | null;
}) {
  const celebratedDays = useFirstWeekStore((state) => state.celebratedDays);
  const markCelebrated = useFirstWeekStore((state) => state.markCelebrated);
  const [hydrated, setHydrated] = useState(() => useFirstWeekStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = useFirstWeekStore.persist.onFinishHydration(() => setHydrated(true));
    if (useFirstWeekStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, [hydrated]);

  const [celebrateDay, setCelebrateDay] = useState<number | null>(null);
  // 같은 날 바로 전에 읽은 완료율 (날이 바뀌거나 오늘 체크를 모르는 동안은 처음부터)
  const prev = useRef<{ today: string; rate: number } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (currentRate === null) {
      prev.current = null;
      return;
    }
    const prevRate = prev.current?.today === today ? prev.current.rate : null;
    prev.current = { today, rate: currentRate };
    if (
      !shouldCelebrate({ week, day, completedRate: currentRate, prevRate, celebratedDays, today })
    )
      return;
    markCelebrated(today);
    setCelebrateDay(day);
  }, [hydrated, week, day, today, currentRate, celebratedDays, markCelebrated]);

  return { celebrateDay, closeCelebration: () => setCelebrateDay(null) };
}
