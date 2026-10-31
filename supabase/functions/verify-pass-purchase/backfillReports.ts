// 패스를 사면 지금 회차의 이미 끝난 주 중 리포트가 없는 주를 만들어 준다 (운영자 결정 2026-10-31).
// 1주차에 무료로 지내고 2주차에 사면 cron이 권한 없음으로 건너뛴 1주차 리포트가 생긴다.
// - 한 주 만들기는 cron과 같은 _shared/weeklyReportGenerate.ts (표시 주차, 유지기 1주차까지(MAX_REPORT_WEEK),
//   주차 맞추기로 건너뛴 기간(alignedAheadOver), 같은 회차(sameProgramReports), 기록 없는 주는 만들지 않음).
// - 대상: 지금 시작일(user.start_date) 기준 1주차부터 오늘 전에 끝난 주까지, 키가 MAX_REPORT_WEEK 이하인 주.
//   오래된 주부터 차례로 만든다 (앞 주 리포트가 있어야 다음 주 표시 주차가 이어진다). 한 번에 최대 4개.
//   다시 시작 전 회차의 주와, 한 주 더 하기·주차 미루기 전의 옛 시작일 키로 지낸 주는 보지 않는다.
// - 푸시는 묶어서 한 번 ("지난 1~3주차 리포트도 만들어 뒀어요"). 문장까지 만든 리포트(ready)가 없으면 보내지 않는다.
// - 멱등: 같은 키의 리포트가 있으면 AI 전에 건너뛰고 저장은 키 충돌 시 무시하므로, 검증 재시도·cron과 겹쳐도
//   리포트가 늘지 않는다. 푸시는 이 실행이 실제로 저장한 주만 말한다.
// - 반복 악용 막기 (최종 리뷰 #3 I-1: 시작일을 바꿔 가며 옛 토큰으로 검증을 반복하면 키가 매번 새로워 Gemini가 계속
//   불렸다). 마이그레이션 없이 세 겹으로 막는다:
//   1. 기간이 이 유저의 아무 리포트와 OVERLAP_MIN_DAYS 이상 겹치는 주는 건너뛴다 (키가 달라도 이미 리포트가 있는 주).
//      cron은 이 규칙을 쓰지 않는다 (겹치면 표시 주차를 이어받아 만든다, weeklyReportGenerate.ts)
//   2. 이 유저가 최근 24시간에 만든 리포트(weekly_report.created_at, cron 포함)가 BACKFILL_DAILY_LIMIT개면 하지 않고,
//      모자라면 남은 만큼만 만든다. 개수를 못 읽으면 하지 않는다
//   3. 이미 처리된 토큰의 재검증은 구매 24시간 안에만 보충한다 (handler.ts BACKFILL_RETRY_WINDOW_MS)
// - 검증 응답을 기다리게 하거나 실패시키지 않는다: startReportBackfill이 백그라운드(EdgeRuntime.waitUntil)로
//   돌리고, 전체 제한 시간을 두며, 오류는 로그만 남기고 던지지 않는다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

import { kstToday } from '../_shared/kstToday.ts';
import { withTimeout } from '../_shared/providerAlert.ts';
import {
  generateWeekReport,
  MAX_REPORT_WEEK,
  OVERLAP_MIN_DAYS,
  REPORT_CHANNEL,
  type NotificationRow,
  type ReportGenerationDeps,
  type ReportPeriod,
} from '../_shared/weeklyReportGenerate.ts';
import { overlapDays, weekRange } from '../_shared/weeklyStats.ts';

export const BACKFILL_MAX_REPORTS = 4;
// 한 유저가 최근 24시간에 만든 리포트(cron 포함)가 이만큼이면 보충하지 않는다. 무료로 지내다 산 유저는 cron이
// 권한 없음으로 건너뛰어 최근 리포트가 없으므로 첫 보충은 BACKFILL_MAX_REPORTS개를 다 만든다
export const BACKFILL_DAILY_LIMIT = BACKFILL_MAX_REPORTS;
// 전체 제한 (Edge Function 백그라운드 작업 한도 150초 안). 리포트 하나에 Gemini 최대 30초
export const BACKFILL_TIMEOUT_MS = 120_000;
// 시작 뒤 이 시간이 지나면 다음 주를 시작하지 않고 만든 주만 푸시한다 (전체 제한에 걸려 푸시를 놓치지 않게)
export const BACKFILL_SOFT_DEADLINE_MS = 80_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackfillDeps extends ReportGenerationDeps {
  // user.start_date (yyyy-MM-dd). 없으면 null
  fetchStartDate(uid: string): Promise<string | null>;
  insertNotification(row: NotificationRow): Promise<void>;
  // 이 유저의 weekly_report 중 created_at >= since 인 행 수
  countReportsCreatedSince(uid: string, since: Date): Promise<number>;
}

export interface BackfillResult {
  created: number[]; // 새로 저장한 리포트의 키 주차(week_index), 오래된 순 (기록 없는 주는 저장하지 않는다)
  notified: boolean;
  failed: number;
}

const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

// 오늘 전에 끝난 주차 수 (시작 전·1주차 중이면 0)
const completedWeeks = (startDate: string, today: string) => {
  const diff = Math.round((dayMs(today) - dayMs(startDate)) / DAY_MS);
  return Number.isNaN(diff) || diff < 7 ? 0 : Math.floor(diff / 7);
};

// [1] → "1", [1,2,3] → "1~3", [1,3] → "1·3"
const weekLabel = (weeks: number[]) => {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const consecutive = sorted.every((w, i) => i === 0 || w === sorted[i - 1] + 1);
  if (sorted.length === 1) return `${sorted[0]}`;
  return consecutive ? `${sorted[0]}~${sorted[sorted.length - 1]}` : sorted.join('·');
};

export async function backfillPastReports(
  deps: BackfillDeps,
  uid: string,
  options: { deadline?: number; clock?: () => number } = {}
): Promise<BackfillResult> {
  const clock = options.clock ?? Date.now;
  const result: BackfillResult = { created: [], notified: false, failed: 0 };
  // 푸시 문구·링크용: 문장까지 만든 리포트
  const ready: { weekIndex: number; displayWeek: number }[] = [];

  let startDate: string | null;
  try {
    startDate = (await deps.fetchStartDate(uid))?.slice(0, 10) ?? null;
  } catch (error) {
    console.error(`지난 주 리포트 보충: 시작일 조회 실패 (${uid}):`, error);
    result.failed += 1;
    return result;
  }
  if (!startDate) return result;

  let budget: number;
  let periods: ReportPeriod[];
  try {
    const recent = await deps.countReportsCreatedSince(
      uid,
      new Date(deps.now().getTime() - DAY_MS)
    );
    budget = Math.min(BACKFILL_MAX_REPORTS, BACKFILL_DAILY_LIMIT - recent);
    if (budget <= 0) return result;
    periods = await deps.fetchReportPeriods(uid);
  } catch (error) {
    console.error(`지난 주 리포트 보충: 최근 리포트 조회 실패 (${uid}):`, error);
    result.failed += 1;
    return result;
  }
  // 키가 달라도 기간이 이미 있는 리포트와 같은 주로 볼 만큼 겹치면 만들지 않는다
  const covered = (weekIndex: number) =>
    periods.some(
      (r) =>
        overlapDays(
          weekRange(startDate, weekIndex),
          weekRange(r.start_date.slice(0, 10), r.week_index)
        ) >= OVERLAP_MIN_DAYS
    );

  const lastWeek = Math.min(completedWeeks(startDate, kstToday(deps.now())), MAX_REPORT_WEEK);
  for (let weekIndex = 1; weekIndex <= lastWeek; weekIndex++) {
    if (result.created.length >= budget) break;
    if (options.deadline !== undefined && clock() >= options.deadline) break;
    if (covered(weekIndex)) continue;
    try {
      const { outcome, displayWeek } = await generateWeekReport(deps, uid, startDate, weekIndex);
      if (outcome === 'generated') result.created.push(weekIndex);
      if (outcome === 'generated' && displayWeek !== undefined) {
        ready.push({ weekIndex, displayWeek });
      }
    } catch (error) {
      console.error(`지난 주 리포트 보충 실패 (${uid}, ${weekIndex}주차):`, error);
      result.failed += 1;
    }
  }

  if (ready.length === 0) return result;
  try {
    await deps.insertNotification({
      uid,
      title: `지난 ${weekLabel(ready.map((r) => r.displayWeek))}주차 리포트도 만들어 뒀어요`,
      body: '그동안의 기록을 주차별로 정리했어요. 잘한 점과 다음 주 할 일을 확인해보세요.',
      // 하나면 그 리포트, 여럿이면 리포트 목록 (/report → 기록 탭 리포트 칸)
      href: ready.length === 1 ? `/report/${startDate}/${ready[0].weekIndex}` : '/report',
      channel_id: REPORT_CHANNEL,
      type: 'WEEKLY_REPORT',
    });
    result.notified = true;
  } catch (error) {
    console.error(`지난 주 리포트 보충 알림 저장 실패 (${uid}):`, error);
    result.failed += 1;
  }
  return result;
}

type Schedule = (task: Promise<unknown>) => void;

// 응답을 돌려준 뒤에도 끝까지 돌게 한다 (Supabase Edge Runtime의 waitUntil). 없으면 그냥 둔다
const waitUntilOrDetach: Schedule = (task) => {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  try {
    runtime?.waitUntil(task);
  } catch {
    // 요청 밖(waitUntil 불가)이면 그냥 백그라운드로 둔다
  }
};

// 보충을 백그라운드로 시작하고 바로 돌아온다. 넘긴 작업은 거절되지 않는다 (오류·시간 초과는 로그)
export function startReportBackfill(
  deps: BackfillDeps,
  uid: string,
  {
    schedule = waitUntilOrDetach,
    timeoutMs = BACKFILL_TIMEOUT_MS,
    softDeadlineMs = BACKFILL_SOFT_DEADLINE_MS,
  }: { schedule?: Schedule; timeoutMs?: number; softDeadlineMs?: number } = {}
): void {
  const task = withTimeout(
    backfillPastReports(deps, uid, { deadline: Date.now() + softDeadlineMs }),
    timeoutMs
  )
    .then((result) => {
      if (result.created.length > 0 || result.failed > 0) {
        console.log(`지난 주 리포트 보충 (${uid}):`, JSON.stringify(result));
      }
    })
    .catch((error) => console.error(`지난 주 리포트 보충 중단 (${uid}):`, error));
  schedule(task);
}
