// 지난 주차·일차를 계정별로 기억하기 (useKoreanToday가 "날이 바뀌었나"를 볼 때 쓴다).
// 기기에 하나만 기억하면 다른 계정에 들렀다 돌아올 때 날이 바뀐 것으로 보여 오늘 체크를 서버에서 지우고
// 단식 계획을 초기화한다

export type DayMark = { week: number; day: number };

// 기기에 기억해 둘 계정 수 (가장 오래 안 들른 계정부터 뺀다)
export const DAY_BY_UID_MAX = 10;

// 이 계정의 지난 주차·일차. null = 이 기기에서 처음 보는 계정 (날이 바뀌었는지 모름)
// - 이 계정 기억이 있으면 그 값
// - 계정별 기억이 아직 하나도 없으면(업데이트 직후) 기기 전역 값을 남긴 계정이 이 계정이거나 모를 때만 전역 값.
//   globalKnown = 전역 값이 예전 버전에서 실제로 남긴 값인지 (새로 깐 앱의 기본값 1주차 1일은 아무 계정 것도 아니다)
export function pickPrevDay(input: {
  uid: string;
  dayByUid: Record<string, DayMark>;
  ownerUid: string | null;
  globalKnown: boolean;
  globalWeek: number;
  globalDay: number;
}): DayMark | null {
  const { uid, dayByUid, ownerUid, globalKnown, globalWeek, globalDay } = input;
  const mine = dayByUid[uid];
  if (mine) return { week: mine.week, day: mine.day };
  const fresh = globalKnown && Object.keys(dayByUid).length === 0;
  if (fresh && (ownerUid === null || ownerUid === uid)) return { week: globalWeek, day: globalDay };
  return null;
}

// 이 계정의 오늘 주차·일차를 남긴다 (최근 max개 계정만). 같은 값이면 같은 객체를 돌려준다
export function rememberDay(
  dayByUid: Record<string, DayMark>,
  uid: string,
  mark: DayMark,
  max: number = DAY_BY_UID_MAX
): Record<string, DayMark> {
  const keys = Object.keys(dayByUid);
  const mine = dayByUid[uid];
  if (mine && mine.week === mark.week && mine.day === mark.day && keys[keys.length - 1] === uid)
    return dayByUid;
  const { [uid]: _old, ...rest } = dayByUid;
  const next: Record<string, DayMark> = { ...rest, [uid]: { week: mark.week, day: mark.day } };
  const nextKeys = Object.keys(next);
  return nextKeys.length <= max
    ? next
    : Object.fromEntries(nextKeys.slice(-max).map((key) => [key, next[key]]));
}

// 할 일 단계 (const/baseTodos BASE_TODOS의 키): 1주차 1~3일 1, 4~7일 2, 2주차부터 주차+1
export function todoStep(week: number, day: number): number {
  return week === 1 ? (day <= 3 ? 1 : 2) : week + 1;
}

// 이 기기에서 처음 보는 계정: 서버의 오늘(KST) todo_daily 기록으로 할 일 체크를 정한다.
// 기록이 있으면 그 체크로 맞추고(sync), 없으면 남아 있는 체크는 지난 날 것이라 초기화(reset).
// 기록의 checked는 items 안 위치라, 그 문구를 오늘 할 일 목록에서 찾아 id로 바꾼다 (못 찾으면 건너뜀).
// 기록은 있는데 체크가 하나도 없으면 서버 체크를 건드리지 않는다(keep): 오늘 기록은 앱을 열 때 빈 채로 먼저
// 만들어지므로, 빈 기록이 옛 앱·오프라인에서 한 오늘 체크보다 늦을 수 있다. 덮어쓰면 체크가 지워진다
export function firstSeenTodoPlan(
  row: { items: string[]; checked: number[] } | null | undefined,
  todos: { id: number; value: string }[]
): { kind: 'reset' } | { kind: 'keep' } | { kind: 'sync'; checkedIds: number[] } {
  if (!row) return { kind: 'reset' };
  if (row.checked.length === 0) return { kind: 'keep' };
  const used = new Set<number>();
  const checkedIds: number[] = [];
  for (const index of row.checked) {
    const text = row.items[index];
    if (text === undefined) continue;
    const todo = todos.find((t) => t.value === text && !used.has(t.id));
    if (!todo) continue;
    used.add(todo.id);
    checkedIds.push(todo.id);
  }
  return { kind: 'sync', checkedIds };
}
