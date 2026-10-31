// 리포트 직접 만들기·다시 만들기 본체 (운영자 결정 2026-10-31). 로그인 사용자(패스 전용)가 기록 탭·리포트 상세에서 부른다.
// 외부 의존성(인증, DB, Gemini)은 deps로 받아 Vitest(node)에서 가짜로 테스트한다. URL import를 두지 않는다
// (실제 연결은 index.ts). 한 주 통계·문장은 cron과 같은 _shared/weeklyReportGenerate.ts (표시 주차, MAX_REPORT_WEEK,
// 같은 회차, alignedAheadOver). 푸시는 보내지 않는다 (사용자가 화면에 있다).
//
// 요청: POST { start_date: 'yyyy-MM-dd', week_index: n, mode?: 'create' | 'regenerate' | 'check' } (mode 생략 = create)
// - create (기록 탭 [지금 만들기], 리포트가 없는 주): 키 시작일 = 지금 시작일(user.start_date), 오늘(KST) 전에 끝난 주,
//   키 ≤ MAX_REPORT_WEEK, 이미 있는 리포트와 같은 주(OVERLAP_MIN_DAYS 이상 겹침)가 아니고, 표시 주차 ≤ MAX_REPORT_WEEK,
//   주차 맞추기로 건너뛴 기간이 아님 → 패스 → 최근 24시간 만든 리포트 < CREATE_DAILY_LIMIT → 체중·할 일 기록
//   (없으면 400 no_records, Gemini 없음) → 문장(Gemini, 실패하면 cron처럼 기본 문장) → 저장 → { report }.
//   같은 키가 이미 있으면 새로 만들지 않고 그 행을 돌려준다 (두 번 눌러도 한 번).
// - regenerate (리포트 상세 [다시 만들기]): 지금 회차 리포트, 표시 주차 ≤ MAX_REPORT_WEEK → 패스 → 오늘(KST) 다시 만든 적
//   없음(regenerated_at) → 마지막 생성(coalesce(regenerated_at, created_at)) 뒤 그 주 기록이 바뀜(recordsChangedSince)
//   → 체중·할 일 기록 있음 → regenerated_at을 조건부 update로 먼저 차지 (동시 요청은 하나만) → Gemini → 갱신 → { report }.
//   Gemini가 실패하면(기본 문장) 있던 리포트를 덮지 않고 차지를 되돌린 뒤 502 generation_failed.
// - check (리포트 상세가 [다시 만들기]를 보일지): regenerate의 Gemini 전 조건만 본다 → { can_regenerate, reason }.
//   앱 표시는 참고, 최종 판단은 regenerate가 다시 한다.
// 무료 1주차 리포트(평생 1번)는 cron만 만든다: 여기는 패스가 있어야 한다.
// 오류 응답: { error } — 401 unauthorized, 400 invalid_request·no_records, 402 pass_required, 404 not_found,
// 409 not_available·not_changed, 429 daily_limit·already_regenerated_today, 502 generation_failed, 500 internal

import { kstMidnightIso, kstToday } from '../_shared/kstToday.ts';
import {
  alignedAheadOver,
  buildWeekStats,
  MAX_REPORT_WEEK,
  OVERLAP_MIN_DAYS,
  resolveDisplayWeek,
  sameProgramReports,
  writeReportContent,
  type ReportGenerationDeps,
  type WeeklyReportRow,
} from '../_shared/weeklyReportGenerate.ts';
import {
  baselineStartOf,
  overlapDays,
  weekRange,
  type WeeklyStats,
} from '../_shared/weeklyStats.ts';

// 직접 만들기 반복 악용 막기: 최근 24시간에 만든 리포트(cron·보충 포함)가 이만큼이면 더 만들지 않는다.
// 한 회차 리포트는 많아야 5개(MAX_REPORT_WEEK)라 정상 사용은 걸리지 않는다
export const CREATE_DAILY_LIMIT = MAX_REPORT_WEEK;
const DAY_MS = 24 * 60 * 60 * 1000;

// weekly_report 행 (select *)
export interface MyReportRow extends Omit<WeeklyReportRow, 'display_week'> {
  display_week: number | null;
  created_at: string;
  regenerated_at: string | null;
}

export interface MyReportDeps extends ReportGenerationDeps {
  // 요청 JWT로 구한 uid. 없거나 유효하지 않으면 null
  getUid(req: Request): Promise<string | null>;
  // user.start_date (yyyy-MM-dd). 없으면 null
  fetchStartDate(uid: string): Promise<string | null>;
  fetchReport(uid: string, startDate: string, weekIndex: number): Promise<MyReportRow | null>;
  // 이 유저의 weekly_report 중 created_at >= since 인 행 수
  countReportsCreatedSince(uid: string, since: Date): Promise<number>;
  // since 뒤에 그 주 기록이 바뀌었는지: weight_log·todo_daily·fasting_result(range 안 day)·fasting_plan(키)의 updated_at > since
  recordsChangedSince(
    query: {
      uid: string;
      startDate: string;
      weekIndex: number;
      range: { from: string; to: string };
    },
    since: string
  ): Promise<boolean>;
  // regenerated_at이 null이거나 dayStartIso 전이면 at으로 바꾸고 true (조건부 update, 동시 요청 중 하나만). 아니면 false
  claimRegeneration(
    uid: string,
    startDate: string,
    weekIndex: number,
    at: string,
    dayStartIso: string
  ): Promise<boolean>;
  // claim으로 바꾼 regenerated_at(at)을 previous로 되돌린다 (그 사이 다른 값이면 두지 않는다)
  releaseRegeneration(
    uid: string,
    startDate: string,
    weekIndex: number,
    at: string,
    previous: string | null
  ): Promise<void>;
  updateReport(
    uid: string,
    startDate: string,
    weekIndex: number,
    patch: { stats: WeeklyStats; content: WeeklyReportRow['content']; status: 'ready' }
  ): Promise<MyReportRow | null>;
}

type Mode = 'create' | 'regenerate' | 'check';
type Failure =
  | 'not_found'
  | 'not_available'
  | 'pass_required'
  | 'already_regenerated_today'
  | 'not_changed';

const STATUS: Record<Failure | 'no_records' | 'daily_limit' | 'generation_failed', number> = {
  not_found: 404,
  not_available: 409,
  pass_required: 402,
  already_regenerated_today: 429,
  not_changed: 409,
  no_records: 400,
  daily_limit: 429,
  generation_failed: 502,
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const fail = (error: keyof typeof STATUS) => json({ error }, STATUS[error]);

const isValidDay = (day: unknown): day is string =>
  typeof day === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

const parseBody = (body: unknown): { startDate: string; weekIndex: number; mode: Mode } | null => {
  if (!body || typeof body !== 'object') return null;
  const { start_date, week_index, mode = 'create' } = body as Record<string, unknown>;
  if (!isValidDay(start_date)) return null;
  if (typeof week_index !== 'number' || !Number.isInteger(week_index) || week_index < 1) {
    return null;
  }
  if (mode !== 'create' && mode !== 'regenerate' && mode !== 'check') return null;
  return { startDate: start_date, weekIndex: week_index, mode };
};

const displayOf = (r: { display_week: number | null; week_index: number }) =>
  r.display_week ?? r.week_index;

// 다시 만들기(regenerate·check)의 Gemini 전 조건. 통과하면 리포트와 회차 정보
const regenerationGate = async (
  deps: MyReportDeps,
  uid: string,
  startDate: string,
  weekIndex: number
): Promise<
  | { ok: false; reason: Failure }
  | { ok: true; report: MyReportRow; programStart: string | null; dayStartIso: string }
> => {
  const report = await deps.fetchReport(uid, startDate, weekIndex);
  if (!report) return { ok: false, reason: 'not_found' };

  const [userStart, programStart] = await Promise.all([
    deps.fetchStartDate(uid),
    deps.fetchProgramStart(uid),
  ]);
  // 지금 회차 = 시작일이 회차 시작일(program_start, 없거나 시작일보다 뒤면 start_date) 이후인 리포트
  if (!userStart || startDate < baselineStartOf(programStart, userStart)) {
    return { ok: false, reason: 'not_available' };
  }
  if (displayOf(report) > MAX_REPORT_WEEK) return { ok: false, reason: 'not_available' };
  if (!(await deps.hasPremiumAccess(uid))) return { ok: false, reason: 'pass_required' };

  const dayStartIso = kstMidnightIso(kstToday(deps.now()));
  if (report.regenerated_at && Date.parse(report.regenerated_at) >= Date.parse(dayStartIso)) {
    return { ok: false, reason: 'already_regenerated_today' };
  }
  const changed = await deps.recordsChangedSince(
    { uid, startDate, weekIndex, range: weekRange(startDate, weekIndex) },
    report.regenerated_at ?? report.created_at
  );
  if (!changed) return { ok: false, reason: 'not_changed' };
  return { ok: true, report, programStart, dayStartIso };
};

const regenerate = async (
  deps: MyReportDeps,
  uid: string,
  startDate: string,
  weekIndex: number
): Promise<Response> => {
  const gate = await regenerationGate(deps, uid, startDate, weekIndex);
  if (!gate.ok) return fail(gate.reason);
  const { report, programStart, dayStartIso } = gate;

  // 기록을 읽기 전 시각을 생성 시각으로 남긴다 (읽는 사이 저장된 기록은 다음 다시 만들기 대상)
  const at = deps.now().toISOString();
  // 단식 계획을 읽을 키는 이 리포트를 뺀 같은 회차 리포트로 정한다 (처음 만들 때와 같게). 표시 주차는 저장된 값
  const others = (await deps.fetchReportPeriods(uid)).filter(
    (r) => !(r.start_date.slice(0, 10) === startDate && r.week_index === weekIndex)
  );
  const { source } = resolveDisplayWeek(
    { startDate, weekIndex },
    sameProgramReports(others, startDate, programStart)
  );
  const stats = await buildWeekStats(
    deps,
    uid,
    startDate,
    weekIndex,
    programStart,
    displayOf(report),
    source
  );
  if (stats.isEmpty) return fail('no_records');

  const previous = report.regenerated_at;
  if (!(await deps.claimRegeneration(uid, startDate, weekIndex, at, dayStartIso))) {
    return fail('already_regenerated_today');
  }
  const release = () =>
    deps.releaseRegeneration(uid, startDate, weekIndex, at, previous).catch((e) => {
      console.error(`다시 만들기 되돌리기 실패 (${uid}, ${startDate}, ${weekIndex}):`, e);
    });

  const { content, ai } = await writeReportContent(deps, stats, uid);
  if (!ai) {
    await release();
    return fail('generation_failed');
  }
  let updated: MyReportRow | null;
  try {
    updated = await deps.updateReport(uid, startDate, weekIndex, {
      stats,
      content,
      status: 'ready',
    });
  } catch (error) {
    await release();
    throw error;
  }
  if (!updated) throw new Error('다시 만든 리포트를 찾지 못했습니다');
  return json({ report: updated }, 200);
};

const create = async (
  deps: MyReportDeps,
  uid: string,
  startDate: string,
  weekIndex: number
): Promise<Response> => {
  const userStart = await deps.fetchStartDate(uid);
  const today = kstToday(deps.now());
  const range = weekRange(startDate, weekIndex);
  // 지금 시작일 기준으로 오늘 전에 끝난 주만 (다시 시작 전·한 주 더 하기 전 시작일 키는 만들지 않는다)
  if (userStart !== startDate || weekIndex > MAX_REPORT_WEEK || range.to >= today) {
    return fail('not_available');
  }

  const reports = await deps.fetchReportPeriods(uid);
  if (reports.some((r) => r.start_date.slice(0, 10) === startDate && r.week_index === weekIndex)) {
    const existing = await deps.fetchReport(uid, startDate, weekIndex);
    if (existing) return json({ report: existing }, 200);
  }
  // 키가 달라도 기간이 이미 있는 리포트와 같은 주면 만들지 않는다 (패스 구매 뒤 보충과 같은 규칙)
  if (
    reports.some(
      (r) =>
        overlapDays(range, weekRange(r.start_date.slice(0, 10), r.week_index)) >= OVERLAP_MIN_DAYS
    )
  ) {
    return fail('not_available');
  }
  const programStart = await deps.fetchProgramStart(uid);
  const program = sameProgramReports(reports, startDate, programStart);
  const { week: displayWeek, source } = resolveDisplayWeek({ startDate, weekIndex }, program);
  if (
    displayWeek > MAX_REPORT_WEEK ||
    alignedAheadOver({ startDate, weekIndex }, displayWeek, program)
  ) {
    return fail('not_available');
  }

  if (!(await deps.hasPremiumAccess(uid))) return fail('pass_required');
  const recent = await deps.countReportsCreatedSince(uid, new Date(deps.now().getTime() - DAY_MS));
  if (recent >= CREATE_DAILY_LIMIT) return fail('daily_limit');

  const stats = await buildWeekStats(
    deps,
    uid,
    startDate,
    weekIndex,
    programStart,
    displayWeek,
    source
  );
  if (stats.isEmpty) return fail('no_records');

  const { content } = await writeReportContent(deps, stats, uid);
  // 키 충돌(동시에 만든 다른 요청·cron)이면 먼저 저장된 행을 돌려준다
  await deps.insertReport({
    uid,
    start_date: startDate,
    week_index: weekIndex,
    display_week: displayWeek,
    stats,
    content,
    status: 'ready',
    is_trial: false,
  });
  const saved = await deps.fetchReport(uid, startDate, weekIndex);
  if (!saved) throw new Error('만든 리포트를 찾지 못했습니다');
  return json({ report: saved }, 200);
};

export async function handleGenerateMyReport(req: Request, deps: MyReportDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const uid = await deps.getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    const input = parseBody(body);
    if (!input) return json({ error: 'invalid_request' }, 400);
    const { startDate, weekIndex, mode } = input;

    if (mode === 'create') return await create(deps, uid, startDate, weekIndex);
    if (mode === 'regenerate') return await regenerate(deps, uid, startDate, weekIndex);

    const gate = await regenerationGate(deps, uid, startDate, weekIndex);
    if (!gate.ok && gate.reason === 'not_found') return fail('not_found');
    return json({ can_regenerate: gate.ok, reason: gate.ok ? 'ok' : gate.reason }, 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('리포트 직접 만들기 실패:', error);
    return json({ error: 'internal' }, 500);
  }
}
