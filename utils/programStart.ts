import { shouldOpenWeekPopup } from './weekPopup';

// 시작일이 오늘(KST)보다 뒤인 "시작 전" 상태를 다루는 순수 함수들.
// 날짜는 모두 yyyy-MM-dd (KST 날짜). 뒤에 시각이 붙어 있어도 날짜만 본다

const DAY_MS = 24 * 60 * 60 * 1000;

// 주차 팝업 store에 남기는 "시작 전" 일차. 시작일(1일)이 되면 일차가 바뀌어 할 일이 초기화된다
export const BEFORE_START_DAY = 0;

const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

// 시작까지 남은 날. 0 = 오늘 시작, 양수 = 시작 전, 음수 = 이미 시작(지난 날 수). 시작일이 없으면 0
export function daysUntilStart(startDate: string | null | undefined, todayKst: string): number {
  if (!startDate) return 0;
  return Math.round((dayToUtc(startDate) - dayToUtc(todayKst)) / DAY_MS);
}

export function isBeforeStart(startDate: string | null | undefined, todayKst: string): boolean {
  return daysUntilStart(startDate, todayKst) > 0;
}

// 오늘의 주차·일차. 시작 전이면 0·음수 대신 1주차 1일(내용은 1주차 기준)이고 beforeStart로 따로 알린다
export function programWeekAndDay(
  startDate: string | null | undefined,
  todayKst: string
): { week: number; day: number; beforeStart: boolean; daysUntilStart: number } {
  const until = daysUntilStart(startDate, todayKst);
  if (until > 0) return { week: 1, day: 1, beforeStart: true, daysUntilStart: until };
  const elapsed = -until;
  return {
    week: Math.floor(elapsed / 7) + 1,
    day: (elapsed % 7) + 1,
    beforeStart: false,
    daysUntilStart: until,
  };
}

// 앱을 열 때·날이 바뀔 때(useKoreanToday) 주차 팝업 store를 어떻게 맞출지.
// weekChanged → setWeek, dayChanged → setDay. 시작 전에는 팝업을 열지 않고 일차를 BEFORE_START_DAY로 둔다.
// - resetFasting: 주차가 바뀌면 언제나 (시작 전으로 다시 시작해 주차가 1로 내려갈 때도 지난 단식 계획을 지운다.
//   시작일에는 주차가 바뀌지 않으므로 여기서 지워야 한다)
// - resetTodos: 일차나 주차가 바뀌면 (한 주 더 하기로 같은 날 주차만 줄어도 목록이 바뀌므로). 시작 전에는 하지 않고
//   시작일 0 → 1일 전환 때 초기화한다
export function todayRevalidation(input: {
  week: number;
  day: number;
  beforeStart: boolean;
  prevWeek: number;
  prevDay: number;
  isChecked: boolean;
}): {
  week: number;
  day: number;
  weekChanged: boolean;
  dayChanged: boolean;
  resetFasting: boolean;
  resetTodos: boolean;
  closePopup: boolean;
  openPopup: boolean;
} {
  const { beforeStart, prevWeek, prevDay, isChecked } = input;
  const week = beforeStart ? 1 : input.week;
  const day = beforeStart ? BEFORE_START_DAY : input.day;
  const weekChanged = week !== prevWeek;
  const dayChanged = day !== prevDay;
  return {
    week,
    day,
    weekChanged,
    dayChanged,
    resetFasting: weekChanged,
    resetTodos: (dayChanged || weekChanged) && !beforeStart,
    // 시작일을 뒤로 미뤄 주차가 줄었으면 그 주차 팝업은 이미 본 것으로 둔다
    closePopup: weekChanged && week < prevWeek,
    openPopup: !beforeStart && shouldOpenWeekPopup({ prevWeek, week, isChecked }),
  };
}

// 시작 전 카드 제목 (daysUntilStart ≥ 1)
export function startCountdownLabel(daysUntil: number): string {
  return daysUntil === 1 ? '내일부터 1주차가 시작돼요' : `${daysUntil}일 뒤 1주차가 시작돼요`;
}

// yyyy-MM-dd 날짜에 n일을 더한 날짜 (온보딩 "내일부터 시작")
export function addDaysToDay(day: string, n: number): string {
  return new Date(dayToUtc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

// 유지기를 뜻하는 주차. 주차 맞추기에서 유지기를 고르면 5주차 1일로 계산한다
export const MAINTENANCE_WEEK = 5;

// 주차 맞추기: 오늘(KST)이 week주차 day일이 되는 시작일 = 오늘 − ((주차−1)×7 + (일−1))일.
// 유지기(5주차 이상)는 5주차 1일. 주차·일차는 1 아래로 내려가지 않아 미래 시작일은 만들지 않는다
export function startDateForWeekDay(today: string, week: number, day: number): string {
  const w = Math.min(Math.max(Math.floor(week), 1), MAINTENANCE_WEEK);
  const d = w === MAINTENANCE_WEEK ? 1 : Math.min(Math.max(Math.floor(day), 1), 7);
  return addDaysToDay(today, -((w - 1) * 7 + (d - 1)));
}

// 처음부터 다시 시작: 오늘 또는 내일이 1주차 1일
export function restartStartDate(today: string, when: 'today' | 'tomorrow'): string {
  return addDaysToDay(today, when === 'tomorrow' ? 1 : 0);
}

// 주차 맞추기 기본 선택 = 지금 주차·일차. 유지기는 5주차 1일, 시작 전·시작일 없음은 1주차 1일
export function weekDaySelection(
  startDate: string | null | undefined,
  today: string
): { week: number; day: number } {
  if (!startDate) return { week: 1, day: 1 };
  const { week, day, beforeStart } = programWeekAndDay(startDate, today);
  if (beforeStart) return { week: 1, day: 1 };
  if (week >= MAINTENANCE_WEEK) return { week: MAINTENANCE_WEEK, day: 1 };
  return { week, day };
}

// 시작일을 바꾼 뒤 정리할 것: 새 시작일 기준 오늘 주차·일차부터의 할 일 통계는 지우고(새 차수가 다시 쌓는다),
// 그 주차보다 높은 주차의 선택 재료는 뺀다. 재료 목록이 그대로면 null (저장하지 않음)
export function startDateCleanup<T extends { week: number }>(input: {
  newStart: string;
  today: string;
  low: T[];
  zero: T[];
}): { statisticsFrom: { week: number; day: number }; low: T[] | null; zero: T[] | null } {
  const { week, day } = programWeekAndDay(input.newStart, input.today);
  const prune = (list: T[]) => {
    const kept = list.filter((ingredient) => ingredient.week <= week);
    return kept.length === list.length ? null : kept;
  };
  return { statisticsFrom: { week, day }, low: prune(input.low), zero: prune(input.zero) };
}
