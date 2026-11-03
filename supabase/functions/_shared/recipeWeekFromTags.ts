// 이름으로 만든 레시피의 저장 주차 = 실제 레시피 재료(등록 재료 태그) 중 가장 높은 주차 (운영자 2026-11-03).
// AI가 고른 주차 규칙을 어기고 다음 주차 재료(치즈 등)를 넣어도 그 주차 레시피로 저장되게 한다.
// 재료로 만들기(앱 utils/recipeWeekChoice ingredientRecipeWeek)와 같은 기준이라 낮은 주차 재료만이면 낮춘다.
// Deno 엣지 함수와 Vitest 양쪽에서 로드되므로 외부 import를 두지 않는다.

const SAVE_WEEK_MAX = 3;

const clampWeek = (week: number) => Math.min(Math.max(Math.floor(week), 1), SAVE_WEEK_MAX);

export interface TagWeekResult {
  week: number;
  // 고른 주차보다 올라갔을 때 그 주차를 만든 재료들 (안내 문구용). 안 올라갔으면 빈 배열
  raisedBy: string[];
}

export function recipeWeekFromTags(
  tags: string[],
  weekByName: Map<string, number>,
  chosenWeek: number
): TagWeekResult {
  const known = tags
    .map((name) => ({ name, week: weekByName.get(name) }))
    .filter((t): t is { name: string; week: number } => Number.isFinite(t.week));
  const chosen = clampWeek(chosenWeek);
  if (known.length === 0) return { week: chosen, raisedBy: [] };

  const week = clampWeek(Math.max(...known.map((t) => t.week)));
  const raisedBy =
    week > chosen ? known.filter((t) => clampWeek(t.week) === week).map((t) => t.name) : [];
  return { week, raisedBy };
}

const josa = (word: string) => {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return '이';
  return (last - 0xac00) % 28 === 0 ? '가' : '이';
};

// 레시피의 "이렇게 바꿨어요"(adapt_note)에 붙이는 한 줄. 올리지 않았으면 null
export function raisedWeekNote({ week, raisedBy }: TagWeekResult): string | null {
  if (raisedBy.length === 0) return null;
  const names = raisedBy.join(', ');
  return `${names}${josa(names)} 들어가 ${week}주차 레시피로 저장했어요`;
}
