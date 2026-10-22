// todo_daily 행 만들기: items = 오늘 목록 문구(id 순), checked = items 안에서 체크된 위치
export function todoDailySnapshot(
  todos: { id: number; value: string }[],
  checkedIds: number[]
): { items: string[]; checked: number[] } {
  const sorted = [...todos].sort((a, b) => a.id - b.id);
  const checked = new Set(checkedIds);
  return {
    items: sorted.map((todo) => todo.value),
    checked: sorted.flatMap((todo, index) => (checked.has(todo.id) ? [index] : [])),
  };
}

interface TodayStateInput {
  hydrated: boolean; // 팝업 store(주차·일차) 복원 끝
  week: number; // 시작일로 계산한 지금 주차
  storeWeek: number; // revalidateToday가 반영한 주차
  fastingResetting: boolean; // 주차가 바뀌어 단식 설정을 초기화하는 중
}

// 오늘 할 일 목록(단식일이면 끼니를 자름)이 이번 주 기준인지.
// 새 주 첫날 revalidateToday가 주차를 반영하고 단식 초기화가 끝나기 전에는 지난 주 단식 요일로 잘릴 수 있다
export function isTodoListCurrent(s: TodayStateInput): boolean {
  return s.hydrated && s.storeWeek === s.week && !s.fastingResetting;
}

// 체크 상태까지 오늘 것인지: 목록이 이번 주 기준이고, 일차가 반영돼 할 일 초기화도 끝났을 때
export function areTodoChecksCurrent(
  s: TodayStateInput & { day: number; storeDay: number; todosResetting: boolean }
): boolean {
  return isTodoListCurrent(s) && s.storeDay === s.day && !s.todosResetting;
}

type TodoDailyBody = { day: string; items: string[]; checked: number[] };

interface TodoDailySyncDeps {
  upsert(body: TodoDailyBody): Promise<boolean>; // 성공하면 true
  insertIfAbsent(body: { day: string; items: string[] }): Promise<boolean>;
  debounceMs: number;
}

// todo_daily 보내기 상태 (useTodos는 할 일마다 불리므로 모듈에 하나만 둔다)
// - 첫 스냅샷: 성공한 뒤에만 그날 보낸 것으로 친다. 보내는 중에 겹친 호출은 건너뛴다
// - 체크 기록: 마지막 상태만 debounce 뒤에 보낸다. 가장 최근 요청이 실패하면 그날을 "다시 보낼 날"로 남긴다
export function createTodoDailySync({ upsert, insertIfAbsent, debounceMs }: TodoDailySyncDeps) {
  let sentKey: string | null = null;
  let inFlightKey: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  let unsentDay: string | null = null;

  const sendSnapshot = (key: string, body: { day: string; items: string[] }) => {
    if (sentKey === key || inFlightKey === key) return;
    inFlightKey = key;
    void insertIfAbsent(body).then((ok) => {
      if (inFlightKey === key) inFlightKey = null;
      if (ok) sentKey = key;
    });
  };

  const queueUpsert = (body: TodoDailyBody) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const mySeq = ++seq;
      void upsert(body).then((ok) => {
        if (mySeq !== seq) return; // 더 새 요청이 있으면 그 결과를 따른다
        unsentDay = ok ? null : body.day;
      });
    }, debounceMs);
  };

  // 오늘 체크 기록을 다시 보내야 하는지 (지난 날 것은 다시 보내지 않는다)
  const needsResend = (today: string) => unsentDay === today;

  return { sendSnapshot, queueUpsert, needsResend };
}
