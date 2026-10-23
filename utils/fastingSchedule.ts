// 요일별 단식 시작 시각 (요일 0=일..6=토 → KST 자정부터 분).
// 서버 복사본: supabase/functions/_shared/fastingSchedule.ts (fastingSchedule.serverCopy.test.ts로 일치 확인)
import type { FastingTime } from 'const/fastingDays';

export type FastingSchedule = Record<number, number>;

export const FASTING_SLIDER = { min: 360, max: 1320, step: 30 } as const;

// 옛 라벨과 그 시각. 빠른 선택 버튼, 옛 start_time 읽기·쓰기에 쓴다
export const QUICK_TIMES: { label: FastingTime; minutes: number }[] = [
  { label: '아침 식후', minutes: 540 },
  { label: '점심 식후', minutes: 780 },
  { label: '저녁 식후', minutes: 1140 },
];

const MINUTES_PER_DAY = 1440;

const isMinutes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;

const labelMinutes = (label: string | null): number | undefined =>
  QUICK_TIMES.find((quick) => quick.label === label)?.minutes;

// jsonb { "<요일>": 분 } 중 올바른 값만
const parseStartMinutes = (value: unknown): FastingSchedule => {
  const schedule: FastingSchedule = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return schedule;
  for (const [key, minutes] of Object.entries(value)) {
    if (!/^[0-6]$/.test(key) || !isMinutes(minutes)) continue;
    schedule[Number(key)] = minutes;
  }
  return schedule;
};

// DB 행 → 지도. 요일마다 start_minutes 값이 우선, 없으면 start_time 라벨 시각. 둘 다 없으면 그 요일은 뺀다
export function scheduleFrom(row: {
  days: number[] | null;
  start_time: string | null;
  start_minutes?: unknown;
}): FastingSchedule {
  const parsed = parseStartMinutes(row.start_minutes);
  const fallback = labelMinutes(row.start_time);
  const schedule: FastingSchedule = {};
  for (const day of row.days ?? []) {
    const minutes = parsed[day] ?? fallback;
    if (minutes !== undefined) schedule[day] = minutes;
  }
  return schedule;
}

// 가장 가까운 옛 라벨. 가운데(660, 960)는 뒤 라벨
export function legacyLabel(minutes: number): FastingTime {
  let best = QUICK_TIMES[0];
  for (const quick of QUICK_TIMES) {
    if (Math.abs(quick.minutes - minutes) <= Math.abs(best.minutes - minutes)) best = quick;
  }
  return best.label;
}

// 1140 → "19:00"
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

// 월→일 순서 (일요일이 마지막)
const weekOrder = (day: number) => (day === 0 ? 7 : day);

// 저장할 칸: start_minutes(고른 요일만)와 옛 앱·서버용 start_time(첫 요일 시각과 가장 가까운 라벨)
export function scheduleColumns(
  days: number[],
  schedule: FastingSchedule
): { start_minutes: Record<string, number> | null; start_time: FastingTime | null } {
  const sorted = [...days].sort((a, b) => weekOrder(a) - weekOrder(b));
  const start_minutes: Record<string, number> = {};
  for (const day of sorted) {
    const minutes = schedule[day];
    if (isMinutes(minutes)) start_minutes[String(day)] = minutes;
  }
  const first = sorted.find((day) => String(day) in start_minutes);
  if (first === undefined) return { start_minutes: null, start_time: null };
  return { start_minutes, start_time: legacyLabel(start_minutes[String(first)]) };
}
