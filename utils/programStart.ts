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

// 시작일 상태. loading = 유저를 아직 불러오지 않음(앱을 막 켜 store가 기본값, 로그아웃 직후) — 이때 비어 있는
// 시작일은 "없음"이 아니라 "모름"이다. none = 불러온 유저에게 시작일이 없음. set = 시작일 있음
export type StartDateStatus = 'loading' | 'none' | 'set';

export function startDateStatus(input: {
  userId: string | null | undefined;
  startDate: string | null | undefined;
}): StartDateStatus {
  if (!input.userId) return 'loading';
  return input.startDate ? 'set' : 'none';
}

// useKoreanToday 재검증 계획. 시작일이 없으면(모름·없음) null = 아무것도 하지 않는다:
// 빈 시작일을 1주차로 계산하면 저장 주차가 1로 내려가고(할 일·단식 서버 초기화), 진짜 시작일을 불러오면
// 다시 "주차가 올라갔다"로 보여 할 일·단식을 또 지우고 이미 본 주차 팝업을 다시 연다
export function revalidateTodayPlan(input: {
  userId: string | null | undefined;
  startDate: string | null | undefined;
  today: string;
  prevWeek: number;
  prevDay: number;
  isChecked: boolean;
}): ReturnType<typeof todayRevalidation> | null {
  const { userId, startDate, today, prevWeek, prevDay, isChecked } = input;
  if (startDateStatus({ userId, startDate }) !== 'set') return null;
  const { week, day, beforeStart } = programWeekAndDay(startDate, today);
  return todayRevalidation({ week, day, beforeStart, prevWeek, prevDay, isChecked });
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

// 주차 맞추기로 바뀔 시작일. 지금과 같으면 null (저장하지 않음).
// 유지기는 5주차 1일로 계산하지만, 이미 유지기(5주차 이상)인 사람이 유지기를 고르면 시작일을 옮기지 않는다
export function adjustTarget(
  startDate: string | null | undefined,
  today: string,
  selection: { week: number; day: number }
): string | null {
  if (startDate && selection.week >= MAINTENANCE_WEEK) {
    const { week, beforeStart } = programWeekAndDay(startDate, today);
    if (!beforeStart && week >= MAINTENANCE_WEEK) return null;
  }
  const next = startDateForWeekDay(today, selection.week, selection.day);
  return isSameStartDate(startDate, next) ? null : next;
}

// 시작일이 같은 날인지 (뒤에 시각이 붙어 있어도 날짜만 본다)
export function isSameStartDate(current: string | null | undefined, next: string): boolean {
  return !!current && current.slice(0, 10) === next.slice(0, 10);
}

// ── 회차(program): 다시 시작·온보딩으로 시작한 한 묶음. 한 주 더 하기·주차 맞추기로 시작일(start_date)이
// 바뀌어도 같은 회차다. 회차 시작일은 user.program_start에 둔다 (구버전 앱은 모르는 칸이라 null일 수 있다)

// 지난 회차를 묶는 기준: 바로 앞 시작일과 8주(56일) 이내면 같은 회차
export const PROGRAM_CHAIN_DAYS = 56;

// 지금 회차 시작일. program_start가 없거나(구버전 앱·마이그레이션 전) 시작일보다 뒤면
// (구버전 앱이 시작일을 앞당김) 시작일로 본다. 시작일보다 PROGRAM_CHAIN_DAYS(56일) 넘게 앞이어도 시작일로 본다:
// 구버전 앱(5.x)은 다시 시작할 때 start_date만 쓰므로 옛 회차의 program_start가 남는다 (한 주 더 하기·주차 맞추기는
// 8주 안쪽으로만 움직인다). 서버 _shared/weeklyStats.ts baselineStartOf와 같은 규칙. 둘 다 없으면 null
export function programStartOf(
  programStart: string | null | undefined,
  startDate: string | null | undefined
): string | null {
  const start = startDate ? startDate.slice(0, 10) : null;
  const program = programStart ? programStart.slice(0, 10) : null;
  if (!start) return program;
  if (!program || program > start) return start;
  return (dayToUtc(start) - dayToUtc(program)) / DAY_MS > PROGRAM_CHAIN_DAYS ? start : program;
}

// 시작일을 바꾸는 이유: 다시 시작(온보딩 포함) / 주차 맞추기 / 한 주 더 하기
export type StartDateChangeKind = 'restart' | 'align' | 'repeat';

// 시작일을 바꾼 뒤의 회차 시작일. current = 지금 회차 시작일(programStartOf)
// - 다시 시작: 새 시작일 (새 회차)
// - 주차 맞추기: 더 이른 쪽 (앞당기면 새 시작일, 미루면 그대로)
// - 한 주 더 하기: 그대로
// 지금 회차 시작일을 모르면 새 시작일
export function nextProgramStart(
  kind: StartDateChangeKind,
  current: string | null,
  newStart: string
): string {
  const next = newStart.slice(0, 10);
  if (!current || kind === 'restart') return next;
  const program = current.slice(0, 10);
  if (kind === 'align') return next < program ? next : program;
  return program;
}

// 지난 회차 묶기. 회차 시작일(programStart) 전의 시작일들을 정렬해, 바로 앞 시작일과 PROGRAM_CHAIN_DAYS 이내로
// 이어지면 같은 회차로 묶는다 (한 주 더 하기 +7일, 주차 맞추기는 몇 주 안쪽으로 움직인다).
// 회차마다 시작일 오름차순, 회차는 최근 먼저. programStart가 없으면 모든 시작일이 지난 회차다.
// 한계: 8주 안에 다시 시작한 회차는 앞 회차와 한 묶음이 된다 (지난 회차 경계는 저장하지 않으므로)
export function groupPastStarts(starts: string[], programStart: string | null): string[][] {
  const program = programStart ? programStart.slice(0, 10) : null;
  const past = [...new Set(starts.map((start) => start.slice(0, 10)))]
    .filter((start) => !program || start < program)
    .sort();

  const groups: string[][] = [];
  for (const start of past) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (prev && (dayToUtc(start) - dayToUtc(prev)) / DAY_MS <= PROGRAM_CHAIN_DAYS)
      group.push(start);
    else groups.push([start]);
  }
  return groups.reverse();
}

// 시작일 변경으로 저장할 것. 할 것이 없으면 null (같은 시작일, 같은 회차 시작일).
// startChanged = 시작일이 바뀜 (재료·통계 정리도 한다). 같은 날 다시 시작인데 회차 시작일만 다르면
// (한 주 더 하기 뒤 오늘이 1주차 1일인 날 등) 회차 시작일만 바꾸고 정리하지 않는다.
// alignBase = 오늘 첫 변경 전 회차 시작일 (dayProgramBase). 주차 맞추기는 지금 회차 시작일 대신 이것과 비교한다:
// 앞당겼다가 같은 날 되돌리면 회차 시작일도 돌아간다 (앞당긴 날짜에 묶이면 그 사이 날들이 이번 회차로 섞인다)
export function startDateChange(input: {
  kind: StartDateChangeKind;
  startDate: string | null | undefined;
  programStart: string | null | undefined;
  newStart: string;
  alignBase?: string | null;
}): { programStart: string; startChanged: boolean } | null {
  const current = programStartOf(input.programStart, input.startDate);
  const basis = input.kind === 'align' && input.alignBase ? input.alignBase : current;
  const programStart = nextProgramStart(input.kind, basis, input.newStart);
  const startChanged = !isSameStartDate(input.startDate, input.newStart);
  if (!startChanged && programStart === current) return null;
  return { programStart, startChanged };
}

// 오늘(KST) 첫 시작일 변경 전 회차 시작일 기록. 같은 유저·같은 날이면 그대로, 아니면 지금 회차 시작일로 새로 연다.
// 기기 메모리에만 둔다 (앱을 다시 켜면 그 뒤 변경부터 센다)
export type DayProgramBase = { uid: string; day: string; program: string | null };

export function dayProgramBase(
  base: DayProgramBase | null,
  now: { uid: string; today: string },
  currentProgram: string | null
): DayProgramBase {
  if (base && base.uid === now.uid && base.day === now.today) return base;
  return { uid: now.uid, day: now.today, program: currentProgram };
}

// 시작일을 바꾼 뒤 updated_at을 새로 찍을 단식 계획 행: 새 시작일의 오늘 주차 (단식이 있는 2주차부터, 시작 전이면 없음).
// 기록 탭은 계획 행의 생성·수정 시각으로 "언제부터 이 시작일이 쓰였나"를 어림하는데, 같은 날 주차 맞추기를 되돌리면
// 이미 있는 행이라 백필(insert-if-absent)이 아무것도 쓰지 않아 중간 시작일이 계속 이긴다. 이 행을 표시해 막는다
export function planToTouch(
  newStart: string,
  todayKst: string
): { start_date: string; week_index: number } | null {
  const { week, beforeStart } = programWeekAndDay(newStart, todayKst);
  if (beforeStart || week < 2) return null;
  return { start_date: newStart.slice(0, 10), week_index: week };
}
