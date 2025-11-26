import { differenceInDays, parseISO } from 'date-fns';
import { Maybe } from '../types/common';

const convertToKoreanDate = (date: Date) => {
  const isUTC = date.getTimezoneOffset() === 0;
  const offset = 9 * 60 * 60 * 1000; // 한국은 UTC+9

  const koreanDate = new Date(date.getTime() + offset);
  return isUTC ? koreanDate : date;
};

const getWeekAndDay = (startDate: string | null) => {
  if (!startDate) return { week: 1, day: 1 };

  const start = parseISO(startDate);
  const current = parseISO(getKoreanDateString());

  const daysDiff = differenceInDays(current, start);

  const week = Math.floor(daysDiff / 7) + 1;
  const day = (daysDiff % 7) + 1;

  return { week, day };
};

const getKoreanDate = () => {
  const now = new Date();
  return convertToKoreanDate(now);
};

const getKoreanDateString = () => {
  const now = new Date();
  const koreanDate = convertToKoreanDate(now);
  return koreanDate.toISOString().split('T')[0];
};

const getKoreanDateWeeksAgo = (weeksAgo: number) => {
  const koreanDate = getKoreanDate();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  const weeksAgoDate = new Date(koreanDate.getTime() - weeksAgo * msPerWeek);
  return weeksAgoDate.toISOString().split('T')[0];
};

export const formatKoreanDate = (dateString: Maybe<string>) => {
  const date = dateString ? new Date(dateString) : new Date();
  const koreanDate = convertToKoreanDate(date);

  return koreanDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export { getKoreanDate, getKoreanDateString, getKoreanDateWeeksAgo, getWeekAndDay };
