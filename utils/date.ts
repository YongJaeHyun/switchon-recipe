import { TIME_ZONE } from 'const/const';
import { format, toZonedTime } from 'date-fns-tz';
import { Maybe } from '../types/common';
import { programWeekAndDay } from './programStart';

interface GetKoreanDateStringProps {
  formatType: 'detailed' | 'date';
}

export const convertToKoreanDate = (date: Date | string) => {
  return toZonedTime(date, TIME_ZONE);
};

// 오늘(KST)의 주차·일차. 시작일이 미래(시작 전)여도 1주차 1일 아래로 내려가지 않는다.
// 시작 전인지는 utils/programStart의 isBeforeStart로 따로 본다
export const getWeekAndDay = (startDate: Maybe<string>) => {
  const { week, day } = programWeekAndDay(startDate, getKoreanDateString({ formatType: 'date' }));
  return { week, day };
};

export const getKoreanDate = () => {
  const now = new Date();
  return convertToKoreanDate(now);
};

export const getKoreanDateString = (
  { formatType }: GetKoreanDateStringProps = { formatType: 'detailed' }
) => {
  const formatStr = formatType === 'detailed' ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd';

  const now = new Date();
  const koreanDate = convertToKoreanDate(now);
  return format(koreanDate, formatStr, { timeZone: TIME_ZONE });
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
