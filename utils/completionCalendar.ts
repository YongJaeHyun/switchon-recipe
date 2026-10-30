import type { Nullable } from 'types/common';
import { isDayReached, type ProgramProgress } from './todoRateWeeks';

// 기록 탭 "4주 완주 달력": 일별 할 일 완료율을 ● 완주 / ◐ 일부 / ○ 못 함 / · 아직 으로 바꾼다

export type DayMark = 'full' | 'partial' | 'missed' | 'upcoming';

export interface CalendarDay {
  day: number;
  mark: DayMark;
  isToday: boolean;
}

export interface CalendarWeek {
  week: number;
  days: CalendarDay[];
  counts: Record<DayMark, number>;
}

export interface CompletionCalendar {
  weeks: CalendarWeek[];
  // 100% 한 날 수
  fullCount: number;
}

const WEEKS = 4;
const DAYS = 7;

// 지난 날(오늘 포함)인데 기록이 없으면 못 함. 아직 안 온 날은 값과 상관없이 아직
export function toDayMark(rate: Nullable<number>, reached: boolean): DayMark {
  if (!reached) return 'upcoming';
  if (rate === null || rate <= 0) return 'missed';
  if (rate >= 100) return 'full';
  return 'partial';
}

// ratesByWeek[주차-1][일차-1]. 없으면(불러오는 중) 빈 값으로 채운다.
// 유지기(5주차~)는 프로그램 4주가 모두 지난 날이고 오늘 표시는 없다
export function buildCompletionCalendar(
  ratesByWeek: Nullable<number>[][] | undefined,
  progress: ProgramProgress
): CompletionCalendar {
  const weeks: CalendarWeek[] = [];
  let fullCount = 0;

  for (let week = 1; week <= WEEKS; week++) {
    const counts: Record<DayMark, number> = { full: 0, partial: 0, missed: 0, upcoming: 0 };
    const days: CalendarDay[] = [];
    for (let day = 1; day <= DAYS; day++) {
      const rate = ratesByWeek?.[week - 1]?.[day - 1] ?? null;
      const mark = toDayMark(rate, isDayReached(week, day, progress));
      counts[mark] += 1;
      days.push({
        day,
        mark,
        isToday: !progress.beforeStart && week === progress.week && day === progress.day,
      });
    }
    fullCount += counts.full;
    weeks.push({ week, days, counts });
  }

  return { weeks, fullCount };
}
