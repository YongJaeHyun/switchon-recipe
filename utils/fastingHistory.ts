import type { FastingResult } from 'api/FastingResultAPI';
import { scheduleFrom } from './fastingSchedule';

export interface FastingHistoryItem {
  day: string; // 단식 시작일 (KST yyyy-MM-dd)
  weekIndex: number;
  result: FastingResult | null;
  fastedMinutes: number | null; // 일찍 끝낸 단식의 단식한 분 (없으면 null)
  inProgress: boolean; // 시작부터 24시간이 안 지난 단식 (결과를 고를 수 없다. 오늘 탭과 같게)
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const FAST_MS = DAY_MS; // 24시간 단식
const KST_OFFSET_MS = 9 * 60 * MINUTE_MS;

// yyyy-MM-dd → 그 날짜의 UTC 자정 (날짜 계산용)
const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const utcToDay = (utc: number) => new Date(utc).toISOString().slice(0, 10);

// 기록 탭 > 단식 칸 목록: 이미 시작된 계획일 ∪ 결과가 있는 날 (현재 프로그램 2주차 이후만), 최근순
export function fastingHistory({
  startDate,
  plans,
  results,
  now,
}: {
  startDate: string;
  plans: {
    week_index: number;
    days: number[];
    start_time: string | null;
    start_minutes?: unknown;
  }[];
  results: { day: string; result: FastingResult; fastedMinutes?: number | null }[];
  now: Date;
}): FastingHistoryItem[] {
  const start = dayToUtc(startDate);
  const t = now.getTime();
  const weekOf = (day: string) => Math.floor((dayToUtc(day) - start) / (7 * DAY_MS)) + 1;

  const days = new Set<string>();
  const inProgress = new Set<string>();
  for (const plan of plans) {
    // 요일별 시각(start_minutes 우선, 없으면 라벨). 시각이 없는 요일은 그날 자정부터로 본다
    const schedule = scheduleFrom(plan);
    const weekStart = start + 7 * (plan.week_index - 1) * DAY_MS;
    for (let i = 0; i < 7; i++) {
      const midnight = weekStart + i * DAY_MS;
      const weekday = new Date(midnight).getUTCDay();
      if (!plan.days.includes(weekday)) continue;
      // KST 자정 + 그 요일 시작 시각이 지났는지
      const startsAt = midnight - KST_OFFSET_MS + (schedule[weekday] ?? 0) * MINUTE_MS;
      if (startsAt > t) continue;
      days.add(utcToDay(midnight));
      if (t < startsAt + FAST_MS) inProgress.add(utcToDay(midnight));
    }
  }

  const resultByDay = new Map<string, { result: FastingResult; fastedMinutes: number | null }>();
  for (const { day, result, fastedMinutes } of results) {
    // fasting_result엔 시작일이 없다. 1주차(단식 없음)나 시작일 이전 날짜의 결과는
    // 시작일을 앞당기기 전 프로그램 것이라 뺀다
    if (weekOf(day) < 2) continue;
    resultByDay.set(day, { result, fastedMinutes: fastedMinutes ?? null });
    days.add(day);
  }

  const startDay = utcToDay(start);
  return [...days]
    .filter((day) => day >= startDay)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((day) => ({
      day,
      weekIndex: weekOf(day),
      result: resultByDay.get(day)?.result ?? null,
      fastedMinutes: resultByDay.get(day)?.fastedMinutes ?? null,
      inProgress: inProgress.has(day),
    }));
}
