import type { FastingTime } from 'const/fastingDays';
import type { FastingResult } from 'api/FastingResultAPI';
import { FASTING_START_HOUR } from './dietGuide';

export interface FastingHistoryItem {
  day: string; // 단식 시작일 (KST yyyy-MM-dd)
  weekIndex: number;
  result: FastingResult | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

// yyyy-MM-dd → 그 날짜의 UTC 자정 (날짜 계산용)
const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const utcToDay = (utc: number) => new Date(utc).toISOString().slice(0, 10);

const isFastingTime = (value: string | null): value is FastingTime =>
  value !== null && value in FASTING_START_HOUR;

// 기록 탭 > 단식 칸 목록: 이미 시작된 계획일 ∪ 결과가 있는 날 (현재 프로그램 2주차 이후만), 최근순
export function fastingHistory({
  startDate,
  plans,
  results,
  now,
}: {
  startDate: string;
  plans: { week_index: number; days: number[]; start_time: string | null }[];
  results: { day: string; result: FastingResult }[];
  now: Date;
}): FastingHistoryItem[] {
  const start = dayToUtc(startDate);
  const t = now.getTime();
  const weekOf = (day: string) => Math.floor((dayToUtc(day) - start) / (7 * DAY_MS)) + 1;

  const days = new Set<string>();
  for (const plan of plans) {
    const hour = isFastingTime(plan.start_time) ? FASTING_START_HOUR[plan.start_time] : 0;
    const weekStart = start + 7 * (plan.week_index - 1) * DAY_MS;
    for (let i = 0; i < 7; i++) {
      const midnight = weekStart + i * DAY_MS;
      if (!plan.days.includes(new Date(midnight).getUTCDay())) continue;
      // KST 자정 + 시작 시각이 지났는지
      if (midnight - KST_OFFSET_MS + hour * HOUR_MS > t) continue;
      days.add(utcToDay(midnight));
    }
  }

  const resultByDay = new Map<string, FastingResult>();
  for (const { day, result } of results) {
    // fasting_result엔 시작일이 없다. 1주차(단식 없음)나 시작일 이전 날짜의 결과는
    // 시작일을 앞당기기 전 프로그램 것이라 뺀다
    if (weekOf(day) < 2) continue;
    resultByDay.set(day, result);
    days.add(day);
  }

  const startDay = utcToDay(start);
  return [...days]
    .filter((day) => day >= startDay)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((day) => ({ day, weekIndex: weekOf(day), result: resultByDay.get(day) ?? null }));
}
