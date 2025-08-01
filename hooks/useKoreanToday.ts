import { useEffect, useState } from 'react';
import { getKoreanToday } from 'utils/date';

export default function useKoreanToday() {
  const [today, setToday] = useState(getKoreanToday());

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const timeoutMs = nextMidnight.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      setToday(getKoreanToday());

      const intervalId = setInterval(
        () => {
          setToday(getKoreanToday());
        },
        24 * 60 * 60 * 1000
      );

      return () => clearInterval(intervalId);
    }, timeoutMs);

    return () => clearTimeout(timeoutId);
  }, []);

  return today;
}
