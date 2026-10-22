import colors from 'tailwindcss/colors';
import { getWeekColorHex } from './getWeekColor';

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 300;

export interface WeightPoint {
  day: string; // yyyy-MM-dd (KST 날짜)
  weight_kg: number;
}

interface PeriodOptions {
  // true면 start_date 이전 기록도 포함한다 ([전체 기간 보기])
  allPeriod?: boolean;
}

// 시작일 이전 기록(이전 차수) 점 색
const BEFORE_START_COLOR = colors.neutral[400];
const DAY_MS = 24 * 60 * 60 * 1000;

// 소수 한 자리 반올림. 'e' 표기로 올려 부동소수 오차(65.05*10=650.4999…)를 피한다
const round1 = (n: number) => Math.round(Number(`${n}e1`)) / 10;

// yyyy-MM-dd → UTC 자정 시각(ms). 날짜끼리만 비교하므로 시간대와 무관하다
const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const utcToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// 입력 문자열 → kg(소수 한 자리). 숫자가 아니거나 20.0~300.0 밖이면 null
export function parseWeightInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = round1(Number(normalized));
  if (!Number.isFinite(value) || value < MIN_WEIGHT_KG || value > MAX_WEIGHT_KG) return null;
  return value;
}

// day 기준 n일 뒤(음수면 앞) 날짜
export function shiftDay(day: string, n: number): string {
  return utcToDay(dayToUtc(day) + n * DAY_MS);
}

// 시작일 기준 주차 (시작일 = 1주차, 8일째 = 2주차). 시작일 이전은 0 이하
export function weekOfDay(day: string, startDate: string): number {
  const diffDays = Math.round((dayToUtc(day) - dayToUtc(startDate)) / DAY_MS);
  return Math.floor(diffDays / 7) + 1;
}

// 기간 필터 + 날짜순 정렬
export function weightsInPeriod<T extends WeightPoint>(
  logs: T[],
  startDate: string | null,
  opts?: PeriodOptions
): T[] {
  const start = startDate ? startDate.slice(0, 10) : null;
  return logs
    .filter((log) => opts?.allPeriod || !start || log.day >= start)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// 기간 안 첫 기록 대비 마지막 기록 변화량. 기록이 없으면 null
export function weightChange(
  logs: WeightPoint[],
  startDate: string | null,
  opts?: PeriodOptions
): { first: number; last: number; diff: number } | null {
  const inPeriod = weightsInPeriod(logs, startDate, opts);
  if (inPeriod.length === 0) return null;
  const first = Number(inPeriod[0].weight_kg);
  const last = Number(inPeriod[inPeriod.length - 1].weight_kg);
  return { first, last, diff: round1(last - first) };
}

// 그래프 점. 색은 현재 start_date 기준 주차 색, 시작일 이전은 회색
export function chartPoints(
  logs: WeightPoint[],
  startDate: string | null,
  opts?: PeriodOptions
): { value: number; label: string; dataPointColor: string }[] {
  const start = startDate ? startDate.slice(0, 10) : null;
  return weightsInPeriod(logs, startDate, opts).map((log) => {
    const [, m, d] = log.day.slice(0, 10).split('-').map(Number);
    const week = start ? weekOfDay(log.day, start) : 1;
    return {
      value: Number(log.weight_kg),
      label: `${m}/${d}`,
      dataPointColor: week >= 1 ? getWeekColorHex(week) : BEFORE_START_COLOR,
    };
  });
}

// 변화량 표시: +0.2kg / -1.5kg / 0.0kg
export function formatWeightDiff(diff: number): string {
  const value = round1(diff);
  if (value === 0) return '0.0kg';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}kg`;
}

// 입력 시트에 미리 채울 값: 그날 값, 없으면 전날 값, 둘 다 없으면 null
export function prefillWeight(logs: WeightPoint[], day: string): number | null {
  const byDay = (d: string) => logs.find((log) => log.day === d)?.weight_kg;
  return byDay(day) ?? byDay(shiftDay(day, -1)) ?? null;
}
