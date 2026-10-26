// 단식 요일 설정 시트의 요일별 줄
import { FASTING_DAYS } from 'const/fastingDays';
import { formatMinutes, type FastingSchedule } from 'utils/fastingSchedule';

export const DEFAULT_START_MINUTES = 1140; // 정한 시각이 없을 때 19:00

// 월→일 순서 (일요일이 마지막)
export const sheetDaysOrdered = (days: number[]): number[] =>
  [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));

// "목요일 · 19:00 시작 → 금 19:00 끝" (24시간 뒤 같은 시각)
export function fastingDayRowLabel(day: number, minutes: number): string {
  const time = formatMinutes(minutes);
  return `${FASTING_DAYS[day]}요일 · ${time} 시작 → ${FASTING_DAYS[(day + 1) % 7]} ${time} 끝`;
}

// 고른 요일만 남기고, 시각이 없는 새 요일은 직전에 정한 시각(없으면 19:00)으로
export function withNewDays(
  schedule: FastingSchedule,
  days: number[],
  lastSet: number | undefined
): FastingSchedule {
  const next: FastingSchedule = {};
  for (const day of days) next[day] = schedule[day] ?? lastSet ?? DEFAULT_START_MINUTES;
  return next;
}
