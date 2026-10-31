// 체중 입력 시트 위 날짜 줄 (지난 날 체중도 기록). 순수 함수
import { type BodyComp, prefillBodyComp } from './bodyComp';
import { programStartOf } from './programStart';
import { prefillWeight, shiftDay } from './weight';

// 시트가 저장할 날과 미리 채울 값
export interface WeightInputTarget {
  day: string; // 저장할 KST 날짜 (yyyy-MM-dd)
  initial: number | null; // 미리 채울 값 (그날 값, 없으면 어제 값)
  initialBodyComp: BodyComp; // 미리 채울 인바디 값 (그날 값만)
  isToday: boolean;
}

export interface WeightDateRange {
  from: string;
  to: string;
}

export interface WeightDateChip {
  day: string;
  monthDay: string; // "10/28"
  weekday: string; // "화"
  weekdayIndex: number; // 0 = 일요일
  isToday: boolean;
  recorded: boolean;
  selected: boolean;
  label: string; // 화면 읽기: "10월 28일 화요일, 기록 있음"
}

// 회차 시작 며칠 전부터 고를 수 있나 (시작 전 몸무게도 적게)
export const DAYS_BEFORE_START = 7;
// 시작일을 모를 때 고를 수 있는 날 수 (오늘 포함)
export const FALLBACK_DAYS = 30;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const partsOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return { m, d, weekdayIndex: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

const min = (a: string, b: string) => (a < b ? a : b);

// 그 시각의 KST 날짜 (yyyy-MM-dd)
export function kstDayOf(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 고를 수 있는 날: (회차 시작 − 7일) ~ 오늘. 시작일을 모르면 최근 30일. 미래는 없다.
// 시작이 먼 미래여도 오늘은 들어가고, 범위보다 앞선 날을 열었으면(전체 기간 기록) 그날부터
export function weightDateRange({
  today,
  programStart,
  startDate,
  targetDay,
}: {
  today: string;
  programStart: string | null | undefined;
  startDate: string | null | undefined;
  targetDay: string | null | undefined;
}): WeightDateRange {
  const start = programStartOf(programStart, startDate);
  let from = start ? shiftDay(start, -DAYS_BEFORE_START) : shiftDay(today, -(FALLBACK_DAYS - 1));
  from = min(from, today);
  if (targetDay) from = min(from, targetDay);
  return { from, to: today };
}

// 날짜 칸 목록 (오래된 날 → 오늘)
export function weightDateChips({
  range,
  today,
  logs,
  selectedDay,
}: {
  range: WeightDateRange;
  today: string;
  logs: { day: string }[];
  selectedDay: string | null;
}): WeightDateChip[] {
  const recordedDays = new Set(logs.map((log) => log.day));
  const chips: WeightDateChip[] = [];
  for (let day = range.from; day <= range.to; day = shiftDay(day, 1)) {
    const { m, d, weekdayIndex } = partsOf(day);
    const isToday = day === today;
    const recorded = recordedDays.has(day);
    chips.push({
      day,
      monthDay: `${m}/${d}`,
      weekday: WEEKDAYS[weekdayIndex],
      weekdayIndex,
      isToday,
      recorded,
      selected: day === selectedDay,
      label: `${isToday ? '오늘, ' : ''}${m}월 ${d}일 ${WEEKDAYS[weekdayIndex]}요일, ${
        recorded ? '기록 있음' : '기록 없음'
      }`,
    });
  }
  return chips;
}

// 날짜를 고르면 시트가 그날을 겨눈다: 체중은 그날(없으면 전날), 인바디는 그날 값
export function weightTargetForDay(
  logs: ({ day: string; weight_kg: number } & Partial<BodyComp>)[],
  day: string,
  today: string
): WeightInputTarget {
  return {
    day,
    initial: prefillWeight(logs, day),
    initialBodyComp: prefillBodyComp(logs, day),
    isToday: day === today,
  };
}

// 시트 안내: "오늘 10월 31일 체중을 적어 주세요" / "10월 28일 (화) 체중을 적어 주세요"
export function weightSheetSubtitle(day: string, today: string): string {
  const { m, d, weekdayIndex } = partsOf(day);
  return day === today
    ? `오늘 ${m}월 ${d}일 체중을 적어 주세요`
    : `${m}월 ${d}일 (${WEEKDAYS[weekdayIndex]}) 체중을 적어 주세요`;
}

// 날짜 줄을 처음 열 때 가로 위치: 고른 칸이 오른쪽 끝에 보이게. 고른 칸이 없으면 맨 끝(오늘)
export function weightStripScrollX({
  index,
  itemWidth,
  viewportWidth,
  count = 0,
}: {
  index: number;
  itemWidth: number;
  viewportWidth: number;
  count?: number;
}): number {
  const at = index >= 0 ? index : count - 1;
  return Math.max(0, (at + 1) * itemWidth - viewportWidth);
}
