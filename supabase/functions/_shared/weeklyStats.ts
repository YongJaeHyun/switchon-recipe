// 주간 리포트용 통계 계산 (순수 함수).
// 모든 기록은 KST 날짜(yyyy-MM-dd)로 비교한다. created_at 같은 UTC 시각은 KST 날짜로 바꿔서 본다.
// 주차는 조회 시점의 start_date로 계산한다 (week.ts와 같은 규칙: 시작일 = 1주차 1일째).
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 URL import를 두지 않는다.

import type { FastingSchedule } from './fastingSchedule.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export interface WeeklyInputs {
  startDate: string;
  weekIndex: number; // 리포트 대상 주차
  weights: { day: string; weight_kg: number }[]; // 전체(누적 변화 계산용)
  todoDays: { day: string; items: string[]; checked: number[] }[];
  fastingPlannedDays: string[]; // 그 주에 계획된 단식 시작일들
  // fastedMinutes: 일찍 끝낸(broken) 단식의 단식한 분. 성공이거나 옛 앱 기록이면 null/없음
  fastingResults: { day: string; result: 'success' | 'broken'; fastedMinutes?: number | null }[];
  // 그 주 요일별 단식 시작 시각(요일 0=일..6=토 → KST 자정부터 분, scheduleFrom 결과)과
  // 리포트 생성 시각. 지도가 비어 있거나 now가 없으면 응답 대기(pending)를 세지 않는다
  fastingSchedule?: FastingSchedule;
  now?: Date;
  recipes: { created_at: string; is_zero_carb: boolean }[];
  foodChecks: { created_at: string; verdict: 'ok' | 'avoid' }[];
}

export interface TodoDayRate {
  day: string;
  weekday: string;
  rate: number; // 0~100 정수
}

export interface WeeklyStats {
  weekIndex: number;
  range: { from: string; to: string }; // KST 날짜
  weight: {
    start: number | null;
    end: number | null;
    diff: number | null; // 기록 2일 이상일 때만
    daysLogged: number;
    totalDiff: number | null; // 시작일 이후 첫 기록 대비
  };
  todo: {
    avgRate: number | null;
    best: TodoDayRate | null;
    worst: TodoDayRate | null; // 기록 2일 이상이고 최고보다 낮을 때만
    items: { name: string; done: number; appeared: number }[];
  };
  fasting: {
    planned: number;
    success: number;
    broken: number;
    pending: number; // 결과가 없고 생성 시점에 아직 응답 기간(시작 후 72시간, 다음 단식 전)인 단식
    successWeekdays: string[];
    // 일찍 끝낸 단식(날짜순), 시간 없으면 null. 이 필드 전에 만든 리포트(stats jsonb)에는 없다
    earlyEnded?: { weekday: string; fastedMinutes: number | null }[];
  };
  recipes: { total: number; low: number; zero: number };
  foodChecks: { total: number; avoid: number };
  isEmpty: boolean; // 체중 0일 && 할 일 체크 0일
}

// 소수 한 자리 반올림. 10배 값을 소수 6자리로 먼저 잘라 부동소수 오차(1.15 → 11.4999…)를 없앤다
// (문자열 'e' 표기는 1e-7 같은 값에서 NaN이 된다)
const round1 = (n: number) => Math.round(Number((n * 10).toFixed(6))) / 10;

// yyyy-MM-dd(또는 시각이 붙은 값) → 그 KST 날짜의 UTC 자정(ms)
const dayToUtc = (day: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayToUtc(kstDayOf(day));
};

const utcToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// UTC 시각 문자열 → KST 날짜 (yyyy-MM-dd)
export const kstDayOf = (timestamp: string): string =>
  utcToDay(new Date(timestamp).getTime() + KST_OFFSET_MS);

const weekdayOf = (day: string) => new Date(dayToUtc(day)).getUTCDay();

const inRange = (day: string, range: { from: string; to: string }) =>
  day >= range.from && day <= range.to;

// 시작일 기준 weekIndex주차의 7일 (KST 날짜)
export function weekRange(startDate: string, weekIndex: number): { from: string; to: string } {
  const from = dayToUtc(startDate) + (weekIndex - 1) * 7 * DAY_MS;
  return { from: utcToDay(from), to: utcToDay(from + 6 * DAY_MS) };
}

// 범위 안에서 단식 요일(0=일, 앱 FASTING_DAYS·getFastingStatus와 같음)인 날짜들 = 단식 시작일.
// 단식은 2주차부터 고른다 (앱 FastingDayBottomSheet: 1주차에는 선택 불가).
// 단식은 시작일 기준으로 센다: 주 마지막 날 시작해 다음 날 끝나는 단식도 이번 주 몫.
export function plannedFastingDays(
  range: { from: string; to: string },
  fastingDays: number[] | null,
  weekIndex: number
): string[] {
  if (weekIndex < 2 || !fastingDays || fastingDays.length === 0) return [];
  const days: string[] = [];
  for (let t = dayToUtc(range.from); t <= dayToUtc(range.to); t += DAY_MS) {
    if (fastingDays.includes(new Date(t).getUTCDay())) days.push(utcToDay(t));
  }
  return days;
}

const byDay = <T extends { day: string }>(a: T, b: T) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : 0;

const weightStats = (input: WeeklyInputs, range: { from: string; to: string }) => {
  const start = input.startDate.slice(0, 10);
  const sorted = [...input.weights].sort(byDay);
  const week = sorted.filter((w) => inRange(w.day, range));
  if (week.length === 0) {
    return { start: null, end: null, diff: null, daysLogged: 0, totalDiff: null };
  }
  const first = Number(week[0].weight_kg);
  const last = Number(week[week.length - 1].weight_kg);
  const baseline = sorted.find((w) => w.day >= start && w.day <= range.to);
  return {
    start: first,
    end: last,
    diff: week.length >= 2 ? round1(last - first) : null,
    daysLogged: week.length,
    totalDiff: baseline ? round1(last - Number(baseline.weight_kg)) : null,
  };
};

const todoStats = (input: WeeklyInputs, range: { from: string; to: string }) => {
  const days = input.todoDays
    .filter((d) => inRange(d.day, range) && d.items.length > 0)
    .sort(byDay)
    .map((d) => {
      const checked = new Set(
        d.checked.filter((i) => Number.isInteger(i) && i >= 0 && i < d.items.length)
      );
      return { ...d, checked };
    });

  const items = new Map<string, { name: string; done: number; appeared: number }>();
  for (const d of days) {
    d.items.forEach((name, i) => {
      const item = items.get(name) ?? { name, done: 0, appeared: 0 };
      item.appeared += 1;
      if (d.checked.has(i)) item.done += 1;
      items.set(name, item);
    });
  }

  if (days.length === 0) return { avgRate: null, best: null, worst: null, items: [] };

  const rates = days.map((d) => ({ day: d.day, ratio: d.checked.size / d.items.length }));
  const toRate = (r: { day: string; ratio: number }): TodoDayRate => ({
    day: r.day,
    weekday: WEEKDAYS[weekdayOf(r.day)],
    rate: Math.round(r.ratio * 100),
  });
  // 동률이면 앞선 날짜
  const best = rates.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const worst = rates.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const avg = rates.reduce((sum, r) => sum + r.ratio, 0) / rates.length;

  return {
    avgRate: Math.round(avg * 100),
    best: toRate(best),
    // 하루뿐이거나 모든 날이 같으면 최저는 없다 (최고와 같은 날이 되지 않게)
    worst: rates.length >= 2 && worst.ratio < best.ratio ? toRate(worst) : null,
    items: [...items.values()],
  };
};

// 앱 utils/dietGuide.ts의 fastingResultWindow·RESULT_WINDOW_MS와 같은 규칙 (KST).
// 단식 시작 = 그 날 KST 자정 + 그 요일 시각(분). 앱은 단식 시작부터 72시간(종료 후 48시간)까지,
// 다음 단식이 시작되기 전까지 결과를 묻는다.
// 지도에 없는 요일은 시작 시각을 모르는 단식이라(앱 fastingStartOn이 null) 응답을 묻지 않는다:
// 대기로 세지 않고, 앞 단식의 다음 시작 경계로도 쓰지 않는다
const RESULT_WINDOW_MS = 72 * HOUR_MS;

// 결과가 없는 계획 단식 중 now에 아직 응답 창이 열려 있는 것의 수.
// 다음 단식은 같은 주 계획 안에서만 본다 (다음 주 계획은 리포트 시점에 대개 아직 없다)
const pendingFasts = (
  plannedDays: string[],
  answered: Set<string>,
  schedule: FastingSchedule | undefined,
  now: Date | undefined
): number => {
  // 지도가 비면 앱도 응답을 묻지 않는다
  if (!schedule || Object.keys(schedule).length === 0 || !now) return 0;
  const t = now.getTime();
  const startOf = (day: string): number | undefined => {
    const minutes = schedule[weekdayOf(day)];
    return minutes === undefined ? undefined : dayToUtc(day) - KST_OFFSET_MS + minutes * MINUTE_MS;
  };
  const sorted = [...plannedDays].sort();
  return sorted.filter((day, i) => {
    const start = startOf(day);
    if (answered.has(day) || start === undefined) return false;
    const next = sorted
      .slice(i + 1)
      .map(startOf)
      .find((v) => v !== undefined);
    const end = Math.min(start + RESULT_WINDOW_MS, next ?? Infinity);
    return t < end;
  }).length;
};

// 1~1440분 정수만 단식 시간으로 본다 (그 밖은 시간 없음. 0분은 "0분"으로 쓰지 않게)
const validMinutes = (m: number | null | undefined): number | null =>
  typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 1440 ? m : null;

const fastingStats = (input: WeeklyInputs, range: { from: string; to: string }) => {
  const results = input.fastingResults.filter((r) => inRange(r.day, range)).sort(byDay);
  // 결과가 있는 날은 계획에 없었더라도(요일 변경, 계획 기록 없음) 계획한 단식으로 센다
  const planned = new Set([
    ...input.fastingPlannedDays.filter((d) => inRange(d, range)),
    ...results.map((r) => r.day),
  ]);
  const success = results.filter((r) => r.result === 'success');
  return {
    planned: planned.size,
    success: success.length,
    broken: results.filter((r) => r.result === 'broken').length,
    pending: pendingFasts(
      [...new Set(input.fastingPlannedDays.filter((d) => inRange(d, range)))],
      new Set(results.map((r) => r.day)),
      input.fastingSchedule,
      input.now
    ),
    successWeekdays: success.map((r) => WEEKDAYS[weekdayOf(r.day)]),
    earlyEnded: results
      .filter((r) => r.result === 'broken')
      .map((r) => ({
        weekday: WEEKDAYS[weekdayOf(r.day)],
        fastedMinutes: validMinutes(r.fastedMinutes),
      })),
  };
};

export function computeWeeklyStats(input: WeeklyInputs): WeeklyStats {
  const range = weekRange(input.startDate, input.weekIndex);
  const weight = weightStats(input, range);
  const todo = todoStats(input, range);

  const recipes = input.recipes.filter((r) => inRange(kstDayOf(r.created_at), range));
  const zero = recipes.filter((r) => r.is_zero_carb).length;
  const foodChecks = input.foodChecks.filter((c) => inRange(kstDayOf(c.created_at), range));

  const checkedTodoDays = input.todoDays.filter(
    (d) =>
      inRange(d.day, range) &&
      d.checked.some((i) => Number.isInteger(i) && i >= 0 && i < d.items.length)
  ).length;

  return {
    weekIndex: input.weekIndex,
    range,
    weight,
    todo,
    fasting: fastingStats(input, range),
    recipes: { total: recipes.length, low: recipes.length - zero, zero },
    foodChecks: {
      total: foodChecks.length,
      avoid: foodChecks.filter((c) => c.verdict === 'avoid').length,
    },
    isEmpty: weight.daysLogged === 0 && checkedTodoDays === 0,
  };
}
