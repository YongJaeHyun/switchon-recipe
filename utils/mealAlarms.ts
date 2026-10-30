// 1주차 끼니 시간 알림 계산 (순수). 예약·취소는 utils/notifications의 syncMealAlarms
import { BASE_TODOS } from 'const/baseTodos';
import { MEAL_KEYS, type MealKey, type MealTimes } from './mealTimes';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const KST_OFFSET_MS = 9 * 60 * MINUTE_MS;
const WEEK1_DAYS = 7;

export interface MealAlarm {
  date: Date;
  body: string;
  meal: MealKey;
  day: number; // 1주차 n일
}

// 1주차 n일의 할 일 (1~3일 네 끼 쉐이크, 4일부터 점심 저탄수식) — useTodos의 단계와 같다
export const week1Todos = (day: number): string[] => BASE_TODOS[day <= 3 ? 1 : 2];

// "점심 프로틴쉐이크 마시기" → "점심 프로틴쉐이크 마실 시간이에요"
export function mealAlarmBody(todo: string): string {
  if (todo.endsWith('마시기')) return `${todo.slice(0, -3)}마실 시간이에요`;
  if (todo.endsWith('먹기')) return `${todo.slice(0, -2)}먹을 시간이에요`;
  return `${todo} 시간이에요`;
}

const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

// 1주차(시작일부터 7일) 중 아직 오지 않은 끼니 알림. 오늘(KST) 체크한 끼니(할 일 id)는 오늘 것만 뺀다.
// 날짜는 모두 KST로 셈한다 (기기 시간대와 상관없음). 시작 전이면 1주차 1일부터 전부
export function mealAlarms({
  startDate,
  now,
  times,
  checkedToday,
  todos = week1Todos,
}: {
  startDate: string | null | undefined;
  now: Date;
  times: MealTimes;
  checkedToday: number[];
  todos?: (day: number) => string[];
}): MealAlarm[] {
  if (!startDate) return [];
  const start = dayToUtc(startDate);
  // 오늘 KST 날짜(의 UTC 자정)
  const todayUtc = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS;

  const alarms: MealAlarm[] = [];
  for (let i = 0; i < WEEK1_DAYS; i++) {
    const dayUtc = start + i * DAY_MS;
    if (dayUtc < todayUtc) continue;
    const isToday = dayUtc === todayUtc;
    const midnight = dayUtc - KST_OFFSET_MS; // 그날 KST 자정
    const dayTodos = todos(i + 1);
    MEAL_KEYS.forEach((meal, index) => {
      if (isToday && checkedToday.includes(index)) return;
      const todo = dayTodos[index];
      if (!todo) return;
      const at = midnight + times[meal] * MINUTE_MS;
      if (at <= now.getTime()) return;
      alarms.push({ date: new Date(at), body: mealAlarmBody(todo), meal, day: i + 1 });
    });
  }
  return alarms;
}

// 내 정보에서 끼니 알림을 바로 맞출 때 쓸 오늘 체크. 오늘 탭이 안 떠 있으면 할 일 캐시가 어제 것일 수 있어,
// 주차 팝업 store의 주차·일차가 오늘과 같을 때(오늘로 초기화가 끝났을 때)만 캐시를 믿는다. 아니면 체크 없음
export function checksForSettingSync(input: {
  beforeStart: boolean;
  week: number;
  day: number;
  storeWeek: number;
  storeDay: number;
  cached: number[] | undefined;
}): number[] {
  const { beforeStart, week, day, storeWeek, storeDay, cached } = input;
  if (beforeStart || !cached) return [];
  return week === storeWeek && day === storeDay ? cached : [];
}
