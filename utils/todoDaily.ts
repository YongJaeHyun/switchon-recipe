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
