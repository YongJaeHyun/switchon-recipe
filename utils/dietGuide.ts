import type { FastingTime } from 'const/fastingDays';

// ── 할 일에서 바로 행동하기 ────────────────────────────────────
export interface Tip {
  title: string;
  description: string;
  points: { icon: string; title: string; text: string }[];
}

export type TodoAction =
  | {
      type: 'route';
      label: string;
      href: '/(tabs)/home/recipeCreation/low' | '/(tabs)/home/recipeCreation/zero';
    }
  | { type: 'tip'; label: string; tip: Tip };

const SHAKE_TIP: Tip = {
  title: '프로틴쉐이크 팁',
  description: '스위치온 초반에는 쉐이크가 식사를 대신해요. 이렇게 고르고 드세요.',
  points: [
    { icon: '🥤', title: '저당 제품 고르기', text: '1회 당류 5g 이하인 단백질 쉐이크를 고르세요.' },
    {
      icon: '🥛',
      title: '물이나 무가당 음료에',
      text: '물, 무가당 두유, 아몬드 우유에 타서 드세요.',
    },
    {
      icon: '🍳',
      title: '쉐이크가 없다면',
      text: '두부, 계란, 닭가슴살처럼 단백질 위주로 가볍게 대체할 수 있어요.',
    },
  ],
};

export const getTodoAction = (todo: string): TodoAction | null => {
  if (todo.includes('저탄수식'))
    return { type: 'route', label: '레시피 만들기', href: '/(tabs)/home/recipeCreation/low' };
  if (todo.includes('무탄수식'))
    return { type: 'route', label: '레시피 만들기', href: '/(tabs)/home/recipeCreation/zero' };
  if (todo.includes('프로틴쉐이크')) return { type: 'tip', label: '팁', tip: SHAKE_TIP };
  return null;
};

// ── 주차가 바뀔 때 "이번 주 달라지는 점" ────────────────────────
export const WEEK_CHANGES: Record<number, string[]> = {
  2: [
    '주 1회 24시간 단식이 시작돼요. 단식 요일을 정해주세요.',
    '하루 2번 쉐이크 + 일반식 2끼 (점심 저탄수, 저녁 무탄수)',
    '블랙커피(오전 1잔), 견과류, 우유, 치즈를 먹을 수 있어요.',
  ],
  3: [
    '24시간 단식이 주 2회로 늘어나요. 이틀 연속은 피하세요.',
    '단호박, 토마토, 바나나, 베리류를 먹을 수 있어요.',
    '단식 후 첫 끼는 고단백으로 근손실을 막아주세요.',
  ],
  4: [
    '24시간 단식이 주 3회로 늘어나요.',
    '과일을 하루 1개 정도 먹을 수 있어요 (아침 추천).',
    '저녁도 저탄수식으로 먹을 수 있어요.',
  ],
  5: [
    '유지기에 들어왔어요. 지금까지의 식습관을 그대로 이어가세요.',
    '정제 탄수화물과 당은 계속 멀리하는 게 좋아요.',
    '체중이 다시 늘면 언제든 스위치온을 다시 시작해보세요.',
  ],
};

// ── 단식일 카운트다운 ───────────────────────────────────────────
// 앱에는 끼니 단위만 있어 시각을 기준값으로 정함 (KST)
const FASTING_START_HOUR: Record<FastingTime, number> = {
  '아침 식후': 9,
  '점심 식후': 13,
  '저녁 식후': 19,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

export type FastingStatus =
  | { phase: 'none' }
  | { phase: 'upcoming'; startsAt: Date }
  | { phase: 'fasting'; startsAt: Date; endsAt: Date; remainingMs: number }
  | { phase: 'finished'; endsAt: Date };

// KST 기준 날짜(자정)의 UTC 시각과 요일(0=일)
const kstMidnight = (date: Date) => {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const midnightKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return { utc: midnightKst - KST_OFFSET_MS, weekday: kst.getUTCDay() };
};

export const getFastingStatus = (
  now: Date,
  fastingDays: number[],
  startTime: FastingTime | null | undefined
): FastingStatus => {
  if (!startTime || fastingDays.length === 0) return { phase: 'none' };

  const startOffset = FASTING_START_HOUR[startTime] * HOUR_MS;
  const today = kstMidnight(now);
  const t = now.getTime();

  // 어제 시작한 단식이 아직 진행 중이거나 오늘 끝났는지
  const yesterdayWeekday = (today.weekday + 6) % 7;
  const yesterdayStart = today.utc - DAY_MS + startOffset;
  const todayStart = today.utc + startOffset;

  const fasting = (start: number): FastingStatus => ({
    phase: 'fasting',
    startsAt: new Date(start),
    endsAt: new Date(start + DAY_MS),
    remainingMs: start + DAY_MS - t,
  });

  if (fastingDays.includes(yesterdayWeekday) && t < yesterdayStart + DAY_MS) {
    return fasting(yesterdayStart);
  }
  if (fastingDays.includes(today.weekday)) {
    return t < todayStart
      ? { phase: 'upcoming', startsAt: new Date(todayStart) }
      : fasting(todayStart);
  }
  if (fastingDays.includes(yesterdayWeekday)) {
    return { phase: 'finished', endsAt: new Date(yesterdayStart + DAY_MS) };
  }
  return { phase: 'none' };
};

// ── 단식 결과 응답 창 ──────────────────────────────────────────
// 단식 시작부터 종료 후 48시간까지(= 시작 후 72시간), 단, 다음 단식이 시작되면 그 단식으로 넘어감.
// day = 단식 시작일(KST 날짜). 응답할 단식이 없으면 null.
// 주차가 바뀌면 단식 설정이 초기화되므로, 지난 주차 계획(previous, fasting_plan)을 받으면
// previous.to(지난 주차 마지막 날)까지는 지난 계획, 그 다음 날부터는 현재 설정으로 본다.
const RESULT_WINDOW_MS = DAY_MS + 48 * HOUR_MS;

export interface PreviousFastingPlan {
  days: number[];
  startTime: FastingTime | null | undefined;
  to: string; // 지난 주차 마지막 날 (yyyy-MM-dd, KST)
}

const kstDayString = (midnightUtc: number) =>
  new Date(midnightUtc + KST_OFFSET_MS).toISOString().slice(0, 10);

export const fastingResultWindow = (
  now: Date,
  fastingDays: number[],
  startTime: FastingTime | null | undefined,
  previous?: PreviousFastingPlan | null
): { day: string } | null => {
  const today = kstMidnight(now);
  const t = now.getTime();

  // 가장 최근에 시작한 단식 (72시간 창이라 3일 전까지만 보면 됨)
  for (let back = 0; back <= 3; back++) {
    const midnight = today.utc - back * DAY_MS;
    const day = kstDayString(midnight);
    const weekday = (today.weekday - back + 7) % 7;
    const plan =
      previous && day <= previous.to
        ? { days: previous.days, startTime: previous.startTime }
        : { days: fastingDays, startTime };
    if (!plan.startTime || !plan.days.includes(weekday)) continue;

    const start = midnight + FASTING_START_HOUR[plan.startTime] * HOUR_MS;
    if (start > t) continue;
    if (t >= start + RESULT_WINDOW_MS) return null;
    return { day };
  }
  return null;
};

// 지금 week주차일 때 지난 주차(단식이 있는 2주차 이상)와 그 마지막 날(KST 날짜). 없으면 null
export const previousFastingWeek = (
  startDate: string | null | undefined,
  week: number
): { weekIndex: number; to: string } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate ?? '');
  if (!m || week - 1 < 2) return null;
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const to = new Date(start + (7 * (week - 1) - 1) * DAY_MS).toISOString().slice(0, 10);
  return { weekIndex: week - 1, to };
};
