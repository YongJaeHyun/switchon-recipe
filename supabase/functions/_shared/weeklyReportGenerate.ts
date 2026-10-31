// 주간 리포트 한 주(uid, start_date, week_index) 만들기. cron(generate-weekly-reports)과 패스 구매 뒤
// 지난 주 보충(verify-pass-purchase/backfillReports.ts)이 함께 쓴다. 외부 의존성(DB, Gemini)은 deps로 받아
// Vitest(node)에서 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 weeklyReportDb.ts).
// 같은 키(uid, start_date, week_index)의 리포트가 있으면 AI 호출 전에 건너뛰고, 저장은 키 충돌 시 무시한다.
// 표시 주차(resolveDisplayWeek)·유지기 1주차까지(MAX_REPORT_WEEK)·주차 맞추기로 건너뛴 기간(alignedAheadOver)
// 규칙은 generate-weekly-reports/handler.ts 머리 주석 참고. 푸시는 부르는 쪽이 정한다.

import { scheduleFrom } from './fastingSchedule.ts';
import { kstMidnightIso } from './kstToday.ts';
import {
  buildReportPrompt,
  fallbackContent,
  nextWeekChangesFor,
  parseReportContent,
  sanitizeContent,
  type ReportContent,
} from './weeklyReport.ts';
import {
  baselineStartOf,
  computeWeeklyStats,
  overlapDays,
  plannedFastingDays,
  weekRange,
  type WeeklyStats,
} from './weeklyStats.ts';

export const REPORT_CHANNEL = 'REPORT';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WeekQuery {
  uid: string;
  startDate: string; // yyyy-MM-dd
  weekIndex: number;
  baselineStart: string; // 누적 체중 기준 = 회차 시작일 (baselineStartOf). 체중은 이날부터 읽는다
  range: { from: string; to: string }; // KST 날짜
  fromIso: string; // range.from 00:00 KST (UTC ISO)
  toIso: string; // range.to 다음 날 00:00 KST (UTC ISO, 미포함)
}

// DB에서 읽은 그대로의 값 (검증은 handler에서)
export interface WeekData {
  weights: { day: string; weight_kg: number | string }[]; // baselineStart ~ range.to
  todoDays: { day: string; items: string[]; checked: number[] }[]; // range 안
  fastingPlanDays: number[] | null; // fasting_plan(uid, start_date, week_index).days
  fastingPlanStartTime: string | null; // 같은 행의 start_time ('아침 식후' 등, 옛 라벨)
  fastingPlanStartMinutes?: unknown; // 같은 행의 start_minutes jsonb ({"<요일>": 분}). 우선 사용
  fastingResults: { day: string; result: string; fasted_minutes?: number | null }[]; // range 안
  recipes: { created_at: string; is_zero_carb: boolean | null }[]; // [fromIso, toIso)
  foodChecks: { created_at: string; verdict: string | null }[]; // [fromIso, toIso)
}

export interface WeeklyReportRow {
  uid: string;
  start_date: string;
  week_index: number; // 키: start_date 기준 주차 (상세 경로 /report/{start_date}/{week_index})
  display_week: number; // 제목: 실제로 지낸 주차 (displayWeekFor)
  stats: WeeklyStats;
  content: ReportContent | null;
  status: 'ready' | 'empty';
}

export interface NotificationRow {
  uid: string;
  title: string;
  body: string;
  href: string;
  channel_id: string;
  type: 'WEEKLY_REPORT';
}

export interface ReportPeriod {
  start_date: string;
  week_index: number;
  display_week: number | null; // 마이그레이션 전 행은 null → week_index
}

export interface FastingPlanRow {
  days: number[] | null;
  start_time: string | null;
  start_minutes?: unknown;
}

// 리포트 한 주를 만드는 데 필요한 의존성 (cron 후보 조회·푸시 저장은 부르는 쪽)
export interface ReportGenerationDeps {
  now(): Date;
  hasPremiumAccess(uid: string): Promise<boolean>;
  // 유저의 리포트 키·표시 주차 전부 (리포트는 주 1개라 적다). 같은 키 여부와 표시 주차를 여기서 본다
  fetchReportPeriods(uid: string): Promise<ReportPeriod[]>;
  // fasting_plan(uid, start_date, week_index) 한 행. 없으면 null. 새 키에 계획이 없을 때 그 기간의 옛 키로 읽는다
  fetchFastingPlan(
    uid: string,
    startDate: string,
    weekIndex: number
  ): Promise<FastingPlanRow | null>;
  // user.program_start (회차 시작일, yyyy-MM-dd). 없으면 null (구버전 앱·마이그레이션 전)
  fetchProgramStart(uid: string): Promise<string | null>;
  fetchWeekData(query: WeekQuery): Promise<WeekData>;
  // Gemini 응답 텍스트. 실패하면 던진다
  askGemini(prompt: string): Promise<string>;
  // insert ... on conflict do nothing. 실제로 들어갔으면 true
  insertReport(row: WeeklyReportRow): Promise<boolean>;
}

const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

// 새 리포트 기간이 이미 있는 리포트의 실제 기간(start_date + 7×(week_index−1) ~ +6일)과 이만큼(일) 이상
// 겹치면 같은 주로 보고 그 리포트의 표시 주차를 이어받는다. 7일 중 과반(4일): 같은 기간(한 주 더 하기 직후)은
// 물론, 주차 맞추기로 며칠 어긋난 기간도 같은 주. 3일 이하만 겹치면 대부분 새 날짜라 새 주로 본다
export const OVERLAP_MIN_DAYS = 4;

const displayOf = (r: ReportPeriod) => r.display_week ?? r.week_index;
const periodOf = (r: ReportPeriod) => weekRange(r.start_date.slice(0, 10), r.week_index);

// 리포트를 만들 기간과 같은 회차의 리포트들. programStart = user.program_start (없으면 null).
// 앱 groupReportsByProgram과 같은 경계(리포트 start_date 기준):
// - 지금 회차: 시작일이 회차 시작일(baselineStartOf: program_start, 없거나 시작일보다 뒤면 start_date) 이후
// - 지난 회차(다시 시작 직전 주 보충, weekly_report_candidates): startDate가 회차 시작일보다 앞이면 회차 시작일 전 리포트
export function sameProgramReports<T extends ReportPeriod>(
  reports: T[],
  startDate: string,
  programStart: string | null
): T[] {
  const start = startDate.slice(0, 10);
  const program = programStart?.slice(0, 10);
  if (program && /^\d{4}-\d{2}-\d{2}$/.test(program) && start < program) {
    return reports.filter((r) => r.start_date.slice(0, 10) < program);
  }
  const from = baselineStartOf(programStart, start);
  return reports.filter((r) => r.start_date.slice(0, 10) >= from);
}

// 새 리포트의 표시 주차 = 실제로 지낸 주차. reports = 같은 회차의 리포트 (sameProgramReports)
// 1. 기간이 OVERLAP_MIN_DAYS 이상 겹치는 리포트가 있으면 그 리포트의 표시 주차 (가장 많이 겹치는 것, 같으면 최근)
//    예) 한 주 더 하기 뒤 (새 시작일, 1주차) = (옛 시작일, 2주차)와 같은 기간 → 2주차
// 2. 가장 최근 리포트 바로 다음 기간이고, 그 리포트 시작일 기준으로 센 주차(week_index + 1)가 더 크면 그 주차.
//    그 기간에 쓰이던 시작일은 가장 최근 리포트의 시작일이다 (한 주 더 하기·주차 미루기는 그 뒤에 했다)
//    예) 감사 #3: 3주차 1일차 08:00 전에 한 주 더 → (옛, 2주차)가 없고 (새, 1주차)가 그 기간 → 2주차.
//    한 주 더를 두 번 08:00 전에 해도 1, 2, 2, 2 (표시 주차 + 1이 아니라 week_index + 1이라 3이 되지 않는다)
//    단, 새 1주차가 2주차 이상 리포트 바로 뒤면 건너뛴다: 한 주 더 하기로는 생기지 않고, 구버전(5.x) 다시 시작
//    (program_start가 옛 값이라 지난 회차 리포트가 같은 회차로 보임)이다.
//    한계: 앞 리포트가 1주차면 5.x 다시 시작과 08:00 전 한 주 더(2주차 반복)를 구별할 수 없어 2주차로 본다
// 3. 그 외 week_index. 한 주 더로 다시 지낸 주는 새 시작일 기준 주차라 같은 숫자가 다시 나온다
//    (앱이 "N주차 · 한 번 더"로 구분). 주차 맞추기로 앞당겨 주차가 올라가면 사용자가 정한 주차를 따른다
// source = 그 기간을 실제로 지낼 때의 키 (겹친 리포트의 키, 또는 앞 리포트 시작일 기준 다음 주차). 앱은 단식 계획을
// 그 키로 남겼으므로 새 키에 계획이 없을 때 이 키로 읽는다. 규칙 3이면 null
export function resolveDisplayWeek(
  target: { startDate: string; weekIndex: number },
  reports: ReportPeriod[]
): { week: number; source: { start_date: string; week_index: number } | null } {
  const start = target.startDate.slice(0, 10);
  const range = weekRange(start, target.weekIndex);
  // 기간 최신 먼저, 같은 기간이면 시작일 최신 먼저
  const byRecent = reports
    .map((report) => ({ report, period: periodOf(report) }))
    .sort(
      (a, b) =>
        dayMs(b.period.from) - dayMs(a.period.from) ||
        (a.report.start_date < b.report.start_date ? 1 : -1)
    );

  let best: { report: ReportPeriod; days: number } | null = null;
  for (const { report, period } of byRecent) {
    const days = overlapDays(range, period);
    if (days >= OVERLAP_MIN_DAYS && (!best || days > best.days)) best = { report, days };
  }
  if (best) {
    return {
      week: displayOf(best.report),
      source: {
        start_date: best.report.start_date.slice(0, 10),
        week_index: best.report.week_index,
      },
    };
  }

  const latest = byRecent[0];
  if (
    latest &&
    dayMs(latest.period.to) + DAY_MS === dayMs(range.from) &&
    latest.report.week_index + 1 > target.weekIndex &&
    !(target.weekIndex === 1 && latest.report.week_index >= 2)
  ) {
    const week = latest.report.week_index + 1;
    return {
      week,
      source: { start_date: latest.report.start_date.slice(0, 10), week_index: week },
    };
  }
  return { week: target.weekIndex, source: null };
}

// 리포트를 만드는 마지막 표시 주차 = 유지기 1주차 (운영자 결정 2026-10-31: 1~4주차 + 유지기 1주차).
// 유지기 2주차(표시 주차 6) 이후는 이용 권한 rpc·AI·저장·푸시 없이 건너뛴다. 판단은 week_index가 아니라 표시 주차로
// 한다 (08:00 전 한 주 더로 week_index 5가 실제 6주차일 수 있다). 후보 SQL(weekly_report_candidates)은
// week_index ≤ 5만 돌려준다: 표시 주차가 week_index보다 작은 건 이미 있는 리포트와 4일 이상 겹칠 때뿐인데,
// 주차를 올리는 주차 맞추기는 많아야 5주차 1일로 가므로 6주차 이후 기간은 맞춘 날 뒤의 새 날짜라 겹치지 않는다
export const MAX_REPORT_WEEK = 5;

// 감사 #16: 주차 맞추기로 몇 주 앞(예: 유지기 = 5주차 1일)으로 가면 방금 끝난 기간이 새 시작일 키로 큰 주차가
// 되지만, 실제로는 맞추기 전 주차로 지낸 날들이다 (2주차 6일에 유지기로 맞추면 1·2주차 기록이 "4주차 리포트").
// 규칙: 같은 회차의 가장 최근 리포트(기간 기준)와 1~3일 겹치고(일부 날짜가 이미 그 주 리포트에 들어갔고)
// 표시 주차가 그 리포트의 표시 주차보다 2 이상 크면 맞추기 전 날짜가 섞인 기간으로 보고 만들지 않는다.
// 겹치지 않는 기간(바로 이어지거나 빈 날이 있음)은 만든다: 맞춘 뒤 지낸 날이 대부분일 수 있다 (기존 결정:
// 2주차 중 4주차로 맞추면 그 주는 4주차).
// 한계: 1주차 중 맞추거나(앞 리포트 없음) 새 주차 1일차 08:00 전에 맞추면(바로 이어짐) 구별할 수 없어 만든다.
// 한계: 리포트를 받은 다음 날~사흘 안에 2주 이상 앞의 주차 2~4일로 맞추면, 맞춘 뒤 지낸 날이 많아도 그 주는 빠진다
export function alignedAheadOver(
  target: { startDate: string; weekIndex: number },
  displayWeek: number,
  reports: ReportPeriod[]
): boolean {
  const range = weekRange(target.startDate.slice(0, 10), target.weekIndex);
  const latest = reports
    .map((report) => ({ report, period: periodOf(report) }))
    .sort(
      (a, b) =>
        dayMs(b.period.from) - dayMs(a.period.from) ||
        (a.report.start_date < b.report.start_date ? 1 : -1)
    )[0];
  if (!latest) return false;
  const days = overlapDays(range, latest.period);
  return days > 0 && days < OVERLAP_MIN_DAYS && displayWeek >= displayOf(latest.report) + 2;
}

export function displayWeekFor(
  target: { startDate: string; weekIndex: number },
  reports: ReportPeriod[]
): number {
  return resolveDisplayWeek(target, reports).week;
}

const normalizeWeekData = (data: WeekData) => ({
  weights: data.weights
    .map((w) => ({ day: w.day, weight_kg: Number(w.weight_kg) }))
    .filter((w) => Number.isFinite(w.weight_kg)),
  todoDays: data.todoDays.map((d) => ({
    day: d.day,
    items: d.items ?? [],
    checked: d.checked ?? [],
  })),
  fastingResults: data.fastingResults
    .filter(
      (r): r is { day: string; result: 'success' | 'broken'; fasted_minutes?: number | null } =>
        r.result === 'success' || r.result === 'broken'
    )
    .map((r) => ({
      day: r.day,
      result: r.result,
      fastedMinutes: typeof r.fasted_minutes === 'number' ? r.fasted_minutes : null,
    })),
  recipes: data.recipes.map((r) => ({ created_at: r.created_at, is_zero_carb: !!r.is_zero_carb })),
  foodChecks: data.foodChecks.filter(
    (c): c is { created_at: string; verdict: 'ok' | 'avoid' } =>
      c.verdict === 'ok' || c.verdict === 'avoid'
  ),
});

const writeContent = async (
  deps: ReportGenerationDeps,
  stats: WeeklyStats,
  uid: string
): Promise<ReportContent> => {
  const nextWeekChanges = nextWeekChangesFor(stats.weekIndex);
  try {
    const parsed = parseReportContent(
      await deps.askGemini(buildReportPrompt(stats, nextWeekChanges))
    );
    if (parsed) return sanitizeContent(parsed, stats, nextWeekChanges);
    console.error(`리포트 응답 해석 실패 (${uid}, ${stats.weekIndex}주차)`);
  } catch (error) {
    console.error(`리포트 Gemini 실패 (${uid}, ${stats.weekIndex}주차):`, error);
  }
  return fallbackContent(stats, nextWeekChanges);
};

export type ReportOutcome =
  | 'noAccess'
  | 'existing'
  | 'capped'
  | 'alignedAhead'
  | 'generated'
  | 'empty'
  | 'skipped';

// 리포트 대상은 그 주 기록이 1개 이상인 유저 (설계 §6). 앱을 열지 않은 주에 빈 리포트를 쌓지 않는다
const hasAnyRecord = (stats: WeeklyStats) =>
  stats.weight.daysLogged > 0 ||
  stats.todo.items.some((item) => item.appeared > 0) ||
  stats.fasting.success + stats.fasting.broken > 0 ||
  stats.recipes.total > 0 ||
  stats.foodChecks.total > 0;

// (uid, startDate, weekIndex) 리포트 하나를 만든다. 'generated'(문장까지 만든 ready)일 때만 푸시할 거리가 있다.
// displayWeek = 저장한 표시 주차 (generated·empty일 때). DB·권한 조회 오류는 던진다 (AI 실패는 기본 문장)
export const generateWeekReport = async (
  deps: ReportGenerationDeps,
  uid: string,
  startDate: string,
  weekIndex: number
): Promise<{ outcome: ReportOutcome; displayWeek?: number }> => {
  // 같은 키의 리포트가 있는지 먼저 본다 (리포트는 권한이 있던 유저에게만 만들어지므로 결과는 같고,
  // 재시도 실행에서 이미 만든 유저의 권한 rpc를 아낀다). 기간만 겹치는 다른 키는 건너뛰지 않는다
  const reports = await deps.fetchReportPeriods(uid);
  if (reports.some((r) => r.start_date.slice(0, 10) === startDate && r.week_index === weekIndex)) {
    return { outcome: 'existing' };
  }

  // 표시 주차로 만들지 말지 먼저 정한다 (만들지 않을 유저의 권한 rpc·AI를 아낀다)
  const programStart = await deps.fetchProgramStart(uid);
  const program = sameProgramReports(reports, startDate, programStart);
  const { week: displayWeek, source } = resolveDisplayWeek({ startDate, weekIndex }, program);
  if (displayWeek > MAX_REPORT_WEEK) return { outcome: 'capped' };
  if (alignedAheadOver({ startDate, weekIndex }, displayWeek, program)) {
    return { outcome: 'alignedAhead' };
  }

  if (!(await deps.hasPremiumAccess(uid))) return { outcome: 'noAccess' };

  const range = weekRange(startDate, weekIndex);
  const baselineStart = baselineStartOf(programStart, startDate);
  const data = await deps.fetchWeekData({
    uid,
    startDate,
    weekIndex,
    baselineStart,
    range,
    fromIso: kstMidnightIso(range.from),
    toIso: kstMidnightIso(range.to, 1),
  });
  // 한 주 더 하기 등으로 새 키가 된 기간: 앱은 단식 계획을 그 기간을 지낼 때의 키로만 남겼다
  if (
    data.fastingPlanDays === null &&
    source &&
    (source.start_date !== startDate || source.week_index !== weekIndex)
  ) {
    const plan = await deps.fetchFastingPlan(uid, source.start_date, source.week_index);
    if (plan) {
      data.fastingPlanDays = plan.days;
      data.fastingPlanStartTime = plan.start_time;
      data.fastingPlanStartMinutes = plan.start_minutes;
    }
  }
  const known = normalizeWeekData(data);
  const computed = computeWeeklyStats({
    startDate,
    weekIndex,
    baselineStart,
    ...known,
    // 단식은 2주차부터: 지낸 주차로 본다 (한 주 더 하기 뒤 (새 시작일, 1주차)가 실제로는 2주차인 기간)
    fastingPlannedDays: plannedFastingDays(range, data.fastingPlanDays, displayWeek),
    // 아직 결과를 답할 수 있는 단식은 실패가 아니라 응답 대기로 센다
    fastingSchedule: scheduleFrom({
      days: data.fastingPlanDays,
      start_time: data.fastingPlanStartTime,
      start_minutes: data.fastingPlanStartMinutes,
    }),
    now: deps.now(),
  });
  // 저장하는 stats.weekIndex와 AI 문맥(주차별 몸 변화·다음 주 변화·기본 문장)은 표시 주차.
  // 기간(range)은 키(start_date, week_index)로 이미 정했다
  const stats: WeeklyStats = { ...computed, weekIndex: displayWeek };

  if (!hasAnyRecord(stats)) return { outcome: 'skipped' };

  const content = stats.isEmpty ? null : await writeContent(deps, stats, uid);
  const inserted = await deps.insertReport({
    uid,
    start_date: startDate,
    week_index: weekIndex,
    display_week: displayWeek,
    stats,
    content,
    status: stats.isEmpty ? 'empty' : 'ready',
  });
  // 동시에 돈 다른 실행이 먼저 저장했다 → 그쪽이 푸시한다 (existing)
  if (!inserted) return { outcome: 'existing' };
  if (stats.isEmpty) return { outcome: 'empty', displayWeek };

  return { outcome: 'generated', displayWeek };
};
