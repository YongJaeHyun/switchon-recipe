import type { FastingSchedule } from './fastingSchedule';

// 할 일 끼니(아침·점심·오후간식·저녁)를 마치는 시각(KST 자정부터 분). 옛 라벨 "○○ 식후" 시각과 같다:
// 아침 식후 540, 점심 식후 780, 저녁 식후 1140. 오후간식은 점심과 저녁 사이(16:00)
const MEAL_MINUTES = [540, 780, 960, 1140];

// 오늘(weekday) 보이는 할 일: 단식일은 시작 시각까지 마치는 끼니만(끼니 시각 ≤ 시작),
// 단식 다음 날은 단식이 끝난 뒤(같은 시각)의 끼니만(끼니 시각 ≥ 시작)
export function fastingDayTodos<T>(todos: T[], weekday: number, schedule: FastingSchedule): T[] {
  const today = schedule[weekday];
  const yesterday = schedule[(weekday + 6) % 7];
  return todos.filter((_, index) => {
    const meal = MEAL_MINUTES[index];
    if (meal === undefined) return true;
    if (today !== undefined && meal > today) return false;
    if (yesterday !== undefined && meal < yesterday) return false;
    return true;
  });
}
