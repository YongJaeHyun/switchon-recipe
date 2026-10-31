import type { FastingSchedule } from './fastingSchedule';
import { DEFAULT_MEAL_MINUTES, mealEndMinutes } from './mealTimes';

// 할 일 끼니(아침·점심·오후간식·저녁)를 마치는 시각(KST 자정부터 분) = 끼니 시각 + 30분 ('○○ 식후').
// 기본 끼니 시각이면 08:30 · 13:00 · 16:30 · 19:00 (utils/mealTimes)
const DEFAULT_MEAL_ENDS = mealEndMinutes(DEFAULT_MEAL_MINUTES);

// 오늘(weekday) 보이는 할 일: 단식일은 시작 시각까지 마치는 끼니만(끼니 마치는 시각 ≤ 시작),
// 단식 다음 날은 단식이 끝난 뒤(같은 시각)의 끼니만(끼니 마치는 시각 ≥ 시작)
export function fastingDayTodos<T>(
  todos: T[],
  weekday: number,
  schedule: FastingSchedule,
  mealEnds: number[] = DEFAULT_MEAL_ENDS
): T[] {
  const today = schedule[weekday];
  const yesterday = schedule[(weekday + 6) % 7];
  return todos.filter((_, index) => {
    const meal = mealEnds[index];
    if (meal === undefined) return true;
    if (today !== undefined && meal > today) return false;
    if (yesterday !== undefined && meal < yesterday) return false;
    return true;
  });
}
