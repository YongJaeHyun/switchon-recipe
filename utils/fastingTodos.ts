import { FASTING_START_TIMES } from 'const/fastingDays';
import { legacyLabel, type FastingSchedule } from './fastingSchedule';

// 시작 시각(분) → 할 일 목록에서 그 끼니 위치. 가장 가까운 옛 라벨(아침/점심/저녁 식후)로 본다.
// 할 일에는 점심과 저녁 사이에 오후 간식이 있어 저녁은 한 칸 뒤
const mealIndex = (minutes: number) => {
  const label = legacyLabel(minutes);
  const index = FASTING_START_TIMES.indexOf(label);
  return label === '저녁 식후' ? index + 1 : index;
};

// 오늘(weekday) 보이는 할 일: 단식일은 시작 전 끼니까지, 단식 다음 날은 단식이 끝나는 끼니부터
export function fastingDayTodos<T>(todos: T[], weekday: number, schedule: FastingSchedule): T[] {
  let result = todos;
  const today = schedule[weekday];
  if (today !== undefined) result = result.slice(0, mealIndex(today) + 1);
  const yesterday = schedule[(weekday + 6) % 7];
  if (yesterday !== undefined) result = result.slice(mealIndex(yesterday));
  return result;
}
