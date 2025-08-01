import { differenceInDays, parseISO } from 'date-fns';

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
  const offset = 9 * 60 * 60 * 1000; // 한국은 UTC+9
  const koreaTime = new Date(now.getTime() + offset);
  return koreaTime.toISOString().split('T')[0];
};

const getKoreanDateWeeksAgo = (weeksAgo: number) => {
  const now = new Date();
  const offset = 9 * 60 * 60 * 1000; // UTC+9
  const koreaTime = new Date(now.getTime() + offset);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  const weeksAgoDate = new Date(koreaTime.getTime() - weeksAgo * msPerWeek);
  return weeksAgoDate.toISOString().split('T')[0];
};

export { getKoreanDateWeeksAgo, getKoreanToday, getWeekAndDay };
