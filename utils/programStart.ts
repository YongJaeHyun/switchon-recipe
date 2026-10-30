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
// weekChanged → setWeek, dayChanged → setDay. resetFasting·resetTodos는 서버 행을 쓰는 초기화라
// 시작 전에는 하지 않는다 (store만 맞춘다. 시작일 0 → 1일 전환 때 할 일 초기화가 일어난다).
// 시작 전에는 팝업을 열지 않고 일차를 BEFORE_START_DAY로 둔다
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
    resetFasting: weekChanged && !beforeStart,
    resetTodos: dayChanged && !beforeStart,
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
