// 사용자 끼니 시각 (KST 자정부터 분, 30분 단위). 끼니 알림 시각이고, '○○ 식후'(끼니 + 30분)로 단식과도 이어진다:
// 단식 요일 설정의 빠른 선택·새 요일 기본 시각, 단식 중 숨기는 끼니 판정(utils/fastingTodos).
// 서버 호환용 옛 라벨 시각(QUICK_TIMES 540/780/1140, legacyLabel)은 utils/fastingSchedule에 그대로 둔다
import type { FastingTime } from 'const/fastingDays';
import { QUICK_TIMES, type FastingSchedule } from './fastingSchedule';

export type MealKey = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type MealTimes = Record<MealKey, number>;

// 할 일(BASE_TODOS) 순서와 같다: 아침·점심·오후간식·저녁 (할 일 id = 이 순서의 칸)
export const MEAL_KEYS: MealKey[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: '아침',
  lunch: '점심',
  snack: '오후간식',
  dinner: '저녁',
};

export const DEFAULT_MEAL_MINUTES: MealTimes = {
  breakfast: 480, // 08:00
  lunch: 750, // 12:30
  snack: 960, // 16:00
  dinner: 1110, // 18:30
};

export const MEAL_MINUTE_STEP = 30;
const AFTER_MEAL = 30;

// 끼니마다 고를 수 있는 시(휠). 겹치지 않아 끼니 순서가 늘 아침 < 점심 < 오후간식 < 저녁.
// 식후(+30분)가 단식 시작 휠 범위(06:00~22:50) 안에 들도록 아침은 06시부터, 저녁은 21시대까지
export const MEAL_HOUR_RANGES: Record<MealKey, { minHour: number; maxHour: number }> = {
  breakfast: { minHour: 6, maxHour: 9 },
  lunch: { minHour: 10, maxHour: 14 },
  snack: { minHour: 15, maxHour: 17 },
  dinner: { minHour: 18, maxHour: 21 },
};

// 끼니 + 30분 = 그 끼니 '식후' (그 끼니를 마친 때)
export function afterMealMinutes(times: MealTimes): MealTimes {
  return {
    breakfast: times.breakfast + AFTER_MEAL,
    lunch: times.lunch + AFTER_MEAL,
    snack: times.snack + AFTER_MEAL,
    dinner: times.dinner + AFTER_MEAL,
  };
}

// 할 일 순서의 끼니 마치는 시각 (utils/fastingTodos)
export function mealEndMinutes(times: MealTimes): number[] {
  const after = afterMealMinutes(times);
  return MEAL_KEYS.map((key) => after[key]);
}

// 단식 시작 빠른 선택 (아침·점심·저녁 식후)
export function quickTimes(times: MealTimes): { label: FastingTime; minutes: number }[] {
  const after = afterMealMinutes(times);
  return [
    { label: '아침 식후', minutes: after.breakfast },
    { label: '점심 식후', minutes: after.lunch },
    { label: '저녁 식후', minutes: after.dinner },
  ];
}

// 새 단식 요일의 기본 시작 시각 (직전에 정한 값이 없을 때) = 저녁 식후
export function defaultFastingStart(times: MealTimes): number {
  return afterMealMinutes(times).dinner;
}

// 저장된 단식 시작이 옛 '○○ 식후' 라벨 시각(540·780·1140: 옛 빠른 선택 버튼·라벨만 있는 행)이면
// 지금 사용자 식후 시각으로 읽는다. 보이는 할 일(단식 다음 날 아침이 숨지 않게)과 빠른 선택 표시에만 쓴다.
// 저장 값·단식 알림·서버는 그대로
export function snapLegacyMinutes(minutes: number, times: MealTimes): number {
  const legacy = QUICK_TIMES.find((quick) => quick.minutes === minutes);
  if (!legacy) return minutes;
  return quickTimes(times).find((quick) => quick.label === legacy.label)?.minutes ?? minutes;
}

export function snapLegacySchedule(schedule: FastingSchedule, times: MealTimes): FastingSchedule {
  const snapped: FastingSchedule = {};
  for (const [day, minutes] of Object.entries(schedule)) {
    snapped[Number(day)] = snapLegacyMinutes(minutes, times);
  }
  return snapped;
}

const isMealMinutes = (key: MealKey, value: unknown): value is number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value % MEAL_MINUTE_STEP !== 0) {
    return false;
  }
  const { minHour, maxHour } = MEAL_HOUR_RANGES[key];
  return value >= minHour * 60 && value < (maxHour + 1) * 60;
};

// 저장된 값 읽기: 끼니마다 올바른 값만, 아니면 기본값
export function normalizeMealTimes(value: unknown): MealTimes {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const times = { ...DEFAULT_MEAL_MINUTES };
  for (const key of MEAL_KEYS) if (isMealMinutes(key, raw[key])) times[key] = raw[key];
  return times;
}
