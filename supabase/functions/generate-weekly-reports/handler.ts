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
// 리포트는 1~4주차와 유지기 1주차(표시 주차 5)까지만 만든다 (운영자 결정 2026-10-31, MAX_REPORT_WEEK).
// 한 주 만들기(표시 주차·상한·AI·저장)는 _shared/weeklyReportGenerate.ts (패스 구매 뒤 보충과 같은 규칙)
// 후보 SQL(weekly_report_candidates)은 패스 여부를 보지 않는다. 패스 없는 유저는 generateWeekReport의 권한 rpc에서
// 건너뛰되, 표시 주차 1 리포트는 사용자당 평생 한 번 무료로 만든다 (claimFreeReport, is_trial 행, 푸시는 같은 규칙).
// 그래서 Gemini는 패스 없는 유저 한 명당 평생 최대 1번 불린다
// 리포트 알림을 끈 유저(user_setting.report_reminder = false)는 리포트만 만들고 도착 푸시는 보내지 않는다 (muted)

import { isServiceRoleRequest } from '../_shared/serviceRole.ts';
import { resolveToday } from '../_shared/kstToday.ts';
import {
  generateWeekReport,
  REPORT_CHANNEL,
  type NotificationRow,
  type ReportGenerationDeps,
  type ReportOutcome,
} from '../_shared/weeklyReportGenerate.ts';

export {
  alignedAheadOver,
  displayWeekFor,
  MAX_REPORT_WEEK,
  OVERLAP_MIN_DAYS,
  REPORT_CHANNEL,
  resolveDisplayWeek,
  sameProgramReports,
  type FastingPlanRow,
  type NotificationRow,
  type ReportPeriod,
  type WeekData,
  type WeeklyReportRow,
  type WeekQuery,
} from '../_shared/weeklyReportGenerate.ts';

export const CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportUserRow {
  id: string;
  start_date: string | null;
}

export interface GenerateReportsDeps extends ReportGenerationDeps {
  // 오늘이 새 주차 1~3일차인 유저 (전부, 페이지 처리는 구현이). 구현은 SQL 함수
  // weekly_report_candidates(p_today)로 걸러 읽는다. handler도 reportWeekOf로 한 번 더 거른다.
  // 다시 시작 직전 회차의 마지막 완료 주는 같은 유저가 옛 시작일로 한 번 더 온다 (start_date < program_start)
  fetchUsers(today: string): Promise<ReportUserRow[]>;
  insertNotification(row: NotificationRow): Promise<void>;
  // 무료 1주차 리포트 (SQL 함수 claim_free_report / release_free_report, FreeReportTrial)
  claimFreeReport(uid: string): Promise<boolean>;
  releaseFreeReport(uid: string): Promise<void>;
  // 후보 중 리포트 알림을 끈 유저 (user_setting.report_reminder = false, _shared/weeklyReportDb.ts). 실행마다 한 번 읽는다.
  // 끈 유저도 리포트는 만들고 도착 푸시(무료 1주차 포함)만 보내지 않는다. 없으면(테스트) 모두 켜짐
  fetchReportReminderOffUids?(uids: string[]): Promise<Set<string>>;
}

export interface GenerateResult {
  today: string;
  candidates: number; // 오늘이 새 주차 1~3일차인 유저
  noAccess: number;
  existing: number; // 이미 리포트가 있어 건너뜀
  capped: number; // 표시 주차가 MAX_REPORT_WEEK보다 커서(유지기 2주차 이후) 건너뜀
  alignedAhead: number; // 주차 맞추기로 건너뛴 기간이라 건너뜀 (alignedAheadOver, 감사 #16)
  generated: number; // 기록이 있어 문장까지 만든 리포트
  trial: number; // 그중 패스 없이 무료 체험으로 만든 1주차 리포트
  empty: number; // 체중·할 일 기록이 없어 만들지 않음 (빈 리포트는 저장하지 않는다. 앱 [지금 만들기])
  skipped: number; // 그 주 기록이 하나도 없어 만들지 않음
  notified: number;
  muted: number; // 리포트는 만들었지만 리포트 알림을 꺼서 푸시하지 않음
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

const processUser = async (
  deps: GenerateReportsDeps,
  uid: string,
  startDate: string,
  weekIndex: number,
  muted: boolean
): Promise<{
  outcome: ReportOutcome;
  trial: boolean;
  notified: boolean;
  muted: boolean;
  failed: boolean;
}> => {
  const { outcome, displayWeek, trial } = await generateWeekReport(
    deps,
    uid,
    startDate,
    weekIndex,
    { claim: (id) => deps.claimFreeReport(id), release: (id) => deps.releaseFreeReport(id) }
  );
  const isTrial = outcome === 'generated' && trial === true;
  // 문장까지 만든 리포트만 푸시한다 (empty는 저장하지 않음, 키 충돌이면 먼저 저장한 실행이 푸시)
  if (outcome !== 'generated') {
    return { outcome, trial: false, notified: false, muted: false, failed: false };
  }
  if (muted) return { outcome, trial: isTrial, notified: false, muted: true, failed: false };

  try {
    await deps.insertNotification({
      uid,
      title: `${displayWeek}주차 리포트가 도착했어요`,
      body: '지난 한 주 기록을 정리했어요. 잘한 점과 다음 주 할 일을 확인해보세요.',
      href: `/report/${startDate}/${weekIndex}`,
      channel_id: REPORT_CHANNEL,
      type: 'WEEKLY_REPORT',
    });
    return { outcome: 'generated', trial: isTrial, notified: true, muted: false, failed: false };
  } catch (error) {
    console.error(`리포트 알림 저장 실패 (${uid}, ${weekIndex}주차):`, error);
    return { outcome: 'generated', trial: isTrial, notified: false, muted: false, failed: true };
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

  // 리포트 알림을 끈 유저를 한 번에 읽는다. 못 읽으면 실행 실패 (08:30 재시도가 다시 만든다)
  const mutedUids =
    targets.length > 0 && deps.fetchReportReminderOffUids
      ? await deps.fetchReportReminderOffUids([...new Set(targets.map((t) => t.uid))])
      : new Set<string>();

  const result: GenerateResult = {
    today,
    candidates: targets.length,
    noAccess: 0,
    existing: 0,
    capped: 0,
    alignedAhead: 0,
    generated: 0,
    trial: 0,
    empty: 0,
    skipped: 0,
    notified: 0,
    muted: 0,
    failed: 0,
  };

  await forEachLimited(targets, CONCURRENCY, async ({ uid, startDate, weekIndex }) => {
    try {
      const { outcome, trial, notified, muted, failed } = await processUser(
        deps,
        uid,
        startDate,
        weekIndex,
        mutedUids.has(uid)
      );
      result[outcome] += 1;
      if (trial) result.trial += 1;
      if (notified) result.notified += 1;
      if (muted) result.muted += 1;
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
