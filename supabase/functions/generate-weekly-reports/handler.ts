// 주간 리포트 생성 배치 본체. 외부 의존성(DB, Gemini)은 deps로 받아 Vitest(node)에서 가짜로
// 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 매일 08:00 KST cron이 service role로 호출한다. 오늘(KST)이 start_date 기준 새 주차 1~3일차인 유저 중
// 이용 권한이 있는 유저의 지난 주차 리포트를 만든다 (1일차 실행이 실패·시간 초과로 놓친 리포트를
// 2·3일차 실행이 보충한다).
// 여러 번 실행해도 안전하다: 같은 키(uid, start_date, week_index)의 리포트가 있으면 AI 호출 전에 건너뛰고,
// 저장은 키 충돌 시 무시하며, 실제로 새로 들어간 경우에만 푸시한다.
// 한 주 더 하기·주차 맞추기로 start_date가 바뀌면 같은 기간이 다른 키가 된다. 그래도 리포트는 만든다
// (운영자 결정 2026-10-31: 한 주 더 하면 같은 7일 리포트가 하나 더 생기는 게 맞다). 대신 제목·푸시·
// AI 문맥의 주차는 week_index가 아니라 실제로 지낸 주차(display_week, displayWeekFor)를 쓴다.

import { isServiceRoleRequest } from '../_shared/serviceRole.ts';
import { scheduleFrom } from '../_shared/fastingSchedule.ts';
import { kstMidnightIso, resolveToday } from '../_shared/kstToday.ts';
import {
  buildReportPrompt,
  fallbackContent,
  nextWeekChangesFor,
  parseReportContent,
  sanitizeContent,
  type ReportContent,
} from '../_shared/weeklyReport.ts';
import {
  baselineStartOf,
  computeWeeklyStats,
  overlapDays,
  plannedFastingDays,
  weekRange,
  type WeeklyStats,
} from '../_shared/weeklyStats.ts';

export const CONCURRENCY = 5;
export const REPORT_CHANNEL = 'REPORT';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportUserRow {
  id: string;
  start_date: string | null;
}

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

export interface GenerateReportsDeps {
  now(): Date;
  // 오늘이 새 주차 1~3일차인 유저 (전부, 페이지 처리는 구현이). 구현은 SQL 함수
  // weekly_report_candidates(p_today)로 걸러 읽는다. handler도 reportWeekOf로 한 번 더 거른다.
  // 다시 시작 직전 회차의 마지막 완료 주는 같은 유저가 옛 시작일로 한 번 더 온다 (start_date < program_start)
  fetchUsers(today: string): Promise<ReportUserRow[]>;
  hasPremiumAccess(uid: string): Promise<boolean>;
  // 유저의 리포트 키·표시 주차 전부 (리포트는 주 1개라 적다). 같은 키 여부와 표시 주차를 handler가 본다
  fetchReportPeriods(uid: string): Promise<ReportPeriod[]>;
  // user.program_start (회차 시작일, yyyy-MM-dd). 없으면 null (구버전 앱·마이그레이션 전)
  fetchProgramStart(uid: string): Promise<string | null>;
  fetchWeekData(query: WeekQuery): Promise<WeekData>;
  // Gemini 응답 텍스트. 실패하면 던진다
  askGemini(prompt: string): Promise<string>;
  // insert ... on conflict do nothing. 실제로 들어갔으면 true
  insertReport(row: WeeklyReportRow): Promise<boolean>;
  insertNotification(row: NotificationRow): Promise<void>;
}

export interface GenerateResult {
  today: string;
  candidates: number; // 오늘이 새 주차 1~3일차인 유저
  noAccess: number;
  existing: number; // 이미 리포트가 있어 건너뜀
  generated: number; // 기록이 있어 문장까지 만든 리포트
  empty: number; // 체중·할 일 기록이 없어 status='empty'로 저장
  skipped: number; // 그 주 기록이 하나도 없어 만들지 않음
  notified: number;
  failed: number;
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
// 2. 가장 최근 리포트 바로 다음 기간이고, 그 사이 시작일이 바뀌었고(다른 start_date), week_index로는 주차가
//    올라가지 않으면(한 주 더 하기·주차 미루기 전에 지낸 주) → 그 리포트 표시 주차 + 1
//    예) 감사 #3: 3주차 1일차 08:00 전에 한 주 더 → (옛, 2주차)가 없고 (새, 1주차)가 그 기간 → 2주차
// 3. 그 외 week_index. 한 주 더로 다시 지낸 주는 새 시작일 기준 주차라 같은 숫자가 다시 나온다
//    (앱이 "N주차 · 한 번 더"로 구분). 주차 맞추기로 앞당겨 주차가 올라가면 사용자가 정한 주차를 따른다
export function displayWeekFor(
  target: { startDate: string; weekIndex: number },
  reports: ReportPeriod[]
): number {
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
  if (best) return displayOf(best.report);

  const latest = byRecent[0];
  if (
    latest &&
    latest.report.start_date.slice(0, 10) !== start &&
    dayMs(latest.period.to) + DAY_MS === dayMs(range.from) &&
    displayOf(latest.report) + 1 > target.weekIndex
  ) {
    return displayOf(latest.report) + 1;
  }
  return target.weekIndex;
}

// 새 주차 몇 일차까지 지난 주차 리포트를 만들지 (1일차 + 보충 2일).
// SQL 함수 weekly_report_candidates도 같은 값(% 7 < 3)을 쓴다. 바꾸면 함께 바꾼다
export const CATCH_UP_DAYS = 3;

// 오늘이 새 주차 1~3일차면 끝난 주차 번호, 아니면 null (1주차 중·시작 전 제외)
export function reportWeekOf(startDate: string | null, today: string): number | null {
  if (!startDate) return null;
  const start = dayMs(startDate);
  if (Number.isNaN(start)) return null;
  const diff = Math.round((dayMs(today) - start) / DAY_MS);
  if (diff < 7 || diff % 7 >= CATCH_UP_DAYS) return null;
  return Math.floor(diff / 7);
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
  deps: GenerateReportsDeps,
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

type Outcome = 'noAccess' | 'existing' | 'generated' | 'empty' | 'skipped';

// 리포트 대상은 그 주 기록이 1개 이상인 유저 (설계 §6). 앱을 열지 않은 주에 빈 리포트를 쌓지 않는다
const hasAnyRecord = (stats: WeeklyStats) =>
  stats.weight.daysLogged > 0 ||
  stats.todo.items.some((item) => item.appeared > 0) ||
  stats.fasting.success + stats.fasting.broken > 0 ||
  stats.recipes.total > 0 ||
  stats.foodChecks.total > 0;

const processUser = async (
  deps: GenerateReportsDeps,
  uid: string,
  startDate: string,
  weekIndex: number
): Promise<{ outcome: Outcome; notified: boolean; failed: boolean }> => {
  // 같은 키의 리포트가 있는지 먼저 본다 (리포트는 권한이 있던 유저에게만 만들어지므로 결과는 같고,
  // 재시도 실행에서 이미 만든 유저의 권한 rpc를 아낀다). 기간만 겹치는 다른 키는 건너뛰지 않는다
  const reports = await deps.fetchReportPeriods(uid);
  if (reports.some((r) => r.start_date.slice(0, 10) === startDate && r.week_index === weekIndex)) {
    return { outcome: 'existing', notified: false, failed: false };
  }
  if (!(await deps.hasPremiumAccess(uid)))
    return { outcome: 'noAccess', notified: false, failed: false };

  const range = weekRange(startDate, weekIndex);
  const programStart = await deps.fetchProgramStart(uid);
  const baselineStart = baselineStartOf(programStart, startDate);
  const displayWeek = displayWeekFor(
    { startDate, weekIndex },
    sameProgramReports(reports, startDate, programStart)
  );
  const data = await deps.fetchWeekData({
    uid,
    startDate,
    weekIndex,
    baselineStart,
    range,
    fromIso: kstMidnightIso(range.from),
    toIso: kstMidnightIso(range.to, 1),
  });
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

  if (!hasAnyRecord(stats)) return { outcome: 'skipped', notified: false, failed: false };

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
  // 동시에 돈 다른 실행이 먼저 저장했다 → 그쪽이 푸시한다
  if (!inserted) return { outcome: 'existing', notified: false, failed: false };
  if (stats.isEmpty) return { outcome: 'empty', notified: false, failed: false };

  try {
    await deps.insertNotification({
      uid,
      title: `${displayWeek}주차 리포트가 도착했어요`,
      body: '지난 한 주 기록을 정리했어요. 잘한 점과 다음 주 할 일을 확인해보세요.',
      href: `/report/${startDate}/${weekIndex}`,
      channel_id: REPORT_CHANNEL,
      type: 'WEEKLY_REPORT',
    });
    return { outcome: 'generated', notified: true, failed: false };
  } catch (error) {
    console.error(`리포트 알림 저장 실패 (${uid}, ${weekIndex}주차):`, error);
    return { outcome: 'generated', notified: false, failed: true };
  }
};

// items를 최대 limit개씩 동시에 처리한다
const forEachLimited = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

export async function generateWeeklyReports(
  deps: GenerateReportsDeps,
  today: string
): Promise<GenerateResult> {
  const targets = (await deps.fetchUsers(today)).flatMap((u) => {
    const weekIndex = reportWeekOf(u.start_date, today);
    return weekIndex === null || !u.start_date
      ? []
      : [{ uid: u.id, startDate: u.start_date.slice(0, 10), weekIndex }];
  });

  const result: GenerateResult = {
    today,
    candidates: targets.length,
    noAccess: 0,
    existing: 0,
    generated: 0,
    empty: 0,
    skipped: 0,
    notified: 0,
    failed: 0,
  };

  await forEachLimited(targets, CONCURRENCY, async ({ uid, startDate, weekIndex }) => {
    try {
      const { outcome, notified, failed } = await processUser(deps, uid, startDate, weekIndex);
      result[outcome] += 1;
      if (notified) result.notified += 1;
      if (failed) result.failed += 1;
    } catch (error) {
      console.error(`리포트 생성 실패 (${uid}, ${weekIndex}주차):`, error);
      result.failed += 1;
    }
  });
  return result;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function handleGenerateWeeklyReports(
  req: Request,
  deps: GenerateReportsDeps
): Promise<Response> {
  try {
    // ?today= 지정도 service role 확인을 통과한 뒤에만 읽는다
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }
    const today = resolveToday(req, deps.now());
    if (!today) return json({ error: 'today는 yyyy-MM-dd 형식이어야 합니다' }, 400);
    return json(await generateWeeklyReports(deps, today), 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('주간 리포트 생성 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
}
