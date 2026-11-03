import { useEffect, useState } from 'react';
import { ringFinishedTimers, useCookingStore } from 'stores/cookingStore';

// 타이머가 있는 동안 1초마다 지금 시각을 다시 그리고, 끝난 타이머가 있으면 진동한다
export function useCookingClock() {
  const hasTimers = useCookingStore((s) => Object.keys(s.timers).length > 0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasTimers) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      ringFinishedTimers(t);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hasTimers]);

  return now;
}
