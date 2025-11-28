import { TIME_ZONE } from 'const/const';
import { differenceInDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { Maybe } from '../types/common';

export const convertToKoreanDate = (date: Date | string) => {
  return toZonedTime(date, TIME_ZONE);
};

export const getWeekAndDay = (startDate: Maybe<string>) => {
  if (!startDate) return { week: 1, day: 1 };

  const start = convertToKoreanDate(startDate);
  const current = convertToKoreanDate(getKoreanDateString());

  const daysDiff = differenceInDays(current, start);

  const week = Math.floor(daysDiff / 7) + 1;
  const day = (daysDiff % 7) + 1;

  return { week, day };
};

export const getKoreanDate = () => {
  const now = new Date();
  return convertToKoreanDate(now);
};

export const getKoreanDateString = () => {
  const now = new Date();
  const koreanDate = convertToKoreanDate(now);
  return format(koreanDate, 'yyyy-MM-dd', { timeZone: TIME_ZONE });
};

export const getKoreanDateWeeksAgo = (weeksAgo: number) => {
  const koreanDate = getKoreanDate();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  const weeksAgoDate = new Date(koreanDate.getTime() - weeksAgo * msPerWeek);
  return format(weeksAgoDate, 'yyyy-MM-dd', { timeZone: TIME_ZONE });
};

export const formatKoreanDate = (dateString: Maybe<string>) => {
  const date = dateString ? new Date(dateString) : new Date();
  const koreanDate = convertToKoreanDate(date);

  return format(koreanDate, 'yyyy-MM-dd HH:mm', { timeZone: TIME_ZONE });
};
