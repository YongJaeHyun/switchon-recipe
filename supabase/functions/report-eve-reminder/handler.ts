// 리포트 전날 기록 알림 배치 본체. 외부 의존성(DB)은 deps로 받아 Vitest(node)에서 가짜로 테스트한다.
// URL import를 두지 않는다 (실제 연결은 index.ts).
// 매일 20:00 KST cron이 service role로 호출한다. 내일(KST) 08:00 generate-weekly-reports가 리포트를 만들 유저에게
// "내일 아침 N주차 리포트가 나와요" 알림을 넣어 오늘 기록을 남기게 한다 (기존 push 함수가 발송).
// 대상 = 내일 리포트 후보(weekly_report_candidates(내일), 내일 실행과 같은 SQL) 중
//   - 내일이 새 주차 1일차 (2·3일차는 보충 실행이라 제외)
//   - 같은 키의 리포트가 아직 없고, 표시 주차(resolveDisplayWeek) 1~MAX_REPORT_WEEK, 주차 맞추기로 건너뛸 기간이 아님
//     (_shared/weeklyReportGenerate.ts generateWeekReport와 같은 규칙)
//   - 패스 이용 권한이 있거나, 무료 1주차 리포트 대상 (표시 주차 1, user_trial.free_report_at 없음)
//   - 오늘 weight_log가 없고 푸시 토큰이 있음
// 내일 실행은 그 주 기록이 하나도 없으면 리포트를 만들지 않지만, 이 알림은 기록을 남기게 하려는 것이라 기록 여부를 보지 않는다.
// 한계: 20:00 뒤 08:00 전에 한 주 더 하기·주차 맞추기·다시 시작을 하면 내일 리포트 주차가 달라지거나 만들어지지 않을 수 있다.
// 같은 날 다시(또는 동시에) 실행해도 한 번만 보낸다: report_eve_reminder_sent(uid, day)에
// insert ... on conflict do nothing으로 자리를 잡고, 새로 잡힌 유저에게만 알림을 넣는다.

import { resolveToday } from '../_shared/kstToday.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';
import {
  alignedAheadOver,
  FREE_REPORT_WEEK,
  MAX_REPORT_WEEK,
  REPORT_CHANNEL,
  resolveDisplayWeek,
  sameProgramReports,
  type ReportPeriod,
} from '../_shared/weeklyReportGenerate.ts';

export const CHUNK_SIZE = 100;
export const CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EveReminderNotificationRow {
  uid: string;
  title: string;
  body: string;
  href: string;
  channel_id: string;
  type: 'REPORT_EVE_REMINDER';
}

export interface ReportEveReminderDeps {
  now(): Date;
  // weekly_report_candidates(day) 전부 (페이지 처리는 구현이). day = 내일
  fetchCandidates(day: string): Promise<{ uid: string; start_date: string | null }[]>;
  // uids(최대 CHUNK_SIZE) 중 day에 weight_log가 있는 유저
  fetchLoggedUids(uids: string[], day: string): Promise<Set<string>>;
  // uids 중 push_token이 있는 유저
  fetchPushableUids(uids: string[]): Promise<Set<string>>;
  // 유저 한 명의 리포트 키·표시 주차 전부, user.program_start (generate-weekly-reports와 같은 구현)
  fetchReportPeriods(uid: string): Promise<ReportPeriod[]>;
  fetchProgramStart(uid: string): Promise<string | null>;
  hasPremiumAccess(uid: string): Promise<boolean>;
  // uids 중 무료 1주차 리포트를 이미 쓴 유저 (user_trial.free_report_at not null)
  fetchFreeReportUsedUids(uids: string[]): Promise<Set<string>>;
  // report_eve_reminder_sent에 (uid, day)를 넣고(충돌 시 무시) 새로 들어간 유저만 돌려준다
  claimReminders(uids: string[], day: string): Promise<Set<string>>;
  insertNotifications(rows: EveReminderNotificationRow[]): Promise<void>;
}

export interface EveReminderResult {
  today: string;
  tomorrow: string;
  candidates: number; // 내일이 새 주차 1일차인 유저
  existing: number;
  capped: number;
  alignedAhead: number;
  noAccess: number;
  sent: number;
  failed: number;
}

const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

const addDays = (day: string, days: number) =>
  new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10);

// 내일(today + 1)이 startDate 기준 새 주차 1일차면 끝나는 주차(week_index), 아니면 null
export function eveReportWeekOf(startDate: string | null, today: string): number | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return null;
  const start = dayMs(startDate);
  if (Number.isNaN(start)) return null;
  const diff = Math.round((dayMs(today) + DAY_MS - start) / DAY_MS);
  if (diff < 7 || diff % 7 !== 0) return null;
  return diff / 7;
}

const notificationFor = (uid: string, week: number): EveReminderNotificationRow => ({
  uid,
  title: `내일 아침 ${week}주차 리포트가 나와요`,
  body: '오늘 체중과 할 일을 기록해 두면 더 정확하게 정리해 드려요',
  // 오늘 탭 (앱 utils/notificationHref.ts LEGACY_TAB_HREFS)
  href: '/home',
  channel_id: REPORT_CHANNEL,
  type: 'REPORT_EVE_REMINDER',
});

type Outcome = { week: number } | 'existing' | 'capped' | 'alignedAhead' | 'noAccess';

// 내일 08:00 실행의 generateWeekReport와 같은 순서로 판단한다 (권한 rpc는 마지막)
const evaluate = async (
  deps: ReportEveReminderDeps,
  uid: string,
  startDate: string,
  weekIndex: number,
  freeUsed: boolean
): Promise<Outcome> => {
  const reports = await deps.fetchReportPeriods(uid);
  if (reports.some((r) => r.start_date.slice(0, 10) === startDate && r.week_index === weekIndex)) {
    return 'existing';
  }
  const programStart = await deps.fetchProgramStart(uid);
  const program = sameProgramReports(reports, startDate, programStart);
  const { week } = resolveDisplayWeek({ startDate, weekIndex }, program);
  if (week > MAX_REPORT_WEEK) return 'capped';
  if (alignedAheadOver({ startDate, weekIndex }, week, program)) return 'alignedAhead';
  if (await deps.hasPremiumAccess(uid)) return { week };
  if (week === FREE_REPORT_WEEK && !freeUsed) return { week };
  return 'noAccess';
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

export async function sendReportEveReminders(
  deps: ReportEveReminderDeps,
  today: string
): Promise<EveReminderResult> {
  const tomorrow = addDays(today, 1);

  // 유저별 내일 1일차 리포트 키. 다시 시작 직전 회차 보충으로 한 유저가 두 키로 올 수 있다 (먼저 맞는 키로 1번)
  const keysByUid = new Map<string, { startDate: string; weekIndex: number }[]>();
  for (const row of await deps.fetchCandidates(tomorrow)) {
    const weekIndex = eveReportWeekOf(row.start_date, today);
    if (weekIndex === null || weekIndex > MAX_REPORT_WEEK || !row.start_date) continue;
    const keys = keysByUid.get(row.uid) ?? [];
    keys.push({ startDate: row.start_date.slice(0, 10), weekIndex });
    keysByUid.set(row.uid, keys);
  }
  const uids = [...keysByUid.keys()];

  const result: EveReminderResult = {
    today,
    tomorrow,
    candidates: uids.length,
    existing: 0,
    capped: 0,
    alignedAhead: 0,
    noAccess: 0,
    sent: 0,
    failed: 0,
  };

  for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
    const chunk = uids.slice(i, i + CHUNK_SIZE);
    const logged = await deps.fetchLoggedUids(chunk, today);
    let targets = chunk.filter((uid) => !logged.has(uid));
    if (targets.length === 0) continue;

    const pushable = await deps.fetchPushableUids(targets);
    targets = targets.filter((uid) => pushable.has(uid));
    if (targets.length === 0) continue;

    const freeUsed = await deps.fetchFreeReportUsedUids(targets);
    const weekByUid = new Map<string, number>();
    await forEachLimited(targets, CONCURRENCY, async (uid) => {
      try {
        let last: Outcome = 'noAccess';
        for (const { startDate, weekIndex } of keysByUid.get(uid) ?? []) {
          last = await evaluate(deps, uid, startDate, weekIndex, freeUsed.has(uid));
          if (typeof last === 'object') break;
        }
        if (typeof last === 'object') weekByUid.set(uid, last.week);
        else result[last] += 1;
      } catch (error) {
        console.error(`리포트 전날 알림 대상 확인 실패 (${uid}):`, error);
        result.failed += 1;
      }
    });
    targets = targets.filter((uid) => weekByUid.has(uid));
    if (targets.length === 0) continue;

    // 자리를 잡은 뒤 알림 저장이 실패하면 그날은 다시 보내지 않는다 (중복보다 누락을 택한다)
    const claimed = await deps.claimReminders(targets, today);
    targets = targets.filter((uid) => claimed.has(uid));
    if (targets.length === 0) continue;

    await deps.insertNotifications(targets.map((uid) => notificationFor(uid, weekByUid.get(uid)!)));
    result.sent += targets.length;
  }
  return result;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function handleReportEveReminder(
  req: Request,
  deps: ReportEveReminderDeps
): Promise<Response> {
  try {
    // ?today= 지정도 service role 확인을 통과한 뒤에만 읽는다
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }
    const today = resolveToday(req, deps.now());
    if (!today) return json({ error: 'today는 yyyy-MM-dd 형식이어야 합니다' }, 400);
    return json(await sendReportEveReminders(deps, today), 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('리포트 전날 알림 발송 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
}
