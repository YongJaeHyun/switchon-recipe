// 리포트 직접 만들기·다시 만들기(서버 generate-my-report)용 순수 함수. 앱 표시는 참고이고 서버가 최종 판단한다.
import type { WeeklyReport } from 'types/report';
import { toWeeklyReport } from './reportDisplay';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 서버 MAX_REPORT_WEEK(유지기 1주차까지), OVERLAP_MIN_DAYS(같은 주로 볼 겹친 날 수)와 같다
const MAX_REPORT_WEEK = 5;
const OVERLAP_MIN_DAYS = 4;
// 끝난 주 리포트는 다음 날 08:00 KST에 cron이 만든다. 그 전엔 빈 칸으로 보이지 않게 (여유 1시간)
const CRON_READY_HOUR_KST = 9;

type ReportKey = { start_date: string; week_index: number };
export type WeekRange = { from: string; to: string };

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const rangeOf = (startDate: string, weekIndex: number): WeekRange => {
  const from = dayMs(startDate) + (weekIndex - 1) * 7 * DAY_MS;
  return { from: dayOf(from), to: dayOf(from + 6 * DAY_MS) };
};
const overlap = (a: WeekRange, b: WeekRange) =>
  Math.max(
    0,
    Math.round(
      (Math.min(dayMs(a.to), dayMs(b.to)) - Math.max(dayMs(a.from), dayMs(b.from))) / DAY_MS
    ) + 1
  );

// 기록 탭 리포트 목록의 빈 칸: 지금 시작일 기준 오늘(KST) 전에 끝난 1~5주차 중 리포트가 없는 주 (최근 먼저).
// 키가 달라도 기간이 4일 이상 겹치는 리포트가 있으면 있는 것으로 본다 (서버 직접 만들기·패스 구매 뒤 보충과 같은 규칙).
// 방금 끝난 주는 그날 09:00 KST 전엔 뺀다 (08:00 cron이 곧 만든다)
export function missingReportWeeks(
  startDate: string | null,
  reports: ReportKey[],
  now: Date
): { weekIndex: number; range: WeekRange }[] {
  const start = startDate?.slice(0, 10);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(dayMs(start))) return [];
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const today = kst.toISOString().slice(0, 10);
  const beforeCron = kst.getUTCHours() < CRON_READY_HOUR_KST;
  const completed = Math.floor(Math.round((dayMs(today) - dayMs(start)) / DAY_MS) / 7);
  const periods = reports.map((r) => rangeOf(r.start_date.slice(0, 10), r.week_index));

  const weeks: { weekIndex: number; range: WeekRange }[] = [];
  for (let weekIndex = Math.min(completed, MAX_REPORT_WEEK); weekIndex >= 1; weekIndex--) {
    const range = rangeOf(start, weekIndex);
    if (beforeCron && dayMs(range.to) + DAY_MS === dayMs(today)) continue;
    if (periods.some((p) => overlap(range, p) >= OVERLAP_MIN_DAYS)) continue;
    weeks.push({ weekIndex, range });
  }
  return weeks;
}

// 그 주에 기록(체중, 체크한 할 일)이 있는 날이 있는지. recordDays = 기록이 있는 날 (yyyy-MM-dd)
export function weekHasRecords(range: WeekRange, recordDays: string[]): boolean {
  return recordDays.some((day) => day >= range.from && day <= range.to);
}

export type GenerateMyReportOutcome =
  | { status: 'ok'; report: WeeklyReport }
  | {
      status:
        | 'no_records'
        | 'pass_required'
        | 'daily_limit'
        | 'regenerated_today'
        | 'not_changed'
        | 'not_available'
        | 'error';
    };

export const ON_DEMAND_MESSAGES: Record<
  Exclude<GenerateMyReportOutcome['status'], 'ok'>,
  string
> = {
  no_records: '그 주 체중이나 할 일을 기록하면 만들 수 있어요',
  pass_required: '스위치온 패스로 리포트를 직접 만들 수 있어요',
  daily_limit: '오늘은 더 만들 수 없어요. 내일 다시 시도해 주세요',
  regenerated_today: '다시 만들기는 리포트마다 하루에 한 번 할 수 있어요',
  not_changed: '리포트를 만든 뒤 바뀐 기록이 없어요',
  not_available: '이 주는 리포트를 만들 수 없어요',
  error: '리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요',
};

// generate-my-report 응답 해석 (create·regenerate)
export function interpretGenerateMyReport(status: number, data: unknown): GenerateMyReportOutcome {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (status === 200) {
    const report = body.report;
    return report && typeof report === 'object'
      ? { status: 'ok', report: toWeeklyReport(report as Parameters<typeof toWeeklyReport>[0]) }
      : { status: 'error' };
  }
  switch (body.error) {
    case 'no_records':
      return { status: 'no_records' };
    case 'pass_required':
      return { status: 'pass_required' };
    case 'daily_limit':
      return { status: 'daily_limit' };
    case 'already_regenerated_today':
      return { status: 'regenerated_today' };
    case 'not_changed':
      return { status: 'not_changed' };
    case 'not_available':
    case 'not_found':
      return { status: 'not_available' };
    default:
      return { status: 'error' };
  }
}

// 기록 탭 빈 칸 제목. noRecords = 그 주 기록이 없다는 걸 알 때 (앱이 읽은 기록, 또는 서버 no_records)
export function missingReportTitle(noRecords: boolean): string {
  return noRecords ? '기록이 없어서 아직 리포트가 없어요' : '이 주 리포트가 아직 없어요';
}

// 오늘(KST) 날짜 (yyyy-MM-dd)
export const kstDayOf = (now: Date): string =>
  new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 하루 상한(서버 daily_limit, 직접 만들기·다시 만들기 합쳐 KST 하루 5번)에 걸린 날이 오늘인지. 오늘이면 버튼을 막는다
export function isOnDemandLimitedToday(limitedDay: string | null, now: Date): boolean {
  return !!limitedDay && limitedDay === kstDayOf(now);
}
