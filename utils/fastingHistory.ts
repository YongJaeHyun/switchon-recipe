import type { FastingResult } from 'api/FastingResultAPI';
import { scheduleFrom } from './fastingSchedule';
import { groupPastStarts, programStartOf } from './programStart';

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

type Plan = {
  start_date: string;
  week_index: number;
  days: number[];
  start_time: string | null;
  start_minutes?: unknown;
  // 계획 행을 만든 시각·마지막으로 고친 시각. 앱은 지금 시작일의 계획만 쓰므로, 둘 다 "그때 이 시작일이 쓰이고
  // 있었다"는 표시다 (시작일을 바꾼 때를 어림하는 데 쓴다). created_at은 고쳐도 바뀌지 않는다
  created_at?: string | null;
  updated_at?: string | null;
};
type Result = { day: string; result: FastingResult; fastedMinutes?: number | null };

// timestamptz 문자열 → KST 날짜. 없거나 깨졌으면 null
const kstDayOf = (iso: string | null | undefined): { day: string; ms: number } | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? { day: utcToDay(ms + KST_OFFSET_MS), ms } : null;
};

// 날짜마다 그날 쓰이던 시작일. 계획 행의 생성·수정 시각마다 "그때 이 시작일이 쓰였다"는 기록을 남기고,
// 어떤 날짜든 그날(KST)까지의 가장 늦은 기록의 시작일이 이긴다 (첫 기록 전 날짜는 첫 기록의 시작일).
// 그래서 시작일이 겹치는 날은 가장 새 계획만 남는다 (주차 맞추기·한 주 더 하기 뒤 유령 날짜 방지).
// 이번 주 계획을 고쳐도 같은 시작일의 기록이 늘 뿐이라 그 주 앞 날짜가 사라지지 않고, 앞당겼다가 되돌리면 되돌린 뒤의
// 기록부터 원래 시작일이 다시 이긴다. 시각이 하나도 없는 시작일(옛 행)은 판정하지 않고 언제나 쓴다
function activeStartOn(plans: Plan[]): (start: string, day: string) => boolean {
  const marks = plans
    .flatMap((plan) =>
      [kstDayOf(plan.created_at), kstDayOf(plan.updated_at)].map((mark) =>
        mark ? { ...mark, start: plan.start_date } : null
      )
    )
    .filter((mark): mark is { day: string; ms: number; start: string } => mark !== null)
    .sort((a, b) => a.ms - b.ms);
  const marked = new Set(marks.map((mark) => mark.start));

  return (start, day) => {
    if (!marked.has(start)) return true;
    let active = marks[0].start;
    for (const mark of marks) {
      if (mark.day > day) break;
      active = mark.start;
    }
    return active === start;
  };
}

// 한 회차의 단식 목록: [from, until) 안의 이미 시작된 계획일 ∪ 결과가 있는 날, 최근순.
// starts = 이 회차의 시작일들(오름차순). 계획일은 그 계획의 시작일로 날짜를 세고 주차는 계획의 주차를 쓴다.
// 시작일이 겹치는 날은 activeStartOn으로 가장 새 계획만 쓴다 (주차 맞추기·한 주 더 하기 뒤 유령 날짜 방지). 계획 없이 결과만 있는 날은, 그날이 2주차 이상이 되는 가장 늦은
// 시작일로 주차를 센다 (한 주 더 하기로 시작일이 밀려도 앞 시작일 기준으로 이어진다). 어느 시작일로도 1주차
// (단식 없음)면 앞 회차 것이라 뺀다
function programItems({
  starts,
  from,
  until,
  plans,
  results,
  now,
}: {
  starts: string[];
  from: string;
  until: string | null;
  plans: Plan[];
  results: Result[];
  now: Date;
}): FastingHistoryItem[] {
  const t = now.getTime();
  const inRange = (day: string) => day >= from && (!until || day < until);
  const weekFrom = (start: string, day: string) =>
    Math.floor((dayToUtc(day) - dayToUtc(start)) / (7 * DAY_MS)) + 1;

  const weekByDay = new Map<string, number>();
  const inProgress = new Set<string>();
  const isActive = activeStartOn(plans);
  for (const plan of plans) {
    const inWindow = (day: string) => isActive(plan.start_date, day);
    // 요일별 시각(start_minutes 우선, 없으면 라벨). 시각이 없는 요일은 그날 자정부터로 본다
    const schedule = scheduleFrom(plan);
    const weekStart = dayToUtc(plan.start_date) + 7 * (plan.week_index - 1) * DAY_MS;
    for (let i = 0; i < 7; i++) {
      const midnight = weekStart + i * DAY_MS;
      const day = utcToDay(midnight);
      const weekday = new Date(midnight).getUTCDay();
      if (!plan.days.includes(weekday) || !inRange(day) || !inWindow(day)) continue;
      // KST 자정 + 그 요일 시작 시각이 지났는지
      const startsAt = midnight - KST_OFFSET_MS + (schedule[weekday] ?? 0) * MINUTE_MS;
      if (startsAt > t) continue;
      weekByDay.set(day, plan.week_index);
      if (t < startsAt + FAST_MS) inProgress.add(day);
    }
  }

  const latestFirst = [...starts].sort().reverse();
  const resultByDay = new Map<string, { result: FastingResult; fastedMinutes: number | null }>();
  for (const { day, result, fastedMinutes } of results) {
    if (!inRange(day)) continue;
    if (!weekByDay.has(day)) {
      // fasting_result엔 시작일이 없다
      const week = latestFirst
        .filter((start) => start <= day)
        .map((start) => weekFrom(start, day))
        .find((w) => w >= 2);
      if (week === undefined) continue;
      weekByDay.set(day, week);
    }
    resultByDay.set(day, { result, fastedMinutes: fastedMinutes ?? null });
  }

  return [...weekByDay.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((day) => ({
      day,
      weekIndex: weekByDay.get(day)!,
      result: resultByDay.get(day)?.result ?? null,
      fastedMinutes: resultByDay.get(day)?.fastedMinutes ?? null,
      inProgress: inProgress.has(day),
    }));
}

// 기록 탭 > 단식 칸: 지금 회차(current)와 지난 회차(previous, 최근 회차 먼저) 단식 목록.
// 회차 시작일 = programStartOf(program_start, start_date). 지금 회차는 시작일이 회차 시작일 이후인 계획 모두와
// 회차 시작일 이후 결과. 지난 회차는 groupPastStarts로 묶은 시작일들의 계획과, 다음 회차 시작 전까지의 결과.
// 기록이 없는 지난 회차는 뺀다
export function fastingHistory({
  startDate,
  programStart,
  plans,
  results,
  now,
}: {
  startDate: string;
  programStart: string | null;
  plans: Plan[];
  results: Result[];
  now: Date;
}): {
  current: FastingHistoryItem[];
  previous: { startDate: string; items: FastingHistoryItem[] }[];
} {
  const program = programStartOf(programStart, startDate) ?? startDate.slice(0, 10);
  const startOf = (plan: Plan) => plan.start_date.slice(0, 10);
  const normalized = plans.map((plan) => ({ ...plan, start_date: startOf(plan) }));

  const currentStarts = [
    ...new Set([program, startDate.slice(0, 10), ...normalized.map((p) => p.start_date)]),
  ].filter((start) => start >= program);
  const current = programItems({
    starts: currentStarts,
    from: program,
    until: null,
    plans: normalized.filter((p) => p.start_date >= program),
    results,
    now,
  });

  // 최근 회차 먼저: 각 회차는 바로 다음(더 최근) 회차 시작 전, 가장 최근 회차는 지금 회차 시작 전까지
  const groups = groupPastStarts(
    normalized.map((p) => p.start_date),
    program
  );
  const previous = groups
    .map((starts, i) => ({
      startDate: starts[0],
      items: programItems({
        starts,
        from: starts[0],
        until: i === 0 ? program : groups[i - 1][0],
        plans: normalized.filter((p) => starts.includes(p.start_date)),
        results,
        now,
      }),
    }))
    .filter((group) => group.items.length > 0);

  return { current, previous };
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 단식 기록 날짜: 올해(KST)면 "10월 30일 (금)", 아니면 "2025년 9월 1일 (월)"
export function formatHistoryDay(day: string, todayKst: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const md = `${m}월 ${d}일 (${weekday})`;
  return String(y) === todayKst.slice(0, 4) ? md : `${y}년 ${md}`;
}
