// 주간 리포트 생성 배치 본체. 외부 의존성(DB, Gemini)은 deps로 받아 Vitest(node)에서 가짜로
// 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 매일 08:00 KST cron이 service role로 호출한다. 오늘(KST)이 start_date 기준 새 주차 1~3일차인 유저 중
// 이용 권한이 있는 유저의 지난 주차 리포트를 만든다 (1일차 실행이 실패·시간 초과로 놓친 리포트를
// 2·3일차 실행이 보충한다).
// 여러 번 실행해도 안전하다: 이미 있는 리포트는 AI 호출 전에 건너뛰고, 저장은 키
// (uid, start_date, week_index) 충돌 시 무시하며, 실제로 새로 들어간 경우에만 푸시한다.

import { isServiceRoleRequest } from '../_shared/serviceRole.ts';
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
  computeWeeklyStats,
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
  range: { from: string; to: string }; // KST 날짜
  fromIso: string; // range.from 00:00 KST (UTC ISO)
  toIso: string; // range.to 다음 날 00:00 KST (UTC ISO, 미포함)
}

// DB에서 읽은 그대로의 값 (검증은 handler에서)
export interface WeekData {
  weights: { day: string; weight_kg: number | string }[]; // start_date ~ range.to
  todoDays: { day: string; items: string[]; checked: number[] }[]; // range 안
  fastingPlanDays: number[] | null; // fasting_plan(uid, start_date, week_index).days
  fastingPlanStartTime: string | null; // 같은 행의 start_time ('아침 식후' 등)
  fastingResults: { day: string; result: string }[]; // range 안
  recipes: { created_at: string; is_zero_carb: boolean | null }[]; // [fromIso, toIso)
  foodChecks: { created_at: string; verdict: string | null }[]; // [fromIso, toIso)
}

export interface WeeklyReportRow {
  uid: string;
  start_date: string;
  week_index: number;
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

export interface GenerateReportsDeps {
  now(): Date;
  // 오늘이 새 주차 1~3일차인 유저 (전부, 페이지 처리는 구현이). 구현은 SQL 함수
  // weekly_report_candidates(p_today)로 걸러 읽는다. handler도 reportWeekOf로 한 번 더 거른다
  fetchUsers(today: string): Promise<ReportUserRow[]>;
  hasPremiumAccess(uid: string): Promise<boolean>;
  reportExists(uid: string, startDate: string, weekIndex: number): Promise<boolean>;
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
  empty: number; // 기록이 없어 status='empty'로 저장
  notified: number;
  failed: number;
}

const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

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
  fastingResults: data.fastingResults.filter(
    (r): r is { day: string; result: 'success' | 'broken' } =>
      r.result === 'success' || r.result === 'broken'
  ),
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

type Outcome = 'noAccess' | 'existing' | 'generated' | 'empty';

const processUser = async (
  deps: GenerateReportsDeps,
  uid: string,
  startDate: string,
  weekIndex: number
): Promise<{ outcome: Outcome; notified: boolean; failed: boolean }> => {
  // 리포트가 있는지 먼저 본다 (리포트는 권한이 있던 유저에게만 만들어지므로 결과는 같고,
  // 재시도 실행에서 이미 만든 유저의 권한 rpc를 아낀다)
  if (await deps.reportExists(uid, startDate, weekIndex)) {
    return { outcome: 'existing', notified: false, failed: false };
  }
  if (!(await deps.hasPremiumAccess(uid)))
    return { outcome: 'noAccess', notified: false, failed: false };

  const range = weekRange(startDate, weekIndex);
  const data = await deps.fetchWeekData({
    uid,
    startDate,
    weekIndex,
    range,
    fromIso: kstMidnightIso(range.from),
    toIso: kstMidnightIso(range.to, 1),
  });
  const known = normalizeWeekData(data);
  const stats = computeWeeklyStats({
    startDate,
    weekIndex,
    ...known,
    fastingPlannedDays: plannedFastingDays(range, data.fastingPlanDays, weekIndex),
    // 아직 결과를 답할 수 있는 단식은 실패가 아니라 응답 대기로 센다
    fastingStartTime: data.fastingPlanStartTime,
    now: deps.now(),
  });

  const content = stats.isEmpty ? null : await writeContent(deps, stats, uid);
  const inserted = await deps.insertReport({
    uid,
    start_date: startDate,
    week_index: weekIndex,
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
      title: `${weekIndex}주차 리포트가 도착했어요`,
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
