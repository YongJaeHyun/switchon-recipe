import { differenceInDays, parseISO } from 'date-fns';

const convertToKoreanDate = (date: Date) => {
  const offset = 9 * 60 * 60 * 1000; // 한국은 UTC+9

  const koreanDate = new Date(date.getTime() + offset);
  return koreanDate;
};

const getWeekAndDay = (startDate: string) => {
  const start = parseISO(startDate);
  const current = parseISO(getKoreanToday());

  const daysDiff = differenceInDays(current, start);

  const week = Math.floor(daysDiff / 7) + 1;
  const day = (daysDiff % 7) + 1;

  return { week, day };
};

const getKoreanToday = () => {
  const now = new Date();

  const koreanDate = convertToKoreanDate(now);
  return koreanDate.toISOString().split('T')[0];
};

const getKoreanDateWeeksAgo = (weeksAgo: number) => {
  const now = new Date();
  const koreanDate = convertToKoreanDate(now);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  const weeksAgoDate = new Date(koreanDate.getTime() - weeksAgo * msPerWeek);
  return weeksAgoDate.toISOString().split('T')[0];
};

export function formatKoreanDate(utcString: string): string {
  const date = new Date(utcString);

  const koreanDate = convertToKoreanDate(date);
  return koreanDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export { getKoreanDateWeeksAgo, getKoreanToday, getWeekAndDay };
