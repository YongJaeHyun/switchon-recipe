import colors from 'tailwindcss/colors';
import { getWeekColorHex } from './getWeekColor';
import { programStartOf } from './programStart';

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 300;

export interface WeightPoint {
  day: string; // yyyy-MM-dd (KST 날짜)
  weight_kg: number;
}

interface PeriodOptions {
  // true면 회차 시작일 이전 기록도 포함한다 ([전체 기간 보기])
  allPeriod?: boolean;
  // user.program_start. 기간은 회차 시작일(programStartOf)부터 본다: 한 주 더 하기·주차 맞추기로
  // start_date가 미뤄져도 같은 회차의 앞 주차 기록을 빼지 않는다. 없으면 start_date부터
  programStart?: string | null;
  // 실제로 지낸 주차 기록 (weekOfLog). 없으면 시작일·회차 시작일로만 센다
  lived?: LivedWeeks;
}

// 어떤 7일을 몇 주차로 지냈는지의 기록. start_date = 그때 시작일, from = 그 주 첫날, week = 지낸 주차,
// at = 기록 시각(ms, 겹치면 늦은 쪽이 이긴다)
export interface LivedPeriod {
  start_date: string;
  from: string;
  week: number;
  at: number;
}

export interface LivedWeeks {
  periods: LivedPeriod[];
  today: string; // KST yyyy-MM-dd. 이번 주는 언제나 지금 시작일로 센다
}

// 회차 시작일 이전 기록(이전 차수) 점 색
const BEFORE_START_COLOR = colors.neutral[400];
const DAY_MS = 24 * 60 * 60 * 1000;

// 소수 한 자리 반올림. 'e' 표기로 올려 부동소수 오차(65.05*10=650.4999…)를 피한다
export const round1 = (n: number) => Math.round(Number(`${n}e1`)) / 10;

// yyyy-MM-dd → UTC 자정 시각(ms). 날짜끼리만 비교하므로 시간대와 무관하다
const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const utcToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// 입력 문자열 → kg(소수 한 자리). 숫자가 아니거나 20.0~300.0 밖이면 null
export function parseWeightInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = round1(Number(normalized));
  if (!Number.isFinite(value) || value < MIN_WEIGHT_KG || value > MAX_WEIGHT_KG) return null;
  return value;
}

// day 기준 n일 뒤(음수면 앞) 날짜
export function shiftDay(day: string, n: number): string {
  return utcToDay(dayToUtc(day) + n * DAY_MS);
}

// 시작일 기준 주차 (시작일 = 1주차, 8일째 = 2주차). 시작일 이전은 0 이하
export function weekOfDay(day: string, startDate: string): number {
  const diffDays = Math.round((dayToUtc(day) - dayToUtc(startDate)) / DAY_MS);
  return Math.floor(diffDays / 7) + 1;
}

// 실제로 지낸 주차 기록: 단식 계획 행 (start_date, week_index) = 그 시작일의 그 주차를 지냄 (앱은 지금 시작일의
// 계획만 만들고 고친다), 주간 리포트 = 그 기간을 display_week주차로 지냄 (서버가 정한 실제 주차, 없으면 week_index).
// 시각: 계획은 생성·수정 중 늦은 쪽, 리포트는 생성 시각. 시각이 없으면 0 (가장 약함)
export function livedPeriodsOf(input: {
  plans?: {
    start_date: string;
    week_index: number;
    created_at?: string | null;
    updated_at?: string | null;
  }[];
  reports?: {
    start_date: string;
    week_index: number;
    display_week?: number | null;
    created_at?: string | null;
  }[];
}): LivedPeriod[] {
  const ms = (...isos: (string | null | undefined)[]) =>
    Math.max(0, ...isos.map((iso) => (iso ? Date.parse(iso) : NaN)).filter(Number.isFinite));
  const period = (start: string, weekIndex: number, week: number, at: number): LivedPeriod => ({
    start_date: start.slice(0, 10),
    from: shiftDay(start.slice(0, 10), 7 * (weekIndex - 1)),
    week,
    at,
  });
  return [
    ...(input.plans ?? []).map((p) =>
      period(p.start_date, p.week_index, p.week_index, ms(p.created_at, p.updated_at))
    ),
    ...(input.reports ?? []).map((r) =>
      period(
        r.start_date,
        r.week_index,
        typeof r.display_week === 'number' ? r.display_week : r.week_index,
        ms(r.created_at)
      )
    ),
  ];
}

// 기록 날짜의 주차 = 그날 실제로 지낸 주차.
// - 회차 시작일 전: 0 이하 (시작 전)
// - 이번 주(지금 시작일 기준 오늘이 든 주) 이후: 지금 시작일 기준
// - 그 앞: 지금 회차의 기록(lived, 회차 시작일 이후 시작일)이 그날을 덮으면 가장 늦은 기록의 주차.
//   한 주 더 하기 뒤 앞 시작일로 지낸 2주차가 "1주차"로 두 번 나오지 않게 한다
// - 기록이 없으면 지금 시작일 뒤는 시작일 기준, 회차 시작일 ~ 시작일 전은 회차 시작일 기준.
//   한계: 단식 계획도 리포트도 없는 주는 지금 시작일로 센다 (지난 시작일 변경 이력은 따로 저장하지 않는다)
export function weekOfLog(
  day: string,
  startDate: string,
  programStart: string | null | undefined,
  lived?: LivedWeeks
): number {
  const d = day.slice(0, 10);
  const start = startDate.slice(0, 10);
  const program = programStartOf(programStart, start) ?? start;
  if (d < program) return weekOfDay(d, program);

  if (lived) {
    const elapsed = weekOfDay(lived.today, start);
    const thisWeekFrom = elapsed >= 1 ? shiftDay(start, 7 * (elapsed - 1)) : start;
    if (d < thisWeekFrom) {
      const covering = lived.periods
        .filter((p) => p.start_date >= program && p.from <= d && d < shiftDay(p.from, 7))
        .sort((a, b) => b.at - a.at);
      if (covering.length > 0) return covering[0].week;
    }
  }

  if (d >= start) return weekOfDay(d, start);
  return weekOfDay(d, program);
}

// 기간 필터 + 날짜순 정렬. 기간 = 회차 시작일부터 (allPeriod면 전체)
export function weightsInPeriod<T extends WeightPoint>(
  logs: T[],
  startDate: string | null,
  opts?: PeriodOptions
): T[] {
  const start = programStartOf(opts?.programStart, startDate);
  return logs
    .filter((log) => opts?.allPeriod || !start || log.day >= start)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// 기간 안 첫 기록 대비 마지막 기록 변화량. 기록이 없으면 null
export function weightChange(
  logs: WeightPoint[],
  startDate: string | null,
  opts?: PeriodOptions
): { first: number; last: number; diff: number } | null {
  const inPeriod = weightsInPeriod(logs, startDate, opts);
  if (inPeriod.length === 0) return null;
  const first = Number(inPeriod[0].weight_kg);
  const last = Number(inPeriod[inPeriod.length - 1].weight_kg);
  return { first, last, diff: round1(last - first) };
}

// 그래프 점. 색은 주차 색(weekOfLog), 회차 시작일 이전은 회색
export function chartPoints(
  logs: WeightPoint[],
  startDate: string | null,
  opts?: PeriodOptions
): { value: number; label: string; dataPointColor: string }[] {
  return weightsInPeriod(logs, startDate, opts).map((log) => {
    const [, m, d] = log.day.slice(0, 10).split('-').map(Number);
    const week = startDate ? weekOfLog(log.day, startDate, opts?.programStart, opts?.lived) : 1;
    return {
      value: Number(log.weight_kg),
      label: `${m}/${d}`,
      dataPointColor: week >= 1 ? getWeekColorHex(week) : BEFORE_START_COLOR,
    };
  });
}

// 변화량 표시: +0.2kg / -1.5kg / 0.0kg
export function formatWeightDiff(diff: number): string {
  const value = round1(diff);
  if (value === 0) return '0.0kg';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}kg`;
}

// 입력 시트에 미리 채울 값: 그날 값, 없으면 전날 값, 둘 다 없으면 null
export function prefillWeight(logs: WeightPoint[], day: string): number | null {
  const byDay = (d: string) => logs.find((log) => log.day === d)?.weight_kg;
  return byDay(day) ?? byDay(shiftDay(day, -1)) ?? null;
}

// 체중 저장 직후 아침 알림을 받을지 물을지. 처음 기록한 직후(저장 전 기록 없음)이고,
// 설정을 제대로 불러왔고(행 없음 = null) 아직 묻지 않았을 때만.
// 조회가 실패하면 묻지 않는다 (다른 기기에서 이미 답했을 수 있다). 기록 목록을 모르면(undefined) 묻지 않는다
export function shouldAskWeightReminder(q: {
  isFetched: boolean;
  isError: boolean;
  setting: { weight_reminder_asked: boolean } | null | undefined;
  hadLogsBefore: boolean | undefined;
}): boolean {
  return (
    q.hadLogsBefore === false &&
    q.isFetched &&
    !q.isError &&
    q.setting !== undefined &&
    !q.setting?.weight_reminder_asked
  );
}

// 그래프 포인터 라벨에 보일 체중. gifted-charts는 yAxisOffset을 쓰면 값에서 offset을 뺀 항목을
// 넘겨주므로(getSanitisedData → adjustToOffset), 그 값 대신 포인터 위치(index)의 원래 값을 쓴다
export function pointerWeight(
  points: { value: number }[],
  index: number | undefined
): number | null {
  if (index === undefined || !Number.isInteger(index) || index < 0) return null;
  return points[index]?.value ?? null;
}
