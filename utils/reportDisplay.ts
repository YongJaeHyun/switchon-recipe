// 주간 리포트 화면용 순수 함수. 화면 컴포넌트는 이 결과를 보여주기만 한다
import type { PassStatus } from 'types/pass';
import type {
  ReportContent,
  ReportMeal,
  ReportStatus,
  WeeklyReport,
  WeeklyStats,
} from 'types/report';
import { isPassOnSale } from './passScreen';

// 소수 한 자리 반올림. 'e' 표기로 올려 부동소수 오차를 피한다
const round1 = (n: number) => Math.round(Number(`${n}e1`)) / 10;

// 체중 변화: -1.2 → "1.2kg 감량", 0.4 → "0.4kg 증가", 0 → "변화 없음", null → "-"
export function formatWeightDiff(diff: number | null): string {
  if (diff === null || !Number.isFinite(diff)) return '-';
  const value = round1(diff);
  if (value === 0) return '변화 없음';
  return `${Math.abs(value).toFixed(1)}kg ${value < 0 ? '감량' : '증가'}`;
}

// 할 일 항목별 완료: "아침 쉐이크 7/7"
export function formatItemRate(i: { name: string; done: number; appeared: number }): string {
  return `${i.name} ${i.done}/${i.appeared}`;
}

// "10월 1일 ~ 10월 7일"
export function formatReportRange(range: { from: string; to: string }): string {
  const label = (day: string) => {
    const [, m, d] = day.split('-').map(Number);
    return `${m}월 ${d}일`;
  };
  return `${label(range.from)} ~ ${label(range.to)}`;
}

// "2026년 10월 1일 시작"
export function formatProgramStart(startDate: string): string {
  const [y, m, d] = startDate.slice(0, 10).split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 시작`;
}

type ReportKey = { start_date: string; week_index: number };

const byWeekDesc = <T extends ReportKey>(a: T, b: T) => b.week_index - a.week_index;

// 지금 시작일의 리포트(current)와 예전 시작일 리포트(previous, 시작일별 묶음)로 나눈다.
// 시작일을 바꿔도 예전 리포트는 지우지 않고 "이전 프로그램"으로 보여준다. 최신이 먼저
export function groupReportsByProgram<T extends ReportKey>(
  reports: T[],
  currentStartDate: string | null
): { current: T[]; previous: { startDate: string; reports: T[] }[] } {
  const current = currentStartDate ? currentStartDate.slice(0, 10) : null;
  const groups = new Map<string, T[]>();
  const currentReports: T[] = [];

  for (const report of reports) {
    if (report.start_date === current) {
      currentReports.push(report);
      continue;
    }
    const list = groups.get(report.start_date) ?? [];
    list.push(report);
    groups.set(report.start_date, list);
  }

  const previous = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([startDate, list]) => ({ startDate, reports: list.sort(byWeekDesc) }));

  return { current: currentReports.sort(byWeekDesc), previous };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const numOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const MEALS: ReportMeal[] = ['breakfast', 'lunch', 'dinner'];

// DB content(jsonb) → ReportContent. 객체가 아니면 null, 빠진 칸은 빈 문자열 (예전/깨진 행 대비)
export function parseReportContent(value: unknown): ReportContent | null {
  if (!isObject(value)) return null;
  const meal = isObject(value.actionLink) ? value.actionLink.meal : null;
  return {
    summary: str(value.summary),
    good: str(value.good),
    improve: str(value.improve),
    action: str(value.action),
    actionLink: MEALS.includes(meal as ReportMeal) ? { meal: meal as ReportMeal } : null,
    weightNote: str(value.weightNote),
    nextWeek: str(value.nextWeek),
  };
}

const parseDayRate = (value: unknown) =>
  isObject(value) && typeof value.day === 'string'
    ? { day: value.day, weekday: str(value.weekday), rate: num(value.rate) }
    : null;

// DB stats(jsonb) → WeeklyStats. 객체가 아니거나 기간이 없으면 null, 빠진 숫자는 0/null
export function parseReportStats(value: unknown): WeeklyStats | null {
  if (!isObject(value) || !isObject(value.range)) return null;
  const { from, to } = value.range;
  if (typeof from !== 'string' || typeof to !== 'string') return null;

  const weight = isObject(value.weight) ? value.weight : {};
  const todo = isObject(value.todo) ? value.todo : {};
  const fasting = isObject(value.fasting) ? value.fasting : {};
  const recipes = isObject(value.recipes) ? value.recipes : {};
  const foodChecks = isObject(value.foodChecks) ? value.foodChecks : {};
  const items = Array.isArray(todo.items) ? todo.items : [];
  const weekdays = Array.isArray(fasting.successWeekdays) ? fasting.successWeekdays : [];

  return {
    weekIndex: num(value.weekIndex),
    range: { from, to },
    weight: {
      start: numOrNull(weight.start),
      end: numOrNull(weight.end),
      diff: numOrNull(weight.diff),
      daysLogged: num(weight.daysLogged),
      totalDiff: numOrNull(weight.totalDiff),
    },
    todo: {
      avgRate: numOrNull(todo.avgRate),
      best: parseDayRate(todo.best),
      worst: parseDayRate(todo.worst),
      items: items
        .filter(isObject)
        .filter((item) => typeof item.name === 'string')
        .map((item) => ({
          name: str(item.name),
          done: num(item.done),
          appeared: num(item.appeared),
        })),
    },
    fasting: {
      planned: num(fasting.planned),
      success: num(fasting.success),
      broken: num(fasting.broken),
      successWeekdays: weekdays.filter((d): d is string => typeof d === 'string'),
    },
    recipes: { total: num(recipes.total), low: num(recipes.low), zero: num(recipes.zero) },
    foodChecks: { total: num(foodChecks.total), avoid: num(foodChecks.avoid) },
    isEmpty: value.isEmpty === true,
  };
}

// DB 행 → 화면용 리포트. status가 이상하면 내용 유무로 정한다
export function toWeeklyReport(row: {
  start_date: string;
  week_index: number;
  status: string;
  stats: unknown;
  content: unknown;
  created_at: string;
}): WeeklyReport {
  const content = parseReportContent(row.content);
  const status: ReportStatus =
    row.status === 'empty' || row.status === 'ready' ? row.status : content ? 'ready' : 'empty';
  return {
    start_date: row.start_date,
    week_index: row.week_index,
    status,
    stats: parseReportStats(row.stats),
    content,
    created_at: row.created_at,
  };
}

// "이번 주는 기록이 없어요"를 보일지: 빈 주이거나, 보여줄 문장도 숫자도 없는 깨진 행
export function isEmptyReport(report: Pick<WeeklyReport, 'status' | 'stats' | 'content'>): boolean {
  return report.status === 'empty' || (!report.content && !report.stats);
}

// 무료 유저 미리보기 카드("이번 주 리포트를 받아보세요")를 보일지.
// 권한이 없고 패스를 살 수 있을 때만. 상태를 아직 모르거나 판매하지 않으면 숨긴다
export function shouldShowReportPreview(
  status: PassStatus | undefined,
  billingAvailable: boolean | undefined
): boolean {
  return !!status && !status.hasAccess && isPassOnSale(status.sales, billingAvailable);
}
